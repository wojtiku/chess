// A FEN goes in, a judgement comes out. This is the whole of the analysis
// layer: the deep module the UI talks to, and the only place that knows how to
// ask the engine a question about a position.
//
// Two rules are baked into the shapes below, because both are easy to get
// backwards and neither shows up as a crash when they are:
//
// 1. `scoreCp` / `scoreMate` are the engine's score *for the side to move in the
//    FEN that was analysed*. They are not "White is up 30". A `+30cp` in a
//    Black-to-move FEN means Black is winning. Comparing two analyses of the
//    same position is safe; comparing the score of a position with the score of
//    the position after a move is not, because the side to move has flipped and
//    the sign has to be flipped with it (see `centipawnLoss`).
// 2. A `scoreMate` is a number of *moves*, not centipawns, and its sign is
//    relative to the side to move: `> 0` means that side mates in N, `< 0` means
//    that side is mated in |N|. `pickHint` puts the two on one scale before
//    comparing them; `classify` keeps them apart and decides mate cases first.

import type { EngineFailureCode, PvLine, SearchResult } from '../engine/engineClient';
import { AnalysisCache } from './cache';

export interface Analysis {
  /** The position that was analysed. Also the FEN the SAN of every line is
   * played out from. */
  fen: string;
  /** Engine score for the **side to move in `fen`**, from the best line. */
  scoreCp?: number;
  /** Mate distance for the **side to move in `fen`**, from the best line:
   * positive means that side mates, negative means that side is mated. */
  scoreMate?: number;
  depth: number;
  /** Principal variations, best first (`EngineClient` orders them by multiPV,
   * so `lines[0]` is the best line). Never empty when the search succeeded; an
   * empty list is a real answer meaning "the engine had no move to offer".
   *
   * `readonly` because the analysis is frozen: the cache hands the same object to
   * every later caller of the same position, so a mutation here would show up as
   * a wrong hint somewhere else in the app. */
  lines: readonly PvLine[];
}

/** The only thing this module needs from an engine.
 *
 * Deliberately one method. Re-creating a dead worker is `EngineClient`'s own
 * job — it drops the worker on `worker-died`, and the next `search` boots a
 * replacement through `newGame` — so the retry below needs no `dispose`, no
 * `newGame` and no status polling. Anything more would couple the analysis
 * layer to the worker's lifecycle for no behaviour. */
export interface EngineLike {
  search(fen: string, opts: { movetimeMs: number; multiPv?: number }): Promise<SearchResult>;
}

export const DEFAULT_MULTI_PV = 5;
export const DEFAULT_ANALYSIS_MOVETIME_MS = 3000;

/** Spec §7.4: the worker dying is the one failure worth re-issuing, because it
 * is a fresh start rather than a verdict. `timeout` is not here (the client has
 * already thrown that worker away and a machine that slow will be slow again),
 * `superseded` is not here (a newer search already owns the engine, and
 * retrying would supersede *it*), and `disposed` is terminal by construction.
 *
 * Spelled out rather than read off `err.retryable`, so the policy is legible
 * here; `evaluate.test.ts` asserts this set is exactly the set the client calls
 * retryable, so the two cannot drift. */
const RETRYABLE_CODES: ReadonlySet<string> = new Set<EngineFailureCode>([
  'worker-died',
  'handshake-timeout',
]);

/** Whether a rejection from `search` is worth one more try.
 *
 * Read structurally rather than with `instanceof EngineError`: the code is the
 * contract, and a caller that wraps the client (or a test) should not have to
 * import the class to get the retry. A non-object, a missing code and a
 * non-string code are all "not retryable" — the default for anything
 * unrecognised is to tell the caller, not to spend a second search. */
function isRetryableFailure(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { code } = e as { code?: unknown };
  return typeof code === 'string' && RETRYABLE_CODES.has(code);
}

export interface EngineSourceOptions {
  /** Injectable only so a test can observe the bound and the eviction order; the
   * real cache is bounded at 500 FENs. */
  cache?: AnalysisCache;
}

export interface EngineSource {
  analyze(fen: string, opts?: { multiPv?: number; movetimeMs?: number }): Promise<Analysis>;
}

export function makeEngineSource(client: EngineLike, options: EngineSourceOptions = {}): EngineSource {
  const cache = options.cache ?? new AnalysisCache();
  /** Searches in flight, so a second request for a position that is already
   * being searched joins the first instead of issuing its own. `EngineClient`
   * holds one search at a time and supersedes whatever it had, so two searches
   * for the same position would make the first reject with `superseded` — the
   * one code the retry must not touch — and hand the caller an error for a
   * question that is already being answered. */
  const inFlight = new Map<string, Promise<Analysis>>();

  const cacheKey = (fen: string, multiPv: number, movetimeMs: number): string =>
    // The options are part of the key, not an afterthought: a 1-line eval-bar
    // search and a 5-line hint search are two different questions about the same
    // position, and answering one from the other's cache would quietly strip
    // `good` hint mode of every alternative.
    `${multiPv}/${movetimeMs} ${fen}`;

  return {
    async analyze(fen, opts = {}) {
      const multiPv = opts.multiPv ?? DEFAULT_MULTI_PV;
      const movetimeMs = opts.movetimeMs ?? DEFAULT_ANALYSIS_MOVETIME_MS;
      const key = cacheKey(fen, multiPv, movetimeMs);

      // Before the in-flight check: a finished search is strictly better than a
      // new one, and the cache read is what makes `get` refresh recency.
      const cached = cache.get(key);
      if (cached !== undefined) return cached;

      const running = inFlight.get(key);
      if (running !== undefined) return running;

      // One attempt is a cache write at most, no matter how many searches it
      // takes: the write happens on the single success path below, so a retry can
      // neither charge the cache twice nor store a failure.
      const attempt = async (): Promise<Analysis> => {
        const search = (): Promise<SearchResult> => client.search(fen, { movetimeMs, multiPv });
        let result: SearchResult;
        try {
          result = await search();
        } catch (e) {
          if (!isRetryableFailure(e)) throw e;
          // Exactly one more try, on a worker the client has already replaced.
          // If this throws, the error surfaces to the caller unchanged: the
          // second attempt has no further retry of its own.
          result = await search();
        }

        const top = result.lines[0];
        const analysis: Analysis = Object.freeze({
          fen,
          scoreCp: top?.scoreCp,
          scoreMate: top?.scoreMate,
          depth: result.depth,
          // Copied so a caller that pushes onto the array cannot corrupt the
          // cached entry, and frozen because every later caller of this FEN is
          // handed the very same object: a silent mutation here would become a
          // wrong hint in a different part of the app.
          lines: Object.freeze([...result.lines]),
        });
        cache.set(key, analysis);
        return analysis;
      };

      const promise = attempt();
      inFlight.set(key, promise);
      // Released on both outcomes, so a failure leaves nothing that a later
      // request would join (it must search again, not inherit a dead promise)
      // and so a rejected attempt cannot become an unhandled rejection while it
      // waits here. Identity-checked, in case a newer attempt for the same key
      // ever replaced this one.
      const release = (): void => {
        if (inFlight.get(key) === promise) inFlight.delete(key);
      };
      return promise.then(
        (value) => {
          release();
          return value;
        },
        (e: unknown) => {
          release();
          throw e;
        },
      );
    },
  };
}
