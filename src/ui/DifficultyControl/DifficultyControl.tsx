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
  /** Play shows presets; the Settings panel shows the detailed controls directly. */
  advanced?: 'disclosure' | 'visible' | 'hidden';
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

/** Named presets are shared between Play and Settings. Detailed controls are
 * visible in Settings, hidden in Play, or collapsible for standalone use.
 * Both views read the same settings and spread updates to preserve the others. */
export default function DifficultyControl({ settings, onChange, disabled, advanced = 'disclosure' }: DifficultyControlProps) {
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

      {advanced === 'disclosure' && <button
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
      </button>}

      {(advanced === 'visible' || (advanced === 'disclosure' && open)) && (
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
