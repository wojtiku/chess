// One exercise: a position, a decision, and what happens when it goes wrong.
//
// The shape is fixed by the spec and the answers given while building it:
//
//   1. the learner makes ONE decision
//   2. if it is wrong, the move is PLAYED, not refused, and the engine's reply
//      is shown as the consequence — both moves marked on the board
//   3. the Fact is shown, not a judgement
//   4. two buttons, both always available: try again, and see the better move
//
// A refused move teaches nothing about why the alternative was better, which is
// why the wrong move is played. And `fine` is not a failure: the learner is told
// a better move existed and shown it, because the goal is making the best moves
// visible rather than withholding praise.
//
// Nothing here decides anything about chess. `gradeAttempt` has already decided;
// this is the sequence those decisions are shown in.

import type { Square } from '../chess/types';
import { gradeAttempt, marksFor, type AttemptOutcome, type EngineLine, type Grading, type MoveMark } from './grading';
import { boardFacts, type FactPack } from './detectors';

export type ExercisePhase =
  /** The learner is to move and nothing has been tried yet. */
  | 'attempting'
  /** The move was right. Nothing more to do. */
  | 'solved'
  /** The move was wrong and the consequence has been shown. Both buttons live. */
  | 'consequence'
  /** The learner asked to see the better move. */
  | 'revealed';

export interface ExerciseConcept {
  id: string;
  /** The plain-language name, for the learner's record. Not used in prose. */
  name: string;
  /**
   * Whether a given move demonstrates this concept. A Concept is a function from
   * a position to a Fact or to nothing — see ADR-0001 — and this is that
   * function, narrowed to the move in question. A detector that returns true for
   * a move nobody would call an instance of the concept is a bug that teaches
   * something false, so the tests pin real positions rather than mocks.
   */
  fires: (position: FactPack, uci: string) => boolean;
}

export interface ExerciseAttempt {
  uci: string;
  outcome: AttemptOutcome;
  grading: Grading;
  /** The facts that were computed, kept with the attempt.
   *
   *  Not for the UI alone: this is what makes a wrong explanation attributable
   *  rather than mysterious. Without the pack, a reader looking at bad coaching
   *  cannot tell whether the model invented something or was handed something
   *  false — which is the whole argument for storing it. */
  facts: FactPack;
  at: number;
}

export interface ExerciseState {
  phase: ExercisePhase;
  /** How many times the learner has answered. The first is the Independent one. */
  attemptNo: number;
  attempts: ExerciseAttempt[];
  /** The most recent grading, for the panel. */
  current: Grading | null;
  /** The engine's reply to a wrong move, as UCI. */
  reply: string | null;
  /** The move to reveal, once asked for. */
  revealed: string | null;
  /** Which facts to show, derived from the position and the grading. */
  shown: string[];
}

export interface StartExercise {
  concept: ExerciseConcept;
  startFen: string;
  learnerSide: 'w' | 'b';
}

export function startExercise(): ExerciseState {
  return {
    phase: 'attempting',
    attemptNo: 0,
    attempts: [],
    current: null,
    reply: null,
    revealed: null,
    shown: [],
  };
}

/** Records an attempt and decides what the learner sees next.
 *
 *  `reply` is the engine's response to the learner's move, or null when the
 *  exercise has no opponent of its own — which is the normal case, since the
 *  engine only speaks after a wrong move. */
export function submitAttempt(
  state: ExerciseState,
  input: {
    startFen: string;
    concept: ExerciseConcept;
    uci: string;
    lines: readonly EngineLine[];
    factsAfter?: FactPack;
    reply?: string | null;
    leftHanging?: boolean;
    forced?: boolean;
    now: number;
  },
): ExerciseState {
  const facts = input.factsAfter ?? boardFacts(input.startFen);
  // The detector is asked about the position the learner was facing, not the one
  // after their move: "does this move show the idea" is a question about the
  // choice made from that position.
  const demonstrated = input.concept.fires(facts, input.uci);
  const grading = gradeAttempt({
    lines: input.lines,
    played: input.uci,
    demonstrated,
    leftHanging: input.leftHanging,
    forced: input.forced,
  });

  const attempt: ExerciseAttempt = {
    uci: input.uci,
    outcome: grading.outcome,
    grading,
    facts,
    at: input.now,
  };

  const solved = grading.outcome === 'demonstrating';

  return {
    ...state,
    // The first attempt is the Independent one. Everything after it followed
    // something the learner was shown, so it is assisted — and that distinction
    // is the app's main measure, so it is carried in the count rather than
    // inferred later from the phase.
    attemptNo: state.attemptNo + 1,
    attempts: [...state.attempts, attempt],
    current: grading,
    phase: solved ? 'solved' : 'consequence',
    reply: solved ? null : input.reply ?? null,
    revealed: null,
    shown: factsToShow(grading, facts),
  };
}

