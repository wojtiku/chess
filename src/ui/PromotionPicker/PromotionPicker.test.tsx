// This panel had no test file at all, and it was the one place in the app holding a
// private copy of the piece table: four hardcoded Unicode symbols and four piece
// names, used by four buttons and nothing else. Nothing could catch a mistake in
// it, because nothing looked at it.
//
// What is asserted here is the panel's whole contract, in the four things it can
// get wrong: it offers all four promotions on equal terms, it names them in words,
// it draws White's artwork (this app gives the learner White), and it can always be
// escaped — by the cancel button and by Escape, on the window so that it works
// wherever focus has got to.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PromotionPicker from './PromotionPicker';

/** The four promotions, in the order they are offered, with the spoken name and
 *  the file expected to draw each. Written out rather than imported from
 *  `Board/pieces`: a test that reuses the lookup it is checking cannot fail. */
const OPTIONS = [
  { promotion: 'q', name: 'queen', asset: 'wQ' },
  { promotion: 'r', name: 'rook', asset: 'wR' },
  { promotion: 'b', name: 'bishop', asset: 'wB' },
  { promotion: 'n', name: 'knight', asset: 'wN' },
] as const;

function setup(over: Partial<Parameters<typeof PromotionPicker>[0]> = {}) {
  const onSelect = vi.fn();
  const onCancel = vi.fn();
  const { unmount } = render(
    <PromotionPicker
      square="a8"
      onSelect={onSelect}
      onCancel={onCancel}
      {...over}
    />,
  );
  return { onSelect, onCancel, unmount, user: userEvent.setup() };
}

describe('PromotionPicker', () => {
  it('is a named dialog, anchored to the square the piece is arriving on', () => {
    setup();
    const dialog = screen.getByRole('dialog', { name: 'Choose promotion piece' });
    expect(dialog).toHaveAttribute('data-promotion-square', 'a8');
  });

  it('follows the square it is given, so the popover moves with the promotion', () => {
    // The anchor is how a learner knows which pawn is being promoted: a queen
    // offered at h8 for a pawn that is actually on a7 is a wrong answer with no
    // way to tell.
    const { unmount } = setup({ square: 'h8' });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-promotion-square', 'h8');
    unmount();
    setup({ square: 'b8' });
    expect(screen.getByRole('dialog')).toHaveAttribute('data-promotion-square', 'b8');
  });

  it('offers all four promotions, queen first, each named in words', () => {
    setup();
    // All four, not a sample of two: underpromotion is offered on equal terms, so
    // a panel that dropped the bishop would still pass a check on queen and knight.
    for (const { name } of OPTIONS) {
      expect(screen.getByRole('button', { name: `Promote to ${name}` })).toBeInTheDocument();
    }
    // And in the order they are read, which is the order they are drawn: queen
    // first, because it is what a learner wants nine times in ten.
    const drawn = [...screen.getAllByRole('button')]
      .filter((b) => b.className !== 'promotion-cancel')
      .map((b) => b.getAttribute('aria-label'));
    expect(drawn).toEqual(OPTIONS.map((o) => `Promote to ${o.name}`));
  });

  it('draws each option with White’s own vendored artwork', () => {
    setup();
    // `wQ`, not `bQ`: the learner promotes to a piece of their own colour, and an
    // option drawn in the opponent's colour is a piece the board will not contain.
    // The `<img>` is also the only thing that distinguishes the four buttons
    // visually — they are otherwise four identical words.
    for (const { name, asset } of OPTIONS) {
      const img = screen.getByRole('button', { name: `Promote to ${name}` }).querySelector('img');
      expect(img, name).not.toBeNull();
      expect(img, name).toHaveAttribute('src', `/pieces/${asset}.svg`);
    }
  });

  it('names each option with its button, not with its image', () => {
    setup();
    // A real `alt` inside a labelled button is announced twice, and the second
    // announcement is a filename. The name is the button's `aria-label`.
    for (const { name } of OPTIONS) {
      const img = screen.getByRole('button', { name: `Promote to ${name}` }).querySelector('img');
      expect(img, name).toHaveAttribute('alt', '');
      expect(img, name).toHaveAttribute('aria-hidden', 'true');
    }
    // One image per option, and none of them an accessible node of its own.
    expect(document.querySelectorAll('img')).toHaveLength(4);
    expect(screen.queryAllByRole('img')).toHaveLength(0);
  });

  it('reports the promotion the learner chose, for each of the four', async () => {
    const { onSelect, user } = setup();
    for (const { promotion, name } of OPTIONS) {
      onSelect.mockClear();
      await user.click(screen.getByRole('button', { name: `Promote to ${name}` }));
      expect(onSelect, name).toHaveBeenCalledWith(promotion);
    }
  });

  it('puts focus on the first option, so a keyboard user is inside the popover', () => {
    setup();
    // A popover that opens with focus still on the board behind it is escapable
    // only by knowing the shortcut; this is what makes Tab reach the four options.
    expect(screen.getByRole('button', { name: 'Promote to queen' })).toHaveFocus();
  });

  it('cancels on the visible button, without choosing anything', async () => {
    const { onSelect, onCancel, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel promotion' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('cancels on Escape, and chooses nothing', async () => {
    // Listened for on the window, so the shortcut works wherever focus has got to
    // — which a listener on the popover itself would silently stop covering once
    // the learner tabbed out of it. Nothing is promoted: Escape is a way out of
    // the choice, not a way to make it.
    const { onSelect, onCancel, user } = setup();
    await user.tab();
    await user.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('stops listening for Escape once it is gone, so a later Escape is not a cancel', async () => {
    const { onCancel, unmount, user } = setup();
    unmount();
    // A leaked window listener would keep calling a stale `onCancel` for the rest
    // of the session. The board cancels a pending promotion on Escape, so the stale
    // call would reach a panel that is no longer on screen.
    await user.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});
