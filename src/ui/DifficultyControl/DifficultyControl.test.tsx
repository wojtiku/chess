// The preset row and the raw 0-20 slider are two views of ONE setting, and the
// requirement is that they never disagree. That cannot be checked by looking at
// either control alone, so most of this file drives a *controlled* panel — one
// that actually applies `onChange` — and asserts that the two views keep
// agreeing after every interaction.
//
// **Almost everything now sits behind the settings disclosure**, so most tests
// below have to open it before they can touch it. That is deliberate, not
// incidental: a test that reached the sliders without opening the panel would be a
// test of a control no learner can reach, and it would go on passing if the
// disclosure were deleted outright.
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { DEFAULT_SETTINGS, PRESETS, clampMinThink, clampSkill, presetLabel } from '../../game/difficulty';
import type { Settings } from '../../game/difficulty';
import DifficultyControl from './DifficultyControl';

const radio = (label: string) => screen.getByRole('radio', { name: label });

const slider = (name: RegExp) =>
  screen.getByLabelText(name) as HTMLInputElement;

/** The disclosure, by accessible name. The caret is `aria-hidden`, so the name is
 *  just the text, and nothing else on screen contains "settings". */
const settingsButton = (): HTMLElement => screen.getByRole('button', { name: /settings/i });

/** Open the collapsed settings panel.
 *
 *  `userEvent` rather than `fireEvent` for the reason the "reports no change from a
 *  real interaction while disabled" test spells out: a raw dispatch reaches a
 *  control that the browser would refuse, so it fails on a correct panel and passes
 *  on one whose handlers ignore `disabled`. The disclosure is never disabled today,
 *  but that is a property of the props rather than of the element, and this is the
 *  one line every test in the file depends on. */
async function openSettings(): Promise<void> {
  await userEvent.setup().click(settingsButton());
}

const bounds = (input: HTMLInputElement) => ({
  min: Number(input.getAttribute('min')),
  max: Number(input.getAttribute('max')),
  step: Number(input.getAttribute('step')),
});

/** The farthest value the clamp leaves unchanged from `from`, walking in units of
 *  `step`. Probed rather than hardcoded, so a change to EITHER the clamp in
 *  `difficulty.ts` or the slider's own attributes fails the test below. */
function clampEdge(clamp: (n: number) => number, from: number, dir: 1 | -1, step: number): number {
  let v = from;
  while (Math.abs(v) <= 5000 && clamp(v + dir * step) === v + dir * step) v += dir * step;
  return v;
}

/** A panel that holds the settings itself, so "moving the slider shows Custom" is
 *  one observation rather than a simulation of what the parent would do next. */
function Controlled({ initial = DEFAULT_SETTINGS, onChange }: {
  initial?: Settings;
  onChange?: (next: Settings) => void;
}) {
  const [settings, setSettings] = useState<Settings>(initial);
  return (
    <DifficultyControl
      settings={settings}
      onChange={(next) => {
        onChange?.(next);
        setSettings(next);
      }}
    />
  );
}

