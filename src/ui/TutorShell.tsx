// The shared board workspace and its sidebar navigation. Play remains the default;
// selecting a study panel does not discard the game.

import type { ReactNode } from 'react';

export type Mode = 'play' | 'learn' | 'coach' | 'review' | 'settings';

export const MODES: ReadonlyArray<{ id: Mode; label: string }> = [
  { id: 'play', label: 'Play' },
  { id: 'learn', label: 'Learn' },
  { id: 'coach', label: 'Coach' },
  { id: 'review', label: 'Review' },
  { id: 'settings', label: 'Settings' },
];

/**
 * `aria-current="page"` rather than a class alone, so the current mode is
 * *announced* as well as styled. A sighted learner sees which navigation button is
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

/** One board and one study panel, including when the board is a lesson. */
export function BoardWorkspace({ board, children, mode, onChange }: {
  board: ReactNode;
  children: ReactNode;
  mode: Mode;
  onChange: (mode: Mode) => void;
}) {
  return (
    <main className="app-main">
      <div className="app-board">{board}</div>
      <aside className="app-sidebar" aria-label={`${MODES.find((m) => m.id === mode)?.label} panel`}>
        <header className="app-header">
          <h1>Chess Practice Board</h1>
          <p className="app-sub">You play White. Take your time.</p>
        </header>
        <ModeSwitcher mode={mode} onChange={onChange} />
        {/* A newly selected mode starts at its heading, even if the previous
            panel was scrolled to the end of a long game. */}
        <div className="app-panel" key={mode}>{children}</div>
      </aside>
    </main>
  );
}
