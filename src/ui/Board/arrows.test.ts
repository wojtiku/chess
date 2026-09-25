import { describe, expect, it } from 'vitest';
import { arrowEnds, squareCentre } from './arrows';

describe('squareCentre', () => {
  it('places a8 at the top left of a White board', () => {
    expect(squareCentre('a8', 'w')).toEqual({ x: 6.25, y: 6.25 });
  });

  it('places h1 at the bottom right of a White board', () => {
    expect(squareCentre('h1', 'w')).toEqual({ x: 93.75, y: 93.75 });
  });

  it('centres e4 on a White board', () => {
    expect(squareCentre('e4', 'w')).toEqual({ x: 56.25, y: 56.25 });
  });

  it('mirrors the coordinates for a Black board', () => {
    // h1 is top left when the board is flipped, so a8 lands where h1 was.
    expect(squareCentre('a8', 'b')).toEqual(squareCentre('h1', 'w'));
    expect(squareCentre('e4', 'b')).toEqual({ x: 43.75, y: 43.75 });
  });

  it('defaults to a White board', () => {
    expect(squareCentre('e4')).toEqual(squareCentre('e4', 'w'));
  });
});

describe('arrowEnds', () => {
  it('points from the origin towards the destination', () => {
    const arrow = arrowEnds('e2', 'e4', 'w');
    expect(arrow?.x1).toBe(56.25);
    expect(arrow?.y1).toBe(81.25);
    // The tip stops short of the target's centre so the head sits on the square.
    expect(arrow?.y2).toBeCloseTo(60.25);
  });

  it('stops short of the target centre along the line, not only vertically', () => {
    // a1 (6.25, 93.75) to h8 (93.75, 6.25): a diagonal, so the tip is pulled
    // back along the line, not just up the y axis.
    const arrow = arrowEnds('a1', 'h8', 'w');
    expect(arrow?.x2).toBeCloseTo(90.92);
    expect(arrow?.y2).toBeCloseTo(9.08);
  });

  it('reverses with the board', () => {
    const white = arrowEnds('e2', 'e4', 'w');
    const black = arrowEnds('e2', 'e4', 'b');
    expect(white).not.toBeNull();
    expect(black).not.toBeNull();
    // On a White board e4 is above e2; on a Black board it is below.
    if (white && black) {
      expect(white.y2).toBeLessThan(white.y1);
      expect(black.y2).toBeGreaterThan(black.y1);
    }
  });

  it('yields a zero-length arrow rather than NaN for a square onto itself', () => {
    const arrow = arrowEnds('d4', 'd4', 'w');
    expect(arrow).toEqual({ x1: 43.75, y1: 56.25, x2: 43.75, y2: 56.25 });
  });

  it('returns null when either end is not a square', () => {
    expect(arrowEnds('zz', 'e4', 'w')).toBeNull();
    expect(arrowEnds('e2', 'e9', 'w')).toBeNull();
    expect(arrowEnds('', '', 'w')).toBeNull();
  });
});
