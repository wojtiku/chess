import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame, legalMovesVerbose, statusOf, tryApplyMove, uciToMove, type Chess } from '../chess/rules';
import type { GameStatus } from '../chess/types';
import { gameAt, initialState, isGameOver, reduce, type GameSnapshot } from './gameState';
import { DEFAULT_SETTINGS } from './difficulty';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings, type StoredMove } from './persistence';

// The key strings are written out here rather than imported, on purpose: a test
// that reads the key from the module under test cannot catch a renamed key,
// and `chess.settings.v1` / `chess.game.v1` are a published contract — the
// plan's Task 10 E2E specs and Task 11's both hardcode them.
const SETTINGS_KEY = 'chess.settings.v1';
const GAME_KEY = 'chess.game.v1';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Writes a raw value under the game key, bypassing `saveGame`. */
function storeGame(raw: string): void {
  localStorage.setItem(GAME_KEY, raw);
}

/** Writes a raw value under the settings key, bypassing `saveSettings`. */
function storeSettings(raw: string): void {
  localStorage.setItem(SETTINGS_KEY, raw);
}

/** The moves of a UCI line, as `saveGame` would receive them from the reducer. */
function fromUci(...ucis: string[]): StoredMove[] {
  return ucis.map((uci) => ({
    from: uci.slice(0, 2),
    to: uci.slice(2, 4),
    ...(uci[4] ? { promotion: uci[4] as StoredMove['promotion'] } : {}),
  }));
}

/** Task 10's `hydrate`, in the shape the review requires.
 *
 * Two things it must do that the plan's sketch does not:
 *  - apply a stored resignation, or a resigned game comes back `playing` and
 *    the opponent-reply effect takes another move in a game already given up;
 *  - apply it *even when the move list is empty*, because resigning on move
 *    zero is legal. The plan's `if (stored.moves.length === 0) return
 *    initialState()` would drop exactly that resignation.
 */
function hydrate(stored: ReturnType<typeof loadGame>): GameSnapshot {
  if (!stored) return initialState();
  const played = stored.moves.reduce(
    (s, m) => reduce(s, { type: 'play', move: { from: m.from, to: m.to, promotion: m.promotion, san: '' } }),
    initialState(),
  );
  return stored.resignedBy === undefined ? played : reduce(played, { type: 'resign' });
}

/** `statusOf` after replaying a UCI line, in O(n) rather than the reducer's
 *  O(n^2). For asserting what a 100-ply *fixture* is — never what the module
 *  under test does, which is what `hydrate` and `loadGame` are for. */
function statusAfter(...ucis: string[]): GameStatus {
  const game: Chess = newGame();
  for (const uci of ucis) {
    if (!tryApplyMove(game, uciToMove(uci))) break;
  }
  return statusOf(game);
}

/** The four FEN fields chess.js compares for a repetition. The halfmove clock
 *  and the move number are not among them, which is what a "has this position
 *  happened before" test has to key on. */
const repetitionKey = (game: Chess): string => game.fen().split(' ').slice(0, 4).join(' ');

/** A legal game from the start position in which no pawn moves, nothing is
 *  captured, and no position ever occurs twice — the only way to drive the
 *  halfmove clock to 100 and reach the fifty-move draw, since any pawn move or
 *  capture resets the clock and any repeat draws first.
 *
 * Greedily generated, at each ply taking the first non-pawn non-capturing move
 * whose result is a position not seen before, rather than transcribed. The
 * alternative was tried first: a hand-transcribed 25-pair table, which was wrong
 * in one pair and produced a game that ended in a *threefold* at ply 14 — a
 * fixture that fails for a reason no assertion names. This one is derived, and
 * the test below states what it must be so a broken generator is loud.
 *
 * Costs ~55ms, computed once per file and cached, because it is deterministic.
 */
function buildFiftyMoveTour(plies: number): string[] {
  const game = newGame();
  const seen = new Set<string>([repetitionKey(game)]);
  const out: string[] = [];
  for (let ply = 0; ply < plies; ply++) {
    const candidates = legalMovesVerbose(game)
      .filter((m) => m.piece !== 'p' && m.captured === undefined)
      .map((m) => `${m.from}${m.to}`)
      .sort();
    let chosen: string | null = null;
    for (const uci of candidates) {
      if (!tryApplyMove(game, uciToMove(uci))) continue;
      const key = repetitionKey(game);
      game.undo();
      if (!seen.has(key)) { chosen = uci; break; }
    }
    if (chosen === null) throw new Error(`no fresh quiet move at ply ${ply}`);
    tryApplyMove(game, uciToMove(chosen));
    seen.add(repetitionKey(game));
    out.push(chosen);
  }
  return out;
}

let fiftyMoveTourCache: string[] | null = null;
/** 100 plies reach the draw; the 101st is a legal move the app's rules refuse. */
const fiftyMoveTour = (): string[] => (fiftyMoveTourCache ??= buildFiftyMoveTour(101));

// File-level, not per-`describe`. jsdom gives the whole file one real
// `localStorage`, so a `beforeEach` scoped to a single block would leave every
// other block reading the previous block's leftovers — and a `vi.spyOn` on
// `Storage.prototype` in one block would still be installed in the next. Both
// failures are silent: the tests that need an empty store would pass for the
// wrong reason, and the storage-availability tests would poison the rest of the
// file. (Caught by exactly the two tests written to prove the isolation.)
beforeEach(() => { localStorage.clear(); });
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
const SCHOLARS_MATE = ['e2e4', 'e7e5', 'f1c4', 'b8c6', 'd1h5', 'g8f6', 'h5f7'];
// Twice round the same knight circuit: the start position occurs three times.
const THREEFOLD = ['g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'];

