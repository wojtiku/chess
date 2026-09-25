import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import {
  applyMove, hasSingleLegalMove, legalMoves, sanSequence, statusOf,
  tryApplyMove, uciToMove,
} from './rules';

const KIWIPETE = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const FORCED = '4k3/8/8/8/8/8/4q3/4K3 w - - 0 1';
const PROMO = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';

describe('legalMoves', () => {
  it('returns only legal moves for a square', () => {
    const g = new Chess();
    expect(legalMoves(g, 'e2')).toEqual(['e3', 'e4']);
  });

  it('reports the legal SAN for a piece in Kiwipete', () => {
    const g = new Chess(KIWIPETE);
    // The f3 queen still has nine moves in the middle of a crowded board.
    expect(g.get('f3')).toEqual({ type: 'q', color: 'w' });
    expect(legalMoves(g, 'f3')).toHaveLength(9);
    // The e5 knight is not pinned: it retreats to c6 and it also wins the d7
    // pawn, which is SAN `Nxd7` rather than `Nd7`.
    expect(g.get('e5')).toEqual({ type: 'n', color: 'w' });
    expect(legalMoves(g, 'e5')).toContain('Nc6');
    expect(legalMoves(g, 'e5')).toContain('Nxd7');
  });

  it('returns [] for an occupied square whose piece is completely stuck', () => {
    const g = new Chess(KIWIPETE);
    // The h2 pawn is hemmed in, not absent: the black h3 pawn blocks the push
    // and g3 is empty, so it can neither advance nor capture.
    expect(g.get('h2')).toEqual({ type: 'p', color: 'w' });
    expect(legalMoves(g, 'h2')).toEqual([]);
    // The f2 pawn is blocked by the white queen that sits on f3.
    expect(g.get('f2')).toEqual({ type: 'p', color: 'w' });
    expect(legalMoves(g, 'f2')).toEqual([]);
  });

  it('drops every move of an absolutely pinned piece', () => {
    // The e2 knight is pinned on the e-file by the rook on e8. White is not in
    // check only because the knight is in the way, and no knight move can stay
    // on the e-file.
    const pinned = new Chess('4r2k/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(pinned.inCheck()).toBe(false);
    expect(pinned.get('e2')).toEqual({ type: 'n', color: 'w' });
    expect(legalMoves(pinned, 'e2')).toEqual([]);
    // Take the pinning rook away and the very same knight has six moves, so the
    // empty result above is caused by the pin and not by an empty square.
    const unpinned = new Chess('7k/8/8/8/8/8/4N3/4K3 w - - 0 1');
    expect(unpinned.get('e2')).toEqual({ type: 'n', color: 'w' });
    expect(legalMoves(unpinned, 'e2')).toHaveLength(6);
  });

  it('returns [] for a square that holds no piece', () => {
    const g = new Chess(FORCED);
    expect(g.get('a1')).toBeUndefined();
    expect(legalMoves(g, 'a1')).toEqual([]);
  });

  it('filters to the king that was asked about, not to the whole position', () => {
    // In FORCED the white king on e1 is in check from the queen on e2 and
    // Kxe2 is the only move that exists — position-wide as well as king-wide —
    // so this case alone cannot prove the filter is applied.
    const forced = new Chess(FORCED);
    expect(forced.get('e1')).toEqual({ type: 'k', color: 'w' });
    expect(legalMoves(forced, 'e1')).toEqual(['Kxe2']);
    // So pair it with a king that has several moves in a crowded position: if
    // the square argument were ignored, this would return all 48 moves.
    const g = new Chess(KIWIPETE);
    expect(g.moves()).toHaveLength(48);
    expect(legalMoves(g, 'e1')).toEqual(['Kf1', 'Kd1', 'O-O', 'O-O-O']);
  });
});

describe('applyMove', () => {
  it('returns the move with SAN filled in', () => {
    const g = new Chess();
    const m = applyMove(g, { from: 'e2', to: 'e4', san: '' });
    expect(m.san).toBe('e4');
  });

  it('throws on an illegal move', () => {
    expect(() => applyMove(new Chess(), { from: 'e2', to: 'e5', san: '' }))
      .toThrow(/Invalid move/);
  });

  it('tryApplyMove returns null instead of throwing', () => {
    expect(tryApplyMove(new Chess(), { from: 'e2', to: 'e5', san: '' })).toBeNull();
  });

  it('underpromotion is legal and keeps the chosen piece', () => {
    const g = new Chess(PROMO);
    const m = applyMove(g, { from: 'a7', to: 'a8', promotion: 'n', san: '' });
    expect(m.san).toBe('a8=N');
    expect(g.get('a8')).toEqual({ type: 'n', color: 'w' });
  });
});

describe('statusOf', () => {
  it('reports check, not mate', () => {
    // Black queen on d1 checks the king on e1; two escapes remain.
    const g = new Chess('4k3/8/8/8/8/8/8/3qK3 w - - 0 1');
    expect(statusOf(g)).toEqual({ kind: 'playing', check: true });
  });

  it('reports checkmate with the winner when the side to move is mated', () => {
    // Fool's mate, already delivered: the black queen on h4 mates along
    // h4-g3-f2-e1, both squares vacated by the f- and g-pawns. White is to
    // move with no legal move, so Black wins.
    const g = new Chess('rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3');
    expect(g.moves()).toHaveLength(0);
    expect(statusOf(g)).toEqual({ kind: 'checkmate', winner: 'b' });
  });

  it('reaches checkmate through a real move', () => {
    const g = new Chess();
    for (const s of ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#']) g.move(s);
    expect(g.history().at(-1)).toBe('Qxf7#');
    expect(statusOf(g)).toEqual({ kind: 'checkmate', winner: 'w' });
  });

  it('reports stalemate', () => {
    expect(statusOf(new Chess('4k3/4P3/4K3/8/8/8/8/8 b - - 0 78')))
      .toEqual({ kind: 'stalemate' });
  });

  it('reports insufficient material', () => {
    expect(statusOf(new Chess('k7/8/n7/8/8/8/8/7K b - - 0 1')))
      .toEqual({ kind: 'insufficientMaterial' });
  });

  it('reports threefold repetition reached by real play', () => {
    const g = new Chess();
    for (const s of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) {
      g.move(s);
    }
    expect(statusOf(g)).toEqual({ kind: 'threefold' });
  });

  it('reports the fifty-move rule from the halfmove clock', () => {
    const g = new Chess('8/8/8/4k3/8/8/4P3/4K3 w - - 100 60');
    expect(g.isDrawByFiftyMoves()).toBe(true);
    expect(statusOf(g)).toEqual({ kind: 'fiftyMove' });
  });

  it('does not report fifty-move at 99 halfmoves', () => {
    const g = new Chess('8/8/8/4k3/8/8/4P3/4K3 w - - 99 60');
    expect(g.isDrawByFiftyMoves()).toBe(false);
    expect(statusOf(g).kind).not.toBe('fiftyMove');
  });

  it('prefers threefold over fifty-move when both hold', () => {
    // 39 knight cycles = 156 halfmoves, and the start position recurs. Threefold
    // is the more specific reason, so it wins.
    const g = new Chess();
    for (let i = 0; i < 39; i++) {
      g.move('Nf3'); g.move('Nf6'); g.move('Ng1'); g.move('Ng8');
    }
    expect(g.isDrawByFiftyMoves()).toBe(true);
    expect(g.isThreefoldRepetition()).toBe(true);
    expect(statusOf(g)).toEqual({ kind: 'threefold' });
  });
});

describe('hasSingleLegalMove', () => {
  it('is true for a forced position', () => {
    const g = new Chess(FORCED);
    expect(hasSingleLegalMove(g)).toBe(true);
    expect(legalMoves(g)).toEqual(['Kxe2']);
  });

  it('is false at the start of a game', () => {
    expect(hasSingleLegalMove(new Chess())).toBe(false);
  });
});

describe('uciToMove', () => {
  it('parses a plain move', () => {
    expect(uciToMove('e2e4')).toMatchObject({ from: 'e2', to: 'e4' });
    expect(uciToMove('e2e4').promotion).toBeUndefined();
  });

  it('parses a promotion, keeping the piece', () => {
    expect(uciToMove('a7a8q')).toMatchObject({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(uciToMove('e7e8n')).toMatchObject({ from: 'e7', to: 'e8', promotion: 'n' });
  });

  it('applies cleanly as a real move', () => {
    const g = new Chess(PROMO);
    const m = applyMove(g, { ...uciToMove('a7a8n'), san: '' });
    expect(m.san).toBe('a8=N');
  });

  it('ignores a fifth character that is not a promotable piece', () => {
    // A PV line is untrusted engine output, so a stray character must be
    // dropped rather than laundered into a typed promotion.
    expect(uciToMove('a7a8x')).toEqual({ from: 'a7', to: 'a8', san: '' });
    expect(uciToMove('e2e4x')).toEqual({ from: 'e2', to: 'e4', san: '' });
    expect(uciToMove('a7a8k')).toEqual({ from: 'a7', to: 'a8', san: '' });
    expect(uciToMove('a7a8p')).toEqual({ from: 'a7', to: 'a8', san: '' });
    // A genuine promotion character still survives.
    expect(uciToMove('a7a8q').promotion).toBe('q');
  });
});

describe('sanSequence', () => {
  it('replays a PV into SAN', () => {
    expect(sanSequence(new Chess().fen(), ['e2e4', 'e7e5', 'g1f3']))
      .toEqual(['e4', 'e5', 'Nf3']);
  });

  it('stops cleanly at the first illegal PV move', () => {
    expect(sanSequence(new Chess().fen(), ['e2e4', 'e2e4'])).toEqual(['e4']);
  });
});
