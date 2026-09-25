import { describe, expect, it } from 'vitest';
import { Chess, applyMove, fenOf, legalMovesVerbose, tryApplyMove, uciToMove } from '../chess/rules';

// `./perft.test.ts` imports `Chess` straight from 'chess.js', so nothing in the
// perft guard can catch a bug in this module. This file is the wrapper
// coverage: the same `rules.ts` entry points the UI will call, driven through
// the three move types whose extra bookkeeping is easiest to get wrong —
// castling, promotion and en passant. Every position is asserted by its exact
// FEN, which pins the board, the side to move, the castling rights, the
// en-passant target and the clocks in one comparison.

const BOTH_CASTLE = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';

describe('rules.ts wrapper: legalMovesVerbose', () => {
  it('filters by the square given and carries the fields the board needs', () => {
    const g = new Chess(BOTH_CASTLE);
    expect(legalMovesVerbose(g)).toHaveLength(26);
    expect(legalMovesVerbose(g, 'h1').map((m) => m.san)).toEqual([
      'Rh2', 'Rh3', 'Rh4', 'Rh5', 'Rh6', 'Rh7', 'Rxh8+', 'Rg1', 'Rf1',
    ]);
    // Every verbose move carries the origin square, SAN and the engine's UCI
    // `lan` field, which is what the board and the engine glue both read.
    const verbose = legalMovesVerbose(g, 'a1');
    expect(verbose.every((m) => m.from === 'a1' && m.san.length > 0)).toBe(true);
    // Castling's `lan` is the king's origin and destination, not the rook's.
    expect(legalMovesVerbose(g, 'e1').find((m) => m.san === 'O-O-O')?.lan).toBe('e1c1');
  });
});

describe('rules.ts wrapper: castling', () => {
  it('moves king and rook together and clears only the mover\'s rights', () => {
    const g = new Chess(BOTH_CASTLE);
    const m = applyMove(g, uciToMove('e1g1'));
    expect(m.san).toBe('O-O');
    // The h1 rook jumped to f1 and the king landed on g1; both origin squares
    // are now empty.
    expect(g.get('f1')).toEqual({ type: 'r', color: 'w' });
    expect(g.get('g1')).toEqual({ type: 'k', color: 'w' });
    expect(g.get('e1')).toBeUndefined();
    expect(g.get('h1')).toBeUndefined();
    // White's KQ rights are gone; Black's kq survive.
    expect(fenOf(g)).toBe('r3k2r/8/8/8/8/8/8/R4RK1 b kq - 1 1');
  });

  it('queensides with the a1 rook', () => {
    const g = new Chess(BOTH_CASTLE);
    expect(applyMove(g, uciToMove('e1c1')).san).toBe('O-O-O');
    expect(g.get('c1')).toEqual({ type: 'k', color: 'w' });
    expect(g.get('d1')).toEqual({ type: 'r', color: 'w' });
    expect(g.get('a1')).toBeUndefined();
    expect(fenOf(g)).toBe('r3k2r/8/8/8/8/8/8/2KR3R b kq - 1 1');
  });

  it('tryApplyMove refuses to castle out of check and leaves the game untouched', () => {
    // The rook on e8 checks the king on e1, so neither castle is legal.
    const g = new Chess('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
    expect(g.inCheck()).toBe(true);
    expect(tryApplyMove(g, uciToMove('e1g1'))).toBeNull();
    expect(tryApplyMove(g, uciToMove('e1c1'))).toBeNull();
    expect(fenOf(g)).toBe('4r1k1/8/8/8/8/8/8/R3K2R w KQ - 0 1');
  });
});

describe('rules.ts wrapper: promotion', () => {
  it('keeps an underpromoted knight and reports it on the returned move', () => {
    const g = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    const m = applyMove(g, uciToMove('a7a8n'));
    expect(m.san).toBe('a8=N');
    expect(m.promotion).toBe('n');
    expect(g.get('a8')).toEqual({ type: 'n', color: 'w' });
    expect(fenOf(g)).toBe('N3k3/8/8/8/8/8/8/4K3 b - - 0 1');
  });

  it('leaves the promotion field undefined on an ordinary move', () => {
    const g = new Chess();
    expect(applyMove(g, uciToMove('e2e4')).promotion).toBeUndefined();
  });
});

describe('rules.ts wrapper: en passant', () => {
  it('removes the captured pawn from its own square and clears the ep target', () => {
    const g = new Chess();
    for (const s of ['e4', 'Nf6', 'e5', 'd5']) g.move(s);
    // The capture is legal here, so chess.js does record d6 as the target.
    expect(fenOf(g)).toBe('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    const m = applyMove(g, uciToMove('e5d6'));
    expect(m.san).toBe('exd6');
    expect(g.get('d6')).toEqual({ type: 'p', color: 'w' });
    // The black pawn is lifted off d5 rather than left behind on d6...
    expect(g.get('d5')).toBeUndefined();
    // ...and the white pawn has left e5. No ep target remains.
    expect(fenOf(g)).toBe('rnbqkb1r/ppp1pppp/3P1n2/8/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 3');
  });

  it('records no ep target after 1.e4 d5, because the capture is not on offer', () => {
    // White's pawn is still on the 4th rank, so there is nothing to capture en
    // passant and chess.js omits the target from the FEN. That is correct
    // behaviour — see the first test for the position where d6 does appear —
    // and must not be "fixed" by hand-rolling a FEN.
    const g = new Chess();
    g.move('e4');
    g.move('d5');
    expect(fenOf(g)).toBe('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    // The d5 pawn is still reachable, by an ordinary diagonal capture that is
    // SAN exd5 and not an en passant move.
    expect(tryApplyMove(g, uciToMove('e4d5'))?.san).toBe('exd5');
    expect(fenOf(g)).toBe('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR b KQkq - 0 2');
  });
});
