import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineClient } from './engineClient';

type Listener = (ev: unknown) => void;

/** A stand-in for the browser's `Worker`.
 *
 * It keeps one listener set *per event type*, like the real thing. That detail
 * is load-bearing for the honesty of this suite: a harness with a single
 * `handler` slot (as the brief's had) is overwritten by the client's second
 * `addEventListener` call, so `emit('uciok')` would reach the *error* handler
 * and every functional test would fail loudly rather than pass vacuously — but a
 * harness that never delivers anything at all would make a broken client look
 * green. `onmessage`/`onerror` exist here only so a test can prove the client
 * never uses them.
 */
class FakeWorker {
  static last: FakeWorker | null = null;
  static created = 0;

  sent: string[] = [];
  terminated = false;
  onmessage: Listener | null = null;
  onerror: Listener | null = null;

  private readonly listeners = new Map<string, Set<Listener>>();
  private waiters: Array<(line: string) => void> = [];

  constructor(public readonly url: string) {
    FakeWorker.last = this;
    FakeWorker.created += 1;
  }

  postMessage(data: string): void {
    this.sent.push(data);
    // Every waiter is offered every line and unsubscribes itself on a match.
    // Draining the list here would silently discard the waiters that this line
    // does not satisfy, and the next matching post would find nobody waiting.
    for (const waiter of [...this.waiters]) waiter(data);
  }

  addEventListener(type: string, listener: Listener): void {
    const set = this.listeners.get(type) ?? new Set<Listener>();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener): void {
    this.listeners.get(type)?.delete(listener);
  }

  terminate(): void {
    this.terminated = true;
  }

  listenerCount(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }

  /** Deliver one engine line to the `message` listeners. */
  emit(line: string): void {
    this.dispatch('message', { data: line });
  }

  /** Simulate a worker-level failure. */
  emitError(err: unknown): void {
    this.dispatch('error', err);
  }

  sentMatching(pattern: RegExp): string[] {
    return this.sent.filter((line) => pattern.test(line));
  }

  /** Index into `sent`, so a test can wait for the *next* `go` and not the last. */
  mark(): number {
    return this.sent.length;
  }

  waitForSent(pattern: RegExp): Promise<string> {
    return this.waitForSentSince(0, pattern);
  }

  /** Resolves when a matching line is posted after `mark`, so no test has to
   * guess how many microtask ticks the client needs to reach its next post. */
  waitForSentSince(mark: number, pattern: RegExp): Promise<string> {
    const seen = this.sent.slice(mark).find((line) => pattern.test(line));
    if (seen !== undefined) return Promise.resolve(seen);
    return new Promise<string>((resolve) => {
      const check = (line: string): void => {
        if (!pattern.test(line)) return;
        this.waiters = this.waiters.filter((w) => w !== check);
        resolve(line);
      };
      this.waiters.push(check);
    });
  }

  private dispatch(type: string, ev: unknown): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(ev);
  }
}

const realWorker = (globalThis as { Worker?: unknown }).Worker;

function install(): void {
  (globalThis as unknown as { Worker: unknown }).Worker = FakeWorker;
  FakeWorker.last = null;
  FakeWorker.created = 0;
}

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const SKILL = /^setoption name Skill Level value /;
const MOVETIME = /^go movetime /;

/** Answer the `uci`/`isready` handshake the client performs on boot. */
async function handshake(w: FakeWorker): Promise<void> {
  await w.waitForSent(/^uci$/);
  w.emit('uciok');
  await w.waitForSent(/^isready$/);
  w.emit('readyok');
}

/** Start a search and drive it as far as the `go` that issues it. */
async function boot(
  client: EngineClient,
  opts: { movetimeMs: number; multiPv?: number } = { movetimeMs: 50 },
): Promise<{ p: Promise<Awaited<ReturnType<EngineClient['search']>>>; w: FakeWorker }> {
  const p = client.search(START_FEN, opts);
  swallow(p);
  const w = FakeWorker.last!;
  await handshake(w);
  await w.waitForSent(MOVETIME);
  return { p, w };
}

