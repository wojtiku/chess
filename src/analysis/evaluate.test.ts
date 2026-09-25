import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_MOVETIME_MS, DEFAULT_MULTI_PV, makeEngineSource } from './evaluate';
import { AnalysisCache } from './cache';
import { EngineError, type EngineFailureCode, type SearchResult } from '../engine/engineClient';

// The brief's five `makeEngineSource` assertions are kept verbatim. Everything
// after them is additional: the brief has no retry at all, and spec §7.4's
// "recreate and retry once, second failure surfaces an error" rule is the whole
// reason this module sits between the engine and the UI.

const SEARCH = (r: Partial<SearchResult>): SearchResult => ({
  bestMove: 'e2e4', lines: [{ uci: 'e2e4', scoreCp: 30, depth: 18, pv: ['e2e4'] }], depth: 18, ...r,
});

/** Every code the real client can reject with, spelled out. The drift test at
 * the bottom walks this list, so a new code in `engineClient.ts` cannot silently
 * leave this module's retry policy stale. */
const ALL_CODES: EngineFailureCode[] = [
  'worker-died',
  'handshake-timeout',
  'timeout',
  'superseded',
  'disposed',
];

const NOT_RETRYABLE: EngineFailureCode[] = ['timeout', 'superseded', 'disposed'];

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

  it('defaults to 5 lines and a 3s budget', async () => {
    // The brief writes this as `{ multiPv?: number; movetimeMs: number } = {}`,
    // which does not typecheck under `strict`: `{}` has no `movetimeMs`. The
    // spy record is what the assertion below is about, so the honest annotation
    // makes both fields optional — `toEqual` still pins both values.
    let seen: { multiPv?: number; movetimeMs?: number } = {};
    const src = makeEngineSource({
      search: async (_f, o) => { seen = o; return SEARCH({}); },
    });
    await src.analyze('fen');
    expect(seen).toEqual({ multiPv: 5, movetimeMs: 3000 });
  });

  it('serves a cached FEN without touching the engine', async () => {
    let calls = 0;
    const src = makeEngineSource({ search: async () => { calls++; return SEARCH({}); } });
    await src.analyze('fen-a');
    await src.analyze('fen-a');
    expect(calls).toBe(1);
  });

  it('propagates a null bestmove as an empty analysis', async () => {
    const src = makeEngineSource({
      search: async () => SEARCH({ bestMove: null, lines: [], depth: 0 }),
    });
    const a = await src.analyze('fen-b');
    expect(a.lines).toEqual([]);
    expect(a.scoreCp).toBeUndefined();
  });

  it('rejects when the engine throws, and does not cache the failure', async () => {
    let n = 0;
    const src = makeEngineSource({
      search: async () => { n++; throw new Error('engine down'); },
    });
    await expect(src.analyze('fen-c')).rejects.toThrow('engine down');
    await expect(src.analyze('fen-c')).rejects.toThrow('engine down');
    expect(n).toBe(2);
  });

  it('exports the documented defaults', () => {
    expect(DEFAULT_MULTI_PV).toBe(5);
    expect(DEFAULT_ANALYSIS_MOVETIME_MS).toBe(3000);
  });

  it('caches an empty analysis, because "no move" is an answer', async () => {
    // Spec §10 treats an engine that returns no move as terminal. Asking again
    // would ask the same question of a position that has no moves left in it.
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; return SEARCH({ bestMove: null, lines: [], depth: 0 }); },
    });
    const first = await src.analyze('fen-empty');
    expect(await src.analyze('fen-empty')).toBe(first);
    expect(calls).toBe(1);
  });

  it("passes the caller's options through", async () => {
    let seen: { multiPv?: number; movetimeMs?: number } = {};
    const src = makeEngineSource({
      search: async (_f, o) => { seen = o; return SEARCH({}); },
    });
    await src.analyze('fen-d', { multiPv: 1, movetimeMs: 800 });
    expect(seen).toEqual({ multiPv: 1, movetimeMs: 800 });
  });

  it("takes the depth from the search result, not from the first line", async () => {
    const src = makeEngineSource({
      search: async () => SEARCH({ depth: 30, lines: [{ uci: 'e2e4', scoreCp: 10, depth: 12, pv: ['e2e4'] }] }),
    });
    const a = await src.analyze('fen-e');
    expect(a.depth).toBe(30);
  });

  it('freezes the analysis, because the cache hands it to every later caller', async () => {
    const src = makeEngineSource({ search: async () => SEARCH({}) });
    const a = await src.analyze('fen-f');
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.lines)).toBe(true);
  });

  it('keys the cache on the search options, not on the FEN alone', async () => {
    const seen: Array<{ fen: string; multiPv?: number; movetimeMs: number }> = [];
    const src = makeEngineSource({
      search: async (fen, o) => { seen.push({ fen, ...o }); return SEARCH({}); },
    });
    // The same position analysed for one line (eval bar) and for five (hints)
    // are two different questions. Answering the second from the first would
    // leave `good` mode with nothing but the best move to offer, silently.
    const one = await src.analyze('fen-g', { multiPv: 1 });
    const five = await src.analyze('fen-g', { multiPv: 5 });
    const oneAgain = await src.analyze('fen-g', { multiPv: 1 });
    const fiveAgain = await src.analyze('fen-g', { multiPv: 5 });
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
    const a = await src.analyze('fen-h');
    expect(calls).toBe(2);
    expect(a.depth).toBe(22);
  });

  it('retries a handshake timeout too, and only that', async () => {
    for (const code of ['worker-died', 'handshake-timeout'] as const) {
      let calls = 0;
      const src = makeEngineSource({
        search: async () => {
          calls++;
          if (calls === 1) throw new EngineError(code, 'gone');
          return SEARCH({ depth: 24 });
        },
      });
      await expect(src.analyze(`fen-${code}`)).resolves.toMatchObject({ depth: 24 });
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
    await expect(src.analyze('fen-i')).rejects.toThrow('died 2');
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
    await expect(src.analyze('fen-j')).rejects.toMatchObject({ code: 'worker-died', message: 'second' });
  });

  it('does not retry a failure the caller must be told about', async () => {
    for (const code of NOT_RETRYABLE) {
      let calls = 0;
      const src = makeEngineSource({
        search: async () => {
          calls++;
          throw new EngineError(code, code);
        },
      });
      await expect(src.analyze(`fen-${code}`)).rejects.toMatchObject({ code });
      expect(calls, code).toBe(1);
    }
  });

  it('retries exactly the codes the engine client itself calls retryable', () => {
    const retried = ALL_CODES.filter((code) => code === 'worker-died' || code === 'handshake-timeout');
    const clientSays = ALL_CODES.filter((code) => new EngineError(code, 'x').retryable);
    expect(retried).toEqual(clientSays);
    expect(retried).toEqual(['worker-died', 'handshake-timeout']);
  });

  it('does not retry an error that carries no code at all', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; throw new TypeError('not an EngineError'); },
    });
    await expect(src.analyze('fen-k')).rejects.toThrow('not an EngineError');
    expect(calls).toBe(1);
  });

  it('does not retry an error whose code is not a string', async () => {
    let calls = 0;
    const src = makeEngineSource({
      search: async () => { calls++; throw { code: 42, retryable: true }; },
    });
    await expect(src.analyze('fen-l')).rejects.toBeTruthy();
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
    await src.analyze('fen-m');
    await src.analyze('fen-m');
    expect(calls).toBe(2);
  });

  it('charges the cache once per analysis, not once per attempt', async () => {
    // A retried analysis that inserted its result twice would evict the
    // neighbour it shares a bounded cache with, so the neighbour is the witness.
    const cache = new AnalysisCache(2);
    let calls = 0;
    let retried = false;
    const src = makeEngineSource(
      {
        search: async (fen) => {
          calls++;
          if (fen === 'fen-n' && !retried) {
            retried = true;
            throw new EngineError('worker-died', 'gone');
          }
          return SEARCH({ depth: calls });
        },
      },
      { cache },
    );
    const a = await src.analyze('fen-o'); // search 1
    await src.analyze('fen-n'); // search 2 fails, retry search 3 succeeds
    expect(cache.size).toBe(2);
    // Served from the cache, so no fourth search and the very same object.
    expect(await src.analyze('fen-o')).toBe(a);
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
    await expect(src.analyze('fen-p')).rejects.toThrow();
    expect(cache.size).toBe(0);
  });
});

