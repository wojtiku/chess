import { describe, expect, it } from 'vitest';
import { makeEngineSource } from './evaluate';
import { AnalysisCache } from './cache';
import {
  ALL_ENGINE_FAILURE_CODES, EngineError, RETRYABLE_ENGINE_CODES, type SearchResult,
} from '../engine/engineClient';

// The brief's five `makeEngineSource` assertions are kept verbatim. Everything
// after them is additional: the brief has no retry at all, and spec §7.4's
// "recreate and retry once, second failure surfaces an error" rule is the whole
// reason this module sits between the engine and the UI.

// `aborted: false` is the shape every search that was *answered* has. It is written
// out rather than defaulted, so a test that means to exercise an interrupted search
// has to say so — the alternative is a helper that invents the answer to a question
// the test did not ask.
const SEARCH = (r: Partial<SearchResult>): SearchResult => ({
  bestMove: 'e2e4', lines: [{ uci: 'e2e4', scoreCp: 30, depth: 18, pv: ['e2e4'] }], depth: 18,
  aborted: false, ...r,
});

const FIVE_LINES: SearchResult['lines'] = [
  { uci: 'e2e4', scoreCp: 30, depth: 18, pv: ['e2e4'] },
  { uci: 'd2d4', scoreCp: 10, depth: 18, pv: ['d2d4'] },
  { uci: 'c2c4', scoreCp: 0, depth: 18, pv: ['c2c4'] },
  { uci: 'g1f3', scoreCp: -5, depth: 18, pv: ['g1f3'] },
  { uci: 'c2c3', scoreCp: -10, depth: 18, pv: ['c2c3'] },
];

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (v: T) => void;
  reject: (e: unknown) => void;
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('makeEngineSource', () => {
  it('returns an analysis built from the engine result', async () => {
    const src = makeEngineSource({ search: async () => SEARCH({}) });
    const a = await src.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    expect(a.depth).toBe(18);
    expect(a.scoreCp).toBe(30);
    expect(a.lines).toHaveLength(1);
  });

  it('defaults to 5 lines, a 3s budget, and full strength', async () => {
    // The brief writes this as `{ multiPv?: number; movetimeMs: number } = {}`,
    // which does not typecheck under `strict`: `{}` has no `movetimeMs`. The
    // spy record is what the assertion below is about, so the honest annotation
    // makes all three fields optional — `toEqual` still pins all three values.
    let seen: { multiPv?: number; movetimeMs?: number; skillLevel?: number } = {};
    const src = makeEngineSource({
      search: async (_f, o) => { seen = o; return SEARCH({}); },
    });
    await src.analyze('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    // `skillLevel: 20` is the review's Critical, asserted at the layer that owns
    // the analysis cache. Every analysis is advice, so the default is full
    // strength, and a test that only checked multiPv and movetimeMs would have
    // passed while the eval bar showed a handicapped score.
    expect(seen).toEqual({ multiPv: 5, movetimeMs: 3000, skillLevel: 20 });
  });

  it('honours an explicit skill level, and caches it separately', async () => {
    // The cache key carries the level, so an analysis at one level can never be
    // served to a caller who asked at another. A handicapped score is a *wrong*
    // score, not a stale one, and the bar would show it with no way to tell.
    const seen: number[] = [];
    const src = makeEngineSource({
      search: async (_f, o) => { seen.push(o.skillLevel ?? 0); return SEARCH({}); },
    });
    await src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4');
    await src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4', { skillLevel: 1 });
    await src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4');

    // Two searches, not three: the level-1 request got its own entry rather than
    // the level-20 answer, and the third call — level 20 again — was served from
    // the first call's cache. A key without the level would give `[20]` here and
    // hand a learner the advice engine's number in response to a different
    // question.
    expect(seen).toEqual([20, 1]);
  });

  it('serves a cached FEN without touching the engine', async () => {
    let calls = 0;
    const src = makeEngineSource({ search: async () => { calls++; return SEARCH({}); } });
    await src.analyze('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    await src.analyze('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    expect(calls).toBe(1);
  });

  it('propagates a null bestmove as an empty analysis', async () => {
    const src = makeEngineSource({
      search: async () => SEARCH({ bestMove: null, lines: [], depth: 0 }),
    });
    const a = await src.analyze('rnbqkb1r/pppp1ppp/5n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4');
    expect(a.lines).toEqual([]);
    expect(a.scoreCp).toBeUndefined();
  });

  it('rejects when the engine throws, and does not cache the failure', async () => {
    let n = 0;
    const src = makeEngineSource({
      search: async () => { n++; throw new Error('engine down'); },
    });
    await expect(src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 4 4')).rejects.toThrow('engine down');
    await expect(src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5Q2/PPPP1PPP/RNB1K1NR b KQkq - 4 4')).rejects.toThrow('engine down');
    expect(n).toBe(2);
  });

  it('never caches an interrupted search, and searches again next time', async () => {
    // The trap `SearchResult.aborted` exists for. An interrupted search answers
    // `bestmove (none)` with no `info` line, so it looks exactly like "this
    // position has no lines" — and the analysis above deliberately *does* cache a
    // genuinely empty answer, because "no move" is an answer. Caching this one
    // would therefore poison the FEN for the rest of the session: the bar would sit
    // at 50/50 and every later hint for the position would find no line to offer,
    // with no error and nothing to retry.
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls += 1;
        return calls === 1
          ? SEARCH({ bestMove: null, lines: [], depth: 0, aborted: true })
          : SEARCH({});
      },
    });

    await expect(src.analyze('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2')).rejects.toMatchObject({ code: 'aborted' });
    // Not retried behind the caller's back: the abort was asked for, and the
    // request that asked for it is doing the work instead.
    expect(calls).toBe(1);

    // The next request for the same position is a real search, and it has lines.
    const a = await src.analyze('rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2');
    expect(calls).toBe(2);
    expect(a.lines).toHaveLength(1);
    expect(a.scoreCp).toBe(30);
  });

  it('caches an empty analysis, because "no move" is an answer', async () => {
    // Spec §10 treats an engine that returns no move as terminal. Asking again
    // would ask the same question of a position that has no moves left in it.
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; return SEARCH({ bestMove: null, lines: [], depth: 0 }); },
    });
    const first = await src.analyze('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(await src.analyze('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1')).toBe(first);
    expect(calls).toBe(1);
  });

  it("passes the caller's options through", async () => {
    let seen: { multiPv?: number; movetimeMs?: number; skillLevel?: number } = {};
    const src = makeEngineSource({
      search: async (_f, o) => { seen = o; return SEARCH({}); },
    });
    await src.analyze('rnbqkbnr/pp1ppppp/8/2p5/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 1 3', { multiPv: 1, movetimeMs: 800 });
    // The level is the analysis layer's own default rather than something the
    // caller has to remember, so it is present even though this caller passed none.
    expect(seen).toEqual({ multiPv: 1, movetimeMs: 800, skillLevel: 20 });
  });

  it("takes the depth from the search result, not from the first line", async () => {
    const src = makeEngineSource({
      search: async () => SEARCH({ depth: 30, lines: [{ uci: 'e2e4', scoreCp: 10, depth: 12, pv: ['e2e4'] }] }),
    });
    const a = await src.analyze('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4');
    expect(a.depth).toBe(30);
  });

  it('freezes the analysis and its lines, because the cache hands them to every later caller', async () => {
    const src = makeEngineSource({ search: async () => SEARCH({}) });
    const a = await src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 0 5');
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.lines)).toBe(true);
    // The elements too: freezing the array alone left `lines[0].uci` writable,
    // which is a mutation of the shared cached object and a silent wrong hint.
    expect(Object.isFrozen(a.lines[0])).toBe(true);
    expect(() => {
      (a.lines[0] as { uci: string }).uci = 'a1a2';
    }).toThrow(TypeError);
    expect(a.lines[0]?.uci).toBe('e2e4');
  });

  it('keys the cache on the search options, not on the FEN alone', async () => {
    const seen: Array<{ fen: string; multiPv?: number; movetimeMs: number }> = [];
    const src = makeEngineSource({
      search: async (fen, o) => { seen.push({ fen, ...o }); return SEARCH({}); },
    });
    // The same position analysed for one line (eval bar) and for five (hints)
    // are two different questions. Answering the second from the first would
    // leave `good` mode with nothing but the best move to offer, silently.
    const one = await src.analyze('rnbqkbnr/pp2pppp/8/2p1p3/4P3/2N5/PPPP1PPP/RNBQKB1R w KQkq - 2 3', { multiPv: 1 });
    const five = await src.analyze('rnbqkbnr/pp2pppp/8/2p1p3/4P3/2N5/PPPP1PPP/RNBQKB1R w KQkq - 2 3', { multiPv: 5 });
    const oneAgain = await src.analyze('rnbqkbnr/pp2pppp/8/2p1p3/4P3/2N5/PPPP1PPP/RNBQKB1R w KQkq - 2 3', { multiPv: 1 });
    const fiveAgain = await src.analyze('rnbqkbnr/pp2pppp/8/2p1p3/4P3/2N5/PPPP1PPP/RNBQKB1R w KQkq - 2 3', { multiPv: 5 });
    expect(seen).toHaveLength(2);
    expect(one).toBe(oneAgain);
    expect(five).toBe(fiveAgain);
    expect(five).not.toBe(one);
    expect(seen.map((s) => s.multiPv)).toEqual([1, 5]);
  });
});

