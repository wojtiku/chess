import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { boardFacts, type FactPack } from './detectors';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const AFTER_E4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1';
const ITALIAN = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9';

const pieceOn = (f: FactPack, square: string) => f.pieceAt[square];
const own = (f: FactPack, square: string) => f.learnerPieces.find((p) => p.square === square);

describe('boardFacts: the board itself', () => {
  it('records the side to move from the FEN', () => {
    expect(boardFacts(START).sideToMove).toBe('w');
    expect(boardFacts(AFTER_E4).sideToMove).toBe('b');
  });

  it('records every piece by colour and type', () => {
    const f = boardFacts(ITALIAN);
    // The Italian fixture is post-castling, so White's king is on g1 and e1 is
    // empty. Asserting e1 would have been asserting the position was wrong.
    // Both sides are castled in this fixture: kings on g1 and g8, and e1/e8
    // empty. Asserting the pre-castling squares would have been asserting the
    // position was wrong.
    expect(pieceOn(f, 'g1')).toBe('wk');
    expect(pieceOn(f, 'g8')).toBe('bk');
    expect(pieceOn(f, 'e1')).toBeUndefined();
    expect(pieceOn(f, 'e8')).toBeUndefined();
    expect(pieceOn(f, 'd4')).toBeUndefined();
  });

  it('reports material by type, in pawns', () => {
    expect(boardFacts(START).material).toEqual({ w: 39, b: 39 });
    // 1.e4 e5: equal pawns, equal everything.
    expect(boardFacts(AFTER_E4).material).toEqual({ w: 39, b: 39 });
  });

  it('counts a missing piece against its side', () => {
    // 1.e4 e5 2.Nf3 Nc6 3.Bc4 Bc5 4.Ng5 Qxg5 — White has lost a knight.
    const g = new Chess();
    for (const m of 'e4 e5 Nf3 Nc6 Bc4 Bc5 Ng5 Qxg5'.split(' ')) g.move(m);
    expect(boardFacts(g.fen()).material).toEqual({ w: 36, b: 39 });
  });
});

describe('boardFacts: attacked and defended', () => {
  // REGRESSION. The detector was first written as `attacked(square, verbose)`,
  // which is a different method with a different signature: it asks whether the
  // square is attacked by the side *not* to move, and the second argument is a
  // verbosity flag, not a colour. Passing a colour there made every "defended"
  // reading identical to every "attacked" reading, so the whole pack claimed no
  // piece was ever defended — and the models wrote confident, wrong teaching
  // from it without complaint. See docs/research/2026-09-27-llm-coach-probe.md.
  it('distinguishes attacked from defended', () => {
    const f = boardFacts(ITALIAN);
    // e4 is attacked by Black's e5 pawn and defended by the d3 knight.
    expect(own(f, 'e4')?.attackedByOpponent).toBe(true);
    expect(own(f, 'e4')?.defendedByYou).toBe(true);
    expect(own(f, 'e4')?.hangs).toBe(false);
  });

  it('finds a genuinely hanging piece', () => {
    // The probe's P1: after 4.Ng5 Qxg5 the queen on g5 attacks g2, and nothing
    // defends it because the g1 knight and f2 pawn are still unmoved.
    const g = new Chess();
    for (const m of 'e4 e5 Nf3 Nc6 Bc4 Bc5 Ng5 Qxg5'.split(' ')) g.move(m);
    const f = boardFacts(g.fen());
    const g2 = own(f, 'g2');
    expect(g2?.attackedByOpponent).toBe(true);
    expect(g2?.defendedByYou).toBe(false);
    expect(g2?.hangs).toBe(true);
  });

  it('never reports hangs without both halves of the condition', () => {
    // The invariant that the first regression broke: if hangs is true then the
    // piece is attacked and undefended, and if it is defended it cannot hang.
    const f = boardFacts(ITALIAN);
    for (const p of f.learnerPieces) {
      expect(p.hangs).toBe(p.attackedByOpponent && !p.defendedByYou);
    }
  });

  it('reports a defended bishop as defended', () => {
    // The c1 bishop is defended by the queen on d1.
    expect(own(boardFacts(START), 'c1')?.defendedByYou).toBe(true);
  });
});