/** `newGame()` on a fresh client, driven to completion. */
async function bootNewGame(client: EngineClient): Promise<FakeWorker> {
  const p = client.newGame();
  swallow(p);
  const w = FakeWorker.last!;
  await handshake(w);
  await p;
  return w;
}

function swallow(p: Promise<unknown>): void {
  // Attach a no-op handler now so a rejection arriving before the assertion is
  // not reported as an unhandled rejection.
  p.catch(() => {});
}

describe('FakeWorker harness', () => {
  it('delivers messages to message listeners and errors to error listeners', () => {
    const w = new FakeWorker('/engine/stockfish.js');
    const messages: string[] = [];
    const errors: string[] = [];
    w.addEventListener('message', (ev) => {
      messages.push(String((ev as { data: string }).data));
    });
    w.addEventListener('error', (ev) => {
      errors.push(String(ev));
    });

    w.emit('uciok');
    w.emitError(new Error('worker died'));

    expect(messages).toEqual(['uciok']);
    expect(errors).toHaveLength(1);
  });

  it('stops delivering to a removed listener, and keeps the others', () => {
    const w = new FakeWorker('/engine/stockfish.js');
    const first: string[] = [];
    const second: string[] = [];
    const firstListener: Listener = (ev) => {
      first.push(String((ev as { data: string }).data));
    };
    w.addEventListener('message', firstListener);
    w.addEventListener('message', (ev) => {
      second.push(String((ev as { data: string }).data));
    });

    w.emit('before');
    w.removeEventListener('message', firstListener);
    w.emit('after');

    expect(first).toEqual(['before']);
    expect(second).toEqual(['before', 'after']);
  });
});

