// Promise-based wrapper around the Stockfish worker. This module owns the worker
// lifecycle and nothing else: every line it sees goes through `parseUciLine` from
// `./uci` (Task 2), and it never inspects a position or a legal move — the
// engine is a FEN-in/move-out service (spec §7.1).

import { cmd, isReliableScore, parseUciLine, type UciInfo } from './uci';

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'thinking' | 'error';

export interface PvLine {
  uci: string;
  scoreCp?: number;
  scoreMate?: number;
  depth: number;
  pv: string[];
}

export interface SearchResult {
  bestMove: string | null;
  lines: PvLine[];
  depth: number;
  /**
   * Whether this search was abandoned by `interrupt()` rather than answered.
   *
   * The two are not the same answer, and treating them as one is expensive: a
   * `stop` a few milliseconds into a `go` makes the engine reply
   * `bestmove (none)` with no `info` line at all, so an aborted result carries
   * **no lines and no score**. A caller that stores it — `makeEngineSource` keys
   * its cache on FEN and options — has then cached an empty evaluation for that
   * position, and every later request for it is served that emptiness with no way
   * to recover. So the flag is on the result, where the caching decision is made,
   * and not merely on the client where the abort happened.
   */
  aborted: boolean;
}

/** A silent worker (bad WASM path, blocked, dead) is a boot failure, not a
 * search failure: 20s is far longer than a healthy lite build needs. */
const HANDSHAKE_TIMEOUT_MS = 20_000;

/**
 * The `Skill Level` every advice search runs at.
 *
 * **The opponent is handicapped. The advice is not, and this constant is the
 * reason.** UCI `setoption` is sticky — the last-sent value stays in force until
 * it is changed again — and before this existed, the only places `Skill Level` was
 * ever sent were `newGame()` and the hook's effect. So the learner's chosen
 * opponent strength was in force for **every evaluation and every hint**, at every
 * difficulty. Stockfish's `Skill Level` does not merely pick worse moves: below
 * Skill 20 it substitutes a reduced-accuracy evaluation net from root depth 4
 * down, so the *score* is handicapped too.
 *
 * Measured against the real engine, in the position `1.a3 c6 2.b4 Qa5 3.bxa5 Na6`
 * (White a queen up, White to move) — see `game.spec.ts` for the permanent test:
 *
 * ```
 *   Skill  1   eval 50  "0.0"   hint e4      <- eight pawns up, advised a pawn push
 *   Skill 20   eval 90  "+8.8"  hint Bb2
 * ```
 *
 * The spec chose Stockfish precisely because "weaker engines give advice that is
 * sometimes wrong, which is worse than no advice" (§3), scoped `Skill Level` to
 * "playing below full strength" (§3) and to the opponent's "next move" (§6.3).
 * Applying it to the advice channel contradicted all three and nobody wrote it
 * down.
 */
export const ADVICE_SKILL_LEVEL = 20;

/** Head-room above `go movetime` before a search is declared dead. The engine
 * honours `go movetime` and answers well inside its budget; the plan's real
 * budgets are 1500ms (opponent) and 3000ms (hint/analysis), so this ceiling
 * cannot fire before `bestmove` in normal operation. */
const SEARCH_TIMEOUT_SLACK_MS = 10_000;

/** Plan: difficulty presets are Beginner 1, Easy 4, Medium 8, Hard 13, Expert
 * 20, and Medium is the default. */
const DEFAULT_SKILL_LEVEL = 8;

/** Every code, in one place: the union is derived from the list rather than
 * written beside it, so a new failure mode cannot be added to one and forgotten
 * in the other, and `ALL_ENGINE_FAILURE_CODES` cannot fall behind the type. */
const FAILURE_CODES = [
  'worker-died',
  'handshake-timeout',
  'timeout',
  'superseded',
  'aborted',
  'disposed',
] as const;

