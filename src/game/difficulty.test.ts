import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  ANALYSIS_MOVETIME_MS, DEFAULT_OPPONENT_MOVETIME_MS, DEFAULT_SETTINGS, PRESETS,
  clampMinThink, clampSkill, presetFor, presetLabel, thinkWaitMs,
  type HintMode, type Settings,
} from './difficulty';

// The brief's ten assertions, kept verbatim so that nothing here is weaker
// than the plan's. (The brief says "PASS (11 tests)"; it contains ten `it`
// blocks, so that count is already wrong.) Everything after the first three
// `describe` blocks is
// additional: the brief pins no boundary from *inside* the valid range, never
// exercises a non-finite value other than NaN, and asserts nothing at all
// about the two search budgets or about the preset/raw-slider agreement the
// plan calls a hard requirement.

describe('presets', () => {
  it('maps the five documented levels', () => {
    expect(PRESETS.map((p) => p.skillLevel)).toEqual([1, 4, 8, 13, 20]);
  });

  it('finds the preset for an exact level', () => {
    expect(presetFor(8)?.label).toBe('Medium');
    expect(presetFor(1)?.label).toBe('Beginner');
  });

  it('returns null off-preset', () => {
    expect(presetFor(7)).toBeNull();
  });

  it('labels an off-preset level Custom', () => {
    expect(presetLabel(8)).toBe('Medium');
    expect(presetLabel(7)).toBe('Custom (7)');
  });

  it('defaults to Medium', () => {
    expect(DEFAULT_SETTINGS.skillLevel).toBe(8);
    expect(presetLabel(DEFAULT_SETTINGS.skillLevel)).toBe('Medium');
  });
});

describe('clamping', () => {
  it('clamps skill level into 0-20', () => {
    expect(clampSkill(-5)).toBe(0);
    expect(clampSkill(99)).toBe(20);
    expect(clampSkill(7.4)).toBe(7);
    expect(clampSkill(Number.NaN)).toBe(8);
  });

  it('clamps think time into 0-3000 and rounds to 100ms', () => {
    expect(clampMinThink(-1)).toBe(0);
    expect(clampMinThink(9999)).toBe(3000);
    expect(clampMinThink(1234)).toBe(1200);
    expect(clampMinThink(Number.NaN)).toBe(500);
  });
});

describe('thinkWaitMs', () => {
  it('waits the full minimum when the engine was fast', () => {
    expect(thinkWaitMs(20, 500)).toBe(500);
  });

  it('does not add delay when the engine was already slow', () => {
    expect(thinkWaitMs(1800, 500)).toBe(1800);
  });

  it('is zero when the minimum is zero and the engine was fast', () => {
    expect(thinkWaitMs(20, 0)).toBe(20);
  });
});

// --- added coverage -------------------------------------------------------

describe('the default settings object', () => {
  // The plan fixes all five values. `loadSettings` returning `DEFAULT_SETTINGS`
  // would agree with whatever this object said, so the brief's "returns
  // defaults" test pins nothing about the defaults themselves.
  it('is exactly the documented object', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      skillLevel: 8,
      minThinkTimeMs: 500,
      orientation: 'w',
      hintMode: 'best',
    });
  });

  it('cannot be edited by a caller, so no default can be poisoned', () => {
    // Every "fall back to the default" path in the project reads this object:
    // `clampSkill(NaN)`, `clampMinThink(NaN)`, and `settingsFrom`'s five
    // per-field fallbacks. One stray write would change all of them for the
    // rest of the session, so the freeze is the invariant. `Object.isFrozen`
    // alone would be satisfied by a freeze of some *other* object, hence the
    // attempt as well.
    expect(Object.isFrozen(DEFAULT_SETTINGS)).toBe(true);
    let threw = false;
    try {
      // Typechecks: the annotation is the plan's `Settings`, so the guard is
      // the runtime one. This is the deliberate trade — a published mutable type
      // over a published frozen value.
      DEFAULT_SETTINGS.skillLevel = 1;
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    // The value is intact, so a failed write cannot leave a partial edit either.
    expect(DEFAULT_SETTINGS.skillLevel).toBe(8);
    expect(presetLabel(DEFAULT_SETTINGS.skillLevel)).toBe('Medium');
  });

  it('is well-formed as a Settings: hintMode is its own union', () => {
    // Enforced by `tsc -b`, not by this run: a widened `Settings` would still
    // satisfy every runtime assertion in the file.
    //
    // This used to assert `ThemeName` as well. There is no theme, so there is
    // nothing to assert — and a type with one member left would have been a type
    // asserting that there is exactly one value, which is a statement about a
    // removed feature rather than about the shape of this object.
    expectTypeOf(DEFAULT_SETTINGS.hintMode).toEqualTypeOf<HintMode>();
    expectTypeOf<Settings['orientation']>().toEqualTypeOf<'w' | 'b'>();
  });
});

