// Grading an attempt. Two independent axes, and the reason they are separate is
// the whole design:
//
//   SOUND        — is the move within tolerance of the best available?
//   DEMONSTRATING — did it fire the lesson's Concept detector?
//
// A move can be sound without demonstrating anything. That is not a near-miss; it
// is the ordinary outcome of a learner making a *reasonable* move that misses
// the point, and grading it as a failure teaches them that reasonable moves are
// wrong. So the vocabulary is three states, not two:
//
//   demonstrating — the idea, found unaided
//   fine          — sound, and the better move is shown anyway
//   failed        — outside tolerance, or it hung material
//
// The measurement behind that split is in .scratch/first-learning-release/
// issues/11-grading-an-attempt.md: on a quiet position ~40% of every legal move
// falls within 50cp of the best, so a grader that said "fine" to two moves in
// five would be grading nothing. 50cp is a *safety* claim, not a verdict.

import type { Square } from '../chess/types';
import { centipawnLoss } from '../game/classification';

/** How much evaluation a move may give away and still be `fine`.
 *
 *  Measured: 15 of 37 legal moves in an Italian middlegame, 17 of 43 in an open
 *  Sicilian. So this is "did not lose anything", never "was the only move". */
export const ACCEPT_CP = 50;

/** The narrower band for "this move was actively bad" rather than merely uninspired.
 *
 *  Separate from ACCEPT_CP on purpose. `classification.ts` already uses 50 for
 *  `MISTAKE_CP`, meaning "an error worth naming" — the same number meaning the
 *  opposite thing in `hints.ts` was a latent collision, and this is the fix: two
 *  numbers, named for their jobs, neither used as the sole test for passing. */
export const SAFETY_CP = 20;

export type AttemptOutcome = 'demonstrating' | 'fine' | 'failed';

export interface EngineLine {
  /** UCI of the move this line begins with. */
  uci: string;
  /** Centipawns, from the side to move's point of view at the searched position. */
  scoreCp?: number;
  scoreMate?: number;
  depth: number;
}

export interface GradingInput {
  /** Every legal move with an evaluation, best first. MultiPV returns them all. */
  lines: readonly EngineLine[];
  /** The move the learner actually played, as UCI. */
  played: string;
  /** Whether the Concept's detector fired on that move. */
  demonstrated: boolean;
  /**
   * Whether the move left one of the learner's own pieces attacked and undefended.
   * A separate, harder failure than being outclassed: it is a fact about the
   * position, and it is the mistake a beginner makes most often.
   */
  leftHanging?: boolean;
  /** The move was the only legal one, so nothing was decided. Never `failed`. */
  forced?: boolean;
}

export interface Grading {
  outcome: AttemptOutcome;
  /** How much the move gave up, in the learner's frame. Negative means it found something. */
  lossCp: number;
  /** 0 = the engine's first choice. */
  rank: number | null;
  /** The engine's own choice, for the "here is the better move" panel. */
  best: EngineLine | null;
  /**
   * What the outcome *means*, in words. Shown beside the buttons, so a learner
   * who was told `fine` is also told that something better exists — a grade with
   * no explanation is a verdict, and this is the difference between a lesson and
   * a mark.
   */
  reason: string;
}

const uciKey = (uci: string) => uci;

/** Grades one attempt. Pure: no engine, no clock, no React.
 *
 *  The frame is the subtle part and it is easy to get wrong twice. Every line
 *  comes from ONE search of ONE position — the position before the learner's
 *  move — so every score in it is already in the *learner's* frame, and
 *  `centipawnLoss(best, chosen)` is the right subtraction with no negation.
 *  This is why the loss is computed from the lines rather than by re-analysing
 *  the resulting position: two separate searches would be in opposite frames,
 *  which is exactly the trap `classification.ts` documents in its FRAME
 *  CONTRACT, and one search avoids it entirely. */