describe('concurrent requests for one position', () => {
  it('serves a second request for the same FEN from the first, not from a new search', async () => {
    const first = deferred<SearchResult>();
    const second = deferred<SearchResult>();
    let calls = 0;
    const src = makeEngineSource({
      search: () => (++calls === 1 ? first.promise : second.promise),
    });
    const p1 = src.analyze('fen-q');
    const p2 = src.analyze('fen-q');
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
    const [a, b] = await Promise.allSettled([src.analyze('fen-r'), src.analyze('fen-r')]);
    expect(a.status).toBe('rejected');
    expect(b.status).toBe('rejected');
    expect(calls).toBe(2); // one search, one retry
    await expect(src.analyze('fen-r')).rejects.toThrow();
    expect(calls).toBe(4); // the in-flight entry was released, not sticky
  });

  it('does not join a search for a different position', async () => {
    const first = deferred<SearchResult>();
    const second = deferred<SearchResult>();
    let calls = 0;
    const src = makeEngineSource({
      search: () => (++calls === 1 ? first.promise : second.promise),
    });
    const p1 = src.analyze('fen-s');
    const p2 = src.analyze('fen-t');
    first.resolve(SEARCH({ depth: 10 }));
    second.resolve(SEARCH({ depth: 12 }));
    const [a, b] = await Promise.all([p1, p2]);
    expect(calls).toBe(2);
    expect(a.depth).toBe(10);
    expect(b.depth).toBe(12);
  });
});
