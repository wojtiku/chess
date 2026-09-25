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
}

/** A silent worker (bad WASM path, blocked, dead) is a boot failure, not a
 * search failure: 20s is far longer than a healthy lite build needs. */
const HANDSHAKE_TIMEOUT_MS = 20_000;

/** Head-room above `go movetime` before a search is declared dead. The engine
 * honours `go movetime` and answers well inside its budget; the plan's real
 * budgets are 1500ms (opponent) and 3000ms (hint/analysis), so this ceiling
 * cannot fire before `bestmove` in normal operation. */
const SEARCH_TIMEOUT_SLACK_MS = 10_000;

/** Plan: difficulty presets are Beginner 1, Easy 4, Medium 8, Hard 13, Expert
 * 20, and Medium is the default. */
const DEFAULT_SKILL_LEVEL = 8;

/** Why a request failed, in a form a caller can branch on.
 *
 * `worker-died` and `handshake-timeout` are the engine being unavailable, which
 * is the one case where re-issuing the request is sensible. `superseded` means
 * the caller itself moved on, and `disposed` means the client is gone; retrying
 * either would be wrong. `timeout` is deliberately **not** retryable: the budget
 * is a hard cap by design, the client has already thrown the worker away, and a
 * machine slow enough to blow `movetime + 10s` once will do it again — the
 * caller is better served by an error it can show than by a silent second wait
 * of the same length. */
export type EngineFailureCode =
  | 'worker-died'
  | 'handshake-timeout'
  | 'timeout'
  | 'superseded'
  | 'disposed';

const RETRYABLE: ReadonlySet<EngineFailureCode> = new Set<EngineFailureCode>([
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
    this.retryable = RETRYABLE.has(code);
  }
}

interface PendingSearch {
  /** Identity of this search, matched against the `bestmove` queue. */
  id: number;
  /** The worker this search was issued to, so a late callback cannot address
   * a replacement. */
  worker: Worker;
  lines: Map<number, PvLine>;
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
  private skillLevel = DEFAULT_SKILL_LEVEL;
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
    p.resolve({ bestMove: move, lines, depth });
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
    // too, and a repeat newGame() is still idempotent.
    w.postMessage(cmd.setSkillLevel(this.skillLevel));
    this.setStatus('ready');
  }

  async setSkillLevel(level: number): Promise<void> {
    this.skillLevel = level;
    const w = this.worker;
    // No worker yet: the level is stored and sent by the next newGame(), which
    // always re-sends it. Posting it mid-search is safe — the engine only reads
    // options when it starts the *next* search, so an in-flight one is untouched.
    if (w === null) return;

    w.postMessage(cmd.setSkillLevel(level));
  }

  async search(
    fen: string,
    opts: { movetimeMs: number; multiPv?: number },
  ): Promise<SearchResult> {
    // ensureWorker() first: on a fresh client it moves the status to 'loading',
    // which is what makes the boot gate below fire.
    const w = this.ensureWorker();
    if (this.statusValue === 'idle' || this.statusValue === 'loading' || this.errorValue !== null) {
      await this.newGame();
    }

    this.supersedePendingSearch();

    const multiPv = opts.multiPv ?? 1;
    w.postMessage(cmd.setMultiPv(multiPv));
    w.postMessage(cmd.position(fen));
    this.setStatus('thinking');

    return new Promise<SearchResult>((resolve, reject) => {
      const state: PendingSearch = {
        id: ++this.nextSearchId,
        worker: w,
        lines: new Map(),
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
