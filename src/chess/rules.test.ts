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

  it('excludes moves that leave the king in check', () => {
    const g = new Chess(KIWIPETE);
    // Kiwipete's traps: the d1 queen and the c1/g1/h2 bishops are completely
    // stuck, while the f3 queen still has nine moves.
    expect(legalMoves(g, 'd1')).toEqual([]);
    expect(legalMoves(g, 'f3')).toHaveLength(9);
    // The e5 knight is pinned along the a1-h8 diagonal, so Nd7 is not legal.
    expect(legalMoves(g, 'e5')).not.toContain('Nd7');
    expect(legalMoves(g, 'e5')).toContain('Nc6');
  });

  it('returns [] for a square with no legal moves', () => {
    expect(legalMoves(new Chess(FORCED), 'a1')).toEqual([]);
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
    // Scholar's mate, already delivered. White is to move and has no legal move,
    // so Black wins.
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