describe('DifficultyControl', () => {
  it('offers the five presets, with the current one checked', () => {
    render(<Controlled />);
    expect(screen.getByRole('radiogroup', { name: /difficulty/i })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(5);
    expect(screen.getAllByRole('radio').map((b) => b.textContent))
      .toEqual(PRESETS.map((p) => p.label));
    expect(radio('Medium')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Hard')).toHaveAttribute('aria-checked', 'false');
  });

  it('checks exactly one preset, whichever level is set', () => {
    for (const preset of PRESETS) {
      const { unmount } = render(<Controlled initial={{ ...DEFAULT_SETTINGS, skillLevel: preset.skillLevel }} />);
      const checked = screen.getAllByRole('radio').filter((b) => b.getAttribute('aria-checked') === 'true');
      expect(checked, preset.label).toHaveLength(1);
      expect(checked[0]?.textContent).toBe(preset.label);
      unmount();
    }
  });

  it('shows the strength as a preset name when the level is one, and Custom when it is not', async () => {
    const { unmount } = render(<Controlled />);
    await openSettings();
    expect(screen.getByText(`Engine strength: ${presetLabel(DEFAULT_SETTINGS.skillLevel)}`)).toBeInTheDocument();
    expect(screen.getByText('Engine strength: Medium')).toBeInTheDocument();
    unmount();

    render(<Controlled initial={{ ...DEFAULT_SETTINGS, skillLevel: 10 }} />);
    await openSettings();
    expect(screen.getByText('Engine strength: Custom (10)')).toBeInTheDocument();
    // "Custom" is what makes the two views visibly one setting rather than two
    // independent controls that happen to sit next to each other.
    expect(screen.getByText(/custom/i)).toBeInTheDocument();
  });

  it('snaps the raw slider to a preset when a preset is clicked', async () => {
    render(<Controlled />);
    await openSettings();
    await userEvent.setup().click(radio('Hard'));
    expect(slider(/skill level/i).value).toBe('13');
    expect(screen.getByText('Engine strength: Hard')).toBeInTheDocument();
    expect(radio('Hard')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Medium')).toHaveAttribute('aria-checked', 'false');
  });

  it('shows Custom and checks no preset when the raw slider moves off one', async () => {
    render(<Controlled />);
    await openSettings();
    fireEvent.change(slider(/skill level/i), { target: { value: '10' } });
    expect(screen.getByText('Engine strength: Custom (10)')).toBeInTheDocument();
    expect(screen.getAllByRole('radio').every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('goes back to a preset name when the raw slider lands on one', async () => {
    // The other direction of the same invariant: dragging 8 -> 10 -> 13 must not
    // leave the panel saying "Custom" once the level is a preset again.
    const { unmount } = render(<Controlled />);
    await openSettings();
    const s = slider(/skill level/i);
    fireEvent.change(s, { target: { value: '10' } });
    expect(screen.getByText(/custom/i)).toBeInTheDocument();
    fireEvent.change(s, { target: { value: '13' } });
    expect(screen.queryByText(/custom/i)).not.toBeInTheDocument();
    expect(screen.getByText('Engine strength: Hard')).toBeInTheDocument();
    expect(radio('Hard')).toHaveAttribute('aria-checked', 'true');
    unmount();
  });

  it('keeps the slider and the checked preset in step for every level the slider can reach', async () => {
    // The invariant, walked exhaustively rather than sampled: for all 21 levels,
    // the checked preset is the one whose level equals the slider, and the label
    // agrees with both. A panel whose two views are computed from different
    // sources passes every spot check and fails here.
    render(<Controlled />);
    await openSettings();
    const s = slider(/skill level/i);
    for (let level = 0; level <= 20; level++) {
      fireEvent.change(s, { target: { value: String(level) } });
      const expected = PRESETS.find((p) => p.skillLevel === level);
      const checked = screen.getAllByRole('radio').filter((b) => b.getAttribute('aria-checked') === 'true');
      expect(checked.map((b) => b.textContent), `level ${level}`).toEqual(
        expected === undefined ? [] : [expected.label],
      );
      expect(screen.getByText(`Engine strength: ${presetLabel(level)}`), `level ${level}`).toBeInTheDocument();
    }
  });

  it('clamps the raw slider through clampSkill rather than re-deriving the bound', async () => {
    const onChange = vi.fn();
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={onChange} />);
    await openSettings();
    // 25 is off the end of the input's own domain. The assertion that matters is the
    // VALUE the panel reports, not the clamp's own output — a version of this test
    // that only asserted `clampSkill(25) === 20` was a statement about the library.
    //
    // Honest limit: this does NOT prove the panel calls `clampSkill`. A range input
    // sanitises its own value, so `e.target.value` is already 20 here and deleting
    // the clamp call survives (`.superpowers/mutate-panels.py`, D03). The call is
    // kept because the panel's contract should not rest on the browser clamping for
    // it, and because the sibling test below proves every reachable value is a
    // fixed point of the clamp — the two facts together mean the clamp can only ever
    // agree with the slider, never contradict it.
    fireEvent.change(slider(/skill level/i), { target: { value: '25' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, skillLevel: 20 });
  });

  it('clamps the think-time slider through clampMinThink', async () => {
    const onChange = vi.fn();
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={onChange} />);
    await openSettings();
    fireEvent.change(slider(/minimum think time/i), { target: { value: '250' } });
    // 250ms is not a 100ms step, so the clamp rounds it: the slider must not be
    // able to store a value its own `step` could never produce.
    expect(clampMinThink(250)).toBe(300);
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, minThinkTimeMs: 300 });
  });

  it('declares slider bounds that are exactly the clamp functions\' own domain', async () => {
    // `difficulty.ts` deliberately does not export its range constants, so the panel
    // writes its own `min`/`max`/`step`. This is the pin that keeps the two files
    // honest: the domain is discovered by probing the clamp, so a change to either
    // side fails here instead of producing a slider that lies about its range.
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={() => {}} />);
    await openSettings();
    const skill = bounds(slider(/skill level/i));
    const think = bounds(slider(/minimum think time/i));

    expect(skill.min).toBe(clampEdge(clampSkill, 0, -1, skill.step));
    expect(skill.max).toBe(clampEdge(clampSkill, 0, 1, skill.step));
    expect(think.min).toBe(clampEdge(clampMinThink, 0, -1, think.step));
    expect(think.max).toBe(clampEdge(clampMinThink, 0, 1, think.step));

    // And every value a user can actually produce is one the clamp keeps intact,
    // so no interaction can store a value the control could not display.
    for (let v = skill.min; v <= skill.max; v += skill.step) expect(clampSkill(v), `skill ${v}`).toBe(v);
    for (let v = think.min; v <= think.max; v += think.step) expect(clampMinThink(v), `think ${v}`).toBe(v);
  });

  it('keeps the two views in step for settings that are not valid levels at all', async () => {
    // Corrupt storage is the case `presetFor` exists for. `clampSkill(NaN)` is 8, so
    // the label says "Medium" and the row MUST highlight Medium; comparing the raw
    // level against the preset table instead — as the brief's sketch does —
    // highlights nothing at all while the label names a preset, which is precisely
    // the "two views that disagree" the requirement forbids.
    for (const [level, labelText, checkedLabel] of [
      [NaN, 'Medium', 'Medium'],
      [25, 'Expert', 'Expert'],
      [-3, 'Custom (0)', null],
      // `clampSkill` TRUNCATES rather than rounds, so 8.7 is the Medium preset and
      // 9.5 is not. Both are the kind of value a stale slider position produces.
      [8.7, 'Medium', 'Medium'],
      [9.5, 'Custom (9)', null],
    ] as const) {
      const { unmount } = render(
        <DifficultyControl settings={{ ...DEFAULT_SETTINGS, skillLevel: level }} onChange={() => {}} />,
      );
      await openSettings();
      expect(screen.getByText(`Engine strength: ${labelText}`), `level ${level}`).toBeInTheDocument();
      const checked = screen.getAllByRole('radio')
        .filter((b) => b.getAttribute('aria-checked') === 'true')
        .map((b) => b.textContent);
      expect(checked, `level ${level}`).toEqual(checkedLabel === null ? [] : [checkedLabel]);
      unmount();
    }
  });

  it('displays a level the slider can actually show, and warns about nothing', async () => {
    // `value={NaN}` on a range input makes React log a warning and the browser's
    // sanitisation then displays the midpoint — so an unclamped panel would sit
    // there showing 10 beside a label reading "Medium", with a console full of
    // React's opinion about it.
    const errors: unknown[][] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args);
    });
    try {
      render(
        <DifficultyControl
          settings={{
            ...DEFAULT_SETTINGS,
            skillLevel: NaN,
            minThinkTimeMs: NaN,
          }}
          onChange={() => {}}
        />,
      );
      await openSettings();
      expect(slider(/skill level/i)).toHaveValue(String(DEFAULT_SETTINGS.skillLevel));
      expect(slider(/minimum think time/i)).toHaveValue(String(DEFAULT_SETTINGS.minThinkTimeMs));
    } finally {
      spy.mockRestore();
    }
    expect(errors).toEqual([]);
  });

  it('changes only the skill level when a preset is clicked', async () => {
    const onChange = vi.fn();
    const settings: Settings = { ...DEFAULT_SETTINGS, minThinkTimeMs: 1200, orientation: 'b', theme: 'dark' };
    render(<DifficultyControl settings={settings} onChange={onChange} />);
    await userEvent.setup().click(radio('Expert'));
    // Orientation, theme, hint mode and think time are not this control's business.
    // Dropping one of them is invisible on screen and very visible to a learner
    // whose board flips because they changed the difficulty.
    expect(onChange).toHaveBeenCalledWith({ ...settings, skillLevel: 20 });
    expect(onChange.mock.calls[0]?.[0]).not.toBe(settings);
  });

  it('offers the hint modes inside the settings panel and reports the chosen one', async () => {
    const onChange = vi.fn();
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={onChange} />);
    // One disclosure for all three adjustments now, rather than a second
    // "Show hint options" button of its own — so the hint select is reached the
    // same way the sliders are. The label is matched exactly enough to say
    // "hint quality", because the app's Hint *button* is a group labelled "Hints"
    // and a loose `/hint/i` would be a match for that too.
    expect(screen.queryByLabelText(/hint quality/i)).not.toBeInTheDocument();

    await openSettings();
    const select = screen.getByLabelText(/hint quality/i) as HTMLSelectElement;
    expect([...select.options].map((o) => o.value)).toEqual(['best', 'good']);

    await userEvent.setup().selectOptions(select, 'good');
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, hintMode: 'good' });
  });

  it('reflects a hint mode chosen elsewhere', async () => {
    render(<Controlled initial={{ ...DEFAULT_SETTINGS, hintMode: 'good' }} />);
    await openSettings();
    expect((screen.getByLabelText(/hint quality/i) as HTMLSelectElement).value).toBe('good');
  });

  it('labels the think time it is showing, in words a learner can act on', async () => {
    const { unmount } = render(<Controlled initial={{ ...DEFAULT_SETTINGS, minThinkTimeMs: 1200 }} />);
    await openSettings();
    expect(slider(/minimum think time/i)).toHaveValue('1200');
    expect(screen.getByText(/1200\s*ms/)).toBeInTheDocument();
    unmount();
    render(<Controlled initial={{ ...DEFAULT_SETTINGS, minThinkTimeMs: 0 }} />);
    await openSettings();
    expect(slider(/minimum think time/i)).toHaveValue('0');
  });

  it('disables every setting when disabled, and still lets the disclosure open', async () => {
    // During the opponent's turn the engine owns the board, and a difficulty change
    // mid-search would apply to the NEXT search only — the panel goes inert instead.
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={() => {}} disabled />);
    for (const b of screen.getAllByRole('radio')) expect(b).toBeDisabled();
    await openSettings();
    expect(slider(/skill level/i)).toBeDisabled();
    expect(slider(/minimum think time/i)).toBeDisabled();

    // The disclosure is local view state, not a setting: hiding it while the panel
    // is inert would make the adjustments unreachable once the panel is live again.
    expect(screen.getByLabelText(/hint quality/i)).toBeDisabled();
  });

  it('reports no change from a real interaction while disabled', async () => {
    // `disabled` is the whole mechanism, so this drives it the way a learner would.
    // `fireEvent.change` is NOT used here: it dispatches straight at the DOM node
    // and bypasses the very thing under test, so it would fail on a correct panel
    // and pass on one whose handlers ignore `disabled` entirely.
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={onChange} disabled />);
    await user.click(radio('Expert'));
    // Opening is deliberately NOT part of the no-change claim: the disclosure holds
    // no setting, so clicking it reports nothing by design rather than by `disabled`.
    await user.click(settingsButton());
    await user.click(slider(/skill level/i));
    await user.type(slider(/skill level/i), '{ArrowRight}');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('scopes the labels to one instance, so two panels cannot cross-wire', async () => {
    // `useId` is what keeps the `htmlFor`/`id` pair unique. React's ids contain
    // colons, which are legal in an id and in `htmlFor`, and this is the test that
    // would notice a hardcoded id copied from the brief.
    //
    // The disclosures are opened by index rather than by name, because there are now
    // two buttons matching "settings" and `getByRole` would — correctly — refuse to
    // guess which one to click.
    render(
      <>
        <DifficultyControl settings={DEFAULT_SETTINGS} onChange={() => {}} />
        <DifficultyControl settings={DEFAULT_SETTINGS} onChange={() => {}} />
      </>,
    );
    const user = userEvent.setup();
    for (const b of screen.getAllByRole('button', { name: /settings/i })) await user.click(b);

    expect(screen.getAllByLabelText(/skill level/i)).toHaveLength(2);
    expect(new Set(screen.getAllByLabelText(/skill level/i).map((i) => i.id)).size).toBe(2);
    // `aria-controls` is a second id to get wrong, and a wrong one points a screen
    // reader at nothing rather than at an error.
    const controlled = screen.getAllByRole('button', { name: /settings/i })
      .map((b) => b.getAttribute('aria-controls'));
    expect(new Set(controlled).size).toBe(2);
  });

  it('keeps the five presets inside one named group of controls', () => {
    // The name used to claim "and slider", which was never true: the slider is a
    // plain labelled input outside the radiogroup, and now it is behind the
    // disclosure as well. A test name that overstates what it checks is how a
    // reader comes to trust it for something it does not cover.
    render(<DifficultyControl settings={DEFAULT_SETTINGS} onChange={() => {}} />);
    const group = screen.getByRole('radiogroup', { name: /difficulty/i });
    expect(within(group).getAllByRole('radio')).toHaveLength(PRESETS.length);
  });
});

