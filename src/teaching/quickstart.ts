// The quickstart: the mandatory opening a learner plays before anything else.
//
// Every step here is a *board action* the learner performs, verified by
// `chess.js` and nothing else. No engine, no evaluation, no concept, no key —
// which is the point. The learner is met with "move a piece" and "capture
// something", not with a judgement about whether a move was any good, because
// nobody can answer that question yet.
//
// Topic order follows Steps Method S1 lessons 1–6, subsetted: board-and-pieces
// and the-pawn are reference material rather than anything you *do*, so they
// are not steps. The idea of defending IS a step, because a position where the
// opponent has already attacked is how a White-only learner practises it.
//
// The last step is the one that makes the next six lessons coherent, and it is
// the reason "defending" is a board action rather than a concept: a learner who
// has never noticed that a piece can be under attack cannot be asked to notice
// that this one is.

import { Chess } from 'chess.js';
import type { Square as ChessSquare } from 'chess.js';
import { tryApplyMove } from '../chess/rules';
import type { Square } from '../chess/types';

export type QuickstartStepId =
  | 'move-a-piece'
  | 'capture'
  | 'defend'
  | 'check'
  | 'escape-check'
  | 'castle'
  | 'promote';

export interface QuickstartStep {
  id: QuickstartStepId;
  /** What the learner is asked to do, in one imperative sentence. */
  instruction: string;
  /** Why they are being asked, in one sentence. Kept separate so the *why* is
   *  never smuggled into the instruction and read as part of the task. */
  purpose: string;
  /** The position the step starts from. `previous` means the board as it stands. */
  startFen: string | 'previous';
  /**
   * Whether the step accepts only this move (one correct answer) or any move
   * satisfying a stated condition. Castling and check have exactly one answer in
   * the positions given, so the check is exact everywhere in release 1 — but the
   * field exists because promotion and defending will not keep that property.
   */
  accept: 'exact' | 'predicate';
  /** SAN of the move the step is built around, for the exact steps. */
  solution?: string;
  /** For predicate steps: what makes a move acceptable. */
  satisfies?: (move: {
    from: Square;
    to: Square;
    san: string;
    promotion?: 'q' | 'r' | 'b' | 'n';
  }) => boolean;
  /** The plain-English condition, so the UI need not read it off the code. */
  goal?: string;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const QUICKSTART: ReadonlyArray<QuickstartStep> = [
  {
    id: 'move-a-piece',
    instruction: 'Move the knight on b1 to c3.',
    purpose: 'Every piece has legal squares it can reach, and you will use them all.',
    startFen: START,
    accept: 'exact',
    solution: 'Nc3',
  },
  {
    id: 'capture',
    instruction: 'Take the black pawn on d5 with your pawn.',
    purpose: 'Capturing removes a piece from the board, and it is how material is won.',
    // 1.e4 d5 2.Nf3 Nf6 — Black has offered a pawn. Taking it is the first
    // thing in the game that removes a piece, and it is unambiguously correct:
    // a learner's first capture should not also be a decision.
    startFen: 'rnbqkb1r/ppp1pppp/5n2/3p4/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq d6 0 3',
    accept: 'exact',
    solution: 'exd5',
  },
  {
    id: 'defend',
    instruction: 'Black has just attacked your bishop on c4. Move the bishop somewhere safe.',
    purpose: 'A piece under attack has to be saved, or it will be taken.',
    // 1.e4 e5 2.Bc4 Nf6 3.Nc3 d5 — the d5 pawn attacks the bishop and nothing
    // defends it. Seven squares are legal and six of them are safe, so this is
    // the one step with more than one right answer: the learner is choosing
    // where to go, not being told where.
    startFen: 'rnbqkb1r/ppp2ppp/5n2/3pp3/2B1P3/2N5/PPPP1PPP/R1BQK1NR w KQkq - 0 4',
    accept: 'predicate',
    goal: 'Move the bishop off the square the pawn is attacking',
    satisfies: ({ from, to }) => from === 'c4' && to !== 'd5',
  },
  {
    id: 'check',
    instruction: 'Take the pawn on f7 with your queen. It also gives check.',
    purpose: 'A king under attack has to answer, so check is a way of gaining a turn.',
    // 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 — the f7 pawn is defended only by its king,
    // so taking it is the classic first mate. It is the only move here that
    // gives check, which makes it the honest first "attack the king" step.
    startFen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    accept: 'exact',
    solution: 'Qxf7#',
  },
  {
    id: 'escape-check',
    instruction: 'Your king is in check. Move the bishop on b5 to block it.',
    purpose: 'Being in check is not losing, but you cannot leave your king in it.',
    // 1.e4 d6 2.Bb5+ — check, not mate, with five legal replies. Fool's mate was
    // the obvious choice here and it is wrong: a learner asked to "escape check"
    // in a position with no escape is being taught that check means game over.
    startFen: 'rnbqkbnr/ppp1pppp/3p4/1B6/4P3/8/PPPP1PPP/RNBQK1NR b KQkq - 1 2',
    accept: 'exact',
    solution: 'Nc6',
  },
  {
    id: 'castle',
    instruction: 'Move the king two squares toward the rook on h1. The rook moves too.',
    purpose: 'Castling gets your king to safety and brings a rook into the game at once.',
    startFen: 'r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6',
    accept: 'exact',
    solution: 'O-O',
  },
  {
    id: 'promote',
    instruction: 'Move the pawn on a7 all the way to a8 and choose a piece.',
    purpose: 'A pawn that reaches the end of the board becomes the strongest piece you own.',
    // Predicated rather than exact, because the *chosen piece* is the learner's
    // decision and any of the four is correct here. It also cannot be matched
    // on a fixed SAN: the check suffix depends on the piece chosen (`a8=Q+` and
    // `a8=R+` both give check against a king on e8), so a stated solution of
    // "a8=Q" would silently reject a correct promotion. All four are accepted.
    startFen: '4k3/P7/8/8/8/8/8/4K3 w - - 0 1',
    accept: 'predicate',
    goal: 'Move the pawn to the last rank, whatever you promote it to',
    satisfies: ({ from, to, promotion }) => from === 'a7' && to === 'a8' && promotion !== undefined,
  },
];

/** The step that follows `id`, or null at the end. */
export function nextStep(id: QuickstartStepId): QuickstartStep | null {
  const i = QUICKSTART.findIndex((s) => s.id === id);
  return i < 0 || i === QUICKSTART.length - 1 ? null : QUICKSTART[i + 1]!;
}

export function stepById(id: QuickstartStepId): QuickstartStep {
  const found = QUICKSTART.find((s) => s.id === id);
  if (!found) throw new Error(`no such quickstart step: ${id}`);
  return found;
}

/** Whether a move satisfies a step, as a verdict rather than a boolean.
 *
 *  A boolean would be enough for the UI, but not for the learner's record: the
 *  difference between "wrong" and "right for the wrong reason" is the difference
 *  between a retry and a concept that did not land, and only the second is worth
 *  remembering. */
export type QuickstartOutcome = 'solved' | 'wrong-target' | 'not-the-piece' | 'illegal';

export function checkQuickstartStep(
  step: QuickstartStep,
  startFen: string,
  move: { from: Square; to: Square; promotion?: 'q' | 'r' | 'b' | 'n' },
): QuickstartOutcome {
  // Applied first, so the answer comes from a real position rather than from a
  // description of one. `chess.js` only offers a promotion among the legal moves
  // when the move actually promotes, so a missing promotion on a promoting move
  // is caught here as illegal rather than reaching the predicate below.
  //
  // `tryApplyMove` and not `move`: the learner supplies these squares, and
  // `chess.js.move()` THROWS on an illegal one rather than returning null. An
  // illegal move is an ordinary event here — it is what a learner does while
  // learning — so it has to be a verdict, not an exception. The rules wrapper
  // already exists for exactly this reason.
  const applied = new Chess(startFen);
  const result = tryApplyMove(applied, {
    from: move.from,
    to: move.to,
    promotion: move.promotion,
    // `san` is filled in by `applyMove` from the position; the caller does not
    // have it and cannot know it, which is the same arrangement the board uses
    // when it offers a square the learner has picked.
    san: '',
  });
  if (!result) return 'illegal';

  if (step.accept === 'exact') {
    return result.san === step.solution ? 'solved' : 'wrong-target';
  }
  if (step.satisfies?.({ from: move.from, to: move.to, san: result.san, promotion: move.promotion })) {
    return 'solved';
  }

  // A legal move of a piece we never asked about is a different mistake from a
  // legal move of the right piece to the wrong square, and the learner is told
  // which one they made: "you moved the wrong piece" is a different correction
  // from "that square is still attacked".
  const piece = new Chess(startFen).get(move.from as Square as ChessSquare);
  if (piece === undefined) return 'illegal';
  const wanted = PIECE_OF[step.id];
  return wanted !== undefined && piece.type !== wanted ? 'not-the-piece' : 'wrong-target';
}

/** The piece each predicate step is about, so "wrong piece" is detectable. */
const PIECE_OF: Partial<Record<QuickstartStepId, 'b' | 'n' | 'q' | 'r' | 'p' | 'k'>> = {
  defend: 'b',
  promote: 'p',
};
