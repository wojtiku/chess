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

import { EngineError, RETRYABLE_ENGINE_CODES } from '../engine/engineClient';
import type { PvLine, SearchResult } from '../engine/engineClient';
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

/** Whether a rejection from `search` is worth one more try.
 *
 * Read structurally rather than with `instanceof EngineError`: the code is the
 * contract, and a caller that wraps the client (or a test) should not have to
 * import the class to get the retry. A non-object, a missing code and a
 * non-string code are all "not retryable" — the default for anything
 * unrecognised is to tell the caller, not to spend a second search.
 *
 * The set is `engineClient`'s, not a copy of it. That module is the one that
 * knows what each failure *means*, so re-deciding the policy here is how the two
 * would drift: a new retryable code would be added to the engine and have to be
 * remembered here, and nothing would say so. `RETRYABLE_ENGINE_CODES` is exported
 * for exactly this, and `evaluate.test.ts` walks
 * `ALL_ENGINE_FAILURE_CODES` asserting the two agree in both directions. */
function isRetryableFailure(e: unknown): boolean {
  if (typeof e !== 'object' || e === null) return false;
  const { code } = e as { code?: unknown };
  return typeof code === 'string' && RETRYABLE_ENGINE_CODES.has(code);
}

/** Lets a queued search run whether or not the one before it worked. */
const regardless = (): void => {};

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
  /** Searches in flight, keyed by **FEN alone**, because that is the unit the
   * engine serialises on: `EngineClient` answers one search at a time and rejects
   * the older with `superseded` when a newer one is issued.
   *
   * Keying this by the option-bearing cache key instead — which is what the
   * first version did — looks correct and is not. The eval bar and the hint both
   * target the current position, so they differ in `multiPv`, take different keys,
   * and would issue two competing searches: the first rejects with `superseded`,
   * a code the retry below deliberately does not touch, and the learner is shown
   * an error for a question that was perfectly answerable. */
  const inFlight = new Map<string, { key: string; promise: Promise<Analysis> }>();

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

        // An interrupted search is not an evaluation of anything. The engine
        // answers a `stop` with `bestmove (none)` and no `info` line, so `lines`
        // is empty and `depth` is 0 — and caching that would poison this FEN for
        // the rest of the session: the bar would sit at 50/50 and every later hint
        // for the position would find no line to offer, with nothing to retry and
        // no way back. So it is refused before anything is built, and the next
        // request for this position searches for real.
        if (result.aborted) {
          throw new EngineError('aborted', 'Search interrupted by a newer request');
        }

        const top = result.lines[0];
        const analysis: Analysis = Object.freeze({
          fen,
          scoreCp: top?.scoreCp,
          scoreMate: top?.scoreMate,
          depth: result.depth,
          // Frozen all the way down, because every later caller of this FEN is
          // handed the very same object: a silent mutation here would become a
          // wrong hint in a different part of the app. The lines are copied and
          // frozen individually because a shallow freeze of the array still left
          // `lines[0].uci` writable. The `pv` string array inside each line is
          // the one part left mutable, since `PvLine.pv` is a published
          // `string[]` and narrowing it to `readonly` would ripple into
          // `sanSequence`'s published signature.
          lines: Object.freeze(result.lines.map((l) => Object.freeze({ ...l }))),
        });
        cache.set(key, analysis);
        return analysis;
      };

      const running = inFlight.get(fen);
      // The same question, already being answered: one object, one search.
      //
      // Only the most recent flight is kept, so a third request whose options
      // match a *superseded-by-a-queue* predecessor's rather than the queued one's
      // gets its own search after the queue instead of joining that predecessor.
      // That costs one redundant search in a three-way mix nobody has asked for
      // yet, and the alternative is a list of flights with its own eviction
      // bookkeeping.
      if (running !== undefined && running.key === key) return running.promise;

      // A different question about a position the engine is already searching.
      // Queue behind it rather than issuing a competing search: `EngineClient`
      // supersedes the older one, and `superseded` is not retryable here, so a
      // competing search would turn an answerable question into an error. The
      // predecessor's outcome is deliberately ignored — a queued request has to
      // run even if the search it waited for failed, or a hint asked for after a
      // dead worker would inherit the worker's error forever.
      //
      // The queue is per position, not global: a search for a *different* position
      // is still issued immediately, because that is the case where the engine's
      // own contract is the right answer — the newer position owns the engine and
      // the older caller is the one that should be superseded.
      const promise =
        running === undefined
          ? attempt()
          : running.promise.then(regardless, regardless).then(attempt);

      const flight = { key, promise };
      inFlight.set(fen, flight);
      // Released on both outcomes, so a failure leaves nothing that a later
      // request would join (it must search again, not inherit a dead promise)
      // and so a rejected attempt cannot become an unhandled rejection while it
      // waits here. Identity-checked, because a queued request replaces the entry
      // for this FEN and must not be dropped when its predecessor settles.
      const release = (): void => {
        if (inFlight.get(fen) === flight) inFlight.delete(fen);
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
