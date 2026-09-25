import { sanSequence } from '../chess/rules';
import type { Analysis } from './evaluate';
import type { HintMode } from '../game/difficulty-types';
import type { PvLine } from '../engine/engineClient';

export type { HintMode } from '../game/difficulty-types';

export interface Hint {
  uci: string;
  san: string[];
  /** Engine score *for the side to move in the analysis' FEN* — the side the
   * hint is being offered to, which is not "White". A negative `scoreCp` here
   * means the player is worse off, not that the engine prefers Black. */
  scoreCp?: number;
  /** Moves until mate, from the same side's point of view: positive means this
   * side mates, negative means this side is mated. Never comparable to
   * `scoreCp` without the conversion below. */
  scoreMate?: number;
}

/** How far below the best line a move may score and still be offered as a "good
 * idea" in `good` hint mode (spec §7.6's bands start at 20; this is the looser
 * "you did not go wrong" window). Inclusive: a move exactly 50cp worse is still
 * offered. */
const GOOD_ENOUGH_CP = 50;

/** A forced mate is worth more than any centipawn score, and one ply of mate
 * distance is worth `MATE_CP_PER_PLY`. The constants are only ever compared with
 * each other, so the absolute values do not matter — only that the mate scale is
 * far from the centipawn scale, and far from `GOOD_ENOUGH_CP` so that "within
 * 50cp" never quietly comes to mean "a move later in the same forced line". */
const MATE_CP = 100_000;
const MATE_CP_PER_PLY = 1_000;

/** One number per line, so that mate and centipawn lines are comparable at all.
 *
 * A UCI `score mate N` counts *moves*, and its sign is relative to the side to
 * move: `N > 0` means that side mates in N, `N < 0` means that side is mated in
 * |N|. So a smaller positive is better, and among negatives a *larger* one is
 * better (mated in 5 beats mated in 1). Both directions are what a plain
 * `±MATE - N` gets wrong, and getting the second one wrong is what turns "hold
 * out for five more moves" into "mate in one is fine". */
function mateValue(mate: number): number {
  return mate > 0 ? MATE_CP - mate * MATE_CP_PER_PLY : -MATE_CP - mate * MATE_CP_PER_PLY;
}

/** The line's score on the common scale, or undefined when the engine reported
 * no score for it at all. */
function scoreValue(l: PvLine): number | undefined {
  if (l.scoreMate !== undefined) return mateValue(l.scoreMate);
  return l.scoreCp;
}

/** One move to suggest, from an engine analysis of the current position.
 *
 * `a.lines` must be in engine rank order (multiPV 1 first), which is what
 * `EngineClient` produces: `lines[0]` is the best line, and "best mode" is
 * defined as that line rather than as a re-scan of the list.
 *
 * `rand` is injectable so the choice is testable; it is expected to return a
 * value in [0, 1) and values outside that range are clamped rather than allowed
 * to index off the end of the pool. */
export function pickHint(a: Analysis, mode: HintMode, rand: () => number = Math.random): Hint | null {
  const best = a.lines[0];
  if (best === undefined) return null;

  if (mode === 'best') return toHint(a, best);

  // Everything on one scale, compared against the best line. A line that is
  // *better* than lines[0] has a negative loss and stays acceptable: the list is
  // only ever out of order if something upstream sorted it wrongly, and dropping
  // a better move would be a worse answer than showing it.
  const bestValue = scoreValue(best);
  const acceptable = a.lines.filter((l) => {
    if (l === best) return true;
    const v = scoreValue(l);
    if (bestValue === undefined || v === undefined) return false;
    return bestValue - v <= GOOD_ENOUGH_CP;
  });

  // Never empty: the filter always keeps `best` itself.
  const index = Math.max(0, Math.min(acceptable.length - 1, Math.floor(rand() * acceptable.length)));
  return toHint(a, acceptable[index]!);
}

function toHint(a: Analysis, l: PvLine): Hint {
  return {
    uci: l.uci,
    // A PV that does not apply to `a.fen` truncates here rather than throwing:
    // `sanSequence` stops at the first move chess.js rejects, so a stale or
    // version-skewed line yields a short list instead of an exception on the
    // render path. The `uci` is the engine's own judgement and is passed
    // through unchanged even when the SAN is empty.
    san: sanSequence(a.fen, l.pv),
    scoreCp: l.scoreCp,
    scoreMate: l.scoreMate,
  };
}
