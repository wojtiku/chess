import { useCallback, useState } from 'react';
import './CoachPanel.css';

/**
 * The coach, and the key it needs.
 *
 * The learner supplies their own provider key. It is stored locally and never
 * leaves the browser — not to this app, and not to the cache server. That is the
 * settled decision, and it has a consequence worth stating here rather than in a
 * comment: **no key means no coaching at all.** There is no template fallback,
 * because the Fact pack is not a phrasing system and pretending otherwise would
 * be building one.
 *
 * What the learner is told, before they paste anything:
 *   - the position and its Fact pack are sent to the provider
 *   - calls are billed to their account
 *   - the key is stored on this device only
 *
 * Disclosure is here and not in a dialog they can dismiss, because the position
 * includes the mistakes they are about to ask about.
 */
export default function CoachPanel() {
  const [key, setKey] = useState('');
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = useCallback(() => {
    const trimmed = key.trim();
    if (trimmed.length === 0) return;
    setBusy(true);
    // Synchronous for now: the call layer is the next step, and a key that is
    // accepted and then rejected by the provider would be worse than one that is
    // plainly stored.
    localStorage.setItem('chess.coach.provider', JSON.stringify({ key: trimmed, savedAt: Date.now() }));
    setSaved(trimmed);
    setBusy(false);
  }, [key]);

  return (
    <div className="coach">
      <h2>Ask the coach</h2>
      <p className="coach-lede">
        The coach explains a position in plain words. It never decides anything about chess — every
        fact it mentions is checked by the app first.
      </p>

      {saved === null ? (
        <div className="coach-key" data-testid="coach-key-prompt" role="group" aria-label="Provider key">
          <h3>Before you can use the coach</h3>
          <ul className="coach-disclosure">
            <li>Your position and the facts about it are sent to the provider you choose.</li>
            <li>Calls are billed to your account, and the app measures its own token use.</li>
            <li>
              Your key is stored on this device only. It is never sent to this app, and it never
              leaves your browser.
            </li>
          </ul>
          <label className="coach-key-label" htmlFor="coach-key-input">
            Provider API key
          </label>
          <input
            id="coach-key-input"
            data-testid="coach-key-input"
            type="password"
            autoComplete="off"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Paste your key"
          />
          <button
            type="button"
            data-testid="coach-key-save"
            onClick={save}
            disabled={busy || key.trim().length === 0}
          >
            {busy ? 'Saving…' : 'Save key'}
          </button>
        </div>
      ) : (
        <div className="coach-saved" data-testid="coach-saved">
          <p>
            A key is saved on this device. The coach is not wired to a provider yet, so there is
            nothing to ask it.
          </p>
          <button
            type="button"
            data-testid="coach-key-clear"
            onClick={() => {
              localStorage.removeItem('chess.coach.provider');
              setSaved(null);
              setKey('');
            }}
          >
            Remove key
          </button>
        </div>
      )}
    </div>
  );
}