describe('the preset table', () => {
  it('has the documented ids and labels in ascending order', () => {
    // These strings are the buttons Task 9 renders and the text Task 11's E2E
    // specs will match on, so a rename is a user-visible change.
    expect(PRESETS.map((p) => [p.id, p.label])).toEqual([
      ['beginner', 'Beginner'],
      ['easy', 'Easy'],
      ['medium', 'Medium'],
      ['hard', 'Hard'],
      ['expert', 'Expert'],
    ]);
  });

  it('hands out the entries of the table itself, not copies', () => {
    // `presetFor` is a lookup, so a caller may compare by reference; a
    // `{...p}` spread anywhere in the module would silently break that.
    const medium = PRESETS.find((p) => p.id === 'medium');
    expect(medium).toBeDefined();
    expect(presetFor(8)).toBe(medium);
  });

  it('has exactly the published element type, and no more', () => {
    // Enforced by `tsc -b`, not by this run: the plan publishes
    // `typeof PRESETS[number]` as `{id, label, skillLevel}`, and an extra
    // optional field would be invisible to every runtime assertion here. A
    // named `Preset` interface with a field nothing reads is the same defect in
    // a different shape.
    expectTypeOf<typeof PRESETS[number]>().toEqualTypeOf<{
      id: string;
      label: string;
      skillLevel: number;
    }>();
  });

  it('keeps every level inside the documented 0-20 range', () => {
    for (const p of PRESETS) {
      expect(p.skillLevel).toBeGreaterThanOrEqual(0);
      expect(p.skillLevel).toBeLessThanOrEqual(20);
      // And clamping a preset level is a no-op, so the table and the slider
      // range cannot drift apart.
      expect(clampSkill(p.skillLevel)).toBe(p.skillLevel);
    }
  });
});

describe('clampSkill boundaries the brief left open', () => {
  it('leaves the ends of the range alone', () => {
    expect(clampSkill(0)).toBe(0);
    expect(clampSkill(20)).toBe(20);
  });

  it('truncates toward zero on both sides of the range', () => {
    // floor(-0.5) is -1, so the low clamp has to come after the truncation.
    expect(clampSkill(-0.5)).toBe(0);
    expect(clampSkill(0.9)).toBe(0);
    expect(clampSkill(20.9)).toBe(20);
  });

  it('resets every non-finite value to the default rather than clamping it', () => {
    // Not a clamp: +/-Infinity is not a number a user can dial in, and both
    // directions are "unrecognisable", so they get the default. Pinned so the
    // difference from -Infinity -> 0 and +Infinity -> 20 is deliberate.
    expect(clampSkill(Number.POSITIVE_INFINITY)).toBe(8);
    expect(clampSkill(Number.NEGATIVE_INFINITY)).toBe(8);
  });
});

describe('clampMinThink boundaries the brief left open', () => {
  it('leaves the ends of the range alone', () => {
    expect(clampMinThink(0)).toBe(0);
    expect(clampMinThink(3000)).toBe(3000);
  });

  it('rounds to the nearest 100ms step, halves upward', () => {
    expect(clampMinThink(49)).toBe(0);
    expect(clampMinThink(50)).toBe(100);
    expect(clampMinThink(149)).toBe(100);
    expect(clampMinThink(150)).toBe(200);
  });

  it('clamps after rounding, so 2999 is the maximum and not 3000 rounded to 3000 by luck', () => {
    expect(clampMinThink(2999)).toBe(3000);
    expect(clampMinThink(3001)).toBe(3000);
    expect(clampMinThink(1e9)).toBe(3000);
  });

  it('resets every non-finite value to the default', () => {
    expect(clampMinThink(Number.POSITIVE_INFINITY)).toBe(500);
    expect(clampMinThink(Number.NEGATIVE_INFINITY)).toBe(500);
  });

  it('lands on a 100ms multiple for every value a slider can produce', () => {
    // The property behind the documented step, not a sample of it.
    for (let n = -250; n <= 3250; n += 13) {
      const clamped = clampMinThink(n);
      expect(clamped % 100).toBe(0);
      expect(clamped).toBeGreaterThanOrEqual(0);
      expect(clamped).toBeLessThanOrEqual(3000);
    }
  });
});

