import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  boardMarks,
  factsToShow,
  retry,
  revealBest,
  startExercise,
  submitAttempt,
  type ExerciseConcept,
} from './exercise';
import { boardFacts, type FactPack } from './detectors';
import { gradeAttempt, type EngineLine } from './grading';

const line = (uci: string, scoreCp: number): EngineLine => ({ uci, scoreCp, depth: 20 });

// The Italian middlegame: White to move, e4 attacked but defended, one knight
// still undeveloped. Used as the exercise position throughout.
// NOTE: in this position the bishop on c4 *is* attacked and undefended, so the
// fact pack reports a hanging piece. That was not obvious when the fixture was
// written and the comments claimed otherwise; the position was checked instead.
const FEN = 'rnbqkb1r/ppp2ppp/5n2/3pp3/2B1P3/2N5/PPPP1PPP/R1BQK1NR w KQkq - 0 4';

/**
 * A quiet middlegame: no hangers, no mate, and captures that are clearly not a
 * tactic. Used for the negative facts. Note it *has* captures — which is the
 * point: "no tactic" has to be sayable in a position that has options, or it is
 * never said at all.
 */
const QUIET = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9';

const LINES = [line('g1f3', 30), line('d2d4', 22), line('b1c3', 8), line('a2a3', -10)];

/** A detector that fires only on the move it names, built on a real position so
 *  a test cannot pass by asserting something the board does not support. */
const conceptFor = (target: string): ExerciseConcept => ({
  id: 'develop-knight',
  name: 'develop a piece',
  fires: (position, uci) => {
    if (uci !== target) return false;
    // Sanity: the move must actually develop something, or the concept is lying.
    const piece = position.pieceAt[uci.slice(0, 2) as 'g1'];
    return piece !== undefined;
  },
});

const NOW = 1_700_000_000_000;
const submit = (uci: string, concept: ExerciseConcept, reply: string | null = 'd7d5') =>
  submitAttempt(startExercise(), {
    startFen: FEN,
    concept,
    uci,
    lines: LINES,
    reply,
    now: NOW,
  });

describe('exercise: a correct attempt', () => {
  it('is solved, and offers no recovery', () => {
    const s = submit('g1f3', conceptFor('g1f3'));
    expect(s.phase).toBe('solved');
    expect(s.reply).toBeNull();
    expect(s.attempts[0]!.outcome).toBe('demonstrating');
  });

  it('marks the first attempt as attempt one, which is the Independent one', () => {
    expect(submit('g1f3', conceptFor('g1f3')).attemptNo).toBe(1);
  });

  it('marks the move it made, and no reply, because there was nothing to react to', () => {
    // The mark is not the consequence — it is a record of what the learner did,
    // which is worth showing either way. What is absent is the opponent's reply.
    const marks = boardMarks(submit('g1f3', conceptFor('g1f3')));
    expect(marks).toEqual([{ from: 'g1', to: 'f3', role: 'played' }]);
    expect(marks.some((m) => m.role === 'reply')).toBe(false);
  });
});

describe('exercise: a wrong attempt plays out', () => {
  it('goes to the consequence phase rather than refusing', () => {
    // A refused move teaches nothing about why the alternative was better.
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(s.phase).toBe('consequence');
    expect(s.attempts).toHaveLength(1);
    expect(s.attempts[0]!.uci).toBe('a2a3');
  });

  it('marks both moves on the board, so the trade is visible', () => {
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(boardMarks(s)).toEqual([
      { from: 'a2', to: 'a3', role: 'played' },
      { from: 'd7', to: 'd5', role: 'reply' },
    ]);
  });

  it('keeps the fact pack with the attempt', () => {
    // Without it, a wrong explanation later cannot be traced to the evidence it
    // was given, which is the argument for storing it at all.
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(s.attempts[0]!.facts.fen).toBe(FEN);
  });

  it('records the attempt even though it failed', () => {
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(s.attempts[0]!.outcome).not.toBe('demonstrating');
    expect(s.attemptNo).toBe(1);
  });
});

describe('exercise: both buttons, both always', () => {
  it('retry returns the board and keeps the attempt', () => {
    const s = submit('a2a3', conceptFor('g1f3'));
    const r = retry(s);
    expect(r.phase).toBe('attempting');
    expect(r.reply).toBeNull();
    // The failed attempt survives: it is evidence, not clutter.
    expect(r.attempts).toHaveLength(1);
    expect(r.attemptNo).toBe(1);
  });

  it('reveal does not end the exercise, so the learner may still retry', () => {
    const s = revealBest(submit('a2a3', conceptFor('g1f3')), 'g1f3');
    expect(s.phase).toBe('revealed');
    expect(s.revealed).toBe('g1f3');
    const r = retry(s);
    expect(r.phase).toBe('attempting');
  });

  it('marks the revealed move as a third mark, distinct from the two played', () => {
    const s = revealBest(submit('a2a3', conceptFor('g1f3')), 'g1f3');
    const marks = boardMarks(s);
    expect(marks.map((m) => m.role)).toEqual(['played', 'reply', 'better']);
  });

  it('refuses both buttons before a wrong move', () => {
    const s = submit('g1f3', conceptFor('g1f3'));
    expect(retry(s)).toBe(s);
    expect(revealBest(s, 'g1f3')).toBe(s);
  });

  it('refuses to reveal nothing', () => {
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(revealBest(s, null)).toBe(s);
  });
});