// The brief's twelve cases. Eleven verbatim; `clearGame removes only the game`
// is strengthened, and says why in place.
describe('persistence', () => {
  it('returns defaults when nothing is stored', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadGame()).toBeNull();
  });

  it('round-trips settings', () => {
    // `hintMode` rather than the `theme` this used to save, because there is no
    // theme to save and the test is about the round trip, not about which field
    // happened to change.
    saveSettings({ ...DEFAULT_SETTINGS, skillLevel: 1, hintMode: 'good' });
    expect(loadSettings()).toMatchObject({ skillLevel: 1, hintMode: 'good' });
  });

  it('clamps out-of-range values on read', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, skillLevel: 99, minThinkTimeMs: 99999 }));
    expect(loadSettings()).toMatchObject({ skillLevel: 20, minThinkTimeMs: 3000 });
  });

  it('discards corrupt settings and returns defaults', () => {
    localStorage.setItem(SETTINGS_KEY, '{not json');
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('discards wrong-shaped settings and returns defaults', () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skillLevel: 'eight', orientation: 42 }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores settings stored under a future version key', () => {
    localStorage.setItem('chess.settings.v2', JSON.stringify({ skillLevel: 20 }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  /**
   * There is no theme any more, and the interesting question is what happens to
   * the learners who stored one.
   *
   * The answer has to be "ignored, not rejected". Every other field in this object
   * is validated and falls back when it is unreadable, so a `theme` key failing
   * validation would be the consistent behaviour — and it would be wrong. A
   * consistent-and-wrong outcome here is `loadSettings()` handing back a default
   * object that had somehow been treated as wholly corrupt, which throws away a
   * learner's skill level and think time because of a field the app no longer
   * reads. The stored shape is read field by field, so an unknown key is simply
   * not copied across.
   *
   * This is the whole reason `settingsFrom` is a per-field read rather than a
   * validate-then-accept, and the block below is what keeps it that way.
   */
  describe('a theme stored by an earlier version', () => {
    it('is ignored, and every other stored setting still survives', () => {
      // The real shape a returning learner has: valid settings, plus a key the
      // schema has since dropped.
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({
        skillLevel: 15,
        minThinkTimeMs: 900,
        orientation: 'b',
        theme: 'light',
        hintMode: 'good',
      }));
      expect(loadSettings()).toEqual({
        skillLevel: 15,
        minThinkTimeMs: 900,
        orientation: 'b',
        hintMode: 'good',
      });
    });

    it('is ignored whichever value it holds, including a nonsense one', () => {
      // `theme: 42` used to be the brief's wrong-typed case. It still has to be
      // harmless, and it still must not cost the learner the rest of the object.
      for (const theme of ['light', 'dark', 'solarized', 42, null, { a: 1 }]) {
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ skillLevel: 3, theme }));
        expect(loadSettings(), JSON.stringify(theme)).toEqual({ ...DEFAULT_SETTINGS, skillLevel: 3 });
      }
    });

    it('is not written back out, so a later save does not keep it alive', () => {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light' }));
      const loaded = loadSettings();
      saveSettings(loaded);
      // The point of dropping the key: one round trip and the stale field is gone
      // for good, rather than sitting in storage forever because the loader keeps
      // tolerating it.
      expect(JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}')).not.toHaveProperty('theme');
    });

    it('leaves the operating system alone entirely', () => {
      // There is no longer a `matchMedia` call anywhere in this module, and this
      // is the test that says so rather than leaving it to a reader's memory. A
      // `matchMedia` added back would be a theme decision nobody made, so the
      // stub fails loudly if anything asks.
      const queries: string[] = [];
      Object.defineProperty(window, 'matchMedia', {
        configurable: true,
        writable: true,
        value: (query: string) => {
          queries.push(query);
          return { matches: true, media: query } as never;
        },
      });
      try {
        loadSettings();
        saveSettings(DEFAULT_SETTINGS);
        loadSettings();
        expect(queries).toEqual([]);
      } finally {
        Reflect.deleteProperty(window, 'matchMedia');
      }
    });
  });

  it('round-trips a move list', () => {
    saveGame([{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5', promotion: undefined }], undefined);
    expect(loadGame()?.moves).toHaveLength(2);
  });

  it('discards a corrupt game', () => {
    localStorage.setItem(GAME_KEY, 'garbage');
    expect(loadGame()).toBeNull();
  });

  it('discards a game whose moves are the wrong shape', () => {
    localStorage.setItem(GAME_KEY, JSON.stringify({ moves: [{ from: 1, to: 2 }] }));
    expect(loadGame()).toBeNull();
  });

  it('clearGame removes only the game', () => {
    // The settings stored here are NOT the defaults, and that is the whole
    // test. The brief's version saved `DEFAULT_SETTINGS` and then asserted
    // `loadSettings()` still returned `DEFAULT_SETTINGS` — which is also what
    // a `clearGame` that wiped both keys would return, so it could not fail.
    saveSettings({ ...DEFAULT_SETTINGS, skillLevel: 20, hintMode: 'good' });
    saveGame([{ from: 'e2', to: 'e4' }], undefined);
    clearGame();
    expect(loadGame()).toBeNull();
    expect(localStorage.getItem(SETTINGS_KEY)).not.toBeNull();
    expect(loadSettings()).toMatchObject({ skillLevel: 20, hintMode: 'good' });
  });

  it('degrades to session-only when writing throws (private mode)', () => {
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    // The spy has to be *doing* something, or the two assertions below would
    // pass against a module that never wrote anything at all.
    expect(vi.isMockFunction(Storage.prototype.setItem)).toBe(true);
    expect(() => localStorage.setItem('probe', 'x')).toThrow(/QuotaExceeded/);
    expect(spy).toHaveBeenCalled();
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => saveGame([{ from: 'e2', to: 'e4' }], undefined)).not.toThrow();
    // And the write really was refused, so the guards are what saved this.
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    expect(localStorage.getItem(GAME_KEY)).toBeNull();
  });

  it('degrades to defaults when reading throws', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(vi.isMockFunction(Storage.prototype.getItem)).toBe(true);
    expect(() => localStorage.getItem('probe')).toThrow(/SecurityError/);
    expect(spy).toHaveBeenCalled();
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadGame()).toBeNull();
  });
});

