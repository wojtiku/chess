import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MoveList from './MoveList';

const moves = [{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }, { san: 'Nc6' }];

/** The `<li>` that holds the given move number's pair, found by its own number. */
const row = (n: number) => {
  const item = screen.getAllByRole('listitem')[n - 1];
  if (item === undefined) throw new Error(`no row ${n}`);
  return item;
};

const current = () =>
  screen.getAllByRole('button').filter((b) => b.getAttribute('aria-current') === 'true');

describe('MoveList', () => {
  it('groups moves into numbered pairs', () => {
    render(<MoveList moves={moves} cursor={4} onGoto={() => {}} />);
    expect(screen.getByText('1.')).toBeInTheDocument();
    expect(screen.getByText('2.')).toBeInTheDocument();
  });

  it('renders every SAN move', () => {
    render(<MoveList moves={moves} cursor={4} onGoto={() => {}} />);
    for (const m of moves) expect(screen.getByText(m.san)).toBeInTheDocument();
  });

  it('marks the move at the cursor', () => {
    render(<MoveList moves={moves} cursor={2} onGoto={() => {}} />);
    expect(screen.getByText('e5')).toHaveAttribute('aria-current', 'true');
  });

  it('calls onGoto with the ply index when a move is clicked', async () => {
    const onGoto = vi.fn();
    render(<MoveList moves={moves} cursor={4} onGoto={onGoto} />);
    await userEvent.setup().click(screen.getByText('e4'));
    expect(onGoto).toHaveBeenCalledWith(1);
  });

  it('renders an empty list without crashing', () => {
    render(<MoveList moves={[]} cursor={0} onGoto={() => {}} />);
    expect(screen.getByText(/no moves/i)).toBeInTheDocument();
  });

  it('shows a trailing number for an odd number of moves', () => {
    render(<MoveList moves={[{ san: 'e4' }]} cursor={1} onGoto={() => {}} />);
    expect(screen.getByText('1.')).toBeInTheDocument();
  });

  // ---- the parts the brief's six assertions above cannot tell apart ----

  it('reports the 1-based ply of every move, not its index and not its move number', async () => {
    // 1.e4 Nf6 2.Nc3 Nc6 as one flat list: the ply of Nf3 is 2 and the ply of Nc3
    // is 3, while their move NUMBERS are 1 and 2. Conflating the two is the bug,
    // and only a test that clicks moves in both halves of two different pairs can
    // see it — the brief's suite clicks only the very first move, where ply and
    // move number happen to be the same 1.
    const onGoto = vi.fn();
    const user = userEvent.setup();
    render(
      <MoveList
        moves={[{ san: 'e4' }, { san: 'Nf6' }, { san: 'Nc3' }, { san: 'Nc6' }]}
        cursor={4}
        onGoto={onGoto}
      />,
    );
    await user.click(screen.getByText('e4'));
    await user.click(screen.getByText('Nf6'));
    await user.click(screen.getByText('Nc3'));
    await user.click(screen.getByText('Nc6'));
    expect(onGoto.mock.calls).toEqual([[1], [2], [3], [4]]);
  });

  it('marks exactly one move, and none at the start position', () => {
    const { unmount } = render(<MoveList moves={moves} cursor={4} onGoto={() => {}} />);
    expect(current().map((b) => b.textContent)).toEqual(['Nc6']);
    unmount();

    // cursor 0 is the position *before* the first move, which is not a move at all.
    // `aria-current="false"` on every button would pass a `toHaveAttribute` check
    // for a caller asking "is this the current one?"; absent is the honest answer.
    render(<MoveList moves={moves} cursor={0} onGoto={() => {}} />);
    expect(current()).toEqual([]);
    expect(screen.getAllByRole('button').every((b) => !b.hasAttribute('aria-current'))).toBe(true);
  });

  it('marks a White move and a Black move in the same row independently', () => {
    const { unmount } = render(<MoveList moves={moves} cursor={1} onGoto={() => {}} />);
    expect(current().map((b) => b.textContent)).toEqual(['e4']);
    unmount();
    render(<MoveList moves={moves} cursor={4} onGoto={() => {}} />);
    expect(current().map((b) => b.textContent)).toEqual(['Nc6']);
  });

  it('renders one row per move pair, with the Black cell absent and not empty', () => {
    // An odd move count must not draw an empty button: a blank focus stop in the
    // tab order that calls onGoto with a ply that does not exist.
    render(<MoveList moves={[{ san: 'e4' }, { san: 'e5' }, { san: 'Nf3' }]} cursor={3} onGoto={() => {}} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(within(row(1)).getAllByRole('button')).toHaveLength(2);
    expect(within(row(2)).getAllByRole('button')).toHaveLength(1);
    expect(within(row(2)).getByText('Nf3')).toBeInTheDocument();
  });

  it('numbers rows past 9 without truncating, and counts pairs not plies', async () => {
    // 22 moves is 11 rows: the last row is numbered 11, and the ply of its White
    // move is 21. Numbering by ply would put "22." here, which is the mistake.
    const long = Array.from({ length: 22 }, (_, i) => ({ san: `m${i + 1}` }));
    const onGoto = vi.fn();
    const user = userEvent.setup();
    render(<MoveList moves={long} cursor={22} onGoto={onGoto} />);
    expect(screen.getByText('10.')).toBeInTheDocument();
    expect(screen.getByText('11.')).toBeInTheDocument();
    expect(screen.queryByText('22.')).not.toBeInTheDocument();
    await user.click(screen.getByText('m21'));
    expect(onGoto).toHaveBeenCalledWith(21);
  });

  it('renders SAN with its own punctuation, including the check and mate marks', () => {
    // A SAN list is full of '#', '+', 'x', 'O-O' and '=' ; none of them may be
    // escaped, stripped or read as markup.
    const tricky = [
      { san: 'O-O' }, { san: 'exd5' }, { san: 'Qxf7#' }, { san: 'Nbd2' }, { san: 'a8=Q' },
    ];
    render(<MoveList moves={tricky} cursor={tricky.length} onGoto={() => {}} />);
    for (const m of tricky) expect(screen.getByText(m.san)).toBeInTheDocument();
  });

  it('accepts the game reducer\'s Move objects without being told to', () => {
    // Task 10 hands this component `GameSnapshot.moves`, which is `Move[]`. The
    // prop is typed to the narrowest shape that works, and this asserts it.
    const reducerMoves = [
      { from: 'e2', to: 'e4', san: 'e4' },
      { from: 'e7', to: 'e5', san: 'e5' },
    ];
    render(<MoveList moves={reducerMoves} cursor={2} onGoto={() => {}} />);
    expect(screen.getByText('e4')).toBeInTheDocument();
    expect(screen.getByText('e5')).toHaveAttribute('aria-current', 'true');
  });
});
