import { describe, expect, it } from 'vitest';
import { gradeAttempt, isAlsoFine, marksFor, type EngineLine } from './grading';

const line = (uci: string, scoreCp: number): EngineLine => ({ uci, scoreCp, depth: 20 });

// The shape MultiPV actually returns: every legal move, best first, all in the
// learner's frame because they come from one search of one position.
const LINES = [line('d2d4', 25), line('g1f3', 18), line('c2c4', 12), line('e2e4', 5), line('b1c3', -30)];

describe('gradeAttempt: the three outcomes', () => {
  it('calls a demonstrating move a success even when it is not the best', () => {
    // Nf3 is not the engine's first choice and is not within 50cp of it either.
    // The Concept fired, so the learner found the idea. That is the whole point
    // of separating the two axes.
    const g = gradeAttempt({ lines: LINES, played: 'g1f3', demonstrated: true });
    expect(g.outcome).toBe('demonstrating');
    expect(g.rank).toBe(1);
  });

  it('calls a sound move that missed the concept "fine", not "failed"', () => {
    // c4 is within 50cp of the best and the Concept did not fire. Grading this a
    // failure would teach the learner that reasonable moves are wrong.
    const g = gradeAttempt({ lines: LINES, played: 'c2c4', demonstrated: false });
    expect(g.outcome).toBe('fine');
    expect(g.reason).toMatch(/better one/i);
  });

  it('calls a move outside the tolerance band a failure', () => {
    // Nc3 is 55cp from the best: over the line, and the Concept did not fire.
    const g = gradeAttempt({ lines: LINES, played: 'b1c3', demonstrated: false });
    expect(g.outcome).toBe('failed');
    expect(g.reason).toMatch(/gave up/);
  });

  it('fails a move that hung a piece, even when the engine tolerated it', () => {
    // Within tolerance AND the Concept fired, but the learner left a piece
    // attacked. A separate and harder failure than being outclassed: it is a
    // fact about the position, and it is the mistake beginners make most.
    const g = gradeAttempt({
      lines: [line('d2d4', 25), line('g1f3', 18)],
      played: 'g1f3',
      demonstrated: true,
      leftHanging: true,
    });
    expect(g.outcome).toBe('failed');
    expect(g.reason).toMatch(/nothing defending it/i);
  });
});

describe('gradeAttempt: forced moves are not decisions', () => {
  it('never fails a forced move, however bad', () => {
    // The only legal move hangs a piece. Flagging it teaches the learner to feel
    // bad about a position they could not avoid, which is the rule the existing
    // classify() already states and this inherits.
    const g = gradeAttempt({
      lines: [line('a1a8', -500)],
      played: 'a1a8',
      demonstrated: false,
      leftHanging: true,
      forced: true,
    });
    expect(g.outcome).not.toBe('failed');
    expect(g.reason).toMatch(/only one move/i);
  });

  it('still credits a forced move that demonstrated the concept', () => {
    const g = gradeAttempt({ lines: [line('a1a8', -500)], played: 'a1a8', demonstrated: true, forced: true });
    expect(g.outcome).toBe('demonstrating');
  });
});

