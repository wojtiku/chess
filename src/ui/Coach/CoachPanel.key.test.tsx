import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoachPanel from './CoachPanel';
import { PROVIDER_KEY, loadProvider } from './providerKey';

// The bug this file exists for: the panel wrote the key to localStorage and
// never read it back, so it asked again every time the learner came back to the
// Coach tab — which is the only way to reach it, since switching modes unmounts
// the panel. The key WAS saved. The app just behaved as though it had not been.

describe('CoachPanel: the key survives leaving and coming back', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('does not ask again after the panel has been unmounted and remounted', async () => {
    const user = userEvent.setup();
    const first = render(<CoachPanel />);
    await user.type(screen.getByTestId('coach-key-input'), 'AIzaSyTESTKEY1234567890');
    await user.click(screen.getByTestId('coach-key-save'));
    expect(screen.getByTestId('coach-saved')).toBeInTheDocument();

    // Unmounting is what a mode switch does.
    first.unmount();
    render(<CoachPanel />);

    expect(screen.queryByTestId('coach-key-prompt')).not.toBeInTheDocument();
    expect(screen.getByTestId('coach-saved')).toBeInTheDocument();
  });

  it('shows the key masked, never in full', async () => {
    // A Google AI key is long enough that any prefix identifies it. A suffix is
    // enough for a learner to tell two keys apart.
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByTestId('coach-key-input'), 'AIzaSySECRET1234567890');
    await user.click(screen.getByTestId('coach-key-save'));

    const masked = screen.getByTestId('coach-key-masked').textContent ?? '';
    expect(masked).toContain('7890');
    expect(masked).not.toContain('AIza');
    expect(masked).not.toContain('SECRET');
  });

  it('clears the stored key when the learner removes it', async () => {
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.type(screen.getByTestId('coach-key-input'), 'abc123');
    await user.click(screen.getByTestId('coach-key-save'));
    await user.click(screen.getByTestId('coach-key-clear'));

    expect(loadProvider()).toBeNull();
    expect(screen.getByTestId('coach-key-prompt')).toBeInTheDocument();
  });

  it('asks again when there is nothing stored', () => {
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-key-prompt')).toBeInTheDocument();
  });

  it('asks again, rather than half-reading, when the stored value is corrupt', () => {
    // A hand-edited or half-written entry must not show "a key is saved" for a
    // key that is not usable.
    localStorage.setItem(PROVIDER_KEY, '{"key":"AIzaSyTRUNC');
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-key-prompt')).toBeInTheDocument();
  });

  it('discloses that the position is sent, before the key is pasted', () => {
    // The disclosure is on the panel, not in a dialog that can be dismissed,
    // because the position includes the mistakes the learner is about to ask
    // about.
    render(<CoachPanel />);
    const disclosure = screen.getByRole('group', { name: /provider key/i });
    expect(disclosure).toHaveTextContent(/position and the facts/i);
    expect(disclosure).toHaveTextContent(/billed/i);
    expect(disclosure).toHaveTextContent(/this device only/i);
  });

  it('will not save an empty key', async () => {
    const user = userEvent.setup();
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-key-save')).toBeDisabled();
    await user.type(screen.getByTestId('coach-key-input'), '   ');
    expect(screen.getByTestId('coach-key-save')).toBeDisabled();
  });

  it('names the provider, because a key for one is rejected by another', () => {
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-provider')).toHaveValue('gemini');
  });
});