export function gradeAttempt(input: GradingInput): Grading {
  const { lines, played, demonstrated, leftHanging = false, forced = false } = input;
  const best = lines[0] ?? null;

  const index = lines.findIndex((l) => uciKey(l.uci) === uciKey(played));
  const chosen = index >= 0 ? lines[index]! : null;

  // A move the engine did not return, or a comparison that cannot be made
  // because the engine returned no usable score. MultiPV returns every legal
  // move, so the first case means the caller searched too few lines — and
  // calling it a failure would blame the learner for the app's shortfall.
  // Reported as ungraded, and the caller is expected to widen the search.
  if (!chosen || scoreOf(best) === undefined) {
    return {
      outcome: 'fine',
      lossCp: 0,
      rank: chosen ? index : null,
      best,
      reason: 'This move was not among the moves that were compared, so it has not been marked.',
    };
  }

  // A forced move is not a decision, and neither band may call it wrong. This
  // check comes first for that reason, and it applies to a move that squanders a
  // mate exactly as much as to one that hangs a piece.
  if (forced) {
    return {
      outcome: demonstrated ? 'demonstrating' : 'fine',
      lossCp: 0,
      rank: index,
      best,
      reason: 'There was only one move to play, so this was not a decision.',
    };
  }

  // Both sides are known scorable here, so this cannot be undefined. Kept as a
  // guard rather than a non-null assertion: a missing score must never become a
  // silent zero, because zero is a *real* evaluation and would read as "an even
  // move" rather than "not measured".
  const lossCp = centipawnLoss(scoreOf(best)!, scoreOf(chosen)!);

  if (leftHanging) {
    return {
      outcome: 'failed',
      lossCp,
      rank: index,
      best,
      reason: 'This left one of your pieces attacked with nothing defending it.',
    };
  }

  if (demonstrated) {
    return {
      outcome: 'demonstrating',
      lossCp,
      rank: index,
      best,
      reason: 'That is the move the lesson was about.',
    };
  }

  const safe = lossCp < ACCEPT_CP;
  if (!safe) {
    return {
      outcome: 'failed',
      lossCp,
      rank: index,
      best,
      reason: `That gave up ${Math.round(lossCp / 100)} of the position.`,
    };
  }

  return {
    outcome: 'fine',
    lossCp,
    rank: index,
    best,
    reason: best && index > 0
      ? 'That was a sound move, and there was a better one.'
      : 'That was a sound move.',
  };
}

/** Whether a move counts as demonstrating, given a detector's answer.
 *
 *  A thin wrapper, kept so the grading tests can state the rule once and the UI
 *  does not have to re-implement it: demonstrating means the detector fired, not
 *  that the move matched a target. A Concept with several good moves must
 *  demonstrate with any of them, which is why a "target move" is a seed for the
 *  detector's accepted set rather than the answer. */
export function isDemonstrating(detectorFired: boolean): boolean {
  return detectorFired;
}

/** The centipawn score of a line, treating an absent score as absent rather than 0.
 *
 *  A missing score is not a score of zero: treating it as one reports a mate
 *  distance as "no better than a draw" and a failed search as a perfect move. */
function scoreOf(line: EngineLine | null): number | undefined {
  if (!line) return undefined;
  if (line.scoreCp !== undefined) return line.scoreCp;
  // A mate is worth more than any centipawn score, and `mateValue` keeps that
  // ordering. Importing it rather than open-coding the scale, so a change to one
  // place cannot make the two disagree.
  if (line.scoreMate !== undefined) {
    return line.scoreMate > 0
      ? MATE_CP - line.scoreMate * MATE_CP_PER_PLY
      : -MATE_CP - line.scoreMate * MATE_CP_PER_PLY;
  }
  return undefined;
}

const MATE_CP = 100_000;
const MATE_CP_PER_PLY = 1_000;

/** A move is "also fine" when it is within the wide band of the best.
 *
 *  Named separately from `gradeAttempt` because the UI needs it to *label*
 *  alternatives during exploration, and a label is a different question from a
 *  grade: an alternative is never "demonstrating" without its own detector
 *  answer, and a graded move is never re-asked. */
export function isAlsoFine(candidateCp: number, bestCp: number | undefined): boolean {
  if (bestCp === undefined) return false;
  return bestCp - candidateCp < ACCEPT_CP;
}

/** Squares the board should mark after a move, so the learner can see the path.
 *
 *  Both moves, always: the learner's and the reply. A single arrow shows where a
 *  piece went; a pair shows what happened in exchange for it, which is the thing
 *  a consequence is *for*. The learner's move is dimmed and the reply is solid,
 *  so the direction of cause and effect is legible without a caption. */
export interface MoveMark {
  from: Square;
  to: Square;
  role: 'played' | 'reply' | 'better';
}

export function marksFor(moves: ReadonlyArray<{ uci: string; role: MoveMark['role'] }>): MoveMark[] {
  return moves
    .filter((m) => m.uci.length >= 4)
    .map((m) => ({
      from: m.uci.slice(0, 2) as Square,
      to: m.uci.slice(2, 4) as Square,
      role: m.role,
    }));
}