describe('the one-shot retry (spec 7.4)', () => {
  it('retries once when the worker dies mid-search and returns the retry', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls++;
        if (calls === 1) throw new EngineError('worker-died', 'worker died');
        return SEARCH({ depth: 22 });
      },
    });
    const a = await src.analyze('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(calls).toBe(2);
    expect(a.depth).toBe(22);
  });

  it('retries a handshake timeout too, and only that', async () => {
    const POSITION: Record<string, string> = {
      'worker-died': 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      'handshake-timeout': 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4',
    };
    for (const code of ['worker-died', 'handshake-timeout'] as const) {
      let calls = 0;
      const src = makeEngineSource({
        search: async () => {
          calls++;
          if (calls === 1) throw new EngineError(code, 'gone');
          return SEARCH({ depth: 24 });
        },
      });
      await expect(src.analyze(POSITION[code]!)).resolves.toMatchObject({ depth: 24 });
      expect(calls).toBe(2);
    }
  });

  it('surfaces the second failure instead of looping', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls++;
        throw new EngineError('worker-died', `died ${calls}`);
      },
    });
    await expect(src.analyze('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2')).rejects.toThrow('died 2');
    expect(calls).toBe(2);
  });

  it('propagates the second failure, not the first', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls++;
        throw new EngineError('worker-died', calls === 1 ? 'first' : 'second');
      },
    });
    await expect(src.analyze('rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2')).rejects.toMatchObject({ code: 'worker-died', message: 'second' });
  });

  // I2, the drift guard. The old version of this test listed the codes by hand
  // and compared that list against a local copy of the policy, so a code added
  // to the engine *and* to its retryable set passed both this test and `tsc`: it
  // pinned today's agreement and nothing about tomorrow's.
  //
  // Now the expectation is read from the engine's own exports and the observed
  // behaviour is measured through `analyze`, so a new code added to
  // `RETRYABLE_ENGINE_CODES` makes this fail until the analysis layer follows —
  // in both directions, so a layer that grew its own list would fail here rather
  // than in review.
  it('retries exactly the codes the engine client itself calls retryable', async () => {
    for (const code of ALL_ENGINE_FAILURE_CODES) {
      expect(new EngineError(code, 'x').retryable, code).toBe(RETRYABLE_ENGINE_CODES.has(code));
      let calls = 0;
      const src = makeEngineSource({
        search: async () => {
          calls++;
          throw new EngineError(code, code);
        },
      });
      await expect(src.analyze(`fen-drift-${code}`)).rejects.toMatchObject({ code });
      expect(calls, code).toBe(RETRYABLE_ENGINE_CODES.has(code) ? 2 : 1);
    }
  });

  it('retries a structurally-shaped failure, so the code is the only contract', async () => {
    // The same question asked of a plain object with a `code`, which is what a
    // caller wrapping the client actually throws. Read off the engine's set at
    // runtime, so this needs no code list of its own either.
    // A distinct real position per code, so each iteration is its own cache key
    // and no two share a result.
    const POSITION: Record<string, string> = {
      'worker-died': 'rnbqkbnr/pp1ppppp/8/2p5/4P3/8/PPPP1PPP/RNBQKBNR w KQkq c6 0 2',
      'handshake-timeout': 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 5 4',
    };
    for (const code of RETRYABLE_ENGINE_CODES) {
      let calls = 0;
      const src = makeEngineSource({
        search: async () => {
          calls++;
          if (calls === 1) throw { code, message: `structural ${code}` };
          return SEARCH({ depth: 25 });
        },
      });
      const fen = POSITION[code] ?? 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
      await expect(src.analyze(fen)).resolves.toMatchObject({ depth: 25 });
      expect(calls, code).toBe(2);
    }
  });

  it('does not retry an error that carries no code at all', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; throw new TypeError('not an EngineError'); },
    });
    await expect(src.analyze('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3')).rejects.toThrow('not an EngineError');
    expect(calls).toBe(1);
  });

  it('does not retry an error whose code is not a string', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; throw { code: 42, retryable: true }; },
    });
    await expect(src.analyze('r1bqkbnr/pppp1ppp/2n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3')).rejects.toBeTruthy();
    expect(calls).toBe(1);
  });

  it('caches the retry, so the retry is not paid for twice', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls++;
        if (calls === 1) throw new EngineError('worker-died', 'gone');
        return SEARCH({ depth: 26 });
      },
    });
    await src.analyze('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
    await src.analyze('r1bqkbnr/1ppp1ppp/p1n5/1B2p3/4P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 0 4');
    expect(calls).toBe(2);
  });

  it('does not evict a cached neighbour when a search is retried', async () => {
    // What this kills: charging the cache on the failure path, or under a second
    // key. A *same-key* double `set` is not detectable here, and the test does
    // not claim to be — see the note in the report. The bounded cache is the
    // witness, because an extra entry under any key evicts the neighbour.
    const cache = new AnalysisCache(2);
    let calls = 0;
    let retried = false;
    const src = makeEngineSource(
      {
        search: async (fen) => {
          calls++;
          if (fen === 'r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4' && !retried) {
            retried = true;
            throw new EngineError('worker-died', 'gone');
          }
          return SEARCH({ depth: calls });
        },
      },
      { cache },
    );
    const a = await src.analyze('r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5'); // search 1
    await src.analyze('r1bqkbnr/1ppp1ppp/p1n5/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 1 4'); // search 2 fails, retry search 3 succeeds
    expect(cache.size).toBe(2);
    // Served from the cache, so no fourth search and the very same object.
    expect(await src.analyze('r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 2 5')).toBe(a);
    expect(calls).toBe(3);
  });

  it('leaves nothing cached after a search that never succeeded', async () => {
    const cache = new AnalysisCache(2);
    let calls = 0;
    const src = makeEngineSource(
      {
        search: async () => {
          calls++;
          throw new EngineError('worker-died', 'gone');
        },
      },
      { cache },
    );
    await expect(src.analyze('r1bqkb1r/1ppp1ppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 3 5')).rejects.toThrow();
    expect(cache.size).toBe(0);
  });
});

