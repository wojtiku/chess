// The captured-pieces panel answers "what has been taken", which is NOT the same
// question as "what is missing from the board". A promoted pawn is missing from
// the board and was taken by nobody; a piece that walked three squares is missing
// from its own starting square and is still standing. Every fixture here is a
// real position reached by real moves, and the material numbers are pinned to the
// value a human would say out loud ("up a knight", "up 6").
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chess } from '../../chess/rules';
import Captured, { capturedBy, materialDiff } from './Captured';

/** The vendored SVG for each piece, written out here rather than imported from the
 *  component: a test that reuses the lookup table it is checking cannot fail. */
const BLACK_PIECES = { q: 'bQ', r: 'bR', b: 'bB', n: 'bN', p: 'bP' } as const;
const WHITE_PIECES = { q: 'wQ', r: 'wR', b: 'wB', n: 'wN', p: 'wP' } as const;

const srcOf = (key: string) => `/pieces/${key}.svg`;

/** A game reached by playing real moves. */
function played(...san: string[]): Chess {
  const game = new Chess();
  for (const s of san) game.move(s);
  return game;
}

/** 1.e4 d5 2.exd5 — White has taken one black pawn and nothing else. */
const ONE_PAWN = () => played('e4', 'd5', 'exd5');
/** ...and 2...Qxd5, so each side has taken one pawn and the game is level. */
const TRADED = () => played('e4', 'd5', 'exd5', 'Qxd5');
/** The trade continues to a bishop and a queen: White is up 6. */
const SIX_UP = () => played('e4', 'd5', 'exd5', 'Qxd5', 'Nc3', 'Qe5+', 'Be2', 'Qxe2+', 'Kxe2');
/** Scholar's-mate-ish f7 grab: two black pawns, White up 2. */
const TWO_PAWNS = () => played('e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nd4', 'Nxe5', 'Qg5', 'Bxf7+', 'Ke7');
/** ...and Black takes the knight back with 6...Qxe5. Black is now up 1: it has
 *  captured ONE piece to White's TWO, so the side ahead is not the side that has
 *  taken more. (Verified: +2 pawns - 3 for the knight = -1.) */
const BLACK_UP_ONE = () => {
  const game = TWO_PAWNS();
  game.move('O-O');
  game.move('Qxe5');
  return game;
};

/** 1.e4 a6 2.e5 d5 3.exd6 e.p. — chess.js reports `isCapture() === false` here. */
const EN_PASSANT = () => played('e4', 'a6', 'e5', 'd5', 'exd6');

describe('materialDiff', () => {
  it('is zero in the starting position, where neither side has taken anything', () => {
    expect(materialDiff(new Chess())).toBe(0);
  });

  it('is +1 after White takes one pawn, and the sign is White\'s', () => {
    // 1.e4 d5 2.exd5. White is up a pawn: 39 - 0 = 39, Black 39 - 1 = 38.
    expect(materialDiff(ONE_PAWN())).toBe(1);
  });

  it('is 0 when the pawns are traded back', () => {
    // The brief's own comment ("a black piece still on the board was captured by
    // White") is what a board scan produces; this position is the case that shows
    // why it is wrong in both directions at once.
    expect(materialDiff(TRADED())).toBe(0);
  });

  it('is +6 for a won queen against a won bishop, and is not 9 or 3', () => {
    // White 39 - 1 (pawn) - 3 (bishop) = 35. Black 39 - 1 (pawn) - 9 (queen) = 29.
    // A pawn-only count gives 0, a "captured piece count" gives 1, and adding the
    // two sides' values instead of subtracting gives -0: three plausible wrong
    // answers, all of which the previous cases also pass.
    expect(materialDiff(SIX_UP())).toBe(6);
  });

  it('is +2 for two black pawns, and -1 once Black has taken a knight back', () => {
    // 4.Nxe5 and 5.Bxf7 take two pawns; 6...Qxe5 takes a knight. 2 - 3 = -1, so
    // Black is up 1 while having captured FEWER pieces than White.
    expect(materialDiff(TWO_PAWNS())).toBe(2);
    expect(materialDiff(BLACK_UP_ONE())).toBe(-1);
  });

  it('is unaffected by a promotion, because the promotion is real material', () => {
    // A white pawn on a7 becomes a queen: 1 pawn (1) out, 1 queen (9) in.
    const promo = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    // The pawn is on a7, so Black is already a pawn down before anything happens.
    expect(materialDiff(promo)).toBe(1);
    promo.move({ from: 'a7', to: 'a8', promotion: 'q' });
    // 1 - 1 + 9: the pawn left the pawn count and joined the queen count.
    expect(materialDiff(promo)).toBe(9);
  });

  it('is 0 in a position where both kings are alone', () => {
    // Kings are not material. This cannot catch a king priced at 9 — both sides
    // always have exactly one king, so any value for `k` cancels in the difference
    // (and chess.js refuses to load a FEN that is missing one, so no reachable
    // position can unbalance it). The `k: 0` entry is for the membership test in
    // `capturedBy`, not for this number; the entry and this assertion agree.
    expect(materialDiff(new Chess('4k3/8/8/8/8/8/8/4K3 w - - 0 1'))).toBe(0);
  });
});

