import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { parsePromotion } from '../chess/rules';
import { QUICKSTART, checkQuickstartStep, nextStep, stepById } from './quickstart';
import type { QuickstartStep } from './quickstart';

const SIDE_BY_FEN = (fen: string) => new Chess(fen).turn();

/** Apply a SAN string in a position, the way the board would. Never throws. */
const play = (fen: string, san: string) => {
  const g = new Chess(fen);
  try {
    return g.move(san);
  } catch {
    return null;
  }
};

describe('quickstart: every step is solvable', () => {
  // The property that matters. A step whose solution is not legal in its own
  // start position is unreachable, and a learner would be stuck on it forever
  // with no indication of why — which is the failure mode the recovery step
  // exists for in exercises, and the quickstart has no such escape hatch.
  it.each(QUICKSTART.map((s) => [s.id, s] as const))('%s is solvable', (_id, step) => {
    const fen = step.startFen === 'previous' ? QUICKSTART[0]!.startFen : step.startFen;
    if (step.accept === 'exact') {
      // An exact step is solvable if its stated solution is a legal move.
      expect(play(fen, step.solution!), `${step.id} solution ${step.solution}`).not.toBeNull();
    } else {
      // A predicate step has no single solution, so "solvable" means it has at
      // least one legal move that satisfies its own condition — and at least
      // two, or it is not a choice.
      const accepted = new Chess(fen)
        .moves({ verbose: true })
        .filter(
          (m) =>
            checkQuickstartStep(step, fen, {
              from: m.from,
              to: m.to,
              promotion: parsePromotion(m.promotion),
            }) === 'solved',
        );
      expect(accepted.length, `${step.id} needs at least two accepted moves`).toBeGreaterThanOrEqual(2);
    }
  });

  it.each(QUICKSTART.map((s) => [s.id, s] as const))('%s starts from a legal position', (_id, step) => {
    const fen = step.startFen === 'previous' ? QUICKSTART[0]!.startFen : step.startFen;
    expect(() => new Chess(fen)).not.toThrow();
  });

  it('has no step whose position is already over', () => {
    for (const step of QUICKSTART) {
      const fen = step.startFen === 'previous' ? QUICKSTART[0]!.startFen : step.startFen;
      const g = new Chess(fen);
      expect(g.isGameOver()).toBe(false);
    }
  });
});

describe('quickstart: checking a move', () => {
  const step = (id: string) => stepById(id as never);
  const fenOf = (s: QuickstartStep) => (s.startFen === 'previous' ? QUICKSTART[0]!.startFen : s.startFen);

  it('accepts the stated solution of every exact step', () => {
    for (const s of QUICKSTART.filter((x) => x.accept === 'exact')) {
      const fen = fenOf(s);
      const played = play(fen, s.solution!)!;
      const outcome = checkQuickstartStep(s, fen, {
        from: played.from as string,
        to: played.to as string,
        promotion: parsePromotion(played.promotion),
      });
      expect(outcome, `${s.id} should accept ${s.solution}`).toBe('solved');
    }
  });

  it('rejects an illegal move without crashing', () => {
    const s = step('move-a-piece');
    // a1-a8 is not a move, and the checker must say so rather than throw.
    expect(checkQuickstartStep(s, fenOf(s), { from: 'a1', to: 'a8' })).toBe('illegal');
  });

  it('distinguishes a legal move of the wrong piece', () => {
    const s = step('defend');
    // a3 is a legal pawn move in this position: wrong piece, and the learner
    // needs that correction rather than "that square is attacked".
    const played = play(fenOf(s), 'a3');
    expect(played).not.toBeNull();
    const outcome = checkQuickstartStep(s, fenOf(s), { from: played!.from, to: played!.to });
    expect(outcome).toBe('not-the-piece');
  });

  it('distinguishes the right piece to a square that is still attacked', () => {
    const s = step('defend');
    // Bxd5 is legal and is the bishop, but it captures the very pawn that was
    // attacking — the piece still ends up where the attack came from, so this is
    // "wrong target" and not "wrong piece".
    const played = play(fenOf(s), 'Bxd5');
    expect(played).not.toBeNull();
    expect(checkQuickstartStep(s, fenOf(s), { from: played!.from, to: played!.to })).toBe('wrong-target');
  });

  it('accepts any genuinely safe square for the defending step', () => {
    // The point of a predicate step: more than one right answer.
    const s = step('defend');
    const accepted = ['Bb3', 'Be2', 'Bd3'].filter((san) => {
      const played = play(fenOf(s), san);
      if (!played) return false;
      return checkQuickstartStep(s, fenOf(s), { from: played.from, to: played.to }) === 'solved';
    });
    expect(accepted.length).toBeGreaterThan(1);
  });
});

describe('quickstart: the escape-check step is actually a check', () => {
  // Fool's mate is mate, not check, so the step as written would be teaching
  // the wrong thing. Verified rather than assumed.
  it('the escape-check position has the side to move in check', () => {
    const s = stepById('escape-check');
    const fen = s.startFen === 'previous' ? QUICKSTART[0]!.startFen : s.startFen;
    const g = new Chess(fen);
    expect(g.inCheck()).toBe(true);
  });

  it('the check step ends the game, which is the point of it', () => {
    const s = stepById('check');
    const fen = s.startFen === 'previous' ? QUICKSTART[0]!.startFen : s.startFen;
    const g = new Chess(fen);
    g.move(s.solution!);
    expect(g.isCheckmate()).toBe(true);
  });

  it('the check step is check or mate, and the escape step is only check', () => {
    const check = stepById('check');
    const checkFen = check.startFen === 'previous' ? QUICKSTART[0]!.startFen : check.startFen;
    const afterCheck = new Chess(checkFen);
    afterCheck.move(check.solution!);
    // Either is a legal "give check" step; what must not happen is neither.
    expect(afterCheck.isCheck() || afterCheck.isCheckmate()).toBe(true);

    const escape = stepById('escape-check');
    const escapeFen = escape.startFen === 'previous' ? QUICKSTART[0]!.startFen : escape.startFen;
    expect(new Chess(escapeFen).isCheckmate()).toBe(false);
  });
});

describe('quickstart: order and identity', () => {
  it('is a sequence with no duplicates', () => {
    const ids = QUICKSTART.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('walks forward and ends', () => {
    const first = QUICKSTART[0]!;
    expect(nextStep(first.id)?.id).toBe(QUICKSTART[1]!.id);
    expect(nextStep(QUICKSTART[QUICKSTART.length - 1]!.id)).toBeNull();
  });

  it('gives every step an instruction and a purpose, both non-empty', () => {
    for (const s of QUICKSTART) {
      expect(s.instruction.length).toBeGreaterThan(10);
      expect(s.purpose.length).toBeGreaterThan(10);
    }
  });

  it('asks for something the learner can do, not a judgement', () => {
    // The quickstart's whole claim is that it needs no engine and no chess
    // knowledge. A step phrased as "find the best move" would break that, and
    // would be unanswerable by a machine that is not allowed to have opinions.
    for (const s of QUICKSTART) {
      expect(s.instruction).not.toMatch(/best|strongest|best move|why is/i);
    }
  });
});