describe('EngineClient', () => {
  beforeEach(() => {
    install();
  });

  afterEach(() => {
    vi.useRealTimers();
    (globalThis as { Worker?: unknown }).Worker = realWorker;
  });

  describe('worker creation', () => {
    it('performs the uci/isready handshake before searching', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);

      expect(w.url).toBe('/engine/stockfish.js');
      expect(w.sent).toContain('uci');
      expect(w.sent).toContain('isready');
      c.dispose();
    });

    it('creates the worker with no URL hash (auto-run UCI mode)', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);

      expect(w.url).not.toContain('#');
      c.dispose();
    });

    it('honours a workerUrl override', async () => {
      const c = new EngineClient({ workerUrl: '/custom/engine.js' });
      const { w } = await boot(c);

      expect(w.url).toBe('/custom/engine.js');
      c.dispose();
    });

    it('registers exactly one message and one error listener, and removes both on dispose', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);

      // Proves the client subscribes with addEventListener: the fake only
      // records listeners that way.
      expect(w.listenerCount('message')).toBe(1);
      expect(w.listenerCount('error')).toBe(1);

      c.dispose();

      expect(w.listenerCount('message')).toBe(0);
      expect(w.listenerCount('error')).toBe(0);
    });

    it('never assigns onmessage or onerror', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);

      // A client that used `w.onmessage = fn` would still work in a browser but
      // would be invisible to this harness, and every test below would pass
      // vacuously. The fake leaves both null unless the client writes them.
      expect(w.onmessage).toBeNull();
      expect(w.onerror).toBeNull();
      c.dispose();
    });

    it('is created lazily: the constructor alone starts nothing', () => {
      const c = new EngineClient();

      expect(FakeWorker.created).toBe(0);
      expect(c.status).toBe('idle');
      c.dispose();
    });
  });

  describe('search results', () => {
    it('resolves with the best move and parsed lines', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 18 multipv 1 score cp 31 nodes 900 nps 900 time 10 pv e2e4 e7e5 g1f3');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.bestMove).toBe('e2e4');
      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatchObject({ uci: 'e2e4', scoreCp: 31, depth: 18 });
      expect(r.lines[0]!.pv).toEqual(['e2e4', 'e7e5', 'g1f3']);
      expect(r.depth).toBe(18);
      c.dispose();
    });

    it('keeps a promotion move intact in bestMove and in the PV', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 22 multipv 1 score cp 900 pv a7a8q a8d8 d1h5');
      w.emit('bestmove a7a8q');
      const r = await p;

      // Plan review focus #3: a 4-character slice would drop the promotion piece.
      expect(r.bestMove).toBe('a7a8q');
      expect(r.lines[0]!.uci).toBe('a7a8q');
      expect(r.lines[0]!.pv[0]).toBe('a7a8q');
      c.dispose();
    });

    it('returns several lines for multiPv > 1, sorted best to worst', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 18 multipv 2 score cp 10 pv d2d4');
      w.emit('info depth 18 multipv 1 score cp 31 pv e2e4');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines.map((l) => l.uci)).toEqual(['e2e4', 'd2d4']);
      c.dispose();
    });

    it('reports the deepest depth seen across the lines', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 50, multiPv: 2 });

      w.emit('info depth 14 multipv 1 score cp 31 pv e2e4');
      w.emit('info depth 22 multipv 2 score cp 10 pv d2d4');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.depth).toBe(22);
      expect(r.lines.map((l) => l.depth)).toEqual([14, 22]);
      c.dispose();
    });

    it('keeps the last line reported for a multiPv index', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 8 multipv 1 score cp 90 pv a2a3');
      w.emit('info depth 19 multipv 1 score cp 31 pv e2e4');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]).toMatchObject({ uci: 'e2e4', scoreCp: 31, depth: 19 });
      c.dispose();
    });

    it('ignores lowerbound scores when building lines', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      // The bounded line arrives *last*, so if it were not filtered it would
      // overwrite the real evaluation for this multiPv index.
      w.emit('info depth 18 multipv 1 score cp 31 pv e2e4');
      w.emit('info depth 19 multipv 1 score cp 500 lowerbound pv a2a3');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]!.uci).toBe('e2e4');
      expect(r.lines[0]!.scoreCp).toBe(31);
      c.dispose();
    });

    it('ignores upperbound scores when building lines', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 18 multipv 1 score cp 31 pv e2e4');
      w.emit('info depth 19 multipv 1 score cp -500 upperbound pv h2h3');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines).toHaveLength(1);
      expect(r.lines[0]!.uci).toBe('e2e4');
      expect(r.lines[0]!.scoreCp).toBe(31);
      c.dispose();
    });

    it('drops a bounded line for a multiPv index that has no unbounded line', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 50, multiPv: 2 });

      w.emit('info depth 18 multipv 1 score cp 31 pv e2e4');
      w.emit('info depth 18 multipv 2 score cp 900 lowerbound pv a2a3');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines.map((l) => l.uci)).toEqual(['e2e4']);
      c.dispose();
    });

    it('carries a mate score through without a centipawn score', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 9 multipv 1 score mate 3 pv d1h5');
      w.emit('bestmove d1h5');
      const r = await p;

      expect(r.lines[0]).toMatchObject({ scoreMate: 3 });
      expect(r.lines[0]!.scoreCp).toBeUndefined();
      c.dispose();
    });

    it('prefers mate and omits centipawns when a line carries both', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 9 multipv 1 score cp 250 mate 3 pv d1h5');
      w.emit('bestmove d1h5');
      const r = await p;

      expect(r.lines[0]!.scoreMate).toBe(3);
      expect('scoreCp' in r.lines[0]!).toBe(false);
      c.dispose();
    });

    it('omits absent score keys instead of emitting them as undefined', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 5 multipv 1 pv e2e4 e7e5');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(Object.keys(r.lines[0]!).sort()).toEqual(['depth', 'pv', 'uci']);
      c.dispose();
    });

    it('ignores `info string` chatter, which parses as a depth-0 info event', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      // Task 2 hands these to us as {type:'info', depth:0, multiPv:1, pv:[]},
      // so the filter has to be on pv.length, not on the event type.
      w.emit('info string NNUE evaluation using nn-62ef826d1a6d.nnue enabled');
      w.emit('info string');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines).toEqual([]);
      expect(r.depth).toBe(0);
      expect(r.bestMove).toBe('e2e4');
      c.dispose();
    });

    it('ignores an info line with no pv even when it carries a score', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('info depth 12 currmove e2e4 currmovenumber 1 score cp 31');
      w.emit('bestmove e2e4');
      const r = await p;

      expect(r.lines).toEqual([]);
      c.dispose();
    });

    it('ignores a bestmove that arrives with no search in flight', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);
      w.emit('bestmove e2e4');
      await p;

      // A leftover answer to the search that just finished must not disturb the
      // idle client, and must not be waiting for the next one.
      w.emit('bestmove a2a3');
      expect(c.status).toBe('ready');

      const mark = w.mark();
      const second = c.search(START_FEN, { movetimeMs: 50 });
      await w.waitForSentSince(mark, MOVETIME);
      w.emit('bestmove d2d4');

      await expect(second).resolves.toMatchObject({ bestMove: 'd2d4' });
      c.dispose();
    });

    it('reports a missing bestmove as a terminal result, not a crash', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('bestmove (none)');
      const r = await p;

      expect(r.bestMove).toBeNull();
      expect(r.lines).toEqual([]);
      c.dispose();
    });

    it('treats the protocol\'s other spelling of "no move" the same way', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('bestmove 0000');
      const r = await p;

      expect(r.bestMove).toBeNull();
      c.dispose();
    });

    it('resolves with depth 0 and no lines when only a bestmove arrives', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('bestmove e2e4');
      const r = await p;

      expect(r).toEqual({ bestMove: 'e2e4', lines: [], depth: 0 });
      c.dispose();
    });
  });

  describe('commands sent', () => {
    it('sends position and go with the given time budget', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 1500 });

      w.emit('bestmove e2e4');
      await p;

      expect(w.sent).toContain(`position fen ${START_FEN}`);
      expect(w.sent).toContain('go movetime 1500');
      c.dispose();
    });

    it('sends MultiPV, position and go in that order', async () => {
      const c = new EngineClient();
      const { w } = await boot(c, { movetimeMs: 50, multiPv: 3 });

      const multiPv = w.sent.indexOf('setoption name MultiPV value 3');
      const position = w.sent.indexOf(`position fen ${START_FEN}`);
      const go = w.sent.indexOf('go movetime 50');

      expect(multiPv).toBeGreaterThan(-1);
      expect(multiPv).toBeLessThan(position);
      expect(position).toBeLessThan(go);
      c.dispose();
    });

    it('defaults MultiPV to 1 when the caller does not ask for lines', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);

      expect(w.sent).toContain('setoption name MultiPV value 1');
      c.dispose();
    });

    it('re-sends Skill Level after ucinewgame', async () => {
      const c = new EngineClient();
      const w = await bootNewGame(c);

      expect(w.sent).toContain('ucinewgame');
      // Plan: Medium (8) is the default difficulty preset.
      expect(w.sent).toContain('setoption name Skill Level value 8');
      const ucinewgame = w.sent.indexOf('ucinewgame');
      const skill = w.sent.indexOf('setoption name Skill Level value 8');
      expect(ucinewgame).toBeLessThan(skill);
      c.dispose();
    });

    it('does not repeat the handshake on a second newGame', async () => {
      const c = new EngineClient();
      const w = await bootNewGame(c);
      await c.newGame();

      expect(w.sentMatching(/^uci$/)).toHaveLength(1);
      expect(w.sentMatching(/^isready$/)).toHaveLength(1);
      expect(w.sentMatching(/^ucinewgame$/)).toHaveLength(2);
      expect(w.sentMatching(SKILL)).toHaveLength(2);
      c.dispose();
    });

    it('applies a skill level set before any worker exists, on the first search', async () => {
      const c = new EngineClient();
      await c.setSkillLevel(13);
      expect(FakeWorker.created).toBe(0);

      const { w } = await boot(c);

      // Exactly one Skill Level line, and it is the one that was asked for.
      expect(w.sentMatching(SKILL)).toEqual(['setoption name Skill Level value 13']);
      c.dispose();
    });

    it('posts a skill level change immediately once a worker exists', async () => {
      const c = new EngineClient();
      const { w } = await boot(c);
      const mark = w.mark();

      await c.setSkillLevel(1);

      expect(w.sent.slice(mark)).toEqual(['setoption name Skill Level value 1']);
      c.dispose();
    });

    it('a skill level change while thinking neither cancels nor corrupts the search', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      await c.setSkillLevel(20);
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      expect(w.sentMatching(/^stop$/)).toHaveLength(0);
      c.dispose();
    });

    it('quits the worker on dispose', async () => {
      const c = new EngineClient();
      const w = await bootNewGame(c);

      c.dispose();

      expect(w.sent).toContain('quit');
      c.dispose();
    });
  });

  describe('handshake', () => {
    it('does not accept a readyok in place of the uciok it is waiting for', async () => {
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 50 });
      const w = FakeWorker.last!;
      await w.waitForSent(/^uci$/);

      // Out of order: answering the wrong question must not advance the boot.
      // The flush matters — a client that wrongly accepted this would post
      // `isready` on a later microtask, after a bare synchronous assertion.
      w.emit('readyok');
      await new Promise((r) => setTimeout(r, 0));
      expect(w.sent).not.toContain('isready');

      w.emit('uciok');
      await w.waitForSent(/^isready$/);
      w.emit('readyok');
      await w.waitForSent(MOVETIME);
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      c.dispose();
    });

    it('tolerates the id banner and other chatter around the handshake', async () => {
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 50 });
      const w = FakeWorker.last!;
      await w.waitForSent(/^uci$/);

      w.emit('id name Stockfish 19');
      w.emit('id author the Stockfish developers');
      w.emit('copyprotection');
      w.emit('   ');            // blank line: parseUciLine returns null
      w.emit('uciok');
      await w.waitForSent(/^isready$/);
      w.emit('readyok');
      await w.waitForSent(MOVETIME);
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      c.dispose();
    });

    it('ignores a blank line during a search', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emit('');
      w.emit('   ');
      w.emit('info depth 18 multipv 1 score cp 31 pv e2e4');
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4', lines: [{ uci: 'e2e4' }] });
      c.dispose();
    });

    it('survives a duplicate uciok and never resolves twice', async () => {
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 50 });
      const w = FakeWorker.last!;
      await w.waitForSent(/^uci$/);

      w.emit('uciok');
      w.emit('uciok');
      await w.waitForSent(/^isready$/);
      w.emit('readyok');
      await w.waitForSent(MOVETIME);
      w.emit('bestmove e2e4');
      w.emit('bestmove d2d4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      c.dispose();
    });

    it('fails a silent engine after the handshake timeout and leaves nothing behind', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 1000 });
      swallow(p);
      const w = FakeWorker.last!;
      await w.waitForSent(/^uci$/);

      vi.advanceTimersByTime(19_999);
      expect(c.status).not.toBe('error');

      vi.advanceTimersByTime(1);
      await expect(p).rejects.toThrow(/uciok/);
      expect(c.status).toBe('error');
      expect(c.error).toBeInstanceOf(Error);
      expect(w.terminated).toBe(true);
      c.dispose();
    });

    it('rebuilds the worker and its handshake after a handshake timeout', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 1000 });
      swallow(p);
      const first = FakeWorker.last!;
      await first.waitForSent(/^uci$/);
      vi.advanceTimersByTime(20_000);
      await expect(p).rejects.toThrow(/uciok/);

      const second = c.search(START_FEN, { movetimeMs: 1000 });
      const w = FakeWorker.last!;
      expect(w).not.toBe(first);
      expect(FakeWorker.created).toBe(2);

      await handshake(w);
      await w.waitForSent(MOVETIME);
      w.emit('bestmove d2d4');

      await expect(second).resolves.toMatchObject({ bestMove: 'd2d4' });
      expect(c.status).toBe('ready');
      c.dispose();
    });
  });

  describe('failure states', () => {
    it('rejects a search when the worker dies mid-search', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emitError(new Error('worker died'));

      await expect(p).rejects.toThrow('worker died');
      expect(c.status).toBe('error');
      expect(c.error?.message).toBe('worker died');
      expect(w.terminated).toBe(true);
      c.dispose();
    });

    it('accepts a non-Error failure event without losing the promise', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      w.emitError('script error');

      await expect(p).rejects.toThrow('Engine worker error');
      expect(c.status).toBe('error');
      c.dispose();
    });

    it('recovers on the next search after a worker death', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);
      w.emitError(new Error('worker died'));
      await expect(p).rejects.toThrow();

      const second = c.search(START_FEN, { movetimeMs: 50 });
      const w2 = FakeWorker.last!;
      expect(w2).not.toBe(w);

      await handshake(w2);
      await w2.waitForSent(MOVETIME);
      w2.emit('bestmove d2d4');
      const r = await second;

      expect(r.bestMove).toBe('d2d4');
      expect(c.status).toBe('ready');
      expect(c.error).toBeNull();
      // A replacement worker has no engine options until it is told.
      expect(w2.sentMatching(SKILL)).toEqual(['setoption name Skill Level value 8']);
      c.dispose();
    });

    it('does not leave a pending search behind after a worker death', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);
      w.emitError(new Error('worker died'));
      await expect(p).rejects.toThrow();

      // The dead worker is unhooked, so its late bestmove reaches nobody, and the
      // replacement worker settles on its own answer.
      expect(w.listenerCount('message')).toBe(0);
      w.emit('bestmove a2a3');

      const second = c.search(START_FEN, { movetimeMs: 50 });
      const w2 = FakeWorker.last!;
      await handshake(w2);
      await w2.waitForSent(MOVETIME);
      w2.emit('bestmove d2d4');

      await expect(second).resolves.toMatchObject({ bestMove: 'd2d4' });
      c.dispose();
    });

    it('supersedes an in-flight search instead of leaving it hanging', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);
      const first = p.then(
        () => 'resolved',
        (e: unknown) => (e as Error).message,
      );

      const mark = w.mark();
      const second = c.search(START_FEN, { movetimeMs: 50 });
      await w.waitForSentSince(mark, MOVETIME);

      await expect(first).resolves.toMatch(/superseded/);

      w.emit('bestmove e2e4');
      await expect(second).resolves.toMatchObject({ bestMove: 'e2e4' });
      c.dispose();
    });

    it('rejects an in-flight search when dispose() is called', async () => {
      const c = new EngineClient();
      const { p, w } = await boot(c);

      c.dispose();

      await expect(p).rejects.toThrow(/disposed/);
      expect(c.status).toBe('idle');
    });

    it('rejects a search that is still waiting for uciok when dispose() is called', async () => {
      const c = new EngineClient();
      const p = c.search(START_FEN, { movetimeMs: 50 });
      const w = FakeWorker.last!;
      await w.waitForSent(/^uci$/);

      c.dispose();

      await expect(p).rejects.toThrow(/disposed/);
      expect(w.terminated).toBe(true);
    });

    it('survives a search issued after dispose()', async () => {
      const c = new EngineClient();
      const first = await bootNewGame(c);
      c.dispose();

      const { p, w } = await boot(c, { movetimeMs: 50 });
      expect(w).not.toBe(first);

      w.emit('bestmove e2e4');
      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      c.dispose();
    });
  });

  describe('search timeout', () => {
    it('does not fire before bestmove for a real 1000ms movetime', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 1000 });

      // Three times the budget: the plan's largest real search is 3000ms.
      vi.advanceTimersByTime(3000);
      w.emit('info depth 12 multipv 1 score cp 20 pv e2e4');
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      expect(w.sentMatching(/^stop$/)).toHaveLength(0);
      c.dispose();
    });

    it('does not fire before bestmove for the plan\'s 3000ms analysis budget', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 3000 });

      vi.advanceTimersByTime(6000);
      w.emit('bestmove e2e4');

      await expect(p).resolves.toMatchObject({ bestMove: 'e2e4' });
      expect(w.sentMatching(/^stop$/)).toHaveLength(0);
      c.dispose();
    });

    it('stops the engine, rejects, and leaves the client usable', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 1000 });

      vi.advanceTimersByTime(11_000);

      await expect(p).rejects.toThrow(/timed out/);
      expect(w.sent).toContain('stop');
      expect(c.status).toBe('ready');
      c.dispose();
    });

    it('drops the timed-out worker so its late bestmove cannot answer the next search', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 1000 });
      vi.advanceTimersByTime(11_000);
      await expect(p).rejects.toThrow(/timed out/);

      // The mechanism, asserted rather than assumed: the abandoned worker is
      // terminated and unhooked, so a stale `bestmove` cannot resolve a search
      // that has not been issued yet, and cannot resolve the next one either.
      expect(w.terminated).toBe(true);
      expect(w.listenerCount('message')).toBe(0);

      const second = c.search(START_FEN, { movetimeMs: 1000 });
      const w2 = FakeWorker.last!;
      expect(w2).not.toBe(w);
      await handshake(w2);
      await w2.waitForSent(MOVETIME);

      let done = false;
      void second.then(
        () => {
          done = true;
        },
        () => {
          done = true;
        },
      );
      w.emit('bestmove a2a3');
      w.emit('bestmove e2e4');
      await Promise.resolve();
      expect(done).toBe(false);

      w2.emit('bestmove d2d4');
      await expect(second).resolves.toMatchObject({ bestMove: 'd2d4' });
      c.dispose();
    });

    it('a superseded search does not trip the timeout of its replacement', async () => {
      vi.useFakeTimers();
      const c = new EngineClient();
      const { p, w } = await boot(c, { movetimeMs: 1000 });
      const first = p.then(
        () => 'resolved',
        (e: unknown) => (e as Error).message,
      );

      const mark = w.mark();
      const second = c.search(START_FEN, { movetimeMs: 1000 });
      await w.waitForSentSince(mark, MOVETIME);
      await expect(first).resolves.toMatch(/superseded/);

      // 11s later it is the *replacement's* timer that fires, and only once.
      vi.advanceTimersByTime(11_000);
      await expect(second).rejects.toThrow(/timed out/);
      c.dispose();
    });
  });

  describe('status', () => {
    it('moves idle -> loading -> ready -> thinking -> ready', async () => {
      const c = new EngineClient();
      const seen: string[] = [];
      c.onStatus((s) => seen.push(s));

      const { p, w } = await boot(c);
      expect(c.status).toBe('thinking');
      w.emit('bestmove e2e4');
      await p;
      expect(c.status).toBe('ready');

      expect(seen).toEqual(['loading', 'ready', 'thinking', 'ready']);
      c.dispose();
    });

    it('notifies status subscribers and stops after dispose', async () => {
      const c = new EngineClient();
      const seen: string[] = [];
      const off = c.onStatus((s) => seen.push(s));

      await bootNewGame(c);
      off();
      const before = seen.length;

      await c.newGame();

      expect(seen.length).toBe(before);
      c.dispose();
    });

    it('reports idle again after dispose', async () => {
      const c = new EngineClient();
      await bootNewGame(c);
      const seen: string[] = [];
      c.onStatus((s) => seen.push(s));

      c.dispose();

      expect(c.status).toBe('idle');
      expect(seen).toEqual(['idle']);
    });

    it('tolerates a subscriber that unsubscribes while being notified', async () => {
      const c = new EngineClient();
      const seen: string[] = [];
      const off = c.onStatus((s) => {
        seen.push(s);
        off();
      });

      await bootNewGame(c);

      // The subscriber removed itself during the 'loading' notification, so the
      // 'ready' that follows must not reach it.
      expect(seen).toEqual(['loading']);
      c.dispose();
    });
  });
});
