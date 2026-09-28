import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import PromotionPicker from './PromotionPicker';

// A promotion picker that only knows about White is a bug waiting for a
// "play as Black" exercise: the learner picks a piece and the board fills in
// the *other* side's artwork, with no error anywhere. The learner sees a white
// queen appear on their own promotion.

const srcs = (): string[] =>
  [...document.querySelectorAll<HTMLImageElement>('.promotion-piece')].map((i) => i.src);

describe('PromotionPicker', () => {
  it('draws the promoting side\'s own pieces', () => {
    render(<PromotionPicker square="e7" onSelect={() => {}} onCancel={() => {}} colour="b" />);
    expect(srcs().length).toBeGreaterThan(0);
    // The artwork is resolved from the colour, so a Black picker's srcs must
    // differ from the White ones rather than merely being labelled differently.
    for (const src of srcs()) expect(src).toContain('/pieces/b');
  });

  it('defaults to the learner\'s colour when no colour is given', () => {
    render(<PromotionPicker square="e7" onSelect={() => {}} onCancel={() => {}} />);
    for (const src of srcs()) expect(src).toContain('/pieces/w');
  });

  it('gives the two colours different artwork for the same piece', () => {
    const { unmount } = render(
      <PromotionPicker square="e7" onSelect={() => {}} onCancel={() => {}} colour="w" />,
    );
    const white = srcs();
    unmount();
    render(<PromotionPicker square="e2" onSelect={() => {}} onCancel={() => {}} colour="b" />);
    expect(srcs()).not.toEqual(white);
  });

  it('still reports the piece, not the colour, in its label', () => {
    // The label is how a screen reader names the choice. "Promote to queen" is
    // correct for both colours; "promote to black queen" is not, because the
    // artwork already carries the colour and the label is a piece name.
    render(<PromotionPicker square="e7" onSelect={() => {}} onCancel={() => {}} colour="b" />);
    expect(screen.getByRole('button', { name: 'Promote to queen' })).toBeInTheDocument();
  });

  it('still offers the same four choices for either colour', () => {
    for (const colour of ['w', 'b'] as const) {
      const { unmount } = render(
        <PromotionPicker square="e7" onSelect={() => {}} onCancel={() => {}} colour={colour} />,
      );
      expect(screen.getAllByRole('button', { name: /^Promote to/ })).toHaveLength(4);
      unmount();
    }
  });
});
