// The eval bar's one hard job is the sign of the score. Stockfish reports
// `score cp` / `score mate` for the SIDE TO MOVE in the position it searched, so
// `+200` means "Black is winning by 2" whenever Black is to move. Everything below
// that is formatting is written to make the wrong sign impossible to ship: the
// prop names name the perspective, `sideToMove` is required, and the perspective
// pair is asserted directly rather than only through the resulting share.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen } from '@testing-library/react';
import EvalBar, { formatEvalLabel, toWhiteRelative, whiteShare } from './EvalBar';

const bar = () => screen.getByTestId('eval-bar');
const share = () => Number(bar().getAttribute('data-white-share'));
const fill = (side: 'white' | 'black') =>
  Number(bar().querySelector(`[data-fill="${side}"]`)?.getAttribute('data-height'));

describe('the score conversion', () => {
  // The bug this component exists to prevent, stated as a unit test rather than
  // left to a comment: the same number, two sides to move, opposite answers.
  it('is the identity when White is to move', () => {
    expect(toWhiteRelative({ sideToMoveCp: 200 }, 'w')).toEqual({ whiteCp: 200 });
  });

  it('negates the centipawns when Black is to move', () => {
    expect(toWhiteRelative({ sideToMoveCp: 200 }, 'b')).toEqual({ whiteCp: -200 });
    expect(toWhiteRelative({ sideToMoveCp: -200 }, 'b')).toEqual({ whiteCp: 200 });
  });

  it('negates the mate distance when Black is to move', () => {
    // `mate 2` for Black is "Black mates in 2", which is *negative* for White.
    expect(toWhiteRelative({ sideToMoveMate: 2 }, 'b')).toEqual({ whiteMate: -2 });
    // And `mate -3` for Black is Black being mated in 3: White mates in 3.
    expect(toWhiteRelative({ sideToMoveMate: -3 }, 'b')).toEqual({ whiteMate: 3 });
  });

  it('keeps a missing score missing rather than turning it into zero', () => {
    expect(toWhiteRelative({}, 'w')).toEqual({});
    expect(toWhiteRelative({ sideToMoveCp: undefined }, 'b')).toEqual({});
  });

  it('prefers the mate score when the engine sent both, as the engine layer does', () => {
    expect(toWhiteRelative({ sideToMoveCp: 300, sideToMoveMate: 1 }, 'w'))
      .toEqual({ whiteMate: 1 });
  });
});

describe('whiteShare', () => {
  it('is 50 for no score at all', () => {
    expect(whiteShare({})).toBe(50);
  });

  it('moves a pawn a quarter of the track per 5 centipawns', () => {
    // The scale is a design choice, so it is pinned exactly: 1000cp, a completely
    // winning position, reaches 95 and not 100, because a full bar is reserved for
    // a mate that has actually been found.
    expect(whiteShare({ whiteCp: 0 })).toBe(50);
    expect(whiteShare({ whiteCp: 200 })).toBe(59);
    expect(whiteShare({ whiteCp: -200 })).toBe(41);
    expect(whiteShare({ whiteCp: 1000 })).toBe(95);
    expect(whiteShare({ whiteCp: -1000 })).toBe(5);
  });

  it('clamps a score past the scale instead of leaving the track', () => {
    expect(whiteShare({ whiteCp: 9000 })).toBe(95);
    expect(whiteShare({ whiteCp: -9000 })).toBe(5);
  });

  it('treats a non-finite score as no score, not as a huge one', () => {
    // `Math.min(1000, NaN)` is NaN, so an unguarded clamp would put `data-white-share
    // ="NaN"` on screen. Infinity would otherwise read as a winning position.
    expect(whiteShare({ whiteCp: NaN })).toBe(50);
    expect(whiteShare({ whiteCp: Infinity })).toBe(50);
    expect(whiteShare({ whiteCp: -Infinity })).toBe(50);
    expect(whiteShare({ whiteMate: NaN })).toBe(50);
  });

  it('fills the bar for a mate for White and empties it for a mate against', () => {
    expect(whiteShare({ whiteMate: 2 })).toBe(100);
    expect(whiteShare({ whiteMate: -2 })).toBe(0);
  });

  it('leaves the bar even for the degenerate mate 0, which says nothing about who', () => {
    // Stockfish reports `mate 0` at a position that is already mate, and the sign
    // of a zero is not a direction. Claiming a fill either way would be a guess.
    expect(whiteShare({ whiteMate: 0 })).toBe(50);
    expect(whiteShare({ whiteMate: -0 })).toBe(50);
  });
});

