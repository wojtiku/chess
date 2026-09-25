// The type is imported under a different name from the component on purpose.
// `EngineStatus` is the name of the React component AND of the union exported by
// `engine/engineClient.ts`; a local `type EngineStatus` in this file would shadow
// nothing useful and would make every reader check which one a given line means.
// Aliased on import instead: the union is `EngineState` everywhere below, and
// `EngineStatus` is unambiguously the component.
import type { EngineStatus as EngineState } from '../../engine/engineClient';
import './EngineStatus.css';

export interface EngineStatusProps {
  /** The engine's lifecycle state, exactly as `EngineClient.status` reports it. */
  status: EngineState;
  /** The cause, when there is one. `EngineClient.error` is an `EngineError`, which
   *  is an `Error`, so the narrower type is assignable without a cast. */
  error: Error | null;
}

/** Keyed by the union, so a sixth state is a compile error rather than a blank
 *  badge — and every one of the five reads differently, because "the computer is
 *  thinking" and "the computer has died" call for different amounts of patience. */
const LABEL: Readonly<Record<EngineState, string>> = {
  idle: 'Engine not loaded',
  loading: 'Loading engine…',
  ready: 'Engine ready',
  thinking: 'Engine is thinking…',
  error: 'Engine unavailable',
};

export default function EngineStatus({ status, error }: EngineStatusProps) {
  const failed = status === 'error';
  return (
    <div
      className={`engine-status engine-status--${status}`}
      data-status={status}
      role="status"
      aria-live="polite"
      // Only while a search is running: this badge changes on its own, and a screen
      // reader should wait rather than interrupt whatever the learner is reading.
      aria-busy={status === 'thinking' || undefined}
    >
      <span>{LABEL[status]}</span>
      {failed && (
        <>
          <p className="engine-status-detail">
            Playing locally against yourself — hints and the evaluation bar are unavailable.
          </p>
          {/* The generic sentence above says what still works; this says what broke,
              which is the difference between a learner who waits and one who
              reports a bug. Rendered only in the error state, so a stale cause can
              never be shown next to a healthy badge. */}
          {error !== null && <p className="engine-status-detail">{error.message}</p>}
        </>
      )}
    </div>
  );
}