describe('concurrent requests for one position', () => {
  it('serves a second request with identical options from the one already running', async () => {
    const first = deferred<SearchResult>();
    const second = deferred<SearchResult>();
    let calls = 0;
    const src = makeEngineSource({
      search: () => (++calls === 1 ? first.promise : second.promise),
    });
    const p1 = src.analyze('r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6');
    const p2 = src.analyze('r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 4 6');
    first.reject(new EngineError('worker-died', 'gone'));
    second.resolve(SEARCH({ depth: 21 }));

    const [a, b] = await Promise.all([p1, p2]);
    // The worker that died is retried, and the joined caller rides along with the
    // retry rather than issuing a search of its own: `EngineClient` can only hold
    // one search, so a second one would have superseded the first.
    expect(calls).toBe(2);
    expect(a).toBe(b);
    expect(a.depth).toBe(21);
  });

  it('searches again after a shared search failed', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => {
        calls++;
        throw new EngineError('worker-died', 'gone');
      },
    });
    const [a, b] = await Promise.allSettled([src.analyze('r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq - 5 6'), src.analyze('r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq - 5 6')]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(calls).toBe(2); // one search, one retry
    await expect(src.analyze('r1bqk2r/1pppbppp/p1n2n2/4p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 b kq - 5 6')).rejects.toThrow();
    expect(calls).toBe(4); // the in-flight entry was released, not sticky
  });

  it('does not join a search for a different position', async () => {
    const first = deferred<SearchResult>();
    const second = deferred<SearchResult>();
    let calls = 0;
    const src = makeEngineSource({
      search: () => (++calls === 1 ? first.promise : second.promise),
    });
    const p1 = src.analyze('r1bqk2r/2ppbppp/p1n2n2/1p2p3/B3P3/5N2/PPPP1PPP/RNBQR1K1 w kq - 0 7');
    const p2 = src.analyze('r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7');
    first.resolve(SEARCH({ depth: 10 }));
    second.resolve(SEARCH({ depth: 12 }));
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toBe(2);
    expect(a.depth).toBe(10);
    expect(b.depth).toBe(12);
  });

  // I1. The eval bar and the hint both target the position on screen, so they
  // collide by construction. A double that answers both searches would make the
  // hazard invisible, so these three tests run against one that enforces
  // `EngineClient`'s real rule: one search at a time, and a new one supersedes
  // the older with `superseded`.
  describe('with an engine that supersedes a competing search', () => {
    class SupersedingEngine {
      calls: Array<{ fen: string; multiPv?: number; movetimeMs: number }> = [];
      superseded = 0;
      private pending: { resolve: (r: SearchResult) => void; reject: (e: unknown) => void } | null = null;

      search = (fen: string, opts: { movetimeMs: number; multiPv?: number }): Promise<SearchResult> => {
        this.calls.push({ fen, ...opts });
        return new Promise<SearchResult>((resolve, reject) => {
          const older = this.pending;
          this.pending = { resolve, reject };
          if (older !== null) {
            this.superseded++;
            older.reject(new EngineError('superseded', 'Search superseded by a newer search'));
          }
        });
      };

      answer(result: SearchResult): void {
        const p = this.take();
        p.resolve(result);
      }

      failWith(e: unknown): void {
        const p = this.take();
        p.reject(e);
      }

      private take(): { resolve: (r: SearchResult) => void; reject: (e: unknown) => void } {
        const p = this.pending;
        if (p === null) throw new Error('no search is in flight');
        this.pending = null;
        return p;
      }
    }

    it('queues a different-options request instead of superseding the running one', async () => {
      const engine = new SupersedingEngine();
      const src = makeEngineSource(engine);
      const evalBar = src.analyze('r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7', { multiPv: 1 });
      const hint = src.analyze('r1bqk2r/2ppbppp/p1n2n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 b kq - 1 7', { multiPv: 5 });

      // The hint has not issued a search: it is behind the eval bar's, so nothing
      // was superseded and the first request is still live.
      expect(engine.calls.map((c) => c.multiPv)).toEqual([1]);
      expect(engine.superseded).toBe(0);

      engine.answer(SEARCH({ depth: 20 }));
      const one = await evalBar;
      expect(one.depth).toBe(20);
      // Only now, with the engine free, does the queued search start.
      expect(engine.calls.map((c) => c.multiPv)).toEqual([1, 5]);

      engine.answer(SEARCH({ depth: 24, lines: FIVE_LINES }));
      const many = await hint;
      expect(many.lines).toHaveLength(5);
      expect(many.depth).toBe(24);
      expect(engine.superseded).toBe(0);
    });

    it('runs a queued request when the search it waited for failed', async () => {
      const engine = new SupersedingEngine();
      const src = makeEngineSource(engine);
      const first = src.analyze('r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w kq - 0 8', { multiPv: 1 });
      const queued = src.analyze('r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1B3N2/PPPP1PPP/RNBQR1K1 w kq - 0 8', { multiPv: 5 });

      // Not retryable, so this one is final — and the queued request must not
      // inherit the failure, or a hint would be permanently unavailable after any
      // engine error on the same position.
      engine.failWith(new EngineError('superseded', 'Search superseded by a newer search'));
      await expect(first).rejects.toMatchObject({ code: 'superseded' });

      expect(engine.calls.map((c) => c.multiPv)).toEqual([1, 5]);
      engine.answer(SEARCH({ depth: 26, lines: FIVE_LINES }));
      const many = await queued;
      expect(many.lines).toHaveLength(5);
    });

    it('runs a queued request after the running one has been retried', async () => {
      const engine = new SupersedingEngine();
      const src = makeEngineSource(engine);
      const first = src.analyze('r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 b kq - 0 8', { multiPv: 1 });
      const queued = src.analyze('r1bqk2r/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 b kq - 0 8', { multiPv: 5 });

      // The worker dies: the retry goes first, and the queue waits for the retry
      // rather than racing it.
      engine.failWith(new EngineError('worker-died', 'gone'));
      await Promise.resolve();
      expect(engine.calls.map((c) => c.multiPv)).toEqual([1, 1]);

      engine.answer(SEARCH({ depth: 28 }));
      const a = await first;
      expect(a.depth).toBe(28);
      expect(engine.calls.map((c) => c.multiPv)).toEqual([1, 1, 5]);

      engine.answer(SEARCH({ depth: 30, lines: FIVE_LINES }));
      const many = await queued;
      expect(many.lines).toHaveLength(5);
      expect(engine.superseded).toBe(0);
    });

    it('gives a second identical request the same object, with one search', async () => {
      const engine = new SupersedingEngine();
      const src = makeEngineSource(engine);
      const a = src.analyze('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - - 1 9', { multiPv: 3 });
      const b = src.analyze('r1bq1rk1/2p1bppp/p1np1n2/1p2p3/4P3/1BP2N2/PP1P1PPP/RNBQR1K1 w - - 1 9', { multiPv: 3 });
      expect(engine.calls).toHaveLength(1);

      engine.answer(SEARCH({ depth: 32, lines: FIVE_LINES }));
      const [first, second] = await Promise.all([a, b]);
      expect(first).toBe(second);
      expect(engine.superseded).toBe(0);
    });
  });
});
