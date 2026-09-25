// "Draw by threefold repetition" teaches something; "Game over" does not. So the
// test is not that a banner appears but that the right words appear, for every one
// of the seven `GameStatus` kinds, with the right winner named.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { GameStatus } from '../../chess/types';
import ResultBanner from './ResultBanner';

/** Every kind, so that a kind added to the union and to this list cannot render a
 *  silent banner: `ALL_KINDS` is walked by the test below as well as by the
 *  component's own exhaustiveness check. */
const ALL_KINDS: ReadonlyArray<GameStatus['kind']> = [
  'playing', 'checkmate', 'stalemate', 'threefold', 'fiftyMove',
  'insufficientMaterial', 'resigned',
];

const banner = () => screen.queryByRole('status');

describe('ResultBanner', () => {
  it('renders nothing at all while the game is being played', () => {
    const { container } = render(<ResultBanner status={{ kind: 'playing', check: false }} />);
    expect(banner()).not.toBeInTheDocument();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a game in check, because check is not an ending', () => {
    const { container } = render(<ResultBanner status={{ kind: 'playing', check: true }} />);
    expect(container.firstChild).toBeNull();
  });

  it('names the winner of a checkmate', () => {
    const { unmount } = render(<ResultBanner status={{ kind: 'checkmate', winner: 'w' }} />);
    expect(banner()).toHaveTextContent('Checkmate — White wins');
    unmount();
    render(<ResultBanner status={{ kind: 'checkmate', winner: 'b' }} />);
    expect(banner()).toHaveTextContent('Checkmate — Black wins');
  });

  it('names the winner of a resignation, which is the side that did NOT resign', () => {
    // The learner plays White, so a resignation is almost always Black's and the
    // banner must credit White. Reading the wrong field here congratulates the
    // side that walked away, which is the single worst thing this panel can do.
    const { unmount } = render(<ResultBanner status={{ kind: 'resigned', winner: 'w' }} />);
    expect(banner()).toHaveTextContent('Resigned — White wins');
    unmount();
    render(<ResultBanner status={{ kind: 'resigned', winner: 'b' }} />);
    expect(banner()).toHaveTextContent('Resigned — Black wins');
  });

  it('names each draw by its own rule, not as "draw"', () => {
    for (const [status, text] of [
      [{ kind: 'stalemate' }, 'Draw by stalemate'],
      [{ kind: 'threefold' }, 'Draw by threefold repetition'],
      [{ kind: 'fiftyMove' }, 'Draw by the fifty-move rule'],
      [{ kind: 'insufficientMaterial' }, 'Draw by insufficient material'],
    ] as ReadonlyArray<[GameStatus, string]>) {
      const { unmount } = render(<ResultBanner status={status} />);
      expect(banner(), status.kind).toHaveTextContent(text);
      unmount();
    }
  });

  it('distinguishes the four draws from one another', () => {
    // A `draw` fallback would pass each of the four assertions above if the text
    // merely contained the word "draw", so the whole sentence is pinned instead.
    const texts = ALL_KINDS.filter((k) => k !== 'playing' && k !== 'checkmate' && k !== 'resigned')
      .map((kind) => {
        const { unmount } = render(<ResultBanner status={{ kind } as GameStatus} />);
        const text = banner()?.textContent ?? '';
        unmount();
        return text;
      });
    expect(new Set(texts).size).toBe(4);
  });

  it('says something for every kind except playing', () => {
    for (const kind of ALL_KINDS) {
      const status = { kind } as GameStatus;
      const { unmount } = render(<ResultBanner status={status} />);
      const text = banner()?.textContent ?? '';
      if (kind === 'playing') {
        expect(text, kind).toBe('');
      } else {
        expect(text.length, kind).toBeGreaterThan(0);
        expect(text.trim(), kind).toBe(text);
      }
      unmount();
    }
  });

  it('announces the result politely, without stealing focus', () => {
    // A result that arrives while the engine is thinking must be read out, and must
    // not move the learner's cursor off the board they are looking at.
    render(<ResultBanner status={{ kind: 'checkmate', winner: 'w' }} />);
    const node = banner();
    expect(node).toHaveAttribute('aria-live', 'polite');
    expect(node).not.toHaveAttribute('tabindex');
  });

  it('replaces its own text when the status changes, rather than stacking banners', () => {
    const { rerender } = render(<ResultBanner status={{ kind: 'playing', check: false }} />);
    rerender(<ResultBanner status={{ kind: 'stalemate' }} />);
    rerender(<ResultBanner status={{ kind: 'checkmate', winner: 'b' }} />);
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(banner()).toHaveTextContent('Checkmate — Black wins');
  });
});
