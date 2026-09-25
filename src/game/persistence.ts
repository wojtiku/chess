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

import { newGame, tryApplyMove } from '../chess/rules';
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
    theme: isTheme(source.theme) ? source.theme : DEFAULT_SETTINGS.theme,
    hintMode: isHintMode(source.hintMode) ? source.hintMode : DEFAULT_SETTINGS.hintMode,
  };
}

/** The settings to use, whatever is in storage. Never throws. */
export function loadSettings(): Settings {
  const stored = safeParse(safeGet(SETTINGS_KEY));
  if (!stored) return { ...DEFAULT_SETTINGS };
  return settingsFrom(stored);
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
 * Whether the whole list can be played from the starting position.
 *
 * This is the only real check on a stored game. Type-checking each move (see
 * `isStoredMove`) is not enough: `{from: 'e2', to: 'e5'}` is a perfectly
 * well-typed move that no game can contain, and Task 5's `replay` throws on it
 * — `gameAt` is on the way to rendering, so that throw would be a blank app.
 *
 * The move built here is byte-for-byte the one Task 10's `hydrate` builds from
 * the same stored record, so what is validated and what is played cannot drift
 * apart.
 */
function movesArePlayable(moves: readonly StoredMove[]): boolean {
  const game = newGame();
  for (const move of moves) {
    // `tryApplyMove` never throws: it rejects a move that is illegal in this
    // position *and* one played for the side that is not to move, because
    // chess.js only matches against moves generated for the side to move.
    const applied = tryApplyMove(game, {
      from: move.from,
      to: move.to,
      promotion: move.promotion,
      san: '',
    });
    if (!applied) return false;
  }
  return true;
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
 * over, so a list that ends exactly at a mate or a threefold repetition is
 * restored with its history intact, while a list that carries a move past a
 * finished game is discarded.
 */
export function loadGame(): StoredGame | null {
  const stored = safeParse(safeGet(GAME_KEY));
  const moves = stored?.moves;
  if (!Array.isArray(moves)) return null;
  // Re-widened on purpose: `Array.isArray` narrows to `any[]`, and stopping
  // that `any` from escaping is the entire job of the next two lines.
  const candidates: readonly unknown[] = moves;
  if (!candidates.every(isStoredMove)) return null;
  if (!movesArePlayable(candidates)) return null;
  return { moves: [...candidates] };
}

/** Stores a move list. Validation belongs on the read path, not here. */
export function saveGame(moves: readonly StoredMove[]): void {
  safeSet(GAME_KEY, JSON.stringify({ moves }));
}

/** Forgets the stored game, and only the stored game. */
export function clearGame(): void {
  safeRemove(GAME_KEY);
}
