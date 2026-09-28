import { describe, expect, it, beforeEach } from 'vitest';
import {
  PROVIDER_KEY,
  clearProvider,
  loadProvider,
  maskKey,
  saveProvider,
} from './providerKey';

describe('providerKey: the round trip', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reads back what it wrote', () => {
    // The bug this fixes: the panel wrote the key and never read it, so every
    // visit to Coach asked again and the learner pasted the same key twice.
    const saved = saveProvider('AIzaSyTESTKEY1234567890');
    expect(saved).not.toBeNull();
    expect(loadProvider()?.key).toBe('AIzaSyTESTKEY1234567890');
  });

  it('records which provider the key is for', () => {
    // A key valid for one provider is rejected by another, and that error is
    // indistinguishable from a wrong key unless we know which was meant.
    saveProvider('abc123', 'gemini');
    expect(loadProvider()?.provider).toBe('gemini');
  });

  it('records when it was saved', () => {
    const before = Date.now();
    saveProvider('abc123');
    expect(loadProvider()!.savedAt).toBeGreaterThanOrEqual(before);
  });

  it('trims a pasted key, because a stray newline is the common paste accident', () => {
    saveProvider('  abc123\n');
    expect(loadProvider()?.key).toBe('abc123');
  });

  it('refuses to store an empty key', () => {
    expect(saveProvider('   ')).toBeNull();
    expect(loadProvider()).toBeNull();
  });
});

describe('providerKey: nothing readable, nothing crashes', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when there is nothing stored', () => {
    expect(loadProvider()).toBeNull();
  });

  it('returns null for a corrupt entry rather than throwing', () => {
    // A hand-edited or half-written value must not stop the app starting. A
    // half-read key would be sent to a provider and rejected with an error that
    // looks exactly like a wrong key.
    for (const bad of ['not json', '[]', 'null', '"a string"', '{"key":123}', '{}', '{"key":""}']) {
      localStorage.setItem(PROVIDER_KEY, bad);
      expect(loadProvider(), bad).toBeNull();
    }
  });

  it('returns null for a value missing its timestamp', () => {
    localStorage.setItem(PROVIDER_KEY, JSON.stringify({ key: 'abc', provider: 'gemini' }));
    expect(loadProvider()).toBeNull();
  });

  it('returns null for a provider it does not know', () => {
    // Better to ask again than to send a key to an endpoint we cannot reason
    // about.
    localStorage.setItem(
      PROVIDER_KEY,
      JSON.stringify({ key: 'abc', savedAt: 1, provider: 'some-other-service' }),
    );
    expect(loadProvider()).toBeNull();
  });

  it('clears without throwing when there was nothing there', () => {
    expect(() => clearProvider()).not.toThrow();
    expect(loadProvider()).toBeNull();
  });
});

describe('maskKey: show that one is stored without showing it', () => {
  it('keeps only the last four characters', () => {
    // A prefix would identify a Google AI key, which is long enough to be
    // unique. A suffix is enough for a learner to tell two keys apart.
    expect(maskKey('AIzaSyABCDEFGHIJ1234')).toBe('••••1234');
  });

  it('does not leak a short key', () => {
    expect(maskKey('abc')).toBe('••••');
    expect(maskKey('abcd')).toBe('••••');
  });

  it('never shows more than a suffix', () => {
    const masked = maskKey('AIzaSyABCDEFGHIJ1234');
    expect(masked).not.toContain('AIza');
    expect(masked).not.toContain('ABCD');
  });
});
