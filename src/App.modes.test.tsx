import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

/** A UCI peer that answers with nothing. The mode switcher does not care what the
 *  engine says — it only cares that asking does not throw — so this is the
 *  smallest thing that satisfies `useEngine`. */
class SilentWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  postMessage() {}
  terminate() {}
  addEventListener() {}
  removeEventListener() {}
}

// The mode switcher is the first thing the tutor put in front of a learner, and
// it has one job beyond navigation: a learner who has never used this app must
// be able to find the learning without knowing it is called Learn.

describe('App: modes', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.stubGlobal('Worker', SilentWorker);
  });

  const setup = () => ({ user: userEvent.setup() });

  it('starts in free play, because that is the app that already existed', () => {
    setup();
    render(<App />);
    expect(screen.getByRole('button', { name: /play/i })).toHaveAttribute('aria-current', 'page');
  });

  it('offers every mode the spec settled on', () => {
    // Play, Learn, Coach, Review, Settings. Coach and Review are visible from the start
    // rather than hidden until earned: a learner who cannot see that a review
    // queue exists cannot look for it, and a greyed-out button is a worse
    // invitation than one that says why it is empty.
    setup();
    render(<App />);
    for (const name of [/play/i, /learn/i, /coach/i, /review/i, /settings/i]) {
      expect(screen.getByRole('button', { name })).toBeInTheDocument();
    }
  });

  it('keeps navigation inside the sidebar and the game board beside Coach and Review', async () => {
    const { user } = setup();
    render(<App />);
    const board = screen.getByRole('grid', { name: 'Chess board' });
    for (const mode of ['coach', 'review', 'settings', 'play']) {
      await user.click(screen.getByTestId(`mode-${mode}`));
      expect(screen.getByRole('grid', { name: 'Chess board' })).toBe(board);
      expect(within(screen.getByRole('complementary')).getByRole('navigation', { name: 'Mode' })).toBeInTheDocument();
    }
  });

  it('uses one exercise board in Learn and restores the game on return', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'e2, white pawn' }));
    await user.click(screen.getByRole('button', { name: 'e4, empty' }));
    await user.click(screen.getByTestId('mode-learn'));
    expect(screen.getAllByRole('grid', { name: 'Chess board' })).toHaveLength(1);
    expect(within(screen.getByRole('complementary')).getByRole('group', { name: 'Quickstart' })).toBeInTheDocument();
    await user.click(screen.getByTestId('mode-play'));
    expect(screen.getByRole('button', { name: 'e4, white pawn' })).toBeInTheDocument();
  });

  it('saves appearance, opponent and hint preferences from Settings while keeping the game', async () => {
    const { user } = setup();
    const view = render(<App />);
    await user.click(screen.getByRole('button', { name: 'e2, white pawn' }));
    await user.click(screen.getByRole('button', { name: 'e4, empty' }));
    await user.click(screen.getByTestId('mode-settings'));
    await user.click(screen.getByRole('button', { name: 'Black & White' }));
    await user.click(screen.getByRole('button', { name: 'Ink' }));
    await user.click(screen.getByRole('radio', { name: 'Hard' }));
    await user.selectOptions(screen.getByLabelText('Hint quality'), 'good');
    await user.click(screen.getByTestId('mode-play'));
    expect(screen.getByRole('button', { name: 'e4, white pawn' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.queryByRole('region', { name: 'Appearance' })).not.toBeInTheDocument();

    view.unmount();
    render(<App />);
    expect(screen.getByRole('button', { name: 'e4, white pawn' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Hard' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByTestId('mode-settings'));
    expect(screen.getByRole('button', { name: 'Black & White' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Ink' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Hint quality')).toHaveValue('good');
  });

  it('opens the quickstart from Learn, with no key and no network', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /learn/i }));
    // The whole point of building the quickstart first: it is the one part of
    // the tutor that works with no key, so there is something to click on.
    expect(screen.getByTestId('quickstart-progress')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-key-prompt')).not.toBeInTheDocument();
  });

  it('leaves the quickstart without tearing the game down', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /learn/i }));
    await user.click(screen.getByTestId('quickstart-cancel'));
    expect(screen.queryByTestId('quickstart-progress')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play/i })).toHaveAttribute('aria-current', 'page');
  });

  it('asks for a key only in Coach, and says what happens without one', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /coach/i }));
    expect(screen.getByTestId('coach-key-prompt')).toBeInTheDocument();
  });

  it('shows an empty review queue rather than a spinner that never resolves', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /review/i }));
    expect(screen.getByTestId('review-empty')).toBeInTheDocument();
  });

  it('starts the quickstart from the top when it is reopened', async () => {
    const { user } = setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /learn/i }));
    await user.click(screen.getByRole('button', { name: /play/i }));
    await user.click(screen.getByRole('button', { name: /learn/i }));
    // Step one, because nothing was answered. The quickstart is not resumable
    // yet, and it does not pretend to be — a progress record that starts at
    // step one every time is honest, and one that claims step four is not.
    expect(screen.getByTestId('quickstart-progress')).toHaveTextContent('Step 1');
  });
});
