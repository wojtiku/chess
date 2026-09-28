// The mode switcher: Play, Learn, Coach, Review.
//
// The app that existed before this was one thing — play White against the engine
// — and it is still that, on arrival. The learning modes hang off it rather than
// replacing it, because the practice board is the thing that already works and
// the thing the learner came for. No landing screen and no router: a mode is one
// piece of state, and a mode switch that can fail is one that will.

export type Mode = 'play' | 'learn' | 'coach' | 'review';

export const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'play', label: 'Play' },
  { id: 'learn', label: 'Learn' },
  { id: 'coach', label: 'Coach' },
  { id: 'review', label: 'Review' },
];

/**
 * `aria-current="page"` rather than a class alone, so the current mode is
 * *announced* as well as styled. A sighted learner sees which of four buttons is
 * active instantly; a screen-reader user otherwise has to work it out.
 */
export function ModeSwitcher({
  mode,
  onChange,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
}) {
  return (
    <nav className="app-modes" role="navigation" aria-label="Mode">
      {MODES.map((m) => (
        <button
          key={m.id}
          type="button"
          data-testid={`mode-${m.id}`}
          aria-current={mode === m.id ? 'page' : undefined}
          onClick={() => onChange(m.id)}
        >
          {m.label}
        </button>
      ))}
    </nav>
  );
}