/** Why a request failed, in a form a caller can branch on.
 *
 * `worker-died` and `handshake-timeout` are the engine being unavailable, which
 * is the one case where re-issuing the request is sensible. `superseded` means
 * the caller itself moved on, `aborted` means the caller interrupted this search
 * deliberately, and `disposed` means the client is gone; retrying any of the
 * three would be wrong. `timeout` is deliberately **not** retryable: the budget
 * is a hard cap by design, the client has already thrown the worker away, and a
 * machine slow enough to blow `movetime + 10s` once will do it again — the
 * caller is better served by an error it can show than by a silent second wait
 * of the same length. */
export type EngineFailureCode = (typeof FAILURE_CODES)[number];

/** The same codes as a list, so a caller can walk every one of them — the
 * analysis layer's retry policy is asserted against this list rather than
 * against a hand-written copy of the union, which is how the two used to be
 * able to drift apart silently. */
export const ALL_ENGINE_FAILURE_CODES: readonly EngineFailureCode[] = FAILURE_CODES;

/** Which failures are worth re-issuing: the engine is *unavailable*, not
 * undecided. Exported because that judgement belongs here — this module knows
 * what each failure means — and a caller that re-implements it is a caller that
 * can drift from it.
 *
 * Typed as `ReadonlySet<string>` so a caller holding an `unknown` rejection can
 * ask the question with a plain string and no cast, while the *values* are built
 * from the union so dropping a code from `EngineFailureCode` is a compile error
 * rather than a silently stale set. */
export const RETRYABLE_ENGINE_CODES: ReadonlySet<string> = new Set<EngineFailureCode>([
  'worker-died',
  'handshake-timeout',
]);

/** Every rejection from `EngineClient` is one of these, so a caller can read
 * `code` / `retryable` instead of matching on message text. The one-shot retry
 * that spec §7.4 asks for is Task 7's `analysis/` module to implement on top of
 * this shape; this class is the contract it needs. */
export class EngineError extends Error {
  readonly code: EngineFailureCode;
  readonly retryable: boolean;

  constructor(code: EngineFailureCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'EngineError';
    this.code = code;
    this.retryable = RETRYABLE_ENGINE_CODES.has(code);
  }
}

