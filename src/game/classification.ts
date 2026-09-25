// Spec §7.6. Two pieces of this are easy to get wrong and are load-bearing:
// a forced move is never the player's mistake, and a mate score is a number of
// moves rather than a number of centipawns, so it is never compared as one.

export type MoveLabel = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'forced';

/** The thresholds are named so the table below reads as the spec's table, and so
 * a future edit cannot move one edge without moving the other. */
const INACCURACY_CP = 20;
const MISTAKE_CP = 50;
const BLUNDER_CP = 100;

/** How much evaluation one move gave away: positive is worse.
 *
 * FRAME CONTRACT: both arguments must already be in the *mover's* frame. The
 * engine reports a score for the side to move, and the side to move flips across
 * a move, so a caller comparing two positions has to negate the second one
 * before calling this — `centipawnLoss(beforeCp, -afterCpFromTheEngine)`. Doing
 * it here instead would hide the flip from the caller instead of documenting it.
 *
 * Mate scores are not accepted here at all: `score mate 3` is three moves, and
 * subtracting it from a centipawn score is meaningless. `classify` takes the two
 * mate distances separately for exactly that reason. */
export function centipawnLoss(beforeCp: number, afterCp: number): number {
  return beforeCp - afterCp;
}

export interface ClassifyOptions {
  /** `centipawnLoss` of the move, in the mover's frame. */
  lossCp: number;
  /** Exactly one legal move existed: the label is `forced`, always. */
  forced: boolean;
  /** Mate distance before the move, in the mover's frame, or undefined when the
   * engine did not find a forced mate. `> 0` means the mover was mating. */
  beforeMate?: number;
  /** Mate distance after the move, in the mover's frame, or undefined when the
   * engine found no forced mate in the resulting position. */
  afterMate?: number;
}

export function classify(opts: ClassifyOptions): MoveLabel {
  // Checked before everything, including the mate rules. A move with no
  // alternative is not a decision, and flagging it teaches the player to feel
  // bad about positions they could not avoid (spec §7.6) — which applies just as
  // much to a forced move that squanders a mate as to a forced move that hangs
  // a piece.
  if (opts.forced) return 'forced';

  const { beforeMate, afterMate } = opts;
  const stillMating = afterMate !== undefined && afterMate > 0;

  if (beforeMate !== undefined && beforeMate > 0) {
    // The mover had a forced mate. It survives only if the position after the
    // move still mates for the mover.
    //
    // `afterMate === undefined` counts as lost. After the move it is the
    // *opponent* who is to move, so the engine reports a mate distance there
    // only when the opponent is the one who gets mated; no distance at all means
    // there is no forced mate in the resulting position, and a mate that is gone
    // is gone whether it was thrown away or walked into.
    if (!stillMating) return 'blunder';
    // Still mating: judged on whether the move improved things, not on the
    // distance, which the engine chose.
    return opts.lossCp <= 0 ? 'best' : 'good';
  }

  // Found a mate where there was none, or kept one the engine had not seen.
  if (stillMating) return opts.lossCp <= 0 ? 'best' : 'good';

  // A position that is already lost is judged by the centipawn loss the caller
  // measured, not by the mate distance: a move that holds out for five more
  // moves in a lost position is the best available move, and `centipawnLoss` on
  // a consistent scale already says so (it is negative).
  if (opts.lossCp <= 0) return 'best';
  if (opts.lossCp < INACCURACY_CP) return 'good';
  if (opts.lossCp < MISTAKE_CP) return 'inaccuracy';
  if (opts.lossCp < BLUNDER_CP) return 'mistake';
  return 'blunder';
}
