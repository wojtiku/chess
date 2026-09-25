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

interface PendingSearch {
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
  private errorValue: Error | null = null;
  private skillLevel = DEFAULT_SKILL_LEVEL;
  private pending: PendingSearch | null = null;
  private handshake: Handshake | null = null;
  private readonly subscribers = new Set<(s: EngineStatus) => void>();

  constructor(private readonly opts: { workerUrl?: string } = {}) {}

  get status(): EngineStatus {
    return this.statusValue;
  }

  get error(): Error | null {
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
    for (const cb of [...this.subscribers]) cb(s);
  }

  /** Created on first use, never in the constructor: the ~1.8MB engine must stay
   * off the first-paint path (spec §7.4). */
  private ensureWorker(): Worker {
    const existing = this.worker;
    if (existing !== null) return existing;

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
    this.fail(ev instanceof Error ? ev : new Error('Engine worker error'));
  };

  private settleSearch(move: string | null): void {
    const p = this.pending;
    // A `bestmove` with nothing in flight is either a leftover answer to a
    // search that already settled, or one for a worker that was dropped. It
    // resolves nobody — in particular it must not resolve a *later* search.
    if (p === null) return;

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
  private fail(err: Error): void {
    this.errorValue = err;
    this.dropWorker();
    this.setStatus('error');

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
  }

  /** Terminate and unhook the current worker. No option bookkeeping is needed
   * here: a replacement is only ever reached through `ensureWorker`, which moves
   * the status to 'loading' and so always routes the next `search` through
   * `newGame` — and `newGame` re-sends the skill level unconditionally. */
  private dropWorker(): void {
    const w = this.worker;
    if (w === null) return;

    this.worker = null;
    w.removeEventListener('message', this.onMessage);
    w.removeEventListener('error', this.onError);
    w.terminate();
  }

  private waitFor(want: 'uciok' | 'readyok'): Promise<void> {
    const w = this.ensureWorker();
    return new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => this.handshakeTimedOut(want, timer),
        HANDSHAKE_TIMEOUT_MS,
      );
      this.handshake = { want, resolve, reject, timer };
      w.postMessage(want === 'uciok' ? cmd.uci() : cmd.isready());
    });
  }

  private handshakeTimedOut(
    want: 'uciok' | 'readyok',
    timer: ReturnType<typeof setTimeout>,
  ): void {
    const hs = this.handshake;
    // Identity-checked: a handshake that has already been answered must not be
    // failed by its own stale timer. The slot is left in place for `fail`, which
    // clears it and rejects it — clearing it here first would leave the promise
    // pending forever.
    if (hs === null || hs.want !== want || hs.timer !== timer) return;

    this.fail(new Error(`Engine did not answer ${want} in time`));
  }

  async newGame(): Promise<void> {
    const w = this.ensureWorker();
    // The gate reads the status that `ensureWorker` just set: a client that has
    // never booted is 'loading', so this fires exactly once per worker.
    if (this.statusValue === 'idle' || this.statusValue === 'loading' || this.errorValue !== null) {
      await this.waitFor('uciok');
      await this.waitFor('readyok');
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
        lines: new Map(),
        resolve,
        reject,
        timer: setTimeout(
          () => this.searchTimedOut(state, opts.movetimeMs),
          opts.movetimeMs + SEARCH_TIMEOUT_SLACK_MS,
        ),
      };
      this.pending = state;
      w.postMessage(cmd.goMovetime(opts.movetimeMs));
    });
  }

  /** A newer search owns the engine; the older one can never receive its
   * `bestmove`, so it is rejected now rather than left hanging on a timer. */
  private supersedePendingSearch(): void {
    const p = this.pending;
    if (p === null) return;

    this.pending = null;
    clearTimeout(p.timer);
    p.reject(new Error('Search superseded by a newer search'));
  }

  private searchTimedOut(state: PendingSearch, movetimeMs: number): void {
    // Identity-checked: a superseded search's timer must not fail — or worse,
    // clear the slot of — the search that replaced it.
    if (this.pending !== state) return;

    this.pending = null;
    // The protocol's own abort, per the plan's "stop on abort". It is not what
    // makes this timeout safe — see below — it is what a still-alive worker is
    // told.
    this.worker?.postMessage(cmd.stop());
    // Ignoring `go movetime` plus 10s of slack means the worker is not slow, it
    // is gone, so it is dropped rather than reused. Reusing it is the dangerous
    // option: the answer to *this* search is still coming, it would resolve the
    // next search, and the app would play a stale move.
    this.dropWorker();
    this.setStatus('ready');
    state.reject(
      new Error(`Engine search timed out after ${movetimeMs + SEARCH_TIMEOUT_SLACK_MS}ms`),
    );
  }

  dispose(): void {
    // Reject first: a caller awaiting a search or a boot must not hang on a
    // promise whose worker has just been terminated.
    const err = new Error('Engine client disposed');
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
    this.setStatus('idle');
  }
}
