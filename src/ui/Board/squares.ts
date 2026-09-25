// Board geometry, with no opinion about the position. `Board` reads pieces from the
// `Chess` instance it is handed; this module only answers "which square is where on
// screen", which is the same answer whether the position is the start or a rook
// endgame.

export const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'] as const;
export const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'] as const;

/** Which way up the board is drawn. `'w'` is the ordinary view from White's side. */
export type Orientation = 'w' | 'b';

const SQUARE_PATTERN = /^[a-h][1-8]$/;

/** The four keys that move focus between squares. */
export type ArrowKey = 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';

export function isSquare(square: string): boolean {
  return SQUARE_PATTERN.test(square);
}

/** 0..7, or -1 for anything that is not a file. */
function fileIndex(square: string): number {
  return square.charCodeAt(0) - 97;
}

/** 1..8, or NaN for anything that is not a rank. */
function rankNumber(square: string): number {
  return Number(square[1]);
}

/**
 * a1 is light. That is the lichess convention, and it is the one this app's
 * colours are written for; the important part is that it is a *choice*, and that
 * it is applied consistently: e4 is therefore dark, because a1 light and e4 are
 * an odd number of steps apart (4 files, 3 ranks) and every step flips colour.
 */
export function squareColor(square: string): 'light' | 'dark' {
  return (fileIndex(square) + rankNumber(square)) % 2 === 0 ? 'dark' : 'light';
}

export interface DisplaySquare {
  square: string;
  /**
   * Always null. Kept because it is part of this module's published shape, but the
   * position is deliberately not read here: a square list that carried pieces
   * would have to be rebuilt on every move, and `Board` gets the position from
   * the `Chess` instance anyway.
   */
  piece: string | null;
  light: boolean;
}

/** All 64 squares in render order: top-left first for the given orientation. */
export function displaySquares(orientation: Orientation): DisplaySquare[] {
  const files = orientation === 'w' ? FILES : [...FILES].reverse();
  const ranks = orientation === 'w' ? RANKS : [...RANKS].reverse();
  const out: DisplaySquare[] = [];
  for (const rank of ranks) {
    for (const file of files) {
      const square = `${file}${rank}`;
      out.push({ square, piece: null, light: squareColor(square) === 'light' });
    }
  }
  return out;
}

/**
 * The square one arrow-key press away, in the direction the player pressed, or null
 * at the edge of the board.
 *
 * This is computed from the square's own coordinates rather than from a position
 * in the render order, because a single index arithmetic gets both the flip and
 * the edge case wrong: `+1` in render order is a step right on a White board and
 * a step *left* on a Black one, and it silently wraps onto the next rank at the
 * h-file. The direction is always what the player sees: `ArrowDown` moves down
 * the screen whichever way the board is facing.
 */
export function stepSquare(square: string, key: ArrowKey, orientation: Orientation): string | null {
  if (!isSquare(square)) return null;
  const file = fileIndex(square);
  const rank = rankNumber(square);
  // On a Black board the file letters and the rank numbers both run the other
  // way, so "forwards" inverts along with the picture.
  const towardsH = orientation === 'w' ? 1 : -1;
  const towards8 = orientation === 'w' ? 1 : -1;

  let fileDelta = 0;
  let rankDelta = 0;
  if (key === 'ArrowRight') fileDelta = towardsH;
  else if (key === 'ArrowLeft') fileDelta = -towardsH;
  else if (key === 'ArrowUp') rankDelta = towards8;
  else rankDelta = -towards8;

  const nextFile = file + fileDelta;
  const nextRank = rank + rankDelta;
  if (nextFile < 0 || nextFile > 7 || nextRank < 1 || nextRank > 8) return null;
  return `${FILES[nextFile] ?? ''}${nextRank}`;
}