describe('boardFacts: undeveloped pieces are colour-aware', () => {
  // REGRESSION. The home-square table was first written for White only
  // (b1/g1/c1/f1/a1/h1/d1), so for Black — whose pieces live on rank 8 — it
  // reported that Black had no undeveloped pieces, in every opening. The
  // learner is White in release 1, which is exactly why the bug survived being
  // invisible for as long as it did.
  it('reports White undeveloped at the start', () => {
    const f = boardFacts(START);
    expect(f.learnerPieces.filter((p) => p.undeveloped).map((p) => p.square).sort())
      .toEqual(['a1', 'b1', 'c1', 'd1', 'f1', 'g1', 'h1']);
  });

  it('reports Black undeveloped when Black is to move', () => {
    const f = boardFacts(START.replace(' w KQkq', ' b KQkq'));
    expect(f.learnerPieces.filter((p) => p.undeveloped).map((p) => p.square).sort())
      .toEqual(['a8', 'b8', 'c8', 'd8', 'f8', 'g8', 'h8']);
  });

  it('does not call a pawn on the second rank undeveloped', () => {
    // The white pawn on e2 is on its starting square. It is a starting square,
    // not an undeveloped piece: pawns develop by advancing, and calling this
    // "undeveloped" would have the coach nag about a pawn that has not moved
    // for the best of reasons.
    expect(own(boardFacts(START), 'e2')?.undeveloped).toBe(false);
  });

  it('stops reporting a piece once it has moved', () => {
    // After 1.e4 the e-pawn is off its square; the knight on g1 has not moved.
    const f = boardFacts(AFTER_E4); // Black to move
    expect(own(f, 'b8')?.undeveloped).toBe(true);
    // White's f1/g1 knights are the opponent's now, so not in learnerPieces.
    expect(f.learnerPieces.some((p) => p.square === 'e2')).toBe(false);
  });
});

describe('boardFacts: what the side to move can do', () => {
  it('lists captures available to the side to move', () => {
    // Scholar's mate setup: the queen on h5 can take f7.
    const g = new Chess();
    for (const m of 'e4 e5 Bc4 Nc6 Qh5 Nf6'.split(' ')) g.move(m);
    const f = boardFacts(g.fen());
    expect(f.sideToMove).toBe('w');
    expect(f.capturesAvailable).toContain('h5xf7');
  });

  it('reports a mate in one when one exists', () => {
    const g = new Chess();
    for (const m of 'e4 e5 Bc4 Nc6 Qh5 Nf6'.split(' ')) g.move(m);
    expect(boardFacts(g.fen()).matesAvailable).toContain('Qxf7#');
  });

  it('reports no mate when none exists', () => {
    expect(boardFacts(START).matesAvailable).toEqual([]);
  });

  it('reports checks available', () => {
    // A position with a checking move available: the queen can take on f7 with check.
    // Qxf7 is only check once the g8 knight is off, because the f7 pawn is
    // otherwise defended by its own king. This is the position that carries
    // Scholar's mate, and the fact is checked here rather than assumed.
    const g = new Chess();
    for (const m of 'e4 e5 Bc4 Nc6 Qh5 Nf6'.split(' ')) g.move(m);
    // Captures and checks are UCI so they can be replayed; mates keep SAN
    // because '#' is the fact worth carrying and a mate distance is not.
    // In this position the queen's f7 capture is *mate*, not check, so it does
    // not appear in `checksAvailable`; the bishop's is the real check.
    expect(boardFacts(g.fen()).matesAvailable).toContain('Qxf7#');
    expect(boardFacts(g.fen()).checksAvailable).toContain('c4xf7');
    expect(boardFacts(g.fen()).checksAvailable).toContain('h5xe5');
  });
});

describe('boardFacts: king safety', () => {
  it('knows a castled king from an uncastled one', () => {
    expect(boardFacts(START).kingCastled).toBe(false);
    expect(boardFacts(ITALIAN).kingCastled).toBe(true);
  });

  it('reports castling rights from the FEN', () => {
    expect(boardFacts(START).castlingRights).toBe('KQkq');
    expect(boardFacts(ITALIAN).castlingRights).toBe('-');
  });

  it('reports check', () => {
    // Fool's mate: after 1.f3 e5 2.g4 Qh4# the side to move is in check.
    const g = new Chess();
    for (const m of 'f3 e5 g4 Qh4'.split(' ')) g.move(m);
    const f = boardFacts(g.fen());
    expect(f.sideToMove).toBe('w');
    expect(f.inCheck).toBe(true);
  });
});

describe('boardFacts: the packet is self-describing', () => {
  it('names pieces by owner rather than by relation to a reader', () => {
    // The probe's largest failure was perspective: a model told it was Black to
    // move advised the White learner using "your knight". Every fact is
    // expressed in absolute terms so the question cannot arise.
    const f = boardFacts(AFTER_E4); // Black to move
    expect(f.learnerSide).toBe('b');
    expect(f.learnerPieces.every((p) => p.square)).toBe(true);
    // No field anywhere says "yours".
    expect(JSON.stringify(f)).not.toMatch(/\byour\b/i);
  });

  it('carries negative facts, so a model need not invent a threat', () => {
    // P5 of the probe asked about a knight that was not attacked. The pack has to
    // be able to say so, or the model invents the threat to answer the question.
    const f = boardFacts(ITALIAN);
    expect(own(f, 'c3')?.attackedByOpponent).toBe(false);
    expect(f.learnerPieces.some((p) => p.hangs)).toBe(false);
  });

  it('serialises without functions and without a Chess handle', () => {
    // The fact pack is stored in the learner record, so it has to be plain data.
    const round = JSON.parse(JSON.stringify(boardFacts(ITALIAN))) as FactPack;
    expect(round.fen).toBe(ITALIAN);
    expect(round.learnerPieces.length).toBeGreaterThan(0);
  });
});