describe('presetLabel and presetFor describe the EFFECTIVE level', () => {
  // The plan requires the preset row and the raw slider to be "two views of
  // one setting" that "must never disagree". The only way to guarantee that is
  // for both functions to read the clamped value, so out-of-range and NaN
  // inputs resolve the same way the slider would show them.
  it('reads a non-finite or out-of-range level as its clamped value', () => {
    expect(presetFor(Number.NaN)?.label).toBe('Medium');
    expect(presetLabel(Number.NaN)).toBe('Medium');
    expect(presetFor(99)?.label).toBe('Expert');
    expect(presetLabel(99)).toBe('Expert');
    expect(presetFor(-5)).toBeNull();
    expect(presetLabel(-5)).toBe('Custom (0)');
  });

  it('rounds a fractional level to the same value the slider would hold', () => {
    expect(presetLabel(7.4)).toBe('Custom (7)');
    expect(presetLabel(7.9)).toBe('Custom (7)');
    expect(presetFor(7.4)).toBeNull();
  });

  it('never lets the two views disagree, at any level', () => {
    for (let level = -3; level <= 23; level++) {
      const preset = presetFor(level);
      const effective = clampSkill(level);
      expect(presetLabel(level)).toBe(preset ? preset.label : `Custom (${effective})`);
      expect(preset?.skillLevel ?? effective).toBe(effective);
    }
  });
});

describe('thinkWaitMs', () => {
  it('is the wait, not the delay: the engine time is never subtracted', () => {
    // A mistaken implementation returns `minThinkTimeMs - engineElapsedMs`,
    // which is negative for every fast search and would make the engine reply
    // instantly. The three brief tests above cannot catch that, because
    // `Math.max(20, 500)` and `500 - 20` are only distinguished by 500 - 20
    // being wrong; this pins the sign of the result.
    expect(thinkWaitMs(20, 500)).toBe(500);
    expect(thinkWaitMs(0, 500)).toBe(500);
    expect(thinkWaitMs(20, 20)).toBe(20);
  });

  it('is the minimum exactly when engine and minimum are equal', () => {
    expect(thinkWaitMs(500, 500)).toBe(500);
    expect(thinkWaitMs(3000, 3000)).toBe(3000);
  });

  it('survives a clock that ran backwards', () => {
    // `performance.now()` differences are never negative in practice, but a
    // negative argument must not produce a negative wait.
    expect(thinkWaitMs(-100, 500)).toBe(500);
    expect(thinkWaitMs(-100, 0)).toBe(0);
  });

  it('does not clamp a minimum the caller failed to clamp', () => {
    // Documented contract, not an endorsement: `thinkWaitMs` is exactly
    // `max(engineElapsedMs, minThinkTimeMs)`. Keeping the value already
    // clamped is `loadSettings`' job, and asserting it here stops a future
    // silent clamp from quietly changing what a caller passes through.
    expect(thinkWaitMs(20, 99999)).toBe(99999);
  });
});

describe('search budgets', () => {
  // `go movetime 1500` for the opponent and `go movetime 3000` for hints and
  // analysis, and the plan calls them hard caps. Nothing in the brief's test
  // file mentions them, yet Task 7 and Task 10 both read them.
  it('are the documented hard caps', () => {
    expect(DEFAULT_OPPONENT_MOVETIME_MS).toBe(1500);
    expect(ANALYSIS_MOVETIME_MS).toBe(3000);
  });

  it('are positive integers, so a caller can pass them to `go movetime`', () => {
    for (const budget of [DEFAULT_OPPONENT_MOVETIME_MS, ANALYSIS_MOVETIME_MS]) {
      expect(Number.isInteger(budget)).toBe(true);
      expect(budget).toBeGreaterThan(0);
    }
    // Analysis is given more time than the opponent: it is opt-in and pays
    // for a multiPV of 5, and a hint that arrives before the opponent's own
    // reply would be read from a position the board is about to leave.
    expect(ANALYSIS_MOVETIME_MS).toBeGreaterThan(DEFAULT_OPPONENT_MOVETIME_MS);
  });
});