describe('capturedFor', () => {
  it('reports nothing in the starting position, where every piece is on its square', () => {
    // The brief's version pushes all 30 non-king pieces into these two lists at
    // move 0. Sixteen of them are on their own starting squares and were never
    // captured by anybody.
    expect(capturedBy(new Chess())).toEqual({ w: [], b: [] });
  });

  it('lists only what was actually taken', () => {
    expect(capturedBy(ONE_PAWN())).toEqual({ w: ['p'], b: [] });
    expect(capturedBy(TRADED())).toEqual({ w: ['p'], b: ['p'] });
    expect(capturedBy(TWO_PAWNS())).toEqual({ w: ['p', 'p'], b: [] });
  });

  it('puts the captures under the side that MADE them, not the colour of the piece', () => {
    // The piece White took is Black's. Filing it under `b` because it is black would
    // swap the two rows and make every material number appear on the wrong side.
    expect(capturedBy(SIX_UP()).w).toEqual(['p', 'q']);
    expect(capturedBy(SIX_UP()).b).toEqual(['p', 'b']);
  });

  it('counts an en passant capture, which chess.js calls a non-capture', () => {
    // `move.isCapture()` is false for exd6 because the captured pawn is not on the
    // destination square. `move.captured` is 'p' anyway, and the pawn is gone.
    const game = EN_PASSANT();
    const last = game.history({ verbose: true }).at(-1);
    expect(last?.isCapture()).toBe(false);
    expect(capturedBy(game)).toEqual({ w: ['p'], b: [] });
    expect(materialDiff(game)).toBe(1);
  });

  it('does not report a promoted pawn as a capture', () => {
    // Seven white pawns have left the board in this position and not one of them
    // was taken. Any implementation that diffs the board against the standard
    // army reports seven captured pawns here.
    const promo = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    promo.move({ from: 'a7', to: 'a8', promotion: 'q' });
    expect(capturedBy(promo)).toEqual({ w: [], b: [] });
  });

  it('does not report a piece that merely moved as a capture', () => {
    // Six pawns and four pieces have left their own starting squares after 1.e4
    // c5 2.Nf3; none of them was captured.
    const game = played('e4', 'c5', 'Nf3');
    expect(capturedBy(game)).toEqual({ w: [], b: [] });
  });

  it('stays consistent with materialDiff when the only gain is a promotion', () => {
    // The two answers come from different sources on purpose: the capture list is
    // read from the move history and the material from the board, and here they
    // visibly disagree because a promotion is material without a capture.
    const promo = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    promo.move({ from: 'a7', to: 'a8', promotion: 'q' });
    const taken = capturedBy(promo);
    expect(taken.w).toEqual([]);
    expect(taken.b).toEqual([]);
    expect(materialDiff(promo)).toBe(9);
  });
});