interface PendingSearch {
  /** Identity of this search, matched against the `bestmove` queue. */
  id: number;
  /** The worker this search was issued to, so a late callback cannot address
   * a replacement. */
  worker: Worker;
  lines: Map<number, PvLine>;
  /** Set by `interrupt()`. Lives on the search rather than on the client so it
   * cannot outlive the request it describes: a new search starts un-aborted, and
   * an abort asked for while nothing was running has nothing to mark. */
  aborted: boolean;
  resolve: (r: SearchResult) => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface Handshake {
  want: 'uciok' | 'readyok';
  resolve: () => void;
  reject: (e: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

/** Mate supersedes centipawns on the same line, and an absent score omits its
 * key entirely rather than arriving as `scoreCp: undefined` — `toStrictEqual`,
 * spread and `JSON.stringify` all see the difference. */
function scoreOf(event: UciInfo): Pick<PvLine, 'scoreCp' | 'scoreMate'> {
  if (event.scoreMate !== undefined) return { scoreMate: event.scoreMate };
  if (event.scoreCp !== undefined) return { scoreCp: event.scoreCp };
  return {};
}

export class EngineClient {
  private worker: Worker | null = null;
  private statusValue: EngineStatus = 'idle';
  private errorValue: EngineError | null = null;
  /**
   * The level the **opponent plays** at: what `setSkillLevel()` was last told, and
   * what `newGame()` re-sends.
   *
   * Kept separate from `skillLevelInEffect` because the two genuinely differ. UCI
   * `setoption` is sticky, so a single "the level" would mean two things at once —
   * the learner's chosen strength, and whatever the last search happened to run at
   * (an advice search runs at 20; see `ADVICE_SKILL_LEVEL`). Conflating them is
   * not a style point: after a worker is dropped and rebuilt, `newGame` re-sends
   * *this* field, so a shared field would promote the opponent to full strength
   * and trade C1 for a worse bug.
   */
  private playSkillLevel = DEFAULT_SKILL_LEVEL;
  /**
   * What the live engine is actually set to, or `null` when that is not known.
   *
   * `null` is the honest initial value and is set again for every fresh worker,
   * because a new worker starts at Stockfish's own default of 8 regardless of what
   * this client last sent. `search()` compares against it to avoid re-sending a
   * `setoption` on every hot-path search, and **that optimisation is only sound
   * because a rebuilt worker resets it to `null`** — without that, a client that
   * believed the engine was at 20 would skip the write and the engine would search
   * at 8.
   */
  private skillLevelInEffect: number | null = null;
  private pending: PendingSearch | null = null;
  /** Ids of searches whose `go` has been answered by nobody yet, oldest first.
   *
   * UCI guarantees exactly one `bestmove` per `go`, in the order the `go`s were
   * sent: the engine finishes a search before it reads the next command. That is
   * the only thing that makes a `bestmove` attributable, because the protocol
   * carries no id of its own. So an answer is matched to the oldest unanswered
   * `go` rather than to whatever search happens to be pending — otherwise a
   * superseded search's late answer lands on its replacement's slot and the app
   * plays a stale move. */
  private awaitingBestmove: number[] = [];
  private nextSearchId = 0;
  /** The in-flight boot, memoised: two concurrent `newGame()`/`search()` calls
   * must join one `uci`/`isready` handshake instead of overwriting each other's
   * slot and orphaning a promise forever. */
  private booting: Promise<void> | null = null;
  /** Set by `dispose()` and never cleared. A disposed client is finished; every
   * entry point refuses to start new work, so a boot interrupted mid-handshake
   * cannot resurrect it. */
  private disposed = false;
  private handshake: Handshake | null = null;
  private readonly subscribers = new Set<(s: EngineStatus) => void>();

  constructor(private readonly opts: { workerUrl?: string } = {}) {}

  get status(): EngineStatus {
    return this.statusValue;
  }

  /** Always an `EngineError` when non-null, so a caller can branch on `code`
   * without narrowing. */
  get error(): EngineError | null {
    return this.errorValue;
  }

  onStatus(cb: (s: EngineStatus) => void): () => void {
    this.subscribers.add(cb);
    return () => {
      this.subscribers.delete(cb);
    };
  }

  private setStatus(s: EngineStatus): void {
    this.statusValue = s;
    for (const cb of [...this.subscribers]) {
      try {
        cb(s);
      } catch {
        // A subscriber is a status badge, not part of the lifecycle. Letting it
        // throw would skip the rejection path in `fail`/`dispose` and leave the
        // caller hanging on a promise nobody will settle.
      }
    }
  }

  /** Created on first use, never in the constructor: the ~1.8MB engine must stay
   * off the first-paint path (spec §7.4). */
  private ensureWorker(): Worker {
    const existing = this.worker;
    if (existing !== null) return existing;

    // Terminal. `dispose` means "this client is finished", not "start over": the
    // spec pairs it with unmount, and a client that rebuilt itself would
    // resurrect an engine the caller believes it has torn down. Refusing here is
    // what makes the invariant hold — no code path can construct a worker after
    // disposal, however it was reached.
    if (this.disposed) throw new EngineError('disposed', 'Engine client disposed');

    this.setStatus('loading');
    // No '#' in the URL. The engine reads `location.hash` itself: a hash makes it
    // take a different branch, and its first element overrides the WASM URL it
    // derives from `location.pathname`.
    const url = this.opts.workerUrl ?? '/engine/stockfish.js';
    const w = new Worker(url);
    // addEventListener, not `onmessage`: one `onmessage` assignment silently
    // discards any other handler, and the worker is shared by handshake, search
    // and error paths.
    w.addEventListener('message', this.onMessage);
    w.addEventListener('error', this.onError);
    this.worker = w;
    // A fresh worker has never been told anything, so what it holds is unknown
    // rather than whatever the previous worker was set to.
    this.skillLevelInEffect = null;
    return w;
  }

  private readonly onMessage = (ev: MessageEvent): void => {
    const line = typeof ev.data === 'string' ? ev.data : String(ev.data);
    const event = parseUciLine(line);
    if (event === null) return;

    const hs = this.handshake;
    if (hs !== null) {
      // A handshake wants one specific answer. Anything else arriving here is
      // either chatter (`id name ...`) or an out-of-order reply, and must not
      // advance the boot.
      if (event.type === hs.want) {
        this.handshake = null;
        clearTimeout(hs.timer);
        hs.resolve();
      }
      return;
    }

    if (event.type === 'bestmove') {
      this.settleSearch(event.move);
      return;
    }

    const pending = this.pending;
    if (pending === null || event.type !== 'info') return;
    if (!isReliableScore(event)) return;
    // `info string ...` chatter parses as a depth-0 info event with an empty pv,
    // so the filter is on the pv, not on the event type.
    const uci = event.pv[0];
    if (uci === undefined) return;

    pending.lines.set(event.multiPv, {
      uci,
      ...scoreOf(event),
      depth: event.depth,
      pv: event.pv,
    });
  };

  private readonly onError = (ev: unknown): void => {
    const detail = ev instanceof Error ? ev.message : 'Engine worker error';
    this.fail(new EngineError('worker-died', detail, { cause: ev }));
  };

  private settleSearch(move: string | null): void {
    // The answer belongs to the oldest `go` still waiting for one.
    const id = this.awaitingBestmove.shift();
    if (id === undefined) return; // nothing outstanding: a leftover, ignored

    const p = this.pending;
    if (p === null || p.id !== id) {
      // That answer is for a search that has already been superseded or has
      // timed out. Discarding it is the point: it must not be handed to the
      // search that replaced it, because the app would play a move chosen for a
      // different position.
      return;
    }

    this.pending = null;
    clearTimeout(p.timer);
    this.setStatus('ready');
    const lines = [...p.lines.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, line]) => line);
    const depth = lines.reduce((max, line) => Math.max(max, line.depth), 0);
    p.resolve({ bestMove: move, lines, depth, aborted: p.aborted });
  }

  /**
   * Abandon the search in flight: `stop`, and nothing else.
   *
   * The engine's own abort, and the reason it is a separate method rather than an
   * argument to `search` is that **the replacement must not come from here.** A
   * `go` posted before the aborted search's `bestmove` has arrived kills the
   * 19-lite worker outright — measured in Chromium against the real WASM, with no
   * app involved: `go 3000` then `go 1500` 200ms later dies, two `go`s 20ms apart
   * die, `stop` then `go` 0ms later dies, and a strictly sequential pair — the
   * second `go` 150ms after the first `bestmove` — is clean. So the rule is not
   * "don't overlap searches", it is "never post a `go` before the previous
   * `bestmove`", and the only safe way to hold to it is for the caller to wait: this
   * method returns immediately, the pending search resolves when the engine
   * acknowledges the `stop`, and whatever asked for the interruption starts its own
   * search then.
   *
   * Two things it deliberately does not do:
   *
   *  - it does not reject the pending search. The abort is something the caller
   *    asked for, so turning it into a rejection would make `analyze` throw noise
   *    the caller did not cause. The result resolves instead, with `aborted` set
   *    and — the trap — **no lines**, which is why that flag is on `SearchResult`.
   *  - it does not build a worker to stop. With none there is nothing to interrupt,
   *    and a `stop` posted into a live search on purpose must not also be the thing
   *    that creates an engine.
   *
   * A `stop` with nothing running is harmless: the engine ignores it and sends no
   * `bestmove`, so there is no stray answer to settle an unrelated search.
   */
  interrupt(): void {
    const w = this.worker;
    if (w === null) return;
    const p = this.pending;
    if (p !== null) p.aborted = true;
    try {
      w.postMessage(cmd.stop());
    } catch {
      // A worker that cannot be posted to is a worker that is already gone, and
      // `fail`/`dropWorker` are about to hear about it from somewhere else. The
      // abort flag still stands, so the search that is in flight reports itself
      // aborted rather than as an answer.
    }
  }

  /** One failure path for every way the engine can let us down, so no promise is
   * ever left dangling and `handshake`/`pending` are always cleared. */
  private fail(err: EngineError): void {
    this.errorValue = err;
    this.dropWorker();

    // Settle the outstanding promises *before* notifying subscribers. A
    // subscriber that re-enters search() would otherwise supersede the very
    // search that is failing, and the caller would be told 'superseded' instead
    // of the real cause.
    const hs = this.handshake;
    if (hs !== null) {
      this.handshake = null;
      clearTimeout(hs.timer);
      hs.reject(err);
    }
    const p = this.pending;
    if (p !== null) {
      this.pending = null;
      clearTimeout(p.timer);
      p.reject(err);
    }

    this.setStatus('error');
  }

  /** Terminate and unhook the current worker, discarding every answer still owed
   * by it — a terminated worker's `bestmove` will never arrive, and its absence
   * must not be mistaken for the next search's answer. No option bookkeeping is
   * needed: a replacement is only ever reached through `ensureWorker`, which
   * moves the status to 'loading' and so always routes the next `search` through
   * `newGame` — and `newGame` re-sends the skill level unconditionally. */
  private dropWorker(): void {
    const w = this.worker;
    if (w === null) return;

    this.worker = null;
    this.awaitingBestmove = [];
    w.removeEventListener('message', this.onMessage);
    w.removeEventListener('error', this.onError);
    w.terminate();
  }

  private waitFor(want: 'uciok' | 'readyok'): Promise<void> {
    const w = this.ensureWorker();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => this.handshakeTimedOut(timer),
        HANDSHAKE_TIMEOUT_MS,
      );
      this.handshake = { want, resolve, reject, timer };
      w.postMessage(want === 'uciok' ? cmd.uci() : cmd.isready());
    });
  }

  private handshakeTimedOut(timer: ReturnType<typeof setTimeout>): void {
    const hs = this.handshake;
    // Identity-checked: a handshake that has already been answered must not be
    // failed by its own stale timer. The slot is left in place for `fail`, which
    // clears it and rejects it — clearing it here first would leave the promise
    // pending forever.
    if (hs === null || hs.timer !== timer) return;

    this.fail(
      new EngineError('handshake-timeout', `Engine did not answer ${hs.want} in time`),
    );
  }

  /** `uci` → `uciok` → `isready` → `readyok`, memoised.
   *
   * Two callers arriving together (a double-clicked New Game, or a new game while
   * the engine is still booting) join the same handshake. Re-posting would
   * overwrite the single `handshake` slot, and the overwritten promise's
   * `resolve`/`reject` would be unreachable from every path — including
   * `dispose` — so it would hang forever. */
  private boot(): Promise<void> {
    const inFlight = this.booting;
    if (inFlight !== null) return inFlight;

    const b = (async () => {
      await this.waitFor('uciok');
      await this.waitFor('readyok');
    })();
    this.booting = b;
    // Cleared once the handshake settles so the next boot (after an error, a
    // timeout, or a dispose) is a real one. The identity check stops a slow
    // boot's cleanup from clearing a newer boot's slot.
    const clear = (): void => {
      if (this.booting === b) this.booting = null;
    };
    return b.then(clear, (e: unknown) => {
      clear();
      throw e;
    });
  }

  async newGame(): Promise<void> {
    const w = this.ensureWorker();
    // The gate reads the status that `ensureWorker` just set: a client that has
    // never booted is 'loading', so this fires exactly once per worker.
    if (this.statusValue === 'idle' || this.statusValue === 'loading' || this.errorValue !== null) {
      // Only the handshake is memoised. Everything below still runs for *every*
      // caller, so a second New Game posts its own `ucinewgame` and its own
      // Skill Level — sharing the boot must not swallow that.
      await this.boot();
      this.errorValue = null;
    }

    w.postMessage(cmd.ucinewgame());
    // Re-sent after every ucinewgame (plan: the difficulty presets), so a client
    // that boots through newGame() rather than through a search is configured
    // too, and a repeat newGame() is still idempotent. The **play** level, not
    // `skillLevelInEffect`: a new game resets the engine's state, so this is the
    // point that decides what the opponent will play at next.
    w.postMessage(cmd.setSkillLevel(this.playSkillLevel));
    this.skillLevelInEffect = this.playSkillLevel;
    this.setStatus('ready');
  }

  async setSkillLevel(level: number): Promise<void> {
    this.playSkillLevel = level;
    const w = this.worker;
    // No worker yet: the level is stored and sent by the next newGame(), which
    // always re-sends it. Posting it mid-search is safe — the engine only reads
    // options when it starts the *next* search, so an in-flight one is untouched.
    if (w === null) return;

    w.postMessage(cmd.setSkillLevel(level));
    this.skillLevelInEffect = level;
  }

  /** The level the opponent plays at. The door needs it per reply, and the only
   *  thing that declares it is `setSkillLevel` — which is why this is a getter
   *  rather than a copy the door took once and could not keep fresh. */
  get playLevel(): number {
    return this.playSkillLevel;
  }

  /**
   * Search `fen`, and report the result in the engine's own frame of reference.
   *
   * `skillLevel` is **scoped to this search** and defaults to
   * `ADVICE_SKILL_LEVEL`, not to the level `setSkillLevel()` last set. That default
   * is the whole point: the opponent is handicapped, the advice is not, and a
   * sticky `setoption` means the only way to be sure of a search's strength is to
   * state it on the search itself. A caller that genuinely wants the play level —
   * `bestMove`, and only `bestMove` — passes it explicitly; anything that does not
   * know about the concept gets the advice channel by default, so a new caller
   * cannot inherit the bug.
   *
   * The option is sent only when it differs from `skillLevelInEffect`, the client's
   * record of what the live engine holds. Sending it unconditionally would be
   * correct too and strictly simpler, and it is not: it is one extra line per
   * search, on the hot path of every reply and every evaluation, for a value that
   * rarely changes.
   */
  async search(
    fen: string,
    opts: { movetimeMs: number; multiPv?: number; skillLevel?: number },
  ): Promise<SearchResult> {
    // ensureWorker() first: on a fresh client it moves the status to 'loading',
    // which is what makes the boot gate below fire.
    const w = this.ensureWorker();
    if (this.statusValue === 'idle' || this.statusValue === 'loading' || this.errorValue !== null) {
      await this.newGame();
    }

    this.supersedePendingSearch();

    const multiPv = opts.multiPv ?? 1;
    // Before `position` and `go`, and only when it differs: the engine reads its
    // options when the *next* search starts, so posting it here cannot disturb an
    // in-flight one — and the door in `useEngine` serialises searches anyway, so
    // there is never another search to interleave with. No restore afterwards: the
    // next `search` states its own level, and the next `bestMove` passes the play
    // level explicitly, so a leftover 20 cannot outlive the search that wanted it.
    // Restoring would be equally correct and would add a second write to a value
    // every caller now declares for itself.
    const skillLevel = opts.skillLevel ?? ADVICE_SKILL_LEVEL;
    if (skillLevel !== this.skillLevelInEffect) {
      w.postMessage(cmd.setSkillLevel(skillLevel));
      this.skillLevelInEffect = skillLevel;
    }
    w.postMessage(cmd.setMultiPv(multiPv));
    w.postMessage(cmd.position(fen));
    this.setStatus('thinking');

    return new Promise<SearchResult>((resolve, reject) => {
      const state: PendingSearch = {
        id: ++this.nextSearchId,
        worker: w,
        lines: new Map(),
        aborted: false,
        resolve,
        reject,
        timer: setTimeout(
          () => this.searchTimedOut(state, opts.movetimeMs),
          opts.movetimeMs + SEARCH_TIMEOUT_SLACK_MS,
        ),
      };
      this.pending = state;
      this.awaitingBestmove.push(state.id);
      w.postMessage(cmd.goMovetime(opts.movetimeMs));
    });
  }

  /** A newer search owns the engine; the older one can never be answered, so it
   * is rejected now rather than left hanging on a timer. The worker stays: it
   * still owes an answer for this search, and `awaitingBestmove` is what stops
   * that answer from reaching the replacement. */
  private supersedePendingSearch(): void {
    const p = this.pending;
    if (p === null) return;

    this.pending = null;
    clearTimeout(p.timer);
    p.reject(new EngineError('superseded', 'Search superseded by a newer search'));
  }

  private searchTimedOut(state: PendingSearch, movetimeMs: number): void {
    // Identity-checked against the state that owns this timer, so a superseded
    // search's timer can neither fail nor clear the slot of the search that
    // replaced it. The worker is taken from the same captured state rather than
    // from `this.worker`, so `stop` cannot address a replacement either.
    if (this.pending !== state) return;

    this.pending = null;
    // The protocol's own abort, per the plan's "stop on abort".
    state.worker.postMessage(cmd.stop());
    // Ignoring `go movetime` plus 10s of slack means the worker is not slow, it
    // is gone, so it is dropped rather than reused: the answer to *this* search
    // is still coming and must not reach the next one.
    this.dropWorker();
    this.setStatus('ready');
    state.reject(
      new EngineError(
        'timeout',
        `Engine search timed out after ${movetimeMs + SEARCH_TIMEOUT_SLACK_MS}ms`,
      ),
    );
  }

  dispose(): void {
    // Set first, before anything else, and synchronously. `uciok` and `readyok`
    // arrive as separate messages, so there is a microtask boundary between the
    // boot's two `waitFor` calls where `this.handshake` is null and the boot is
    // still live. Disposing there used to reject nothing, and the resumed boot
    // then called `ensureWorker` — which built a *second* worker, because this
    // one had just been nulled — and re-handshaked against it, leaving the
    // caller's promise unsettled forever. The flag makes that respawn impossible
    // and the boot rejects on its next `ensureWorker` instead.
    this.disposed = true;

    // Reject first: a caller awaiting a search or a boot must not hang on a
    // promise whose worker has just been terminated. A joining boot is rejected
    // through the same handshake, so it settles too.
    const err = new EngineError('disposed', 'Engine client disposed');
    const hs = this.handshake;
    if (hs !== null) {
      this.handshake = null;
      clearTimeout(hs.timer);
      hs.reject(err);
    }
    const p = this.pending;
    if (p !== null) {
      this.pending = null;
      clearTimeout(p.timer);
      p.reject(err);
    }

    const w = this.worker;
    if (w !== null) {
      try {
        w.postMessage(cmd.quit());
      } catch {
        // Already gone; terminate() below is the cleanup that matters.
      }
    }
    this.dropWorker();
    this.booting = null;
    // A disposed client is not a failed one: `status` is 'idle' and `error` is
    // null, so a later `search()` starts from a clean slate rather than
    // re-reporting a failure the caller already tore down.
    this.errorValue = null;
    this.setStatus('idle');
  }
}
