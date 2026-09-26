// Everything that survives a page reload, and everything that has to survive
// storage being wrong.
//
// Two rules govern this file:
//
//  1. **A read never throws and never returns a half-truth.** `localStorage`
//     can be absent (Node, some embedded webviews), can throw (Safari private
//     mode, a `SecurityError` from a blocked third-party context), and can hold
//     anything at all: truncated JSON, a payload from a different build, a
//     hand-edited board. Every one of those cases ends in "the app starts
//     fresh", which is the only outcome that cannot be wrong in a way the
//     learner would blame the app for.
//
//  2. **The game is stored as a move list, never a FEN.** A FEN is a position;
//     threefold repetition and the fifty-move counter are properties of a
//     position *plus its history*, so a FEN store silently dissolves a draw on
//     the move after the reload.
//
// Reads validate. Writes normalise (settings) and otherwise store what they are
// given, because the only writer is the reducer, whose moves are legal by
// construction. There is no version field in either payload: the version is in
// the key, `chess.settings.v1` / `chess.game.v1`, so a future build reads a new
// key and an old one is left where it is rather than guessed at.

import { newGame, statusOf, tryApplyMove, type Chess } from '../chess/rules';
import type { Side } from '../chess/types';
import { isGameOver } from './gameState';
import { DEFAULT_SETTINGS, clampMinThink, clampSkill, type Settings } from './difficulty';
import type { HintMode, ThemeName } from './difficulty-types';

// Deliberately not exported: the test file spells both keys out, so a renamed
// key cannot be satisfied by a renamed constant.
const SETTINGS_KEY = 'chess.settings.v1';
const GAME_KEY = 'chess.game.v1';

/** One stored move: the smallest record that can be replayed. No SAN, no FEN. */
export interface StoredMove {
  from: string;
  to: string;
  /** Omitted for everything but a promotion, which cannot be inferred. */
  promotion?: 'q' | 'r' | 'b' | 'n';
}

export interface StoredGame {
  moves: StoredMove[];
  /** The side that resigned, or absent if the game is still being played.
   *
   * A move list cannot express a resignation — `resign` sets the status without
   * touching `moves` — so without this field a resigned game reopens on reload
   * as rule-derived `playing`, the result banner is gone, and the
   * opponent-reply effect takes another move in a game the learner has already
   * given up. Optional, so a payload written before it existed still loads and
   * the wire format of an unresigned game is byte-for-byte unchanged. */
  resignedBy?: Side;
}

// The `localStorage` access is inside the guard, not just the method call: in an
// environment with no `localStorage` global at all, evaluating the identifier
// throws, and that has to be swallowed too.
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    // No storage, or storage refused to be read: behave as if nothing is there.
    return null;
  }
}

/** A failed write degrades to session-only play. It must not break the game. */
function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Quota exceeded, or storage blocked. The app keeps working; it just
    // forgets. Nothing here is worth failing a move over.
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    // As with a failed write: a game that cannot be cleared is a stale game on
    // the next load, which the read path below treats as a normal stored game.
  }
}

/** JSON that is an object we can read fields off. Arrays are not records. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Parses, or reports that there is nothing usable under `key`. */
function safeParse(raw: string | null): Record<string, unknown> | null {
  if (raw === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  return isRecord(parsed) ? parsed : null;
}

function isTheme(value: unknown): value is ThemeName {
  return value === 'light' || value === 'dark';
}

function isHintMode(value: unknown): value is HintMode {
  return value === 'best' || value === 'good';
}

function isOrientation(value: unknown): value is Settings['orientation'] {
  return value === 'w' || value === 'b';
}

/**
 * The theme a first-time visitor gets: whatever their operating system asks for.
 *
 * `DEFAULT_SETTINGS.theme` is `'light'` and stays that way, because it is a
 * constant used by five fallback paths and by the tests that pin the stored
 * format; a `matchMedia` call in it would make the constant wrong on a learner's
 * machine. So the question is asked here instead, at the one point where "there is
 * no stored preference" is actually knowable.
 *
 * Two guards, both because this runs in jsdom and in Node as well as in a
 * browser: `matchMedia` may not exist at all (an old embedded webview, a test
 * environment), and it may throw (a `SecurityError` from a blocked context, the
 * same class of failure `localStorage` gets two functions above). Either way the
 * answer is the constant, which is what the old unconditional `'light'` did.
 */
function prefersDark(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    );
  } catch {
    return false;
  }
}

/** Type check only. Whether the move is *playable* is decided by the replay. */
function isStoredMove(value: unknown): value is StoredMove {
  if (!isRecord(value)) return false;
  if (typeof value.from !== 'string' || typeof value.to !== 'string') return false;
  // `undefined` is what JSON.stringify drops, so a stored move either has no
  // promotion key or has a real one. `null` is a different thing: it is a
  // value somebody wrote, and it is not a promotion.
  if (value.promotion === undefined) return true;
  return value.promotion === 'q' || value.promotion === 'r'
    || value.promotion === 'b' || value.promotion === 'n';
}