describe('formatEvalLabel', () => {
  it('renders a pawn fraction with a sign', () => {
    expect(formatEvalLabel({ whiteCp: 140 })).toBe('+1.4');
    expect(formatEvalLabel({ whiteCp: -80 })).toBe('-0.8');
    expect(formatEvalLabel({ whiteCp: 900 })).toBe('+9.0');
  });

  it('renders an even score without a sign', () => {
    expect(formatEvalLabel({ whiteCp: 0 })).toBe('0.0');
    expect(formatEvalLabel({ whiteCp: -0 })).toBe('0.0');
  });

  it('never renders a negative zero', () => {
    // `(-0.04).toFixed(1)` is "-0.0" in JavaScript, which reads as a broken number.
    expect(formatEvalLabel({ whiteCp: -4 })).toBe('0.0');
    expect(formatEvalLabel({ whiteCp: 4 })).toBe('0.0');
    expect(formatEvalLabel({ whiteCp: -1 })).toBe('0.0');
    // A score that survives the tenth still keeps its sign: -50cp is -0.5 pawns.
    expect(formatEvalLabel({ whiteCp: -50 })).toBe('-0.5');
    expect(formatEvalLabel({ whiteCp: -150 })).toBe('-1.5');
  });

  it('renders a mate as a count of moves, never as a number derived from it', () => {
    // `mate 4` is FOUR MOVES. Dividing it by 100 or adding it to a centipawn score
    // is how a mate turns into "0.04" or NaN; here it is a sign and a count.
    expect(formatEvalLabel({ whiteMate: 4 })).toBe('M4');
    expect(formatEvalLabel({ whiteMate: -3 })).toBe('-M3');
    expect(formatEvalLabel({ whiteMate: 1 })).toBe('M1');
  });

  it('renders mate 0 as a mate, not as a mate against', () => {
    // The brief's sign test is `> 0 ? 'M' : '-M'`, so zero falls into the negative
    // arm and prints "-M0" — "mated in 0 moves", which is not what a zero means.
    expect(formatEvalLabel({ whiteMate: 0 })).toBe('M0');
    expect(formatEvalLabel({ whiteMate: -0 })).toBe('M0');
  });

  it('renders a dash when there is no score yet', () => {
    expect(formatEvalLabel({})).toBe('—');
    expect(formatEvalLabel({ whiteCp: NaN })).toBe('—');
    expect(formatEvalLabel({ whiteCp: undefined })).toBe('—');
  });

  it('prefers the mate label when both scores are present', () => {
    expect(formatEvalLabel({ whiteCp: 250, whiteMate: -2 })).toBe('-M2');
  });
});

