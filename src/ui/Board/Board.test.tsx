import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { Chess } from '../../chess/rules';
import Board from './Board';

type Props = ComponentProps<typeof Board>;

/** 1.e4 d5 2.e5, with the en passant target d6 on the board. */
const EN_PASSANT_FEN = 'rnbqkbnr/pppppppp/8/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3';
/** 1.e4 d5, so the white e4 pawn can be captured on d5. */
const CAPTURE_FEN = 'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 2';
/** A white pawn on a7 with a8 empty: four legal moves to the same square. */
const PROMOTION_FEN = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
/** A white pawn on b7 with a black rook on a8: four captures to a8, four pushes to b8. */
const CAPTURE_PROMOTION_FEN = 'r3k2r/1P6/8/8/8/8/8/R3K2R w KQkq - 0 1';
/** White to move, black queen on d1 checking the white king on e1. */
const CHECK_FEN = '4k3/8/8/8/8/8/8/3qK3 w - - 0 1';
/** White to move, nobody in check. */
const NO_CHECK_FEN = '4k3/8/8/8/8/8/4R3/4K3 w - - 0 1';

function setup(over: Partial<Props> = {}) {
  const onMove = vi.fn();
  const game = over.game ?? new Chess();
  render(<Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={onMove} {...over} />);
  return { onMove, game, user: userEvent.setup() };
}

/** The button for a square, found by the square half of its accessible name. */
const sq = (square: string) => screen.getByRole('button', { name: new RegExp(`^${square},`) });

/** The piece image inside a square, which is what a drop can land on instead of the button. */
const pieceEl = (square: string) => sq(square).querySelector('img.piece');

/** The `src` of a square's piece, or null when the square draws no piece. */
const pieceSrcOf = (square: string) => pieceEl(square)?.getAttribute('src') ?? null;

/** Move focus to a square the way a keyboard user would, and let React settle:
 * focusing a square updates the grid's single tab stop. */
function focusSquare(square: string): void {
  act(() => {
    sq(square).focus();
  });
}

const targets = () => document.querySelectorAll('[data-target]');
const captures = () => document.querySelectorAll('[data-capture]');

// Written out here rather than imported from `pieces.ts`: a test that reuses the
// lookup table it is checking cannot fail. These are the spoken names and the
// standard Unicode chess symbols.
const PIECE_NAMES: Readonly<Record<string, string>> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const PIECE_ASSETS: Readonly<Record<string, string>> = {
  wp: 'wP', wn: 'wN', wb: 'wB', wr: 'wR', wq: 'wQ', wk: 'wK',
  bp: 'bP', bn: 'bN', bb: 'bB', br: 'bR', bq: 'bQ', bk: 'bK',
};