/** Retry: the board returns to the exercise position and the learner may try again.
 *
 *  Offered alongside "see the better move", not instead of it, and both are
 *  available at the same time. Retrieval teaches more than recognition, and a
 *  learner who wants to look it up first is not a failure of the design. */
export function retry(state: ExerciseState): ExerciseState {
  if (state.phase !== 'consequence' && state.phase !== 'revealed') return state;
  return { ...state, phase: 'attempting', current: null, reply: null, revealed: null, shown: [] };
}

/** See the better move. Does not end the exercise — the learner may still retry,
 *  and the attempt count keeps its honesty either way. */
export function revealBest(state: ExerciseState, bestUci: string | null): ExerciseState {
  if (state.phase !== 'consequence' && state.phase !== 'revealed') return state;
  if (bestUci === null) return state;
  return { ...state, phase: 'revealed', revealed: bestUci };
}

/** The moves to mark on the board, in the order they happened.
 *
 *  Both, always: a single arrow shows where a piece went, a pair shows what was
 *  given up for it. The revealed move is a third mark, and it is the only one
 *  the learner has not played. */
export function boardMarks(state: ExerciseState): MoveMark[] {
  const moves: Array<{ uci: string; role: MoveMark['role'] }> = [];
  const last = state.attempts[state.attempts.length - 1];
  if (last && state.phase !== 'attempting') moves.push({ uci: last.uci, role: 'played' });
  if (state.reply) moves.push({ uci: state.reply, role: 'reply' });
  if (state.revealed) moves.push({ uci: state.revealed, role: 'better' });
  return marksFor(moves);
}

/** The facts to put in front of the learner.
 *
 *  A Fact, never a judgement. "Your knight on d3 is attacked and nothing defends
 *  it" is computed and therefore sayable; "you should have seen the fork" is a
 *  conclusion about the learner and is not. The order is cheapest-and-most-
 *  useful first, because a beginner reads one line and stops.
 *
 *  "No tactic here" is stated whenever there is no *forced* sequence — no mate,
 *  no capture, and nothing hanging — rather than only when the position is
 *  literally empty of options. A quiet middlegame almost always has some capture
 *  available, so gating the sentence on "no captures at all" would mean never
 *  saying it, and the probe showed exactly what happens then: a model asked
 *  about a position with no combination invents one to explain the question. */
export function factsToShow(grading: Grading, facts: FactPack): string[] {
  const lines: string[] = [];
  const hanging = facts.learnerPieces.filter((p) => p.hangs);
  if (hanging.length > 0) {
    lines.push(
      `Your ${hanging[0]!.piece} on ${hanging[0]!.square} is attacked, and nothing of yours defends it.`,
    );
  }
  if (facts.matesAvailable.length > 0) {
    lines.push(`You had a checkmate here: ${facts.matesAvailable[0]}.`);
  } else if (facts.capturesAvailable.length > 0) {
    // A capture and "no tactic" are both true and both worth saying: taking a
    // loose pawn is an option, and it is not a combination. Reporting only the
    // first would let a learner read a lone capture as the answer to the
    // position, which is how a quiet middlegame gets mistaken for a tactic.
    lines.push(`You could have captured on ${squareOf(facts.capturesAvailable[0]!)}.`);
    lines.push('There was no combination here — it was a move about ideas, not calculation.');
  } else {
    lines.push('There was no tactic in this position. It was a move about ideas, not calculation.');
  }
  return lines;
}

/** The destination square of a UCI move.
 *
 *  A capture spells the `x` — `c4xf7`, not `c4f7` — so the destination is *not*
 *  at a fixed offset. Slicing positions 2–4 returned `xf` for every capture, and
 *  the learner was told they could have captured on a square that does not
 *  exist. Strip the `x` first. */
const squareOf = (uci: string): Square => {
  const withoutCapture = uci.replace('x', '');
  return withoutCapture.slice(2, 4) as Square;
};