describe('EvalBar', () => {
  it('renders an even bar at 0', () => {
    render(<EvalBar sideToMoveCp={0} sideToMove="w" orientation="w" />);
    expect(bar()).toHaveAttribute('data-white-share', '50');
  });

  it('gives White more when the score is positive', () => {
    render(<EvalBar sideToMoveCp={200} sideToMove="w" orientation="w" />);
    expect(share()).toBeGreaterThan(50);
    expect(share()).toBe(59);
  });

  it('clamps the bar so it never leaves the track', () => {
    render(<EvalBar sideToMoveCp={9000} sideToMove="w" orientation="w" />);
    expect(share()).toBeLessThanOrEqual(100);
    expect(share()).toBe(95);
  });

  it('renders a pawn-fraction label', () => {
    render(<EvalBar sideToMoveCp={140} sideToMove="w" orientation="w" />);
    expect(screen.getByText('+1.4')).toBeInTheDocument();
  });

  it('renders a negative label', () => {
    render(<EvalBar sideToMoveCp={-80} sideToMove="w" orientation="w" />);
    expect(screen.getByText('-0.8')).toBeInTheDocument();
  });

  // Review Focus: a mate score must not become NaN.
  it('renders a mate label, not NaN', () => {
    render(<EvalBar sideToMoveMate={4} sideToMove="w" orientation="w" />);
    expect(screen.getByText('M4')).toBeInTheDocument();
    expect(screen.queryByText(/NaN/)).not.toBeInTheDocument();
    expect(bar().textContent).not.toMatch(/NaN|Infinity|undefined/);
    expect(bar().getAttribute('data-white-share')).not.toMatch(/NaN/);
  });

  it('renders a negative mate label', () => {
    render(<EvalBar sideToMoveMate={-3} sideToMove="w" orientation="w" />);
    expect(screen.getByText('-M3')).toBeInTheDocument();
  });

  it('shows a neutral label when there is no score yet', () => {
    render(<EvalBar sideToMove="w" orientation="w" />);
    expect(screen.getByText('—')).toBeInTheDocument();
    expect(share()).toBe(50);
  });

  it('goes fully White on a mate for White', () => {
    render(<EvalBar sideToMoveMate={2} sideToMove="w" orientation="w" />);
    expect(bar()).toHaveAttribute('data-white-share', '100');
  });

  it('goes fully Black on a mate for Black', () => {
    render(<EvalBar sideToMoveMate={-2} sideToMove="w" orientation="w" />);
    expect(bar()).toHaveAttribute('data-white-share', '0');
  });

  describe('perspective', () => {
    it('reads +200 as White ahead when White is to move', () => {
      render(<EvalBar sideToMoveCp={200} sideToMove="w" orientation="w" />);
      expect(share()).toBe(59);
      expect(screen.getByText('+2.0')).toBeInTheDocument();
    });

    it('reads the very same +200 as Black ahead when Black is to move', () => {
      render(<EvalBar sideToMoveCp={200} sideToMove="b" orientation="w" />);
      expect(share()).toBe(41);
      expect(screen.getByText('-2.0')).toBeInTheDocument();
    });

    it('gives two views of one engine score that add up to the whole track', () => {
      // A single wrong-side case would still pass the two tests above if both were
      // merely plausible; they only add up to 100 together.
      for (const cp of [37, 200, -145, 640, -900]) {
        const white = whiteShare(toWhiteRelative({ sideToMoveCp: cp }, 'w'));
        const black = whiteShare(toWhiteRelative({ sideToMoveCp: cp }, 'b'));
        expect(white + black, `cp ${cp}`).toBeCloseTo(100, 10);
      }
    });

    it('treats a mate for the side to move as a mate for that side', () => {
      render(<EvalBar sideToMoveMate={2} sideToMove="b" orientation="w" />);
      expect(share()).toBe(0);
      expect(screen.getByText('-M2')).toBeInTheDocument();
    });
  });

  describe('the track', () => {
    it('fills from the bottom when White is at the bottom', () => {
      render(<EvalBar sideToMoveCp={200} sideToMove="w" orientation="w" />);
      expect(fill('white')).toBe(59);
      expect(fill('black')).toBe(41);
    });

    it('fills from the top when the board is flipped, and the share still means White', () => {
      render(<EvalBar sideToMoveCp={200} sideToMove="w" orientation="b" />);
      expect(fill('white')).toBe(41);
      expect(fill('black')).toBe(59);
      // The orientation moves the pixels, never the meaning: this attribute is
      // White's share in both orientations, which is what makes it assertable.
      expect(share()).toBe(59);
    });

    it('always divides the track into exactly two fills', () => {
      for (const cp of [0, 200, -200, 9000]) {
        const { unmount } = render(<EvalBar sideToMoveCp={cp} sideToMove="w" orientation="w" />);
        expect(fill('white') + fill('black'), `cp ${cp}`).toBe(100);
        unmount();
      }
    });
  });
});

// The bar easing between values is the other half of the "does not jitter"
// requirement, and half of it is CSS — which jsdom does not render, so nothing
// above can observe it. These are TEXT assertions over the stylesheet, not
// behavioural ones: they cannot tell you the bar animates, only that the rule
// that animates it is still in the file. That is worth having anyway, because this
// is the only `transition` in the project's CSS, so deleting it would break the
// requirement silently and leave every behavioural test green.
describe('EvalBar.css (a TEXT assertion — it reads the file, it does not render it)', () => {
  const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'EvalBar.css'), 'utf8');

  /** The declarations of the first rule whose selector list mentions `selector`. */
  const ruleFor = (selector: string): string => {
    const found = new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`).exec(css);
    if (found === null || found[1] === undefined) {
      throw new Error(`no rule for .${selector} in EvalBar.css`);
    }
    return found[1];
  };

  it('transitions the height of both fills, with a duration, and nothing else', () => {
    // Both fills, because one easing while the other snaps is exactly the jitter the
    // requirement rules out. A duration, because `transition: height` with no time
    // is invalid CSS and animates nothing. And `height` specifically: the component
    // sets `height` inline and changes nothing else, so a transition on `width` or
    // `background` would leave the bar snapping exactly as before. The duration is
    // NOT pinned to a value, so a retune is not a test failure.
    for (const selector of ['evalbar-black', 'evalbar-white']) {
      const declared = [...ruleFor(selector).matchAll(/transition:\s*([^;]+)/g)].map(
        (m) => (m[1] ?? '').trim(),
      );
      expect(declared.length, `${selector} has a transition`).toBeGreaterThan(0);
      for (const value of declared) {
        expect(value, `${selector} animates the height`).toMatch(/^height\s+[\d.]+m?s\b/);
      }
    }
  });

  it('neutralises the transition when the reader has asked for less motion', () => {
    const query = '@media (prefers-reduced-motion: reduce)';
    expect(css).toContain(query);
    const block = css.slice(css.indexOf(query));
    expect(block).toMatch(/\.evalbar-black[^{]*\{[^}]*transition:\s*none/);
    expect(block).toMatch(/\.evalbar-white[^{]*\{[^}]*transition:\s*none/);
  });
});
