import { useId, useState } from 'react';
import { PRESETS, clampMinThink, clampSkill, presetFor, presetLabel, type Settings } from '../../game/difficulty';
import type { HintMode } from '../../game/difficulty-types';
import './DifficultyControl.css';

export interface DifficultyControlProps {
  settings: Settings;
  onChange: (next: Settings) => void;
  /** True while the engine owns the board. The panel goes inert rather than
   *  accepting a change that would only take effect on the next search. */
  disabled?: boolean;
}

/** The slider's own range. `difficulty.ts` deliberately does not export its
 *  constants, so these are written out here — and `DifficultyControl.test.tsx`
 *  probes `clampSkill` and `clampMinThink` to prove the two files still agree,
 *  because a slider that offers a level the clamp would silently change is how
 *  "two views of one setting" stops being true. */
const SKILL_MIN = 0;
const SKILL_MAX = 20;
const SKILL_STEP = 1;
const THINK_MIN_MS = 0;
const THINK_MAX_MS = 3000;
const THINK_STEP_MS = 100;

const HINT_MODES: ReadonlyArray<{ value: HintMode; label: string }> = [
  { value: 'best', label: 'Best move' },
  { value: 'good', label: 'A good idea' },
];

/**
 * Difficulty: five named presets, and everything else behind one collapsed panel.
 *
 * The presets are the entire interface for most people, so they are what is on
 * screen. The raw 0-20 slider, the think-time floor and the hint mode are all
 * real settings and all still reachable, but they are *adjustments* to a preset
 * rather than the primary control, and a learner who wants Beginner gets Beginner
 * without reading a slider scale.
 *
 * The presets and the raw slider are ONE setting, and the panel is built so they
 * cannot disagree:
 *
 *  - both read `settings.skillLevel` and nothing else, so there is no second copy
 *    of the level to fall out of step;
 *  - the checked preset is `presetFor(settings.skillLevel)`, which clamps its
 *    argument first, and the label is `presetLabel(settings.skillLevel)`, which
 *    clamps the same way. Comparing the raw level against the table instead — as
 *    the brief's sketch does — makes the two disagree for exactly the values that
 *    arrive from corrupt storage, where `presetLabel(NaN)` is "Medium" and
 *    `NaN === 8` is false, so the row would highlight nothing while the label
 *    named a preset;
 *  - a level that is not a preset is labelled `Custom (n)` rather than left blank,
 *    so the raw slider is visibly the same setting rather than a second control.
 *  - the label is INSIDE the panel, which it did not used to be. With it outside,
 *    a learner who never opens the panel could be shown "Custom (7)" with no
 *    visible way to reach the slider that set it — a reading with no control
 *    behind it. Now the only way to see `Custom` is to open the thing that can
 *    produce it.
 *
 * Collapsed by default and not remembered between sessions: it is a view state,
 * not a preference, and a stale "open" would put three sliders back on screen for
 * someone who had deliberately dismissed them.
 *
 * Every change is a spread of the settings the panel was given, so orientation,
 * theme and hint mode survive: dropping one is invisible here and very visible to
 * a learner whose board flips because they changed the difficulty.
 */
export default function DifficultyControl({ settings, onChange, disabled }: DifficultyControlProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const selected = presetFor(settings.skillLevel);

  return (
    <div className="difficulty">
      <div className="difficulty-presets" role="radiogroup" aria-label="Difficulty">
        {PRESETS.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={selected?.id === p.id}
            disabled={disabled}
            onClick={() => onChange({ ...settings, skillLevel: p.skillLevel })}
          >
            {p.label}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="difficulty-advanced"
        aria-expanded={open}
        aria-controls={`${id}-settings`}
        onClick={() => setOpen((v) => !v)}
      >
        {/* Decorative: the state is already in `aria-expanded`, and a caret glyph
            read aloud is noise. */}
        <span className="difficulty-caret" aria-hidden="true">{open ? '▾' : '▸'}</span>
        {open ? 'Hide settings' : 'Settings'}
      </button>

      {open && (
        <div className="difficulty-settings" id={`${id}-settings`}>
          <p className="difficulty-current">Engine strength: {presetLabel(settings.skillLevel)}</p>

          <label className="difficulty-slider" htmlFor={`${id}-skill`}>
            Skill level
            <input
              id={`${id}-skill`}
              type="range"
              min={SKILL_MIN}
              max={SKILL_MAX}
              step={SKILL_STEP}
              // The CLAMPED level, not the raw one, and that is the whole invariant:
              // `presetFor` and `presetLabel` above both clamp, so passing the raw
              // value here would be a third view reading a third copy. With NaN it
              // also matters on its own terms — React warns about `value={NaN}` and
              // the browser's sanitisation then displays the midpoint, 10, beside a
              // label that says "Medium".
              value={clampSkill(settings.skillLevel)}
              disabled={disabled}
              onChange={(e) => onChange({ ...settings, skillLevel: clampSkill(Number(e.target.value)) })}
            />
          </label>

          <label className="difficulty-slider" htmlFor={`${id}-think`}>
            Minimum think time: {clampMinThink(settings.minThinkTimeMs)}ms
            <input
              id={`${id}-think`}
              type="range"
              min={THINK_MIN_MS}
              max={THINK_MAX_MS}
              step={THINK_STEP_MS}
              value={clampMinThink(settings.minThinkTimeMs)}
              disabled={disabled}
              onChange={(e) => onChange({ ...settings, minThinkTimeMs: clampMinThink(Number(e.target.value)) })}
            />
          </label>

          {/* "Hint quality", not "Hints": the Hint *button* in the app is a group
              already labelled "Hints", and two controls called the same thing in
              one screen makes a screen-reader user guess which is which. This one
              picks how good the hint is, which is what the name has to say — "Hint
              strength" would be worse, because "strength" already means the
              opponent's skill level three rows up. */}
          <label className="difficulty-hint" htmlFor={`${id}-hint`}>
            Hint quality
            <select
              id={`${id}-hint`}
              value={settings.hintMode}
              disabled={disabled}
              // Narrowed, not cast. `e.target.value` is a string and `HintMode` is
              // two members of it, so a cast here would launder anything the DOM
              // could produce into a setting that `persistence.ts` then stores. The
              // two options are the whole union, so a value that is neither can
              // only be the default.
              onChange={(e) =>
                onChange({ ...settings, hintMode: e.target.value === 'good' ? 'good' : 'best' })
              }
            >
              {HINT_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