describe('Captured', () => {
  /**
   * The `src` of every piece drawn on a row, in DOM order.
   *
   * This is what the panel's whole ordering and colouring contract is about, and
   * it has to be read off the elements rather than off `textContent`: the pieces
   * are images now, so a text assertion would pass on an empty row and pass on a
   * row of twelve of the wrong piece.
   */
  const drawn = (side: 'w' | 'b') =>
    [...screen.getByTestId(`captured-by-${side}`).querySelectorAll('img')].map((img) =>
      img.getAttribute('src'),
    );

  it('shows nothing taken and no number at the start of a game', () => {
    render(<Captured game={new Chess()} />);
    expect(drawn('w')).toEqual([]);
    expect(drawn('b')).toEqual([]);
    expect(screen.queryByText(/^\+\d/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^-\d/)).not.toBeInTheDocument();
  });

  it('shows the pawn White has taken and +1 beside it', () => {
    render(<Captured game={ONE_PAWN()} />);
    // Black's pawn, because the pieces White took are Black's.
    expect(drawn('w')).toEqual([srcOf('bP')]);
    expect(drawn('b')).toEqual([]);
    expect(screen.getByText('+1')).toBeInTheDocument();
  });

  it('shows a trade with no material number at all, on either row', () => {
    // Not "+0" and not "-0": the game is level and the honest display is silence.
    render(<Captured game={TRADED()} />);
    expect(drawn('w')).toEqual([srcOf('bP')]);
    expect(drawn('b')).toEqual([srcOf('wP')]);
    expect(screen.queryByText(/[+-]\d/)).not.toBeInTheDocument();
  });

  it('shows +6 once, on White\'s row, after a won queen against a won bishop', () => {
    render(<Captured game={SIX_UP()} />);
    expect(screen.getAllByText('+6')).toHaveLength(1);
    expect(screen.getByTestId('captured-advantage-w').textContent).toBe('+6');
    expect(screen.getByTestId('captured-advantage-b')).toBeEmptyDOMElement();
  });

  it('puts the number on the side that is AHEAD, not the side that captured more', () => {
    // White has taken two pawns and Black one knight, and Black is up 1. A panel
    // that hangs the number off the capture lists gets this backwards, and the
    // +6 fixture above cannot see it because there the two happen to agree.
    render(<Captured game={BLACK_UP_ONE()} />);
    expect(drawn('w')).toEqual([srcOf('bP'), srcOf('bP')]);
    // The knight Black took is a WHITE piece, so it is drawn as one.
    expect(drawn('b')).toEqual([srcOf('wN')]);
    expect(screen.getByTestId('captured-advantage-w')).toBeEmptyDOMElement();
    expect(screen.getByTestId('captured-advantage-b').textContent).toBe('-1');
  });

  it('draws each captured piece in its own colour, heaviest first', () => {
    // The queen was taken after the pawn, so a history-order list would read
    // "pawn, queen" — which no score sheet in the world writes. And the pieces
    // White took are drawn as Black's (bQ, bP) while the pieces Black took are
    // drawn as White's (wB, wP).
    render(<Captured game={SIX_UP()} />);
    expect(drawn('w')).toEqual([srcOf(BLACK_PIECES.q), srcOf(BLACK_PIECES.p)]);
    expect(drawn('b')).toEqual([srcOf(WHITE_PIECES.b), srcOf(WHITE_PIECES.p)]);
  });

  it('reports a promoted queen as material with nothing captured', () => {
    // Seven pawns have left the board and none was taken: the number is real and the
    // rows are empty, which is the only way those two facts can both be shown.
    const promo = new Chess('4k3/P7/8/8/8/8/8/4K3 w - - 0 1');
    promo.move({ from: 'a7', to: 'a8', promotion: 'q' });
    render(<Captured game={promo} />);
    expect(drawn('w')).toEqual([]);
    expect(drawn('b')).toEqual([]);
    expect(screen.getByTestId('captured-advantage-w').textContent).toBe('+9');
  });

  it('refuses to draw a material number it cannot account for, for a FEN-loaded game', () => {
    // This test used to assert the opposite: that a bare `new Chess(fen)` renders
    // `+1` beside two empty capture lists, on the grounds that the precondition
    // lived on the caller and a documented contract was enough.
    //
    // It is not enough. The panel was asked "what has been taken" and was about to
    // answer "nothing, and also you are up a pawn" with no error anywhere — and the
    // inventory found that this becomes reachable the moment an exercise starts
    // from a FEN, which is the next thing this app is for. The behaviour is now
    // checked, so the wrong number never reaches the screen.
    //
    // The FEN is the position after 1.e4 d5 2.exd5, so Black really is a pawn down.
    const loaded = new Chess('rnbqkbnr/ppp1pppp/8/3P4/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2');
    expect(loaded.history()).toEqual([]);
    render(<Captured game={loaded} />);
    expect(screen.getByTestId('captured-unreplayable')).toBeInTheDocument();
    // The contradiction is not merely hidden, it is absent: no `+1` at all.
    expect(screen.queryByTestId('captured-advantage-w')).not.toBeInTheDocument();
    expect(screen.queryByTestId('captured-by-w')).not.toBeInTheDocument();

    // ...and the same position handed over REPLAYED reads correctly, which is what
    // makes this a precondition on the caller rather than a defect in the panel.
    const replayed = played('e4', 'd5', 'exd5');
    expect(materialDiff(loaded)).toBe(materialDiff(replayed));
    expect(capturedBy(loaded)).toEqual({ w: [], b: [] });
    expect(capturedBy(replayed)).toEqual({ w: ['p'], b: [] });
  });

  it('announces each row with the side, the pieces and the material, in words', () => {
    // The artwork is decorative and the digits are not speakable, so the row
    // carries a sentence for a screen reader instead of two fragments.
    render(<Captured game={SIX_UP()} />);
    expect(screen.getByTestId('captured-by-w')).toHaveAttribute(
      'aria-label',
      'Captured by White: a queen and a pawn. White is up 6 points of material.',
    );
    expect(screen.getByTestId('captured-by-b')).toHaveAttribute(
      'aria-label',
      'Captured by Black: a bishop and a pawn.',
    );
  });

  it('hangs that sentence on a role that accepts a name, not on a bare span', () => {
    // `aria-label` on a `<span>` with no role is dropped by most screen readers, and
    // jsdom cannot tell that: the attribute is in the DOM either way. What IS
    // observable is the accessibility tree, so the sentence is looked up BY ROLE —
    // which only resolves if the element is exposed as a named image.
    render(<Captured game={SIX_UP()} />);
    const named = screen.getByRole('img', {
      name: 'Captured by White: a queen and a pawn. White is up 6 points of material.',
    });
    expect(named).toBe(screen.getByTestId('captured-by-w'));
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  // The pieces are `<img>`s now, and an image with a real `alt` inside a row that
  // is already one named image is announced a third time — as a filename, or as
  // "queen" on top of "a queen and a pawn". So the artwork contributes nothing and
  // the count of *exposed* images stays at the two rows, whatever is drawn on them.
  it('exposes exactly two images however many pieces a row holds', () => {
    render(<Captured game={SIX_UP()} />);
    // Four pieces are drawn and none of them is in the accessibility tree.
    expect(document.querySelectorAll('img')).toHaveLength(4);
    expect(screen.getAllByRole('img')).toHaveLength(2);
    for (const img of document.querySelectorAll('img')) {
      expect(img).toHaveAttribute('alt', '');
      expect(img).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('says "nothing" for a side that has taken no pieces', () => {
    render(<Captured game={ONE_PAWN()} />);
    expect(screen.getByTestId('captured-by-b')).toHaveAttribute(
      'aria-label',
      'Captured by Black: nothing.',
    );
  });

  it('counts pieces and points in the singular and the plural, correctly', () => {
    // "a pawn" / "2 pawns" / "1 point" / "2 points". One point is the commonest
    // difference there is — the first capture of any game — so "1 points" would be
    // read out on almost every game, and the plural branch is a separate code path
    // from the singular one.
    const { unmount } = render(<Captured game={ONE_PAWN()} />);
    expect(screen.getByTestId('captured-by-w')).toHaveAttribute(
      'aria-label',
      'Captured by White: a pawn. White is up 1 point of material.',
    );
    unmount();

    render(<Captured game={TWO_PAWNS()} />);
    expect(screen.getByTestId('captured-by-w')).toHaveAttribute(
      'aria-label',
      'Captured by White: 2 pawns. White is up 2 points of material.',
    );
  });
});
