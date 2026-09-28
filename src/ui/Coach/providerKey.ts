// The provider key, stored locally.
//
// The learner supplies their own key. It never leaves the browser: not to this
// app, and not to the cache server. That is the settled decision, and it has
// consequences worth writing down rather than leaving to a comment —
//
//   1. There is no server-side fallback. No key means no coaching. The Fact pack
//      is not a phrasing system and pretending otherwise would be building one.
//   2. The disclosure is shown on the panel, not in a dialog that can be
//      dismissed, because the position includes the mistakes the learner is
//      about to ask about.
//   3. `localStorage` is readable by any script on this origin. That is a
//      property of the platform, not something this app can fix, so the honest
//      thing is to say it rather than to imply the key is sealed. A browser
//      extension or an XSS bug on the origin can read it either way.
//
// The key is stored as a plain string under a versioned key, matching the
// convention the game and the learner record already use.

export const PROVIDER_KEY = 'chess.coach.provider';

export interface StoredProvider {
  key: string;
  /** When it was stored. Shown in the panel so a stale key is diagnosable. */
  savedAt: number;
  /**
   * Which provider the key belongs to. Recorded because the app cannot guess it:
   * a key that is valid for one provider is rejected by another, and the error
   * for that is indistinguishable from a wrong key unless we know which was
   * meant. `gemini` is the first and currently only one.
   */
  provider: ProviderId;
}

export type ProviderId = 'gemini';

export const PROVIDERS: ReadonlyArray<{ id: ProviderId; label: string; help: string }> = [
  {
    id: 'gemini',
    label: 'Google AI (Gemini)',
    help: 'Create a key at Google AI Studio.',
  },
];

/**
 * Read the stored key, or null.
 *
 * Returns null for anything it cannot make sense of rather than throwing: a
 * corrupt entry must not stop the app from starting, and a half-read key is
 * worse than none — it would be sent to a provider and rejected with an error
 * that looks like a wrong key. The `savedAt` shape is checked as well as the
 * fields, because an old or hand-edited value is the common case here and a
 * half-written key is indistinguishable from a bad one.
 */
export function loadProvider(): StoredProvider | null {
  let raw: string | null;
  try {
    raw = localStorage.getItem(PROVIDER_KEY);
  } catch {
    // Private browsing, a disabled storage API, or a full quota. The app works
    // without it — the learner is simply asked again next time.
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) return null;
    const p = parsed as Partial<StoredProvider>;
    if (typeof p.key !== 'string' || p.key.length === 0) return null;
    if (typeof p.savedAt !== 'number') return null;
    const id = typeof p.provider === 'string' ? p.provider : 'gemini';
    if (!PROVIDERS.some((x) => x.id === id)) return null;
    return { key: p.key, savedAt: p.savedAt, provider: id as ProviderId };
  } catch {
    return null;
  }
}

export function saveProvider(key: string, provider: ProviderId = 'gemini'): StoredProvider | null {
  const trimmed = key.trim();
  if (trimmed.length === 0) return null;
  const stored: StoredProvider = { key: trimmed, savedAt: Date.now(), provider };
  try {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify(stored));
  } catch {
    // A failed write must not be reported as a saved key: the panel would then
    // show "a key is saved" for a key that is not there, and the learner would
    // only find out when a call failed.
    return null;
  }
  return stored;
}

export function clearProvider(): void {
  try {
    localStorage.removeItem(PROVIDER_KEY);
  } catch {
    // Nothing to do: if it cannot be removed, it also cannot be read back by
    // this app, and the panel reports the failure to the learner anyway.
  }
}

/**
 * A display form of a key, for showing that one is stored without showing it.
 *
 * The last four characters only. A Google AI key is long enough that a prefix
 * would identify it, and a suffix is enough for a learner to tell two keys
 * apart when they are deciding which to remove.
 */
export function maskKey(key: string): string {
  if (key.length <= 4) return '••••';
  return `••••${key.slice(-4)}`;
}