// --- added coverage -------------------------------------------------------

describe('settings: shape of what comes out', () => {
  it('hands out a copy of the defaults, never the shared object', () => {
    // A caller that mutates the settings it was given (a store, a form reset)
    // would otherwise poison the default for the rest of the session, and
    // every later `loadSettings()` would return the mutated values.
    const first = loadSettings();
    expect(first).not.toBe(DEFAULT_SETTINGS);
    first.skillLevel = 1;
    first.hintMode = 'good';
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('has exactly the four documented keys, whatever was stored', () => {
    // Four, not five: `theme` is gone. This assertion is the migration story in one
    // line — an unknown key in storage (including the `theme` an earlier version
    // wrote) produces an object with exactly the documented keys and nothing else,
    // so there is no path by which a dropped field comes back.
    storeSettings(JSON.stringify({ ...DEFAULT_SETTINGS, theme: 'light', hacker: true, __proto__: { hacked: true } }));
    const loaded = loadSettings();
    expect(Object.keys(loaded).sort()).toEqual(
      ['hintMode', 'minThinkTimeMs', 'orientation', 'skillLevel'],
    );
    // A stored `__proto__` key is an own property of the parsed object, so
    // anything that spread the parsed value would carry it into the settings.
    expect(Object.getPrototypeOf(loaded)).toBe(Object.prototype);
    expect(loaded).toEqual(DEFAULT_SETTINGS);
  });

  it('is stable: loading twice gives two equal but distinct objects', () => {
    saveSettings({ ...DEFAULT_SETTINGS, hintMode: 'good' });
    const a = loadSettings();
    const b = loadSettings();
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('saveGame: the resignation argument is required, and that is the point', () => {
  // The review's I2. `resignedBy` was optional, so an unamended one-argument call
  // site compiled clean and silently restored Task 6's Critical: a resignation sets
  // the status without touching `moves`, so a stored game with no `resignedBy`
  // reopens as playable, the banner is gone, and the opponent keeps playing a game
  // the learner has given up.
  //
  // **This is asserted by `tsc`, not by a runtime expectation**, and that is the
  // only way it can be: a runtime test cannot tell a required parameter from an
  // optional one, and a test that merely called `saveGame(moves, undefined)` would
  // pass with the parameter optional — which is the exact shape that hides the
  // regression. `@ts-expect-error` fails the build if the error ever stops
  // happening, so it is a real gate rather than a comment.

  it('refuses a one-argument call at compile time', () => {
    // @ts-expect-error `resignedBy` is required. Omitting it is how a resignation
    // gets dropped from storage, which reopens a resigned game as playable.
    saveGame([]);
    expect(true).toBe(true);
  });

  it('accepts an explicit undefined, and writes no resignedBy', () => {
    // The escape hatch is the *value*, not the arity: an unresigned game passes
    // `undefined` deliberately, and `JSON.stringify` drops the property so the
    // stored bytes are unchanged from before the parameter was made required.
    saveGame([{ from: 'e2', to: 'e4' }], undefined);

    expect(localStorage.getItem(GAME_KEY)).toBe('{"moves":[{"from":"e2","to":"e4"}]}');
    expect(loadGame()).toEqual({ moves: [{ from: 'e2', to: 'e4' }] });
  });

  it('round-trips a resignation through the required argument', () => {
    // The behaviour the signature protects, asserted so the requirement is not
    // satisfied by simply refusing to write the field at all.
    saveGame([{ from: 'e2', to: 'e4' }, { from: 'e7', to: 'e5' }], 'w');

    expect(loadGame()?.resignedBy).toBe('w');
    expect(localStorage.getItem(GAME_KEY)).toContain('"resignedBy":"w"');
  });
});

describe('settings: what is written', () => {
  it('writes the settings object itself under the v1 key', () => {
    // Task 10 asserts on this exact substring in the raw stored string, so the
    // wire format is a contract, not an implementation detail.
    saveSettings({ ...DEFAULT_SETTINGS, skillLevel: 1 });
    const raw = localStorage.getItem(SETTINGS_KEY);
    expect(raw).toContain('"skillLevel":1');
    expect(raw).toBe(
      '{"skillLevel":1,"minThinkTimeMs":500,"orientation":"w","hintMode":"best"}',
    );
  });

  it('never writes a value it would then refuse to read back', () => {
    // The app can only pass a `Settings`, but the object is public and this is
    // the invariant that makes the panel's two views agree after a reload: what
    // is written is what is read, and the read path is the only place that
    // decides what a number means. The raw string is asserted as well as the
    // loaded value, because a reader that clamps on the way in would satisfy
    // the second assertion alone.
    saveSettings({ ...DEFAULT_SETTINGS, skillLevel: 99, minThinkTimeMs: 1234 });
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('"skillLevel":20');
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('"minThinkTimeMs":1200');
    expect(loadSettings()).toMatchObject({ skillLevel: 20, minThinkTimeMs: 1200 });
  });

  it('is not disturbed by a stored copy of the default it wrote', () => {
    saveSettings(DEFAULT_SETTINGS);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(localStorage.getItem(SETTINGS_KEY)).toBe(JSON.stringify(DEFAULT_SETTINGS));
  });
});

describe('settings: recovering corrupt values', () => {
  it('keeps the preferences it recognises when one field is the wrong type', () => {
    // This is the case the plan's "discard the whole object" branch was
    // written for, and it is the reason per-field fallback is the right
    // policy: a learner's dark theme and 800ms think time survive a single
    // bad field, which wholesale discard would throw away for nothing.
    storeSettings(JSON.stringify({ skillLevel: 'eight', minThinkTimeMs: 800, hintMode: 'good' }));
    expect(loadSettings()).toEqual({
      skillLevel: 8,
      minThinkTimeMs: 800,
      orientation: 'w',
      hintMode: 'good',
    });
  });

  it('falls back field by field, so a wholly unrecognisable object is all defaults', () => {
    // Every field present and every field wrong-typed. The plan reached this
    // result through a separate "nothing is recognisable" branch; per-field
    // fallback produces the same object without the branch, because a
    // Settings is always exactly these five fields.
    storeSettings(JSON.stringify({
      skillLevel: 'eight', minThinkTimeMs: 'fast', orientation: 'sideways', hintMode: 'psychic',
    }));
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it.each([
    ['unparseable JSON', '{not json'],
    ['a bare word', 'garbage'],
    ['an empty string', ''],
    ['JSON null', 'null'],
    ['a JSON number', '5'],
    ['a JSON string', '"w"'],
    ['a JSON array', '[]'],
    ['an empty object', '{}'],
    ["the brief's wrong-typed pair", JSON.stringify({ skillLevel: 'eight', orientation: 42 })],
    ['a null field', JSON.stringify({ orientation: null })],
    ['a boolean where a number belongs', JSON.stringify({ skillLevel: true, minThinkTimeMs: false })],
    ['a nested object', JSON.stringify({ skillLevel: { value: 3 } })],
    ['an array of settings', JSON.stringify([DEFAULT_SETTINGS])],
  ])('discards settings that are %s', (_label, raw) => {
    storeSettings(raw);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps the low end and the step as well as the high end', () => {
    storeSettings(JSON.stringify({ ...DEFAULT_SETTINGS, skillLevel: -3, minThinkTimeMs: -100 }));
    expect(loadSettings()).toMatchObject({ skillLevel: 0, minThinkTimeMs: 0 });
  });

  it('rounds a stored think time onto the documented step', () => {
    // A value the 100ms slider could never hold, e.g. written by an older
    // build with a finer step. It must not come back off-step, or the panel
    // renders a value the input refuses.
    storeSettings(JSON.stringify({ ...DEFAULT_SETTINGS, minThinkTimeMs: 1234 }));
    expect(loadSettings()).toMatchObject({ minThinkTimeMs: 1200 });
  });

  it('rejects a value the panel cannot represent, such as a fractional level', () => {
    // `clampSkill` truncates, so this comes back as 7 and the slider can hold
    // it. Pinned because "round" would also be defensible and would silently
    // change which preset is highlighted.
    storeSettings(JSON.stringify({ ...DEFAULT_SETTINGS, skillLevel: 7.4 }));
    expect(loadSettings()).toMatchObject({ skillLevel: 7 });
  });
});

describe('settings: versioned keys', () => {
  it('reads v1 and ignores every other version, including a newer one', () => {
    storeSettings(JSON.stringify({ ...DEFAULT_SETTINGS, skillLevel: 20 }));
    localStorage.setItem('chess.settings.v2', JSON.stringify({ skillLevel: 1 }));
    localStorage.setItem('chess.settings', JSON.stringify({ skillLevel: 1 }));
    localStorage.setItem('chess.game.v1', JSON.stringify({ moves: fromUci('e2e4') }));
    expect(loadSettings()).toMatchObject({ skillLevel: 20 });
  });

  it('ignores a game stored under another version key', () => {
    localStorage.setItem('chess.game.v2', JSON.stringify({ moves: fromUci('e2e4') }));
    localStorage.setItem('chess.game', JSON.stringify({ moves: fromUci('e2e4') }));
    expect(loadGame()).toBeNull();
  });
});

describe('game: what is written', () => {
  it('writes a move list, and never a FEN', () => {
    // The reason a move list is stored at all: a bare FEN carries no history,
    // so the position below cannot be told apart from any other repetition of
    // it, and the threefold counter is lost on the next move.
    saveGame(fromUci('g1f3', 'g8f6', 'f3g1', 'f6g8', 'g1f3', 'g8f6', 'f3g1', 'f6g8'), undefined);
    const raw = localStorage.getItem(GAME_KEY);
    expect(raw).not.toContain('rnbqkbnr');
    expect(raw).toBe(
      '{"moves":[{"from":"g1","to":"f3"},{"from":"g8","to":"f6"},{"from":"f3","to":"g1"},' +
      '{"from":"f6","to":"g8"},{"from":"g1","to":"f3"},{"from":"g8","to":"f6"},' +
      '{"from":"f3","to":"g1"},{"from":"f6","to":"g8"}]}',
    );
    // And the history is genuinely there, which a FEN could not carry.
    expect(hydrate(loadGame()).status).toEqual({ kind: 'threefold' });
  });

  it('drops an undefined promotion instead of writing null', () => {
    // `applyMove` always emits a `promotion` key, possibly undefined, and
    // Task 10 maps it straight through. `JSON.stringify` drops an undefined
    // value; a `?? null` anywhere in the write path would store `null`, which
    // is not a valid promotion and would make `loadGame` discard the learner's
    // entire game on the next reload.
    saveGame([{ from: 'e2', to: 'e4', promotion: undefined }], undefined);
    expect(localStorage.getItem(GAME_KEY)).toBe('{"moves":[{"from":"e2","to":"e4"}]}');
    expect(loadGame()?.moves).toHaveLength(1);
  });

  it('keeps a real promotion', () => {
    saveGame(fromUci('a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4', 'b7c8q'), undefined);
    expect(loadGame()?.moves.at(-1)).toEqual({ from: 'b7', to: 'c8', promotion: 'q' });
    expect(hydrate(loadGame()).moves.at(-1)?.san).toBe('bxc8=Q');
  });

  it('keeps all four promotable pieces, including a knight', () => {
    // Underpromotion is rare but legal, and `promotion` is a four-value union
    // the reader checks by hand. All four, or one of the four is untested.
    const line = ['a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4'];
    for (const piece of ['q', 'r', 'b', 'n'] as const) {
      saveGame(fromUci(...line, `b7c8${piece}`), undefined);
      expect(loadGame()?.moves.at(-1)?.promotion).toBe(piece);
      expect(hydrate(loadGame()).moves.at(-1)?.san).toBe(`bxc8=${piece.toUpperCase()}`);
    }
  });

  it('hands out a fresh array, so a caller cannot write through to storage', () => {
    saveGame(fromUci('e2e4'), undefined);
    const first = loadGame();
    expect(first).not.toBeNull();
    expect(first).not.toBe(loadGame());
    first?.moves.push({ from: 'e7', to: 'e5' });
    expect(loadGame()?.moves).toHaveLength(1);
  });

  it('does not hold on to the caller\'s array', () => {
    const moves = fromUci('e2e4');
    saveGame(moves, undefined);
    moves.push({ from: 'e7', to: 'e5' });
    expect(loadGame()?.moves).toHaveLength(1);
  });

  it('writes an empty list as an empty list', () => {
    saveGame([], undefined);
    expect(loadGame()?.moves).toEqual([]);
    // Task 10 calls `clearGame()` instead when there are no moves, so this is
    // belt and braces; the contract is that it is not the same as "nothing
    // stored", which is `null`.
    expect(loadGame()).not.toBeNull();
  });
});

describe('game: every move type survives the round trip', () => {
  it('castling', () => {
    saveGame(fromUci('e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'), undefined);
    expect(hydrate(loadGame()).moves.at(-1)?.san).toBe('O-O');
  });

  it('en passant', () => {
    saveGame(fromUci('e2e4', 'd7d5', 'e4d5'), undefined);
    expect(hydrate(loadGame()).moves.at(-1)?.san).toBe('exd5');
  });

  it('a promotion that does not name the piece is not a playable move', () => {
    // Without `promotion` the move is illegal, so a stored list cannot rely on
    // the reader inferring it. The *named* half of this is covered above, by
    // `keeps a real promotion` and `keeps all four promotable pieces`; this is
    // the rejected half, and it is rejected as an unplayable move rather than
    // as a wrong-typed field, because `promotion` is simply absent.
    saveGame(fromUci('a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4', 'b7c8'), undefined);
    expect(loadGame()).toBeNull();
  });
});

describe('game: rejecting corrupt storage', () => {
  it.each([
    ['unparseable JSON', 'garbage'],
    ['truncated JSON', '{"moves":[{"from":"e2",'],
    ['JSON null', 'null'],
    ['a JSON number', '5'],
    ['a JSON string', '"e2e4"'],
    ['a bare array of moves', '[{"from":"e2","to":"e4"}]'],
    ['no moves key at all', '{}'],
    ['a bare FEN, which cannot hold a history', JSON.stringify({ fen: START_FEN })],
    ['moves as a UCI string', JSON.stringify({ moves: 'e2e4' })],
    ['moves as a number', JSON.stringify({ moves: 2 })],
    ['moves as an object', JSON.stringify({ moves: { 0: { from: 'e2', to: 'e4' } } })],
    ['a null move', JSON.stringify({ moves: [null] })],
    ['a move that is a string', JSON.stringify({ moves: ['e2e4'] })],
    ['a move that is an array', JSON.stringify({ moves: [['e2', 'e4']] })],
    ['numeric squares', JSON.stringify({ moves: [{ from: 1, to: 2 }] })],
    ['no destination', JSON.stringify({ moves: [{ from: 'e2' }] })],
    ['no origin', JSON.stringify({ moves: [{ to: 'e4' }] })],
    ['a null promotion', JSON.stringify({ moves: [{ from: 'e2', to: 'e4', promotion: null }] })],
    ['a king as a promotion', JSON.stringify({ moves: [{ from: 'e2', to: 'e4', promotion: 'k' }] })],
    ['a numeric promotion', JSON.stringify({ moves: [{ from: 'e2', to: 'e4', promotion: 1 }] })],
  ])('discards a game that is %s', (_label, raw) => {
    storeGame(raw);
    expect(loadGame()).toBeNull();
  });

  it('ignores unknown top-level fields rather than discarding the game', () => {
    // Forward compatibility: a future build may add a field to the same key.
    // Refusing to read a v1 payload that grew a field would lose a game for no
    // reason, which is why the check is on the moves and not on the keys.
    storeGame(JSON.stringify({ moves: fromUci('e2e4', 'e7e5'), note: 'written by a later build' }));
    expect(loadGame()?.moves).toHaveLength(2);
  });

  it('ignores unknown fields inside a move for the same reason', () => {
    storeGame(JSON.stringify({ moves: [{ from: 'e2', to: 'e4', san: 'e4', someFutureField: 1 }] }));
    expect(loadGame()?.moves).toHaveLength(1);
  });
});

describe('game: a move list is rejected in full if any move cannot be played', () => {
  // POLICY: `loadGame` replays the stored list through the rules layer. If a
  // single move cannot be played there, the whole stored game is discarded and
  // the app starts fresh.
  //
  // Not "skip the bad move and keep the rest": a truncated replay yields a
  // position the learner never played, and the app would then have a move list
  // that no longer matches the FEN on screen, with a threefold counter computed
  // from a history that never happened. Starting fresh is boring and honest;
  // starting on a fabricated position is neither.
  it.each([
    ['the only move is an illegal pawn jump', ['e2e5']],
    ['the first move is illegal', ['e2e5', 'e7e5']],
    ['a later move is illegal', ['e2e4', 'e2e5']],
    ['a move is played for the side that is not to move', ['e2e4', 'e7e5', 'e2e4']],
    ['a move is repeated in the same position', ['e2e4', 'e7e5', 'g1f3', 'g1f3']],
    ['a square does not exist', ['zz', 'zz']],
    ['a square is off the board', ['e9', 'e4']],
    ['both squares are empty strings', ['', '']],
    ['a promotion omits the piece', [
      'a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4', 'b7c8',
    ]],
    ['a move needs promotion but names a king', [
      'a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4', 'b7c8k',
    ]],
    ['the list continues past a finished game', [...SCHOLARS_MATE, 'e7e5']],
  ])('discards the game when %s', (_label, ucis) => {
    storeGame(JSON.stringify({ moves: fromUci(...ucis) }));
    expect(loadGame()).toBeNull();
  });

  it('does not return the moves that came before the bad one', () => {
    // The half-applied alternative: `[{e2e4}]`, a board the learner was never
    // shown. Asserted as `null` so that any prefix-returning implementation
    // fails, not just one that returns a truncated replay.
    storeGame(JSON.stringify({ moves: fromUci('e2e4', 'e7e5', 'e2e5') }));
    const loaded = loadGame();
    // `toBeNull` and not a length check on `moves`: the return type admits
    // `null` and an array, and the array case is the defect.
    expect(loaded).toBeNull();
  });

  it('starts the app on an empty board, not on a partial game', () => {
    // The end-to-end consequence, through the real reducer: Task 10's `hydrate`
    // receives `null` and hands `initialState()` to the UI.
    storeGame(JSON.stringify({ moves: fromUci('e2e4', 'e2e5', 'd2d4') }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toEqual([]);
    expect(snapshot.cursor).toBe(0);
    expect(snapshot.status).toEqual({ kind: 'playing', check: false });
    expect(gameAt(snapshot).fen()).toBe(START_FEN);
  });

  it('would really have thrown without the check, so the check is load-bearing', () => {
    // Task 5 left this on purpose: `replay` throws on a bad move inside the
    // list, and `gameAt` is on the way to rendering. So the gate has to be here.
    const handBuilt: GameSnapshot = {
      ...initialState(),
      moves: [{ from: 'e2', to: 'e5', san: '' }],
      cursor: 1,
    };
    expect(() => gameAt(handBuilt)).toThrow();
    // The same move in a stored list never reaches `gameAt` at all.
    storeGame(JSON.stringify({ moves: fromUci('e2e5') }));
    expect(() => gameAt(hydrate(loadGame()))).not.toThrow();
  });

  it('keeps a game that ends exactly where the rules end it', () => {
    // The other half of the policy, and the one that would break if the rule
    // were "reject anything that looks finished" instead of "reject any move
    // that cannot be played".
    storeGame(JSON.stringify({ moves: fromUci(...SCHOLARS_MATE) }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(SCHOLARS_MATE.length);
    expect(snapshot.status).toEqual({ kind: 'checkmate', winner: 'w' });
    expect(isGameOver(snapshot.status)).toBe(true);
  });

  it('keeps a game whose history is what makes it a draw', () => {
    // Threefold is a property of the position *plus* its history, so this is
    // the case a FEN store could not represent at all.
    storeGame(JSON.stringify({ moves: fromUci(...THREEFOLD) }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(THREEFOLD.length);
    expect(snapshot.status).toEqual({ kind: 'threefold' });
  });

  // --- a rule-derived ending is not the same as an unplayable move ---
  //
  // These are the cases the whole-list gate exists for, and the reason it
  // cannot be written as "chess.js refused the move". chess.js has no game-over
  // guard at all: `move()` throws only when the legal-move generator is empty,
  // which is true for checkmate and stalemate and FALSE for the other four
  // endings. So a list that walks past a threefold is, ply by ply, entirely
  // legal as a sequence of positions — and the app's own rules say the game was
  // over three plies earlier.
  //
  // The consequence was measured before the gate was added: `loadGame` accepted
  // `THREEFOLD + b1c3` (9 plies) and `hydrate` then reduced it to 8, because the
  // reducer's `play` guard refuses to extend a finished game. That is the
  // half-applied game this policy exists to prevent, arrived at by a different
  // route and therefore invisible. Verified by execution:
  //
  //   threefold: isGameOver=true, probe b1c3 -> ACCEPTED 'Nc3'
  //   fiftyMove: isGameOver=true, probe d2d4 -> ACCEPTED 'd4'
  //
  // Each test below asserts the cause before the consequence: that the tail
  // move really is playable for the library, and that the prefix really is a
  // finished game. Without both, the test would pass against a gate that
  // rejected the list for the wrong reason.
  it('discards a game that walks past a threefold repetition', () => {
    const tail = 'b1c3';
    // The prefix is a finished game...
    expect(isGameOver(statusAfter(...THREEFOLD))).toBe(true);
    expect(statusAfter(...THREEFOLD)).toEqual({ kind: 'threefold' });
    // ...and the move after it is legal chess, which is the whole problem.
    const extended = newGame();
    for (const uci of THREEFOLD) {
      expect(tryApplyMove(extended, uciToMove(uci))).not.toBeNull();
    }
    expect(tryApplyMove(extended, uciToMove(tail))).not.toBeNull();

    storeGame(JSON.stringify({ moves: fromUci(...THREEFOLD, tail) }));
    expect(loadGame()).toBeNull();
  });

  it('keeps the same game when it stops at the repetition', () => {
    // The other half again: the prefix on its own is a game the learner played.
    storeGame(JSON.stringify({ moves: fromUci(...THREEFOLD) }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(THREEFOLD.length);
    expect(snapshot.status).toEqual({ kind: 'threefold' });
  });

  it('discards a game that walks past a fifty-move draw', () => {
    // The same hole reached by the other rule, and the one that proves the gate
    // consults `isGameOver` rather than the two endings chess.js happens to
    // enforce. Chess.js accepts a move at a saturated halfmove clock, because
    // the position still has legal moves.
    const tour = fiftyMoveTour();
    const atDraw = tour.slice(0, 100);
    const tail = tour[100];
    expect(tail).toBeDefined();
    // The prefix is a fifty-move draw and not a threefold, so the gate has to be
    // reading the clock rather than the history.
    expect(statusAfter(...atDraw)).toEqual({ kind: 'fiftyMove' });
    expect(isGameOver(statusAfter(...atDraw))).toBe(true);
    // And the 101st ply is playable for the library.
    const extended = newGame();
    for (const uci of atDraw) {
      expect(tryApplyMove(extended, uciToMove(uci))).not.toBeNull();
    }
    expect(tryApplyMove(extended, uciToMove(tail ?? ''))).not.toBeNull();

    storeGame(JSON.stringify({ moves: fromUci(...tour) }));
    expect(loadGame()).toBeNull();
  });

  it('keeps a game that ends exactly at the fifty-move draw', () => {
    const atDraw = fiftyMoveTour().slice(0, 100);
    storeGame(JSON.stringify({ moves: fromUci(...atDraw) }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(100);
    expect(snapshot.status).toEqual({ kind: 'fiftyMove' });
  });

  it('covers every ending the status union can name, not just the two chess.js enforces', () => {
    // The gate is only as good as `isGameOver`, and `insufficientMaterial` is
    // the ending with no fixture: reaching K+B against K by legal play from the
    // start position means capturing the other 30 pieces, so no short stored
    // list ends that way. What carries the coverage instead is that the gate asks
    // the predicate rather than testing for a mate, so this test pins the
    // predicate is exhaustive over the union — and the compile-time half below
    // is what stops a seventh `GameStatus` kind being added to `types.ts`
    // without this file noticing, which is Task 5's deferred minor and the one
    // thing that could reopen this hole silently.
    const ENDINGS: ReadonlyArray<readonly [GameStatus, boolean]> = [
      [{ kind: 'checkmate', winner: 'w' }, true],
      [{ kind: 'stalemate' }, true],
      [{ kind: 'threefold' }, true],
      [{ kind: 'fiftyMove' }, true],
      [{ kind: 'insufficientMaterial' }, true],
      [{ kind: 'resigned', winner: 'b' }, true],
      [{ kind: 'playing', check: false }, false],
      [{ kind: 'playing', check: true }, false],
    ];
    for (const [status, over] of ENDINGS) {
      expect(isGameOver(status)).toBe(over);
    }

    const ALL_KINDS = [
      'playing', 'checkmate', 'stalemate', 'threefold', 'fiftyMove',
      'insufficientMaterial', 'resigned',
    ] as const;
    // If the union grows a kind, `Missing` stops being `never`, both aliases
    // become `never`, and these two lines stop compiling.
    type Missing = Exclude<GameStatus['kind'], (typeof ALL_KINDS)[number]>;
    type Extra = Exclude<(typeof ALL_KINDS)[number], GameStatus['kind']>;
    const _allKindsListed: [Missing] extends [never] ? true : never = true;
    const _noExtraKinds: [Extra] extends [never] ? true : never = true;
    expect([_allKindsListed, _noExtraKinds]).toEqual([true, true]);
  });

  it('keeps a game that is still in progress', () => {
    storeGame(JSON.stringify({ moves: fromUci(...THREEFOLD.slice(0, 3)) }));
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(3);
    expect(snapshot.status).toEqual({ kind: 'playing', check: false });
  });

  it('accepts an empty move list, which is not corruption', () => {
    storeGame(JSON.stringify({ moves: [] }));
    expect(loadGame()).toEqual({ moves: [] });
    expect(hydrate(loadGame()).moves).toEqual([]);
  });
});

describe('game: a resignation survives the reload', () => {
  // WHY THIS EXISTS. `resign` sets `status` and `resignedBy` without touching
  // `moves`, so a move list alone cannot express it. On reload the status comes
  // back rule-derived, `gameOver` is false, and the opponent-reply effect — which
  // gates on `gameOver`, `reviewing` and `playerTurn` — takes another move in a
  // game the learner already gave up. So the field is persisted, optionally, so
  // a payload written before it existed still loads.
  //
  // SEMANTICS CHOSEN: a stored `resignedBy` is VALIDATED against the side to
  // move at the end of the replayed list, and the whole game is discarded on
  // disagreement. It is not trusted as written. The reason is that agreement is
  // checkable and the check is already paid for: the gate replays the list to
  // the end, so the side to move is in hand, and `reduce`'s `resign` derives the
  // loser from exactly that value — `const loser = game.turn()`. A stored value
  // that disagrees is therefore provably not something this app wrote, which
  // makes it corrupt data of the same kind as an unplayable move, and this file
  // resolves corruption by discarding rather than by guessing. Guessing here
  // would mean picking a winner for a game from two contradictory facts.
  it('round-trips a resignation', () => {
    // 1.e4, so Black is to move: a Black resignation is the consistent record.
    saveGame(fromUci('e2e4'), 'b');
    expect(localStorage.getItem(GAME_KEY)).toContain('"resignedBy":"b"');
    const loaded = loadGame();
    expect(loaded).toEqual({ moves: fromUci('e2e4'), resignedBy: 'b' });
    // And the end-to-end consequence: the game comes back resigned, so the
    // opponent-reply effect sees `gameOver` and leaves the board alone.
    const snapshot = hydrate(loaded);
    expect(snapshot.moves).toHaveLength(1);
    expect(snapshot.status).toEqual({ kind: 'resigned', winner: 'w' });
    expect(snapshot.resignedBy).toBe('b');
    expect(isGameOver(snapshot.status)).toBe(true);
  });

  it('round-trips a resignation on an empty game', () => {
    // Resigning on move zero is legal, and it is the case the plan's `hydrate`
    // sketch throws away: `if (stored.moves.length === 0) return initialState()`
    // returns before a resignation could be applied.
    saveGame([], 'w');
    expect(loadGame()).toEqual({ moves: [], resignedBy: 'w' });
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toEqual([]);
    expect(snapshot.status).toEqual({ kind: 'resigned', winner: 'b' });
    expect(snapshot.resignedBy).toBe('w');
  });

  it('leaves the payload of an unresigned game exactly as it was', () => {
    // `resignedBy: undefined` must not appear in storage, so the wire format
    // for every game written before this field existed is unchanged.
    saveGame(fromUci('e2e4'), undefined);
    expect(localStorage.getItem(GAME_KEY)).toBe('{"moves":[{"from":"e2","to":"e4"}]}');
    expect(loadGame()).toEqual({ moves: fromUci('e2e4') });
    // `toEqual`, not `toMatchObject`: a `resignedBy: undefined` key riding along
    // would be indistinguishable from a stored resignation at the call site.
    expect(Object.keys(loadGame() ?? {})).toEqual(['moves']);
  });

  it('reads a payload with no resignation key at all', () => {
    storeGame(JSON.stringify({ moves: fromUci('e2e4', 'e7e5') }));
    const loaded = loadGame();
    expect(loaded).toEqual({ moves: fromUci('e2e4', 'e7e5') });
    expect(loaded?.resignedBy).toBeUndefined();
    expect(hydrate(loaded).status).toEqual({ kind: 'playing', check: false });
  });

  it('does not let a resignation change what the move list may contain', () => {
    // The all-or-nothing gate is about the list, and a resignation is a
    // declaration that comes after the last move. Here the learner resigned
    // after being mated, which `reduce` allows, and the list is still valid.
    saveGame(fromUci(...SCHOLARS_MATE), 'b');
    const snapshot = hydrate(loadGame());
    expect(snapshot.moves).toHaveLength(SCHOLARS_MATE.length);
    expect(snapshot.status).toEqual({ kind: 'resigned', winner: 'w' });
  });

  it.each([
    ['the side that resigned is not the side to move', { moves: fromUci('e2e4'), resignedBy: 'w' }],
    ['it disagrees on an empty game', { moves: [], resignedBy: 'b' }],
    ['it is not a side', { moves: fromUci('e2e4'), resignedBy: 'black' }],
    ['it is a number', { moves: fromUci('e2e4'), resignedBy: 1 }],
    ['it is null, which is a value and not an absence', { moves: fromUci('e2e4'), resignedBy: null }],
    ['it is an object', { moves: fromUci('e2e4'), resignedBy: { side: 'b' } }],
    ['and the moves are corrupt too', { moves: fromUci('e2e5'), resignedBy: 'b' }],
  ])('discards a game where %s', (_label, payload) => {
    storeGame(JSON.stringify(payload));
    expect(loadGame()).toBeNull();
    // The corruption is not partial either: nothing survives, so the app cannot
    // show the moves and merely lose the banner.
    expect(hydrate(loadGame()).moves).toEqual([]);
  });

  it('validates against the side to move, not against the side that moved last', () => {
    // The distinction that makes the rule a rule: after 1.e4 it is Black to
    // move, so `b` is right and `w` is wrong even though White moved last.
    storeGame(JSON.stringify({ moves: fromUci('e2e4'), resignedBy: 'b' }));
    expect(loadGame()?.resignedBy).toBe('b');
    storeGame(JSON.stringify({ moves: fromUci('e2e4'), resignedBy: 'w' }));
    expect(loadGame()).toBeNull();
  });
});

describe('when storage itself is unavailable', () => {
  it('tolerates no localStorage at all', () => {
    // `localStorage` does not exist in Node, and reading a global that is not
    // defined throws before any `try` inside a helper could help — so the
    // access itself has to be inside the guard, not just the call.
    vi.stubGlobal('localStorage', undefined);
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(loadGame()).toBeNull();
    expect(() => saveSettings(DEFAULT_SETTINGS)).not.toThrow();
    expect(() => saveGame(fromUci('e2e4'), undefined)).not.toThrow();
    expect(() => clearGame()).not.toThrow();
  });

  it('degrades to session-only when removing throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearGame()).not.toThrow();
  });

  it('really is restored afterwards: a normal write and read still work', () => {
    // The `afterEach` above is what makes the throwing-storage tests
    // independent. On its own this test cannot tell "restored" from "never
    // applied" — which is why the two tests above each assert that their spy
    // *is* live before relying on it. Together: a spy that demonstrably takes
    // effect, and a later test with no spy at all, so the only way both hold is
    // if the hook cleaned up.
    expect(vi.isMockFunction(localStorage.setItem)).toBe(false);
    expect(vi.isMockFunction(localStorage.getItem)).toBe(false);
    localStorage.setItem('probe', 'x');
    expect(localStorage.getItem('probe')).toBe('x');
    saveSettings({ ...DEFAULT_SETTINGS, skillLevel: 13 });
    expect(localStorage.getItem(SETTINGS_KEY)).toContain('"skillLevel":13');
    expect(loadSettings()).toMatchObject({ skillLevel: 13 });
  });
});
