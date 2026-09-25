// Five engine states, and a name that collides with the type it is handed: the
// component is `EngineStatus` and the union from `engine/engineClient.ts` is also
// `EngineStatus`. The component's props are therefore checked by this suite as
// much as by the compiler — a mis-aliased import would arrive as a `string` and
// every state below would silently render the same thing.
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { EngineStatus as EngineState } from '../../engine/engineClient';
import EngineStatus from './EngineStatus';

const ALL_STATES: ReadonlyArray<EngineState> = ['idle', 'loading', 'ready', 'thinking', 'error'];

const badge = () => screen.getByRole('status');

describe('EngineStatus', () => {
  it('labels every one of the five states, and no two alike', () => {
    // The engine can be mid-boot, ready, searching, or dead, and a learner staring
    // at a board that has stopped answering needs to tell those apart. A single
    // fallback string would pass a test that only checked that something rendered.
    const seen = new Set<string>();
    for (const status of ALL_STATES) {
      const { unmount } = render(<EngineStatus status={status} error={null} />);
      const text = badge().textContent ?? '';
      expect(text.length, status).toBeGreaterThan(0);
      expect(seen.has(text), `${status} reuses another state's text`).toBe(false);
      seen.add(text);
      unmount();
    }
    expect(seen.size).toBe(5);
  });

  it('names the exact state in a data attribute, for styling and for tests', () => {
    for (const status of ALL_STATES) {
      const { unmount } = render(<EngineStatus status={status} error={null} />);
      expect(badge()).toHaveAttribute('data-status', status);
      expect(badge().className).toContain(`engine-status--${status}`);
      unmount();
    }
  });

  it('says the engine is not loaded when it is idle', () => {
    render(<EngineStatus status="idle" error={null} />);
    expect(badge()).toHaveTextContent('Engine not loaded');
  });

  it('says it is loading while the ~1.8MB engine boots', () => {
    render(<EngineStatus status="loading" error={null} />);
    expect(badge()).toHaveTextContent(/loading/i);
  });

  it('says it is ready', () => {
    render(<EngineStatus status="ready" error={null} />);
    expect(badge()).toHaveTextContent(/ready/i);
  });

  it('says it is thinking, and marks itself busy so a screen reader waits', () => {
    render(<EngineStatus status="thinking" error={null} />);
    expect(badge()).toHaveTextContent(/thinking/i);
    expect(badge()).toHaveAttribute('aria-busy', 'true');
  });

  it('is not busy in any other state', () => {
    for (const status of ['idle', 'loading', 'ready', 'error'] as const) {
      const { unmount } = render(<EngineStatus status={status} error={null} />);
      expect(badge(), status).not.toHaveAttribute('aria-busy');
      unmount();
    }
  });

  it('tells a learner that local play still works when the engine is gone', () => {
    // The spec's promise: a dead engine disables the computer opponent, not the app.
    render(<EngineStatus status="error" error={new Error('worker died')} />);
    expect(badge()).toHaveTextContent(/locally/i);
    expect(badge()).toHaveTextContent(/unavailable/i);
  });

  it('shows the engine\'s own reason, not only the generic sentence', () => {
    // "Engine unavailable" alone costs a learner an afternoon; the client already
    // knows the failure code and the detail is what makes a bug report actionable.
    render(<EngineStatus status="error" error={new Error('Search timed out after 11000ms')} />);
    expect(badge()).toHaveTextContent('Search timed out after 11000ms');
  });

  it('survives an error state with no error to show', () => {
    // A status and an error are separate props, so they can disagree: the hook
    // reports the state and the client may already have cleared the cause.
    render(<EngineStatus status="error" error={null} />);
    expect(badge()).toHaveTextContent(/unavailable/i);
    expect(badge().textContent).not.toMatch(/null|undefined/);
  });

  it('shows no error detail in any other state, even if handed one', () => {
    for (const status of ['idle', 'loading', 'ready', 'thinking'] as const) {
      const { unmount } = render(<EngineStatus status={status} error={new Error('stale cause')} />);
      expect(badge(), status).not.toHaveTextContent('stale cause');
      unmount();
    }
  });

  it('announces politely and never takes focus', () => {
    render(<EngineStatus status="thinking" error={null} />);
    expect(badge()).toHaveAttribute('aria-live', 'polite');
    expect(badge()).not.toHaveAttribute('tabindex');
  });
});
