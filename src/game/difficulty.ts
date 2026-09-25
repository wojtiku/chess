// The pure settings/difficulty policy. No engine, no DOM, no storage: this
// module is the single place that decides what a difficulty *means*, so the
// settings panel, the engine handshake and `localStorage` cannot disagree.
//
// The plan's hard requirement is that the preset row and the raw 0-20 slider
// are "two views of one setting" that "must never disagree". That is only
// achievable if both views read the *clamped* value, so `presetFor` and
// `presetLabel` normalise their argument before they look at the table — see
// the note on those two functions.

import type { HintMode, ThemeName } from './difficulty-types';

export type { HintMode, ThemeName } from './difficulty-types';

export interface Settings {
  /** UCI `Skill Level`, 0-20. Always an integer: `clampSkill` truncates. */
  skillLevel: number;
  /** Floor on the opponent's reply time, 0-3000, always a multiple of 100. */
  minThinkTimeMs: number;
  orientation: 'w' | 'b';
  theme: ThemeName;
  hintMode: HintMode;
}

// The range the raw slider exposes. Named so the clamps, the doc comments and
// the panel's `min`/`max` attributes cannot drift apart; deliberately not
// exported, because the plan's public surface for this module is fixed and no
// task reads them.
const SKILL_MIN = 0;
const SKILL_MAX = 20;
const THINK_MIN_MS = 0;
const THINK_MAX_MS = 3000;
const THINK_STEP_MS = 100;

/** The five documented levels. Ascending, so the panel can render them in order.
 *
 *  The element type is written out inline rather than as a named `Preset`
 *  interface: `typeof PRESETS[number]` is the shape the plan publishes, and an
 *  exported interface is an extra name for a later task to depend on. */
export const PRESETS: ReadonlyArray<{ id: string; label: string; skillLevel: number }> = [
  { id: 'beginner', label: 'Beginner', skillLevel: 1 },
  { id: 'easy', label: 'Easy', skillLevel: 4 },
  { id: 'medium', label: 'Medium', skillLevel: 8 },
  { id: 'hard', label: 'Hard', skillLevel: 13 },
  { id: 'expert', label: 'Expert', skillLevel: 20 },
];

/** The settings a first-time visitor gets.
 *
 *  Frozen, because every "fall back to the default" path in this project reads
 *  this object: `clampSkill(NaN)`, `clampMinThink(NaN)`, and the five
 *  per-field fallbacks in `settingsFrom`. An exported mutable object is a
 *  global any caller can edit, and after one edit all of those paths return the
 *  edited value for the rest of the session — which is also what would make the
 *  `orientation` fallback in `settingsFrom` differ from the brief's hardcoded
 *  `'w'`, so the freeze is what makes that equivalence unconditional rather
 *  than conditional on nothing having written to this.
 *
 *  The annotation stays `Settings` because that is the shape the plan
 *  publishes, so a write still typechecks — and now throws a `TypeError` rather
 *  than silently succeeding, which is the point. */
export const DEFAULT_SETTINGS: Settings = Object.freeze({
  skillLevel: 8,
  minThinkTimeMs: 500,
  orientation: 'w',
  theme: 'light',
  hintMode: 'best',
});

/** `go movetime` for the opponent's reply. A hard cap, per the plan. */
export const DEFAULT_OPPONENT_MOVETIME_MS = 1500;
/** `go movetime` for hints and the eval bar. A hard cap, per the plan. */
export const ANALYSIS_MOVETIME_MS = 3000;

/** A usable `Skill Level` from anything at all.
 *
 * A non-finite value (NaN, either Infinity) is *reset* to the default rather
 * than clamped: it cannot have come from the slider, and "-Infinity means 0"
 * would be a claim about a value nobody can dial in. Out-of-range finite values
 * are clamped at the ends, and a fractional one is truncated rather than
 * rounded, so the stored setting is always an integer the slider can hold
 * (`<input type="range" step={1}>` would otherwise refuse the value). */
export function clampSkill(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.skillLevel;
  return Math.min(SKILL_MAX, Math.max(SKILL_MIN, Math.floor(n)));
}

/** A usable minimum think time from anything at all.
 *
 * Rounds to the nearest 100ms step, halves upward, so the value is always one
 * the panel's `step={100}` slider can display, and then clamps into
 * 0-3000ms. Rounding before clamping is what makes 2999ms become the maximum
 * rather than a value the slider cannot show. Non-finite resets to the
 * default, for the same reason as in `clampSkill`. */
export function clampMinThink(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_SETTINGS.minThinkTimeMs;
  const stepped = Math.round(n / THINK_STEP_MS) * THINK_STEP_MS;
  return Math.min(THINK_MAX_MS, Math.max(THINK_MIN_MS, stepped));
}

/** The preset whose level *is* `level`. Exact, so the result is table-stable. */
function presetAt(level: number): typeof PRESETS[number] | null {
  return PRESETS.find((p) => p.skillLevel === level) ?? null;
}

/** The preset a level resolves to, or null when it is off-preset.
 *
 * The argument is clamped first, which is the whole point: the panel asks
 * "is any preset selected?" about the *setting*, and the setting is only ever
 * a clamped integer. Asking about the raw argument instead would make the
 * panel and the label disagree for exactly the inputs that came from
 * corrupt storage — `presetFor(NaN)` null against `presetLabel(NaN)`
 * "Medium" is a bug waiting for a NaN. */
export function presetFor(skillLevel: number): typeof PRESETS[number] | null {
  return presetAt(clampSkill(skillLevel));
}

/** What the panel shows for a level: the preset's name, or `Custom (n)`.
 *
 * `Custom` is the honest answer for a level that is not a preset, so the raw
 * slider and the preset row are visibly two views of the same number rather
 * than two independent controls. The number in the label is the clamped one,
 * for the reason given on `presetFor`. */
export function presetLabel(skillLevel: number): string {
  const level = clampSkill(skillLevel);
  return presetAt(level)?.label ?? `Custom (${level})`;
}

/** How long to wait before playing the engine's reply: `max(engine, minimum)`.
 *
 * The opponent's move is held back so a Beginner does not watch a 40ms reply
 * arrive before the board has finished drawing, but an already-slow search is
 * never *extended* — that would make every hard game feel padded.
 *
 * Deliberately not clamped: the minimum arrives from `loadSettings`, which
 * already clamped it, and a second clamp here would only hide a caller that
 * skipped that step. The formula is the plan's, verbatim. */
export function thinkWaitMs(engineElapsedMs: number, minThinkTimeMs: number): number {
  return Math.max(engineElapsedMs, minThinkTimeMs);
}
