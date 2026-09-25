// Every control here is a plain button over a prop, so the risk is not logic but
// wiring: a handler that is never passed, a disabled flag read from the wrong prop,
// and a nav button that is live at the end of the game. Each is asserted against
// the DOM rather than the markup.
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import Controls from './Controls';

type Props = ComponentProps<typeof Controls>;

const HANDLERS = [
  'onFirst', 'onPrev', 'onNext', 'onLast',
  'onUndo', 'onResign', 'onNewGame', 'onFlip',
] as const;

/** Eight fresh spies, typed as the handlers they stand in for. */
function spies() {
  return {
    onFirst: vi.fn(), onPrev: vi.fn(), onNext: vi.fn(), onLast: vi.fn(),
    onUndo: vi.fn(), onResign: vi.fn(), onNewGame: vi.fn(), onFlip: vi.fn(),
  };
}

function setup(over: Partial<Props> = {}) {
  const handlers = spies();
  // The flags default to "everything available, in the middle of a game", so a test
  // that overrides one flag reads the rest as a deliberate "unchanged".
  render(<Controls {...defaults()} {...handlers} {...over} />);
  return handlers;
}

const btn = (name: RegExp | string) => screen.getByRole('button', { name });

describe('Controls', () => {
  it('offers four navigation buttons and four game controls, each findable by name', () => {
    // Names, not glyphs: ⏮ and ◀ are not words, and an icon-only button is
    // invisible to a screen reader and to anyone who cannot see the icon.
    setup();
    for (const name of [/first move/i, /previous move/i, /next move/i, /last move/i]) {
      expect(btn(name)).toBeInTheDocument();
    }
    for (const name of [/^undo$/i, /^resign$/i, /new game/i, /flip/i]) {
      expect(btn(name)).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button')).toHaveLength(8);
  });

  it('groups the navigation and the game controls separately', () => {
    setup();
    expect(screen.getByRole('group', { name: /move navigation/i })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /game controls/i })).toBeInTheDocument();
  });

  it('calls each of the eight handlers exactly once', async () => {
    const p = setup();
    const user = userEvent.setup();
    await user.click(btn(/first move/i));
    await user.click(btn(/previous move/i));
    await user.click(btn(/next move/i));
    await user.click(btn(/last move/i));
    await user.click(btn(/^undo$/i));
    await user.click(btn(/^resign$/i));
    await user.click(btn(/new game/i));
    await user.click(btn(/flip/i));
    for (const h of HANDLERS) expect(p[h], h).toHaveBeenCalledTimes(1);
  });

  it('disables backward navigation at the start and forward at the end', () => {
    const { unmount } = render(<Controls {...defaults()} atStart atEnd={false} />);
    expect(btn(/first move/i)).toBeDisabled();
    expect(btn(/previous move/i)).toBeDisabled();
    expect(btn(/next move/i)).toBeEnabled();
    expect(btn(/last move/i)).toBeEnabled();
    unmount();

    render(<Controls {...defaults()} atStart={false} atEnd />);
    expect(btn(/first move/i)).toBeEnabled();
    expect(btn(/previous move/i)).toBeEnabled();
    expect(btn(/next move/i)).toBeDisabled();
    expect(btn(/last move/i)).toBeDisabled();
  });

  it('enables every navigation button in the middle of a game', () => {
    setup({ atStart: false, atEnd: false });
    for (const name of [/first move/i, /previous move/i, /next move/i, /last move/i]) {
      expect(btn(name), String(name)).toBeEnabled();
    }
  });

  it('disables all four navigation buttons on an empty game', () => {
    // A new game is both at the start and at the end, and `atStart && atEnd` is the
    // only state where every nav button must be dead. A panel that ORs the two
    // flags, or reads one of them twice, leaves two buttons live on move 0.
    render(<Controls {...defaults()} atStart atEnd />);
    for (const name of [/first move/i, /previous move/i, /next move/i, /last move/i]) {
      expect(btn(name), String(name)).toBeDisabled();
    }
  });

  it('follows the canUndo, canResign and canNewGame flags independently', () => {
    // One flag must not be able to drive another's button: a game that cannot be
    // undone can still be resigned and restarted.
    render(<Controls {...defaults()} canUndo={false} canResign canNewGame={false} />);
    expect(btn(/^undo$/i)).toBeDisabled();
    expect(btn(/^resign$/i)).toBeEnabled();
    expect(btn(/new game/i)).toBeDisabled();
  });

  it('leaves Flip board enabled whatever the game state is', () => {
    // Flipping is a view, not a move: it stays available at both ends, in a finished
    // game and with nothing to undo. Task 3 noted a disposed client still reports a
    // live-looking status, and a disabled Flip would be the visible symptom.
    for (const flags of [
      { atStart: true, atEnd: true, canUndo: false, canResign: false, canNewGame: false },
      { atStart: false, atEnd: false, canUndo: true, canResign: true, canNewGame: true },
    ]) {
      const { unmount } = render(<Controls {...defaults()} {...flags} />);
      expect(btn(/flip/i), JSON.stringify(flags)).toBeEnabled();
      unmount();
    }
  });

  it('does not call a disabled button\'s handler', async () => {
    const p = setup({ atStart: true, atEnd: true, canUndo: false, canResign: false, canNewGame: false });
    const user = userEvent.setup();
    for (const name of [/first move/i, /previous move/i, /next move/i, /last move/i, /^undo$/i, /^resign$/i, /new game/i]) {
      await user.click(btn(name));
    }
    expect(p.onFirst).not.toHaveBeenCalled();
    expect(p.onPrev).not.toHaveBeenCalled();
    expect(p.onNext).not.toHaveBeenCalled();
    expect(p.onLast).not.toHaveBeenCalled();
    expect(p.onUndo).not.toHaveBeenCalled();
    expect(p.onResign).not.toHaveBeenCalled();
    expect(p.onNewGame).not.toHaveBeenCalled();
  });

  it('types every button as "button", so none of them submits a form', () => {
    setup();
    for (const b of screen.getAllByRole('button')) {
      expect(b).toHaveAttribute('type', 'button');
    }
  });
});

/** Everything enabled, so a test that overrides one flag reads the rest as a
 *  deliberate "unchanged" rather than as an accident. */
function defaults(): Props {
  return {
    canUndo: true, canResign: true, canNewGame: true, atStart: false, atEnd: false,
    onUndo: vi.fn(), onResign: vi.fn(), onNewGame: vi.fn(), onFlip: vi.fn(),
    onFirst: vi.fn(), onPrev: vi.fn(), onNext: vi.fn(), onLast: vi.fn(),
  };
}