describe('Board', () => {
  describe('rendering', () => {
    it('renders 64 squares inside a named grid', () => {
      setup();
      const grid = screen.getByRole('grid', { name: 'Chess board' });
      expect(within(grid).getAllByRole('button')).toHaveLength(64);
    });

    it('names all 32 starting pieces "<square>, <colour> <piece>", each on its own square', () => {
      setup();
      // Every piece on the board, not a sample of them: a 12-row sample left the
      // bishops unlabelled by any assertion, and a mislabelled bishop is a bishop a
      // screen reader calls a knight. The expected name is built here, from the
      // rules layer, and each one is checked against the square it claims to be on —
      // so a label attached to the wrong square fails too.
      const expected = new Chess()
        .board()
        .flat()
        .filter((cell) => cell !== null)
        .map((cell) => ({
          square: cell.square,
          name: `${cell.square}, ${cell.color === 'w' ? 'white' : 'black'} ${PIECE_NAMES[cell.type]}`,
        }));
      expect(expected).toHaveLength(32);
      for (const { square, name } of expected) {
        expect(screen.getByRole('button', { name }), name).toHaveAttribute('data-square', square);
      }
    });

    it('labels every occupied square and no empty one as a piece', () => {
      setup();
      const labelled = screen
        .getAllByRole('button')
        .map((button) => button.getAttribute('aria-label'))
        .filter((name) => name !== null && !name.endsWith(', empty'))
        .sort();
      expect(labelled).toHaveLength(32);
      expect(new Set(labelled).size).toBe(32);
    });

    it('draws the starting pieces from their own vendored SVGs', () => {
      setup();
      // The whole table, not a sample of three: a rook drawn as a queen is
      // invisible to a test that only checks a king, a queen and a pawn. The
      // expected `src` is built from the rules layer, so a label attached to the
      // wrong square fails too.
      const expected = new Chess()
        .board()
        .flat()
        .filter((cell) => cell !== null)
        .map((cell) => `${cell.square}:${PIECE_ASSETS[`${cell.color}${cell.type}`]}`);
      for (const entry of expected) {
        const [square, key] = entry.split(':');
        expect(pieceSrcOf(square ?? ''), square).toBe(`/pieces/${key}.svg`);
      }
      const drawn = expected.map((entry) => entry.split(':')[1]);
      // White and black versions of a piece are different files, so all 32 are.
      expect(new Set(drawn).size).toBe(12);
    });

    it('names no piece with the image, so a square is announced once', () => {
      setup();
      // The button's own `aria-label` is the name. An `<img>` with a real `alt`
      // inside a labelled button is announced twice, and the second announcement
      // is a filename — the square's name is the thing under test, so the
      // artwork must contribute nothing to it.
      for (const button of screen.getAllByRole('button')) {
        for (const img of button.querySelectorAll('img')) {
          expect(img, button.getAttribute('aria-label') ?? '').toHaveAttribute('alt', '');
          expect(img).toHaveAttribute('aria-hidden', 'true');
        }
      }
      // 32 pieces, 32 images, and not one of them exposed as its own node. The
      // query rather than `getAllByRole`, because "there are none" is the point.
      expect(document.querySelectorAll('img.piece')).toHaveLength(32);
      expect(screen.queryAllByRole('img')).toHaveLength(0);
    });

    it('labels every square with coordinates it does not otherwise show', () => {
      setup();
      // The board's own names already say which square a piece is on, so the
      // coordinate labels are decoration and are hidden from the accessibility
      // tree. If they were exposed, a screen-reader user would hear sixteen
      // letters and digits in a row before reaching the first square.
      const ranks = document.querySelector('.coord-ranks');
      const files = document.querySelector('.coord-files');
      expect(ranks).toHaveAttribute('aria-hidden', 'true');
      expect(files).toHaveAttribute('aria-hidden', 'true');
      // From White's side: 8 down to 1 down the left, a to h along the bottom.
      expect([...ranks!.children].map((n) => n.textContent)).toEqual(['8', '7', '6', '5', '4', '3', '2', '1']);
      expect([...files!.children].map((n) => n.textContent)).toEqual(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);
    });

    it('flips the coordinate labels with the board, rather than leaving them upside down', () => {
      // A label that is right the other way up is worse than no label: it tells a
      // learner the wrong square. The labels are derived from `displaySquares`, so
      // this is the assertion that they really are.
      setup({ orientation: 'b' });
      const ranks = document.querySelector('.coord-ranks')!;
      const files = document.querySelector('.coord-files')!;
      expect([...ranks.children].map((n) => n.textContent)).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
      expect([...files.children].map((n) => n.textContent)).toEqual(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
    });

    it('names each empty square "<square>, empty"', () => {
      setup();
      for (const square of ['a4', 'e4', 'h4', 'd6', 'b6']) {
        expect(screen.getByRole('button', { name: `${square}, empty` })).toHaveAttribute(
          'data-square',
          square,
        );
      }
    });

    it('gives all 64 squares a distinct accessible name, 32 of them empty', () => {
      setup();
      const names = screen.getAllByRole('button').map((b) => b.getAttribute('aria-label'));
      expect(new Set(names).size).toBe(64);
      expect(names.filter((name) => name?.endsWith(', empty'))).toHaveLength(32);
      for (const name of names) {
        expect(name).toMatch(
          /^[a-h][1-8], (empty|(white|black) (pawn|knight|bishop|rook|queen|king))$/,
        );
      }
    });

    it('draws nothing on an empty square', () => {
      setup();
      expect(pieceEl('e4')).toBeNull();
    });

    it('flips the render order for Black', () => {
      setup({ orientation: 'b' });
      const squares = screen.getAllByRole('button');
      expect(squares[0]).toHaveAccessibleName('h1, white rook');
      expect(squares[7]).toHaveAccessibleName('a1, white rook');
      expect(squares[56]).toHaveAccessibleName('h8, black rook');
      expect(squares[63]).toHaveAccessibleName('a8, black rook');
    });
  });

  describe('selection and click to move', () => {
    it('emits a move for select then destination', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
      await user.click(sq('e4'));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
      expect(sq('e2')).not.toHaveAttribute('data-selected');
    });

    it('moves two squares at once with no promotion field and no picker', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      await user.click(sq('e4'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('marks no destinations before anything is selected', () => {
      setup();
      expect(targets()).toHaveLength(0);
      expect(captures()).toHaveLength(0);
    });

    it('deselects when the selected piece is clicked again', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      expect(sq('e4')).toHaveAttribute('data-target', 'true');
      await user.click(sq('e2'));
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      expect(sq('e4')).not.toHaveAttribute('data-target');
      expect(onMove).not.toHaveBeenCalled();
    });

    it('offers only legal destinations', async () => {
      const { user } = setup();
      await user.click(sq('e2'));
      expect(sq('e3')).toHaveAttribute('data-target', 'true');
      expect(sq('e4')).toHaveAttribute('data-target', 'true');
      expect(targets()).toHaveLength(2);
      for (const illegal of ['e5', 'd1', 'a1', 'a3', 'd3', 'e7']) {
        expect(sq(illegal), illegal).not.toHaveAttribute('data-target');
      }
    });

    it('marks a quiet destination as a dot and not a ring', async () => {
      const { user } = setup();
      await user.click(sq('e2'));
      expect(sq('e3')).toHaveAttribute('data-target', 'true');
      expect(sq('e3')).not.toHaveAttribute('data-capture');
      expect(sq('e4')).toHaveAttribute('data-target', 'true');
      expect(sq('e4')).not.toHaveAttribute('data-capture');
      expect(captures()).toHaveLength(0);
    });

    it('marks a capture destination as a ring as well as a destination', async () => {
      const { onMove, user } = setup({ game: new Chess(CAPTURE_FEN) });
      await user.click(sq('e4'));
      expect(sq('d5')).toHaveAttribute('data-target', 'true');
      expect(sq('d5')).toHaveAttribute('data-capture', 'true');
      expect(sq('e5')).not.toHaveAttribute('data-capture');
      expect(captures()).toHaveLength(1);
      await user.click(sq('d5'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e4', to: 'd5' });
    });

    // chess.js reports `captured: 'p'` but `isCapture() === false` for an en passant
    // move, so a board that asks isCapture() draws a dot on a capture.
    it('treats an en passant capture as a capture', async () => {
      const { onMove, user } = setup({ game: new Chess(EN_PASSANT_FEN) });
      await user.click(sq('e5'));
      expect(sq('d6')).toHaveAttribute('data-target', 'true');
      expect(sq('d6')).toHaveAttribute('data-capture', 'true');
      expect(sq('e6')).toHaveAttribute('data-target', 'true');
      expect(sq('e6')).not.toHaveAttribute('data-capture');
      expect(captures()).toHaveLength(1);
      await user.click(sq('d6'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e5', to: 'd6' });
    });

    it('does not move to a square that is not a destination, and drops the selection', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      await user.click(sq('e5'));
      expect(onMove).not.toHaveBeenCalled();
      expect(targets()).toHaveLength(0);
    });

    it('refuses to select an opponent piece', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e7'));
      expect(sq('e7')).not.toHaveAttribute('data-selected');
      expect(targets()).toHaveLength(0);
      await user.click(sq('e5'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('switches selection from one of your pieces to another', async () => {
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      expect(targets()).toHaveLength(2);
      await user.click(sq('d2'));
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      expect(sq('d2')).toHaveAttribute('data-selected', 'true');
      expect(sq('d3')).toHaveAttribute('data-target', 'true');
      expect(sq('e4')).not.toHaveAttribute('data-target');
      expect(onMove).not.toHaveBeenCalled();
    });

    it('is inert when not interactive, and moves as soon as it is', async () => {
      const onMove = vi.fn();
      const game = new Chess();
      const { rerender } = render(
        <Board game={game} orientation="w" interactive={false} lastMove={null} arrows={[]} onMove={onMove} />,
      );
      const user = userEvent.setup();

      await user.click(sq('e2'));
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      expect(targets()).toHaveLength(0);
      await user.click(sq('e4'));
      expect(onMove).not.toHaveBeenCalled();

      // Same board, same clicks, only the prop changed — so the assertions above
      // are the `interactive` guard and not a board that ignores input entirely.
      rerender(<Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={onMove} />);
      await user.click(sq('e2'));
      expect(sq('e4')).toHaveAttribute('data-target', 'true');
      await user.click(sq('e4'));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
    });

    it('never applies the move itself: the Chess instance and the board are unchanged', async () => {
      const game = new Chess();
      const before = game.fen();
      const { onMove, user } = setup({ game });
      await user.click(sq('e2'));
      await user.click(sq('e4'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
      expect(game.fen()).toBe(before);
      expect(sq('e2')).toHaveAccessibleName('e2, white pawn');
      expect(sq('e4')).toHaveAccessibleName('e4, empty');
    });

    it('redraws from a new Chess instance without being asked to', () => {
      const game = new Chess();
      const { rerender } = render(
        <Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={vi.fn()} />,
      );
      expect(sq('e2')).toHaveAccessibleName('e2, white pawn');
      applyThroughParent(game);
      rerender(<Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={vi.fn()} />);
      expect(sq('e2')).toHaveAccessibleName('e2, empty');
      expect(sq('e4')).toHaveAccessibleName('e4, white pawn');
    });
  });

  describe('highlights', () => {
    it('highlights both squares of the last move and nothing else', () => {
      setup({ lastMove: { from: 'e2', to: 'e4' } });
      expect(sq('e2')).toHaveAttribute('data-last', 'true');
      expect(sq('e4')).toHaveAttribute('data-last', 'true');
      expect(sq('e3')).not.toHaveAttribute('data-last');
      expect(document.querySelectorAll('[data-last]')).toHaveLength(2);
    });

    it('marks the checked king and nothing else', () => {
      setup({ game: new Chess(CHECK_FEN) });
      expect(sq('e1')).toHaveAttribute('data-check', 'true');
      expect(sq('d1')).not.toHaveAttribute('data-check');
      expect(document.querySelectorAll('[data-check]')).toHaveLength(1);
    });

    it('marks the side to move in check, not the other king', () => {
      // Black to move with a White rook on the open e-file: the black king is the
      // one in check, so a board that highlighted "the king" would be wrong here.
      setup({ game: new Chess('4k3/8/8/8/8/8/8/4R1K1 b - - 0 1') });
      expect(sq('e8')).toHaveAttribute('data-check', 'true');
      expect(sq('g1')).not.toHaveAttribute('data-check');
      expect(document.querySelectorAll('[data-check]')).toHaveLength(1);
    });

    // `statusOf` reports checkmate as its own status kind with no `check` field, so
    // gating the glow on "still playing" would leave the mated king unlit — at the
    // one moment the king most needs to be obvious.
    it('marks a mated king, because a king in check is in check whoever is winning', () => {
      setup({ game: new Chess("rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3") });
      expect(sq('e1')).toHaveAttribute('data-check', 'true');
      expect(sq('e8')).not.toHaveAttribute('data-check');
      expect(document.querySelectorAll('[data-check]')).toHaveLength(1);
    });

    it('marks no king when nobody is in check', () => {
      setup({ game: new Chess(NO_CHECK_FEN) });
      expect(document.querySelectorAll('[data-check]')).toHaveLength(0);
    });

    it('marks no king in a stalemate, which is not check', () => {
      setup({ game: new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1') });
      expect(document.querySelectorAll('[data-check]')).toHaveLength(0);
    });

    it('marks the king even when the board is not interactive', () => {
      setup({ game: new Chess(CHECK_FEN), interactive: false });
      expect(sq('e1')).toHaveAttribute('data-check', 'true');
    });
  });

  describe('hint arrows', () => {
    const num = (arrow: Element, attribute: string) => Number(arrow.getAttribute(attribute));

    it('renders one line per hint', () => {
      setup({ arrows: [{ from: 'e2', to: 'e4' }] });
      const arrow = screen.getByTestId('arrow-e2-e4');
      expect(arrow.tagName.toLowerCase()).toBe('line');
      expect(arrow.closest('.arrows')).not.toBeNull();
    });

    it('draws the arrow from the origin to the destination for White', () => {
      setup({ arrows: [{ from: 'e2', to: 'e4' }] });
      const arrow = screen.getByTestId('arrow-e2-e4');
      expect(num(arrow, 'x1')).toBeCloseTo(56.25);
      expect(num(arrow, 'y1')).toBeCloseTo(81.25);
      expect(num(arrow, 'x2')).toBeCloseTo(56.25);
      // e4 is above e2 on a White board, so the arrow points up the screen.
      expect(num(arrow, 'y2')).toBeLessThan(num(arrow, 'y1'));
    });

    it('mirrors the arrow when the board is flipped', () => {
      setup({ orientation: 'b', arrows: [{ from: 'e2', to: 'e4' }] });
      const arrow = screen.getByTestId('arrow-e2-e4');
      expect(num(arrow, 'x1')).toBeCloseTo(43.75);
      // h1 is top left when flipped, so e4 is now below e2.
      expect(num(arrow, 'y2')).toBeGreaterThan(num(arrow, 'y1'));
    });

    it('renders several arrows', () => {
      setup({ arrows: [{ from: 'e2', to: 'e4' }, { from: 'd7', to: 'd5' }] });
      expect(screen.getByTestId('arrow-e2-e4')).toBeInTheDocument();
      expect(screen.getByTestId('arrow-d7-d5')).toBeInTheDocument();
    });

    it('skips a hint that is not a pair of squares, and keeps the rest', () => {
      setup({ arrows: [{ from: 'zz', to: 'e4' }, { from: 'e2', to: 'e4' }] });
      expect(screen.queryByTestId('arrow-zz-e4')).toBeNull();
      expect(screen.getByTestId('arrow-e2-e4')).toBeInTheDocument();
      expect(document.querySelectorAll('.arrows line')).toHaveLength(1);
    });

    it('renders no arrow layer content when there is no hint', () => {
      setup({ arrows: [] });
      expect(document.querySelectorAll('.arrows line')).toHaveLength(0);
    });
  });

  describe('drag and drop', () => {
    it('moves a piece by dropping it on a square', () => {
      const { onMove } = setup();
      fireEvent.dragStart(sq('e2'));
      fireEvent.drop(sq('e4'));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
    });

    it('resolves a drop that lands on the piece inside the destination square', () => {
      // The piece is an image covering 86% of its square, so this is the ordinary
      // case and not an edge case: the drop target under the pointer is the
      // artwork, and the search has to walk up to the square from it.
      const { onMove } = setup({ game: new Chess(CAPTURE_FEN) });
      const onPiece = pieceEl('d5');
      expect(onPiece).not.toBeNull();
      fireEvent.dragStart(sq('e4'));
      fireEvent.drop(onPiece as Element);
      expect(onMove).toHaveBeenCalledWith({ from: 'e4', to: 'd5' });
    });

    it('cancels a drop that lands on the grid but not on a square', () => {
      // The knight's only legal destination is a8, which is also the first square
      // in render order — so a handler that fell back to "some square" instead of
      // "no square" would move the knight and be caught here.
      const { onMove } = setup({ game: new Chess('4k3/8/1N6/8/8/8/8/4K3 w - - 0 1') });
      fireEvent.dragStart(sq('b6'));
      fireEvent.drop(sq('a8'));
      expect(onMove).toHaveBeenCalledWith({ from: 'b6', to: 'a8' });

      onMove.mockClear();
      fireEvent.dragStart(sq('b6'));
      fireEvent.drop(screen.getByRole('grid'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('keeps the selection when a drop lands on the grid but not on a square', async () => {
      // A cancelled drop is not an illegal move, so the selection survives it: only
      // the illegal case drops it. Here the pawn's own destination, e4, is also what
      // a naive fallback would guess, so guessing would show up as a move as well as
      // a lost selection.
      const { onMove, user } = setup();
      await user.click(sq('e2'));
      fireEvent.dragStart(sq('e2'));
      fireEvent.drop(screen.getByRole('grid'));
      expect(onMove).not.toHaveBeenCalled();
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
    });

    it('ignores a drop onto the promotion popover, which is not a board square', async () => {
      // A sibling of the grid rather than a square inside it, so a drop there is
      // nobody's business. Kept as a guard against the popover being moved inside
      // the grid later, which would make this drop resolvable.
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      fireEvent.dragStart(sq('a5'));
      fireEvent.drop(screen.getByRole('dialog', { name: 'Choose promotion piece' }));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('drops the options when the parent takes the board away mid-selection', async () => {
      const onMove = vi.fn();
      const game = new Chess();
      const { rerender } = render(
        <Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={onMove} />,
      );
      const user = userEvent.setup();
      await user.click(sq('e2'));
      expect(targets()).toHaveLength(2);

      // The engine's turn, or a game that has just ended: same board, no moves.
      rerender(
        <Board game={game} orientation="w" interactive={false} lastMove={null} arrows={[]} onMove={onMove} />,
      );
      expect(targets()).toHaveLength(0);
      await user.click(sq('e4'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores a drop with nothing being dragged', () => {
      const { onMove } = setup();
      fireEvent.drop(sq('e4'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores a drag to an illegal square', () => {
      const { onMove } = setup();
      fireEvent.dragStart(sq('e2'));
      fireEvent.drop(sq('e5'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('ignores a drop that arrives after the drag ended', () => {
      const { onMove } = setup();
      fireEvent.dragStart(sq('e2'));
      fireEvent.dragEnd(sq('e2'));
      fireEvent.drop(sq('e4'));
      expect(onMove).not.toHaveBeenCalled();
    });

    it('is inert for drags when not interactive, and drags when it is', () => {
      const onMove = vi.fn();
      const game = new Chess();
      const { rerender } = render(
        <Board game={game} orientation="w" interactive={false} lastMove={null} arrows={[]} onMove={onMove} />,
      );

      fireEvent.dragStart(sq('e2'));
      fireEvent.drop(sq('e4'));
      expect(onMove).not.toHaveBeenCalled();

      rerender(<Board game={game} orientation="w" interactive lastMove={null} arrows={[]} onMove={onMove} />);
      fireEvent.dragStart(sq('e2'));
      fireEvent.drop(sq('e4'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
    });

    it('makes only your own pieces draggable', () => {
      setup();
      expect(sq('e2')).toHaveAttribute('draggable', 'true');
      expect(sq('e7')).toHaveAttribute('draggable', 'false');
      expect(sq('e4')).toHaveAttribute('draggable', 'false');
    });
  });

  describe('keyboard', () => {
    it('moves focus in the direction the player pressed for White', async () => {
      const { user } = setup();
      focusSquare('e2');
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(sq('f2'));
      await user.keyboard('{ArrowDown}');
      // On a White board rank 1 is at the bottom, so down is towards rank 1.
      expect(document.activeElement).toBe(sq('f1'));
      await user.keyboard('{ArrowUp}');
      expect(document.activeElement).toBe(sq('f2'));
      await user.keyboard('{ArrowLeft}');
      expect(document.activeElement).toBe(sq('e2'));
    });

    it('mirrors the arrow keys for a Black board', async () => {
      const { user } = setup({ orientation: 'b' });
      focusSquare('e2');
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(sq('d2'));
      await user.keyboard('{ArrowUp}');
      expect(document.activeElement).toBe(sq('d1'));
    });

    it('stops at the edge of the board instead of wrapping', async () => {
      const { user } = setup();
      focusSquare('h8');
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(sq('h8'));
      await user.keyboard('{ArrowUp}');
      expect(document.activeElement).toBe(sq('h8'));
      focusSquare('a1');
      await user.keyboard('{ArrowLeft}');
      expect(document.activeElement).toBe(sq('a1'));
      await user.keyboard('{ArrowDown}');
      expect(document.activeElement).toBe(sq('a1'));
    });

    it('navigates by keyboard when the board is not interactive', async () => {
      const { user } = setup({ interactive: false });
      focusSquare('e2');
      await user.keyboard('{ArrowRight}');
      expect(document.activeElement).toBe(sq('f2'));
    });

    it('plays a move with the keyboard alone', async () => {
      const { onMove, user } = setup();
      focusSquare('e2');
      await user.keyboard('{Enter}');
      expect(sq('e4')).toHaveAttribute('data-target', 'true');
      expect(document.activeElement).toBe(sq('e2'));
      focusSquare('e4');
      await user.keyboard('{Enter}');
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
    });

    it('selects once per Enter, not twice', async () => {
      const { onMove, user } = setup();
      focusSquare('e2');
      await user.keyboard('{Enter}');
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
      await user.keyboard('{Enter}');
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      expect(onMove).not.toHaveBeenCalled();
    });

    it('handles Enter on the keydown itself, not only in the click a browser sends', () => {
      // `fireEvent` sends no default action, so the only thing that can select the
      // square here is the board's own key handling.
      const { onMove } = setup();
      fireEvent.keyDown(sq('e2'), { key: 'Enter' });
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
      fireEvent.keyDown(sq('e4'), { key: 'Enter' });
      expect(onMove).toHaveBeenCalledWith({ from: 'e2', to: 'e4' });
    });

    it('leaves Space to the platform, so a Space keydown cannot activate twice', async () => {
      const { user } = setup();
      focusSquare('e2');
      // A browser (and user-event) already turns Space on a button into a click on
      // keyup, so handling it here as well would select and deselect in one press.
      fireEvent.keyDown(sq('e2'), { key: ' ' });
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      await user.keyboard(' ');
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
    });

    it('activates with Space as well as Enter', async () => {
      const { user } = setup();
      focusSquare('e2');
      await user.keyboard(' ');
      expect(sq('e2')).toHaveAttribute('data-selected', 'true');
    });

    it('ignores activation when not interactive', async () => {
      const { onMove, user } = setup({ interactive: false });
      focusSquare('e2');
      await user.keyboard('{Enter}');
      expect(sq('e2')).not.toHaveAttribute('data-selected');
      expect(onMove).not.toHaveBeenCalled();
    });

    it('is a single tab stop, and the tab stop follows the focus', async () => {
      const { user } = setup();
      const squares = screen.getAllByRole('button');
      expect(squares.filter((square) => square.getAttribute('tabindex') === '0')).toHaveLength(1);
      expect(sq('a8')).toHaveAttribute('tabindex', '0');
      await user.tab();
      expect(document.activeElement).toBe(sq('a8'));
      focusSquare('c4');
      expect(sq('c4')).toHaveAttribute('tabindex', '0');
      expect(sq('a8')).toHaveAttribute('tabindex', '-1');
    });
  });

  describe('promotion', () => {
    it('asks which piece to promote to instead of choosing one', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      expect(screen.getByRole('dialog', { name: 'Choose promotion piece' })).toBeInTheDocument();
      expect(onMove).not.toHaveBeenCalled();
    });

    it('offers all four pieces by name, with focus on the first', async () => {
      const { user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      const dialog = screen.getByRole('dialog', { name: 'Choose promotion piece' });
      for (const name of ['queen', 'rook', 'bishop', 'knight']) {
        expect(within(dialog).getByRole('button', { name: `Promote to ${name}` })).toBeInTheDocument();
      }
      expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Promote to queen' }));
    });

    it('plays the chosen piece, underpromotion included', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      await user.click(screen.getByRole('button', { name: 'Promote to knight' }));
      expect(onMove).toHaveBeenCalledTimes(1);
      expect(onMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8', promotion: 'n' });
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    it('plays a queen when the queen is chosen', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      await user.click(screen.getByRole('button', { name: 'Promote to queen' }));
      expect(onMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8', promotion: 'q' });
    });

    it('asks for a capture promotion too, and rings the destination', async () => {
      const { onMove, user } = setup({ game: new Chess(CAPTURE_PROMOTION_FEN) });
      await user.click(sq('b7'));
      expect(sq('a8')).toHaveAttribute('data-target', 'true');
      expect(sq('a8')).toHaveAttribute('data-capture', 'true');
      expect(sq('b8')).toHaveAttribute('data-target', 'true');
      expect(sq('b8')).not.toHaveAttribute('data-capture');
      await user.click(sq('a8'));
      expect(onMove).not.toHaveBeenCalled();
      await user.click(screen.getByRole('button', { name: 'Promote to rook' }));
      expect(onMove).toHaveBeenCalledWith({ from: 'b7', to: 'a8', promotion: 'r' });
    });

    it('opens the picker from a drag as well as a click', async () => {
      const { onMove } = setup({ game: new Chess(PROMOTION_FEN) });
      fireEvent.dragStart(sq('a7'));
      fireEvent.drop(sq('a8'));
      expect(screen.getByRole('dialog', { name: 'Choose promotion piece' })).toBeInTheDocument();
      expect(onMove).not.toHaveBeenCalled();
    });

    it('cancels on Escape without moving', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      await user.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onMove).not.toHaveBeenCalled();
    });

    it('cancels on the cancel button without moving', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      await user.click(screen.getByRole('button', { name: 'Cancel promotion' }));
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(onMove).not.toHaveBeenCalled();
    });

    it('anchors the picker near the destination square', async () => {
      const { user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      const anchor = document.querySelector('.promotion-anchor') as HTMLElement;
      expect(anchor).not.toBeNull();
      // The destination remains the preferred anchor; edge constraints can move
      // the picker inward. Actual viewport containment is checked in Chromium.
      expect(anchor.style.left).toContain('6.25%');
      expect(anchor.style.top).toContain('6.25%');
    });

    it('ignores Escape once the promotion is resolved', async () => {
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      await user.click(screen.getByRole('button', { name: 'Promote to bishop' }));
      await user.keyboard('{Escape}');
      expect(onMove).toHaveBeenCalledTimes(1);
    });

    it('ignores a click on the board while the picker is open', async () => {
      // The picker is the only question the board is asking, so a second click must
      // not start a second move. The e1 king is a real, legal click when no picker
      // is open, which is what makes this a guard and not a dead board.
      const { onMove, user } = setup({ game: new Chess(PROMOTION_FEN) });
      await user.click(sq('a7'));
      await user.click(sq('a8'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(sq('e1'));
      expect(sq('e1')).not.toHaveAttribute('data-selected');
      // The only destination still on offer is the one being asked about.
      expect([...targets()].map((el) => el.getAttribute('data-square'))).toEqual(['a8']);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(onMove).not.toHaveBeenCalled();

      // Once answered, the same click works again.
      await user.click(screen.getByRole('button', { name: 'Promote to queen' }));
      expect(onMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8', promotion: 'q' });
      await user.click(sq('e1'));
      expect(sq('e1')).toHaveAttribute('data-selected', 'true');
    });

    it('ignores a drop onto the board while the picker is open', () => {
      // The same guard on the drag path, where nothing about the drop says the board
      // is busy: Ke1-d1 is a real move when the picker is closed.
      const { onMove } = setup({ game: new Chess(PROMOTION_FEN) });
      fireEvent.dragStart(sq('a7'));
      fireEvent.drop(sq('a8'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      fireEvent.dragStart(sq('e1'));
      fireEvent.drop(sq('d1'));
      expect(onMove).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      // Answer the promotion, and the drag works again.
      fireEvent.click(screen.getByRole('button', { name: 'Promote to queen' }));
      expect(onMove).toHaveBeenCalledWith({ from: 'a7', to: 'a8', promotion: 'q' });
      onMove.mockClear();
      fireEvent.dragStart(sq('e1'));
      fireEvent.drop(sq('d1'));
      expect(onMove).toHaveBeenCalledWith({ from: 'e1', to: 'd1' });
    });
  });
});

/** Stand-in for the parent, which owns the position and rebuilds the instance. */
function applyThroughParent(game: Chess): void {
  game.move({ from: 'e2', to: 'e4' });
}