/**
 * The one place a stored settings object becomes a `Settings`.
 *
 * Every field is decided on its own, because a single bad value should cost the
 * learner that one preference and not the other four. The plan also described a
 * wholesale "nothing is recognisable, discard everything" branch; it is not
 * here, because it could not change the result: when all five fields are
 * present and all five are wrong-typed, this function already returns
 * `DEFAULT_SETTINGS` field for field. An unreachable branch that returns the
 * value the code below it returns anyway is a second, worse way to say the same
 * thing, and it would break the moment a sixth field is added.
 *
 * The result is built as a literal rather than spread from the input, so an
 * unknown key in storage cannot ride along into the app's settings.
 */
function settingsFrom(source: Record<string, unknown>): Settings {
  return {
    skillLevel: typeof source.skillLevel === 'number'
      ? clampSkill(source.skillLevel)
      : DEFAULT_SETTINGS.skillLevel,
    minThinkTimeMs: typeof source.minThinkTimeMs === 'number'
      ? clampMinThink(source.minThinkTimeMs)
      : DEFAULT_SETTINGS.minThinkTimeMs,
    orientation: isOrientation(source.orientation)
      ? source.orientation
      : DEFAULT_SETTINGS.orientation,
    // A recognisable stored theme is the learner's choice and wins; anything else
    // is the absence of one, which is the only time the OS gets a vote.
    theme: isTheme(source.theme)
      ? source.theme
      : prefersDark() ? 'dark' : DEFAULT_SETTINGS.theme,
    hintMode: isHintMode(source.hintMode) ? source.hintMode : DEFAULT_SETTINGS.hintMode,
  };
}

/** The settings to use, whatever is in storage. Never throws.
 *
 * An empty store is NOT a shortcut around `settingsFrom`: this function used to
 * `return { ...DEFAULT_SETTINGS }` directly when there was nothing stored, which
 * looked equivalent and was not — it meant the first-visit theme never reached a
 * first-time visitor, because the first-visit theme is precisely the case where
 * nothing is stored. `settingsFrom({})` returns the same five fields as
 * `DEFAULT_SETTINGS` and asks the OS about the sixth. The early return is gone so
 * that a first-time visitor and a visitor whose only stored setting is corrupt
 * cannot end up with a different theme. */
export function loadSettings(): Settings {
  return settingsFrom(safeParse(safeGet(SETTINGS_KEY)) ?? {});
}

/**
 * Writes settings through the same normalisation a read applies, so a value
 * this app can never display is never written. `saveSettings(loadSettings())`
 * is then a no-op, which is what makes the settings panel's two views (the
 * preset row and the raw slider) agree again after a reload.
 */
export function saveSettings(settings: Settings): void {
  // Spread into a fresh record because `Settings` is an interface, and an
  // interface has no implicit index signature to hand to `settingsFrom`.
  safeSet(SETTINGS_KEY, JSON.stringify(settingsFrom({ ...settings })));
}

/**
 * The position a stored list replays to, or `null` if the list is not a game
 * this app could have played.
 *
 * This is the only real check on a stored game, and it has two halves, because
 * "could not have been played" has two meanings.
 *
 * **The move is not playable here.** Type-checking each move (see
 * `isStoredMove`) is not enough: `{from: 'e2', to: 'e5'}` is a perfectly
 * well-typed move that no game can contain, and Task 5's `replay` throws on it
 * — `gameAt` is on the way to rendering, so that throw would be a blank app.
 * `tryApplyMove` also rejects a move played for the side that is not to move,
 * because chess.js only matches against moves generated for that side.
 *
 * **The game is already over, and the list walks past it.** This half is not
 * optional, and the reason is specific: **chess.js has no game-over guard.**
 * `move()` throws only when the legal-move generator comes back empty. Measured,
 * for each ending that is reachable from the start position in a test-sized
 * game, with a probe move that is legal chess in the position:
 *
 * ```
 * checkmate   isGameOver=true   probe refused    (the generator is empty)
 * threefold   isGameOver=true   probe ACCEPTED   <-- the hole
 * fiftyMove   isGameOver=true   probe ACCEPTED   <-- the hole
 * ```
 *
 * A stalemate behaves like a mate here — no legal moves — so it was never the
 * hole. Insufficient material is the third hole, and neither it nor a
 * stalemate has a cheap fixture from the start position: K+B against K needs 30
 * captures, and a breadth-first search to depth 5 does not reach a stalemate
 * (it ran the heap out first). Those two are covered by asking `isGameOver`
 * rather than testing for a mate, and that predicate is pinned exhaustive over
 * the `GameStatus` union in `persistence.test.ts`, so a seventh kind cannot
 * appear without this gate being revisited.
 *
 * So a list that walks past a draw is, ply by ply, a legal sequence of
 * positions, and without this half it is accepted. The consequence was measured
 * end to end: `THREEFOLD + b1c3` (9 plies) loaded, and `hydrate` then reduced it
 * to 8, because the reducer's `play` guard refuses to extend a finished game and
 * the tail vanished. That is the half-applied game this whole policy exists to
 * prevent, reached by a different route and therefore invisible.
 *
 * So the question asked at the top of each ply is the app's own — "has a game
 * ended here?", which is `isGameOver` and deliberately not the library's — and
 * it is asked by the same predicate the reducer uses to refuse a move, so the
 * reader and the player can never disagree about where a game ends.
 *
 * The move built here is byte-for-byte the one Task 10's `hydrate` builds from
 * the same stored record, so what is validated and what is played cannot drift
 * apart.
 */
