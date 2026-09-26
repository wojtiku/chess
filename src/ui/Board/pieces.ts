// The one place a piece is named. Everything that draws a piece — the board, the
// captured-pieces panel, the promotion picker — reads its artwork and its spoken
// name from here, so there is no second table to fall out of step with the first.
//
// There WERE three: this module's own glyph lookup, `Captured.tsx`'s copy (so
// that panel "needs nothing but the rules layer"), and `PromotionPicker.tsx`'s
// four hardcoded symbols. Two of those were untested copies of the third, and the
// promotion picker had no test file at all, so a mistake in it would have shipped
// silently. The only reason a lookup may be duplicated is a test that owns its
// own copy of the expected values, which is a different thing.
//
// The pieces themselves are twelve SVGs in `public/pieces/`, vendored and served
// as static assets: see the README there for how they are built. The brief's
// `ComponentType`
// re-export is deliberately NOT here — it was dead weight copied from the plan's
// sketch, and nothing in the app renders a piece as a React component.

import type { PieceType, Side } from '../../chess/types';

/** The shape a caller may hand in. Chess.js's own cell is assignable to it. */
export interface PieceLike {
  type: string;
  color: string;
}

/** The file stem of a piece's SVG: colour letter, capitalised piece letter. */
const KEYS: Readonly<Record<Side, Readonly<Record<PieceType, string>>>> = {
  w: { p: 'wP', n: 'wN', b: 'wB', r: 'wR', q: 'wQ', k: 'wK' },
  b: { p: 'bP', n: 'bN', b: 'bB', r: 'bR', q: 'bQ', k: 'bK' },
};

/** How a piece type is announced on its own, with no colour in front of it. */
const NAMES: Readonly<Record<PieceType, string>> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** Whether `color` is a side this table has artwork for. */
function isSide(value: string): value is Side {
  return value === 'w' || value === 'b';
}

/** Whether `type` is a piece this table has artwork for.
 *
 * `Object.hasOwn`, and the review that found the previous version is why this
 * comment is specific rather than reassuring. The old line was `value in NAMES`,
 * described as "a membership test" — but **`in` walks the prototype chain**, so
 * `'toString' in NAMES` is `true` and the old code answered a piece whose type was
 * the string `"function toString() { [native code] }"`. Neither that nor
 * `'__proto__'` is reachable from chess.js, so it was never a live bug; it is
 * fixed here because it is cheap and because the comment was making a claim the
 * code did not support, which is the self-referential pattern this branch's
 * reviews exist to remove.
 *
 * The cast it replaces: `PieceType` is a compile-time claim about a string the
 * DOM or the library produced at runtime, and a seventh letter has to be a
 * `null` this function can report — not an `undefined` that renders as a broken
 * image or throws on a property read. */
function isPieceType(value: string): value is PieceType {
  return Object.hasOwn(NAMES, value);
}

/** The SVG file stem for a piece — `wQ` — or `null` for one this set has no
 * artwork for. An absent piece is the same answer: `undefined` and `null` both
 * mean an empty square, and both are checked with `== null` rather than
 * `=== undefined` because the callers are a `Map.get` (which returns
 * `undefined`) and a `Record` read (which can hand back `null`), and a
 * property read on `null` is a thrown TypeError rather than a wrong answer. */
export function pieceKey(piece: PieceLike | undefined | null): string | null {
  if (piece == null) return null;
  if (!isSide(piece.color) || !isPieceType(piece.type)) return null;
  return KEYS[piece.color][piece.type];
}

/** The URL of the piece's SVG, or `null` when there is nothing to draw.
 *
 * `null` rather than a broken `src`: a caller that rendered `<img src="">` for an
 * unknown piece would show the browser's missing-image icon in the middle of a
 * square, which is exactly as wrong as a blank one and much harder to miss. */
export function pieceSrc(piece: PieceLike | undefined | null): string | null {
  const key = pieceKey(piece);
  return key === null ? null : `/pieces/${key}.svg`;
}

/**
 * A piece's artwork URL, for a caller that already holds a checked `PieceType`
 * and `Side` — `Captured`'s capture lists and the promotion picker's four
 * options. One source of truth for the path, with none of the narrowing: a typed
 * caller cannot be given a piece this set has no artwork for, so re-deriving the
 * key at runtime would be work whose only outcome is a branch that cannot fail.
 */
export function srcFor(type: PieceType, colour: Side): string {
  return `/pieces/${KEYS[colour][type]}.svg`;
}

/** A piece type's own name: `queen`, not `white queen`. */
export function pieceName(type: PieceType): string {
  return NAMES[type];
}

/**
 * How a piece is announced to a screen reader: `"white pawn"`, `"black king"`.
 *
 * This is half of every square's accessible name, and it is the part that decides
 * whether a board is usable without sight of it, so an unknown piece type falls
 * through to its own symbol rather than to a blank or an exception. Which is also
 * why the artwork is not what names a piece: an `<img>` whose `alt` is the only
 * name would be announcing a filename.
 */
export function pieceLabel(piece: PieceLike): string {
  const colour = isSide(piece.color) ? (piece.color === 'w' ? 'white' : 'black') : 'black';
  return `${colour} ${isPieceType(piece.type) ? NAMES[piece.type] : piece.type}`;
}
