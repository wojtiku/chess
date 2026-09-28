import { describe, expect, it } from 'vitest';
import { arrowEnds, squareCentre, type BoardArrow } from './arrows';

const arrow = (over: Partial<BoardArrow> = {}): BoardArrow => ({ from: 'e2', to: 'e4', ...over });

describe('BoardArrow', () => {
  it('carries a role, or it does not', () => {
    // The inventory found one arrow style for every meaning, so a "this is where
    // your piece went" arrow and a "this is where it could go" arrow were
    // identical. Three roles exist because a consequence shows all three at once.
    expect(arrow({ role: 'played' }).role).toBe('played');
    expect(arrow({ role: 'reply' }).role).toBe('reply');
    expect(arrow({ role: 'better' }).role).toBe('better');
  });

  it('leaves the role optional, so an existing caller needs no change', () => {
    // The board reads `arrow.role ?? 'hint'`. The field is absent rather than
    // defaulted to 'hint' in the interface, so `arrows={[{from, to}]}` — which is
    // what the app passes today — stays valid without a cast.
    expect(arrow().role).toBeUndefined();
  });

  it('gives the played move the quietest styling and the reveal the loudest', () => {
    // Weight encodes which arrow is the point. The learner's own move is context;
    // the better move is the answer, and it should be the thing the eye lands on.
    const played = arrowStyle('played');
    const reply = arrowStyle('reply');
    const better = arrowStyle('better');
    const hint = arrowStyle('hint');
    expect(played.width).toBeLessThan(reply.width);
    expect(reply.width).toBeLessThan(better.width);
    // The reply is the consequence and must read as solid; the played move is
    // something that already happened, so it is dashed.
    expect(played.dash).toBeTruthy();
    expect(reply.dash).toBeUndefined();
    expect(better.opacity).toBe(1);
    expect(played.opacity).toBeLessThan(1);
    expect(hint.opacity).toBeGreaterThan(0);
  });
});

describe('arrowEnds', () => {
  it('mirrors on a flipped board', () => {
    // Measured rather than assumed: a flipped board reflects BOTH axes, so e2 to
    // e4 (same file) has its x moved too. Asserting a rank-only flip here would
    // have been a plausible-sounding test that the real geometry fails.
    const white = arrowEnds('e2', 'e4', 'w')!;
    const black = arrowEnds('e2', 'e4', 'b')!;
    expect(black.x1).toBeCloseTo(100 - white.x1, 5);
    expect(black.y1).toBeCloseTo(100 - white.y1, 5);
    expect(black.x2).toBeCloseTo(100 - white.x2, 5);
    expect(black.y2).toBeCloseTo(100 - white.y2, 5);
  });

  it('refuses a malformed arrow rather than drawing NaN', () => {
    expect(arrowEnds('e9', 'e4', 'w')).toBeNull();
    expect(arrowEnds('e2', '', 'w')).toBeNull();
  });
});

describe('squareCentre', () => {
  it('places a1 at the origin in 0..100 space', () => {
    const a1 = squareCentre('a1', 'w');
    expect(a1.x).toBeCloseTo(6.25, 5);
    expect(a1.y).toBeCloseTo(93.75, 5);
  });
});

// --- the style table the board reads, with the test above pinning its ordering
import { arrowStyle } from './arrows';