function replayStored(moves: readonly StoredMove[]): Chess | null {
  const game = newGame();
  for (const move of moves) {
    if (isGameOver(statusOf(game))) return null;
    const applied = tryApplyMove(game, {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: '',
    });
    if (!applied) return null;
  }
  return game;
}

/**
 * The stored game, or `null` when there is nothing trustworthy to restore.
 *
 * A move list is all-or-nothing. If any move in it cannot be played, the
 * *whole* stored game is discarded and the caller starts a fresh one. The
 * alternative — replay as far as the list allows and keep that prefix — is
 * rejected on purpose: the prefix is a position the learner never played, and
 * it comes with a threefold counter and a halfmove clock computed from a
 * history that never happened. A fresh board is dull and truthful; a fabricated
 * one is neither, and the learner has no way to tell which they are looking at.
 *
 * The rule is about *moves that cannot be played*, not about games that are
 * over, so a list that ends exactly at a mate, a repetition or a fifty-move
 * draw is restored with its history intact, while a list that carries a move
 * past a finished game is discarded.
 *
 * A stored `resignedBy` is validated, not trusted: it must equal the side to
 * move at the end of the replayed list, or the game is discarded. The check is
 * free — the replay is already at the end and its turn is in hand — and
 * `reduce`'s `resign` derives the loser from exactly that value, so a
 * disagreement is provably not something this app wrote. It is corrupt data of
 * the same kind as an unplayable move, and this file resolves corruption by
 * discarding rather than by guessing. Guessing here would mean picking a winner
 * for a game from two contradictory facts.
 */
export function loadGame(): StoredGame | null {
  const stored = safeParse(safeGet(GAME_KEY));
  const moves = stored?.moves;
  if (!Array.isArray(moves)) return null;
  // Re-widened on purpose: `Array.isArray` narrows to `any[]`, and stopping
  // that `any` from escaping is the entire job of the next two lines.
  const candidates: readonly unknown[] = moves;
  if (!candidates.every(isStoredMove)) return null;
  const game = replayStored(candidates);
  if (!game) return null;
  const resignedBy: unknown = stored?.resignedBy;
  // `undefined` is absence, and absence is the common case: a game that was not
  // resigned.
  if (resignedBy === undefined) return { moves: [...candidates] };
  // One comparison, not a type check plus a comparison: the replayed turn is
  // `'w' | 'b'`, so `resignedBy === turn` already rejects every value that is
  // not a side — `'black'`, `1`, `null` and an object all fail it. Checking
  // `isSide` first would be a guard that can never change the answer, and
  // `game.turn()` is returned rather than the stored value so nothing here
  // needs a cast or a narrowing helper.
  const turn = game.turn();
  if (resignedBy !== turn) return null;
  return { moves: [...candidates], resignedBy: turn };
}

/** Stores a move list, and the resignation if the game ended in one.
 *
 * **`resignedBy` is required, and that is the point of the signature.** It was
 * optional, so an unamended one-argument call site compiled clean and silently
 * restored Task 6's Critical: a resignation sets the status without touching
 * `moves`, so a stored game with no `resignedBy` reopens as playable, the banner
 * is gone, and the opponent-reply effect goes on playing a game the learner has
 * already given up. The plan fixed the one call site; nothing stopped the next
 * one. Requiring the argument turns that regression into a type error, which is
 * this project's stated standard — "structural, not test-enforced" — and the
 * optional parameter was the odd one out.
 *
 * **The wire format is unchanged.** The caller passes `undefined` for an
 * unresigned game, `JSON.stringify` drops the property, and the stored bytes are
 * what they always were. The signature is strict about the argument; the file on
 * disk knows nothing about it. Validation of either value belongs on the read
 * path: the only writer is the reducer, whose moves are legal by construction and
 * whose `resignedBy` comes from the side to move.
 */
export function saveGame(moves: readonly StoredMove[], resignedBy: Side | undefined): void {
  safeSet(GAME_KEY, JSON.stringify({ moves, resignedBy }));
}

/** Forgets the stored game, and only the stored game. */
export function clearGame(): void {
  safeRemove(GAME_KEY);
}
