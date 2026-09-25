import { describe, expect, it } from 'vitest';
import { centipawnLoss, classify, type MoveLabel } from './classification';

// The brief's nine `classify` assertions are kept verbatim. They do include the
// 19/20, 49/50 and 99/100 boundaries, which is the part of the brief that is
// usually got wrong. What they do not cover: the interaction of the two special
// rules with each other, the `best` end of the centipawn ladder, and what happens
// when one of the two mate arguments is absent.

describe('centipawnLoss', () => {
  it('is positive when the evaluation got worse', () => {
    expect(centipawnLoss(50, -50)).toBe(100);
  });

  it('is negative when the evaluation improved', () => {
    expect(centipawnLoss(-50, 50)).toBe(-100);
  });

  it('is zero when nothing changed', () => {
    expect(centipawnLoss(30, 30)).toBe(0);
  });

  it('handles the side-to-move flip correctly', () => {
    // Before: +120 for the mover. After: the opponent is up 30, i.e. -30 for us.
    expect(centipawnLoss(120, -30)).toBe(150);
  });
});

describe('classify', () => {
  it('labels a small loss as good', () => {
    expect(classify({ lossCp: 10, forced: false })).toBe('good');
  });

  it('treats the 20cp boundary as an inaccuracy', () => {
    expect(classify({ lossCp: 19, forced: false })).toBe('good');
    expect(classify({ lossCp: 20, forced: false })).toBe('inaccuracy');
  });

  it('treats the 50cp boundary as a mistake', () => {
    expect(classify({ lossCp: 49, forced: false })).toBe('inaccuracy');
    expect(classify({ lossCp: 50, forced: false })).toBe('mistake');
  });

  it('treats the 100cp boundary as a blunder', () => {
    expect(classify({ lossCp: 99, forced: false })).toBe('mistake');
    expect(classify({ lossCp: 100, forced: false })).toBe('blunder');
  });

  it('never flags a forced move, however bad', () => {
    expect(classify({ lossCp: 900, forced: true })).toBe('forced');
  });

  it('labels losing a forced mate a blunder regardless of centipawns', () => {
    expect(classify({ lossCp: 0, forced: false, beforeMate: 3, afterMate: -2 }))
      .toBe('blunder');
  });

  it('does not flag finding a mate', () => {
    expect(classify({ lossCp: -500, forced: false, beforeMate: 5, afterMate: 3 }))
      .toBe('best');
  });

  it('labels escaping a lost position as good when the loss did not grow', () => {
    // Still lost, but the move is the best available: not a blunder.
    expect(classify({ lossCp: 5, forced: false, beforeMate: undefined, afterMate: -6 }))
      .toBe('good');
  });

  it('labels an unchanged position as best, not merely good', () => {
    expect(classify({ lossCp: 0, forced: false })).toBe('best');
    expect(classify({ lossCp: -1, forced: false })).toBe('best');
    expect(classify({ lossCp: 1, forced: false })).toBe('good');
  });

  // Both special rules can fire on the same move. `forced` is checked first, and
  // this pins that: a move you had no alternative to is not a mistake, even when
  // it throws away a forced mate. The alternative — reporting the blunder — is
  // exactly what the spec's "punishing a forced move" warning is about.
  it('a forced move stays forced even when it loses a mate', () => {
    expect(classify({ lossCp: 400, forced: true, beforeMate: 3, afterMate: -3 }))
      .toBe('forced');
  });

  it('a forced move stays forced even when it finds a mate', () => {
    expect(classify({ lossCp: -900, forced: true, beforeMate: 5, afterMate: 4 }))
      .toBe('forced');
  });

  // A mate distance is not a centipawn count. Keeping a forced mate alive while
  // the centipawn loss reads as catastrophic is not a blunder, and this is the
  // test that fails if the mate branch is ever moved below the ladder.
  it('does not read a mate distance as a centipawn magnitude', () => {
    expect(classify({ lossCp: 5000, forced: false, beforeMate: 3, afterMate: 1 }))
      .toBe('good');
  });

  it('labels a lost mate a blunder when the position after it has no mate score', () => {
    // The position after the move has no forced mate for either side, so the mate
    // that was there is gone. This is the same judgement as afterMate <= 0, and
    // it is the common case: after the mover's move it is the *opponent* who is
    // to move, so the engine only reports a mate distance at all when the mover
    // is the one being mated.
    expect(classify({ lossCp: 3, forced: false, beforeMate: 2, afterMate: undefined }))
      .toBe('blunder');
  });

  it('does not flag a mate that was never there', () => {
    // beforeMate absent and afterMate positive: the mate was found by this move.
    expect(classify({ lossCp: -100, forced: false, beforeMate: undefined, afterMate: 1 }))
      .toBe('best');
    expect(classify({ lossCp: 25, forced: false, afterMate: 4 })).toBe('good');
  });

  it('is decided by lossCp alone when neither side has a mate score', () => {
    const labels: MoveLabel[] = [0, 19, 20, 49, 50, 99, 100, 400].map(
      (lossCp) => classify({ lossCp, forced: false, beforeMate: undefined, afterMate: undefined }),
    );
    expect(labels).toEqual(['best', 'good', 'inaccuracy', 'inaccuracy', 'mistake', 'mistake', 'blunder', 'blunder']);
  });

  it('reaches all six labels', () => {
    const seen = new Set<MoveLabel>([
      classify({ lossCp: 0, forced: false }),
      classify({ lossCp: 10, forced: false }),
      classify({ lossCp: 20, forced: false }),
      classify({ lossCp: 50, forced: false }),
      classify({ lossCp: 100, forced: false }),
      classify({ lossCp: 100, forced: true }),
    ]);
    expect(seen).toEqual(new Set<MoveLabel>(['best', 'good', 'inaccuracy', 'mistake', 'blunder', 'forced']));
  });
});