describe('gradeAttempt: mate scores are not centipawns', () => {
  it('treats a mate as better than any centipawn score', () => {
    // Best-first ordering is the engine's, and a mate outranks every centipawn
    // score, so the mate line comes FIRST. The learner played the centipawn
    // move, and it must read as giving something up — which only happens if the
    // mate is converted onto the same scale rather than compared as `undefined`.
    const withMate: EngineLine[] = [
      { uci: 'g1f3', scoreMate: 3, depth: 20 },
      { uci: 'd2d4', scoreCp: 0, depth: 20 },
    ];
    const g = gradeAttempt({ lines: withMate, played: 'd2d4', demonstrated: false });
    expect(g.lossCp).toBeGreaterThan(0);
    expect(g.outcome).toBe('failed');
  });

  it('does not treat a mate as a huge centipawn win in the other direction', () => {
    // Being mated is worse than any centipawn score. If the sign were dropped,
    // a mated learner would look like they had found something.
    const mated: EngineLine[] = [
      { uci: 'd2d4', scoreCp: 0, depth: 20 },
      { uci: 'g1f3', scoreMate: -2, depth: 20 },
    ];
    const g = gradeAttempt({ lines: mated, played: 'g1f3', demonstrated: false });
    expect(g.outcome).toBe('failed');
  });

  it('does not read a missing score as zero', () => {
    // A line with no score at all is a failed search, not a perfect move. Zero
    // would make it indistinguishable from an equal position — and it would
    // report "That was a sound move", which is a verdict the app did not earn.
    const g = gradeAttempt({ lines: [{ uci: 'd2d4', depth: 20 }], played: 'd2d4', demonstrated: false });
    expect(g.reason).toMatch(/not among the moves that were compared/i);
    expect(g.rank).toBe(0);
  });

  it('does not blame the learner for a move the search did not return', () => {
    // MultiPV returns every legal move, so a missing one means the caller
    // searched too few lines. Reporting failure would blame the learner for the
    // app's shortfall.
    const g = gradeAttempt({ lines: [line('d2d4', 25)], played: 'a7a8q', demonstrated: false });
    expect(g.outcome).toBe('fine');
    expect(g.reason).toMatch(/not among the moves/i);
  });
});

describe('gradeAttempt: the loss is in the learner\'s frame', () => {
  it('subtracts within one search, with no negation', () => {
    // Every line comes from ONE search of the position before the move, so all
    // scores are already the learner's. Two separate searches would be in
    // opposite frames — the trap classification.ts documents.
    const g = gradeAttempt({ lines: LINES, played: 'b1c3', demonstrated: false });
    expect(g.lossCp).toBe(25 - -30);
  });

  it('reports a negative loss for a move that found something', () => {
    // `lines` is best-first, so for a move to IMPROVE on the stated best it has
    // to appear with a higher score than lines[0] — which happens when the
    // engine's ordering and this learner's move disagree, or when a narrower
    // search was cached. Either way the sign must survive the subtraction.
    const g = gradeAttempt({ lines: [line('d2d4', 10), line('b1c3', 60)], played: 'b1c3', demonstrated: false });
    expect(g.lossCp).toBe(10 - 60);
    expect(g.outcome).toBe('fine');
  });

  it('reports a zero loss for the move the engine chose', () => {
    const g = gradeAttempt({ lines: LINES, played: 'd2d4', demonstrated: false });
    expect(g.lossCp).toBe(0);
    expect(g.rank).toBe(0);
    // The best move that missed the concept is still "fine", with no better one
    // to point at, so the reason must not promise something that is not there.
    expect(g.reason).toBe('That was a sound move.');
  });
});

describe('isAlsoFine: labelling, not grading', () => {
  it('accepts a move inside the wide band', () => {
    expect(isAlsoFine(18, 25)).toBe(true);
  });

  it('rejects a move outside it', () => {
    expect(isAlsoFine(-30, 25)).toBe(false);
  });

  it('refuses to label anything when the best move has no score', () => {
    // A missing best score would make every candidate "also fine" by comparing
    // against nothing.
    expect(isAlsoFine(0, undefined)).toBe(false);
  });
});

describe('marksFor: what the board shows', () => {
  it('marks both moves of a consequence', () => {
    const marks = marksFor([{ uci: 'e2e4', role: 'played' }, { uci: 'e7e5', role: 'reply' }]);
    expect(marks).toEqual([
      { from: 'e2', to: 'e4', role: 'played' },
      { from: 'e7', to: 'e5', role: 'reply' },
    ]);
  });

  it('keeps the roles apart, so cause and effect are legible', () => {
    const marks = marksFor([{ uci: 'a1a8', role: 'played' }, { uci: 'h7h5', role: 'reply' }]);
    expect(new Set(marks.map((m) => m.role)).size).toBe(2);
  });

  it('skips a malformed move rather than throwing', () => {
    // A UCI string of the wrong length would slice into nonsense squares.
    expect(marksFor([{ uci: 'e2', role: 'played' }])).toEqual([]);
  });
});
