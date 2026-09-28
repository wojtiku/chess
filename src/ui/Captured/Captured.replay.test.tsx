import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';
import { render, screen } from '@testing-library/react';
import Captured, { capturedBy, materialDiff } from './Captured';

// The failure this file exists to prevent: `Captured` reads its two halves
// from two different sources, and only one of them is the board. Material comes
// from `board()` and is correct for a FEN-loaded game; the capture lists come
// from `history()` and come back empty. The result is "+1" next to no pieces —
// a wrong answer with no error, no warning, and no failed test.
//
// The inventory found this while planning. It was invisible because free play
// always replays a move list, and it becomes reachable the moment an exercise
// starts from a FEN.

const REPLAYED = (() => {
  const g = new Chess();
  for (const m of 'e4 d5 exd5 Qxd5'.split(' ')) g.move(m);
  return g;
})();

const FROM_FEN = 'rnbqkbnr/ppp2ppp/8/3P4/8/8/PPP2PPP/RNBQKBNR b KQkq - 0 3';

describe('Captured: the two sources', () => {
  it('reports captures from a replayed game', () => {
    // `capturedBy` returns `{ w, b }` — chess.js's own colour codes, not words.
    expect(capturedBy(REPLAYED).w.length).toBeGreaterThan(0);
  });

  it('reports material from a FEN-loaded game', () => {
    // The board half works fine on its own.
    expect(materialDiff(new Chess(FROM_FEN))).not.toBe(0);
  });

  it('reports NO captures from a FEN-loaded game — the silent wrong answer', () => {
    // This is the trap in executable form. Same material, empty lists.
    const loaded = new Chess(FROM_FEN);
    expect(materialDiff(loaded)).toBeGreaterThan(0);
    expect(capturedBy(loaded).w).toEqual([]);
  });
});

describe('Captured: refuses to render a position it cannot describe', () => {
  // The honest options were to document the contract (which is what the
  // original code did) or to check it. Checking is better here because the
  // precondition is a *fact about the caller's data* that a comment cannot
  // enforce and a test can only pin after someone has already been misled.
  it('says so rather than showing a material count with no pieces', () => {
    render(<Captured game={new Chess(FROM_FEN)} />);
    expect(screen.getByTestId('captured-unreplayable')).toBeInTheDocument();
    // The misleading number must not be on screen at all.
    expect(screen.queryByTestId('captured-advantage-w')).not.toBeInTheDocument();
    expect(screen.queryByTestId('captured-advantage-b')).not.toBeInTheDocument();
  });

  it('explains what went wrong, in terms the caller can act on', () => {
    render(<Captured game={new Chess(FROM_FEN)} />);
    const notice = screen.getByTestId('captured-unreplayable');
    expect(notice).toHaveTextContent(/no move history/i);
  });

  it('renders normally for a replayed game', () => {
    render(<Captured game={REPLAYED} />);
    expect(screen.queryByTestId('captured-unreplayable')).not.toBeInTheDocument();
    expect(screen.getByTestId('captured-by-w')).toBeInTheDocument();
  });
});