describe('the settings disclosure', () => {
  // The requirement: the presets are the visible interface and the rest is folded
  // away. The risk in implementing it is not that it is hard to build but that it
  // quietly stops being true later — a slider added above the disclosure, a label
  // left outside it — so the shape itself is pinned rather than assumed.

  it('shows the five presets and nothing else, to start with', () => {
    render(<Controlled />);
    expect(screen.getAllByRole('radio')).toHaveLength(PRESETS.length);
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/skill level/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/minimum think time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hint quality/i)).not.toBeInTheDocument();
  });

  it('takes the strength label inside the panel with the control that explains it', () => {
    // "Engine strength: Custom (7)" is a reading of the raw slider, so with the
    // label outside the panel a learner could be shown a number whose only
    // explanation is behind a button they have not found. The reverse complaint
    // does not apply: opening the panel to check a setting and seeing the preset
    // name is not a cost worth designing around.
    render(<Controlled initial={{ ...DEFAULT_SETTINGS, skillLevel: 10 }} />);
    expect(screen.queryByText(/engine strength/i)).not.toBeInTheDocument();
  });

  it('reveals all three adjustments when opened, and takes them away when closed', async () => {
    render(<Controlled />);
    await openSettings();

    expect(settingsButton()).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText(/skill level/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/minimum think time/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/hint quality/i)).toBeInTheDocument();
    expect(screen.getByText(/engine strength/i)).toBeInTheDocument();

    await userEvent.setup().click(settingsButton());
    expect(settingsButton()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByLabelText(/skill level/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/minimum think time/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/hint quality/i)).not.toBeInTheDocument();
  });

  it('points the disclosure at a region that actually exists', async () => {
    // `aria-controls` naming an id that is not on screen is worse than omitting it:
    // it looks wired up and is not. The region is conditional, so this also pins
    // that the two ids are generated from the same `useId` rather than typed twice.
    render(<Controlled />);
    await openSettings();
    const id = settingsButton().getAttribute('aria-controls');
    expect(id).toBeTruthy();
    expect(document.getElementById(id!)).not.toBeNull();
  });

  it('keeps a change made inside the panel when it is closed again', async () => {
    // The panel holds no state of its own, so folding it away must not read as
    // undoing anything. What stays visible while it is closed is the preset row,
    // and the row is the one thing that has to stay truthful about a level no
    // preset matches: no button checked, rather than a stale one.
    render(<Controlled />);
    await openSettings();
    fireEvent.change(screen.getByLabelText(/skill level/i), { target: { value: '10' } });
    expect(screen.getByText('Engine strength: Custom (10)')).toBeInTheDocument();

    await userEvent.setup().click(settingsButton());
    expect(radio('Medium')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getAllByRole('radio').every((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);

    // And it was not reverted behind the panel's back.
    await openSettings();
    expect(screen.getByText('Engine strength: Custom (10)')).toBeInTheDocument();
  });

  it('still lets a preset be chosen while collapsed', async () => {
    // The point of the arrangement: the common case needs no opening. A variant
    // that only worked through the panel would satisfy "the sliders are hidden"
    // while breaking the thing the hiding was for.
    // `Controlled`, not a bare panel: the row is only allowed to update if the
    // parent applies what it reports, so asserting both halves of the click needs
    // a parent that applies it.
    const onChange = vi.fn();
    render(<Controlled onChange={onChange} />);
    await userEvent.setup().click(radio('Beginner'));
    expect(onChange).toHaveBeenCalledWith({ ...DEFAULT_SETTINGS, skillLevel: PRESETS[0]!.skillLevel });
    expect(radio('Beginner')).toHaveAttribute('aria-checked', 'true');
    expect(radio('Medium')).toHaveAttribute('aria-checked', 'false');
  });
});