describe('exercise: attempts after the first are not independent', () => {
  it('counts the retry, so the record stays honest', () => {
    let s = submit('a2a3', conceptFor('g1f3'));
    s = retry(s);
    s = submitAttempt(s, {
      startFen: FEN,
      concept: conceptFor('g1f3'),
      uci: 'g1f3',
      lines: LINES,
      reply: 'd7d5',
      now: NOW + 1000,
    });
    expect(s.attemptNo).toBe(2);
    // The second attempt succeeded, and it followed something the learner was
    // shown. That is assisted practice and must never read as independent.
    expect(s.attempts[0]!.outcome).not.toBe('demonstrating');
    expect(s.attempts[1]!.outcome).toBe('demonstrating');
  });

  it('timestamps every attempt, so retention is measurable later', () => {
    const s = submit('a2a3', conceptFor('g1f3'));
    expect(s.attempts[0]!.at).toBe(NOW);
  });
});

describe('factsToShow: facts, not judgements', () => {
  it('says what is true of the position, in the learner\'s terms', () => {
    // The probe's failure mode was a plausible-sounding sentence the learner
    // could not check. These are computed, so they are sayable.
    const f = boardFacts(FEN);
    const shown = factsToShow(gradeAttempt({ lines: LINES, played: 'a2a3', demonstrated: false }), f);
    for (const line of shown) expect(line.length).toBeGreaterThan(0);
  });

  it('never tells the learner what they should have done', () => {
    const f = boardFacts(FEN);
    const shown = factsToShow(gradeAttempt({ lines: LINES, played: 'a2a3', demonstrated: false }), f);
    for (const line of shown) {
      expect(line).not.toMatch(/\bshould have\b|\byou should\b|\bought to\b|why didn't you/i);
    }
  });

  it('says plainly when there is no tactic, even if captures exist', () => {
    // A negative fact, and the one the probe showed matters most: a model asked
    // about a position with no combination will invent one to explain the
    // question.
    //
    // The sentence is keyed on there being no *forced* sequence, not on there
    // being no captures — a lone capture in a quiet middlegame is not a
    // combination, and gating the sentence on "no options at all" would mean
    // never saying it. QUIET has captures and must still say it.
    const quiet = boardFacts(QUIET);
    expect(quiet.matesAvailable).toEqual([]);
    expect(quiet.capturesAvailable.length).toBeGreaterThan(0);
    const g = gradeAttempt({ lines: LINES, played: 'a2a3', demonstrated: false });
    const shown = factsToShow(g, quiet);
    // Both halves: the capture is available, and it is not a combination.
    expect(shown.join(' ')).toMatch(/could have captured/i);
    expect(shown.join(' ')).toMatch(/no combination|no tactic/i);
  });

  it('says the same thing when nothing at all is available', () => {
    // Built rather than played: a bare kings-and-pawns position has no captures,
    // but reaching one from a real game is a long search, and the sentence is
    // keyed on the fact pack's contents rather than on how the position arose.
    const bare: FactPack = {
      fen: '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1',
      sideToMove: 'w',
      learnerSide: 'w',
      inCheck: false,
      castlingRights: '-',
      kingCastled: false,
      pieceAt: { e1: 'wk', e2: 'wp', e8: 'bk' },
      material: { w: 1, b: 0 },
      legalMoveCount: 3,
      learnerPieces: [
        { square: 'e2', piece: 'p', attackedByOpponent: false, defendedByYou: true, hangs: false, undeveloped: false },
      ],
      hanging: [],
      undeveloped: [],
      capturesAvailable: [],
      checksAvailable: [],
      matesAvailable: [],
    };
    const g = gradeAttempt({ lines: LINES, played: 'a2a3', demonstrated: false });
    expect(factsToShow(g, bare).join(' ')).toMatch(/no tactic/i);
  });

  it('reports a hanging piece when there is one', () => {
    const f = boardFacts(FEN);
    expect(f.learnerPieces.filter((p) => p.hangs).map((p) => p.square)).toContain('c4');
    const shown = factsToShow(gradeAttempt({ lines: LINES, played: 'a2a3', demonstrated: false }), f);
    expect(shown.join(' ')).toMatch(/attacked/i);
  });
});
