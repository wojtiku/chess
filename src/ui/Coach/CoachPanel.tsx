import { useCallback, useState } from 'react';
import { PROVIDERS, clearProvider, loadProvider, maskKey, saveProvider, type ProviderId } from './providerKey';
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
  // Read on MOUNT, not on write. The panel unmounts whenever the mode changes,
  // so a value held only in component state was lost every time the learner
  // looked at the board and came back — which is the bug this fixes: the key was
  // written to storage and never read back out of it.
  const [saved, setSaved] = useState(() => loadProvider());
  const [provider, setProvider] = useState<ProviderId>('gemini');
  const [notice, setNotice] = useState<string | null>(null);

  const save = useCallback(() => {
    const stored = saveProvider(key, provider);
    if (stored === null) {
      // A failed write must not read as a saved key. Storage can be unavailable
      // — private browsing, a full quota — and the learner would otherwise find
      // out at the first call instead of here, where it is fixable.
      setNotice('This browser would not store the key. Check that site data is allowed, then try again.');
      return;
    }
    setNotice(null);
    setSaved(stored);
    setKey('');
  }, [key, provider]);

  const forget = useCallback(() => {
    clearProvider();
    setSaved(null);
  }, []);

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
            <li>
              Any script on this page could read it while the page is open — that is how browser
              storage works, and this app cannot seal it.
            </li>
          </ul>

          <label className="coach-key-label" htmlFor="coach-provider">
            Provider
          </label>
          <select
            id="coach-provider"
            data-testid="coach-provider"
            value={provider}
            onChange={(e) => setProvider(e.target.value as ProviderId)}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <p className="coach-provider-help">{PROVIDERS.find((p) => p.id === provider)?.help}</p>

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
          {notice !== null && (
            <p className="coach-notice" data-testid="coach-notice" role="alert">
              {notice}
            </p>
          )}
          <button
            type="button"
            data-testid="coach-key-save"
            onClick={save}
            disabled={key.trim().length === 0}
          >
            Save key
          </button>
        </div>
      ) : (
        <div className="coach-saved" data-testid="coach-saved">
          <p>
            A key is saved on this device
            {' '}
            <span data-testid="coach-key-masked">
              ({maskKey(saved.key)}, {PROVIDERS.find((p) => p.id === saved.provider)?.label ?? saved.provider})
            </span>
            . The coach is not wired to a provider yet, so there is nothing to ask it.
          </p>
          <button type="button" data-testid="coach-key-clear" onClick={forget}>
            Remove key
          </button>
        </div>
      )}
    </div>
  );
}
