import { isSquare, type Orientation } from './squares';

/** One hint arrow. `from` and `to` are squares; the board mirrors them itself. */
export interface BoardArrow {
  from: string;
  to: string;
}

/** The four corners of the 0..100 unit space an arrow overlay is drawn in. */
export const ARROW_HEAD_INSET = 4;

/**
 * The centre of a square in the 0..100 space the arrow overlay is drawn in, so one
 * square is 12.5 units wide and the whole board is 100.
 *
 * `orientation` matters: the overlay sits on top of the grid, so on a flipped board
 * h1 is the top-left square and the coordinates have to be mirrored with it or the
 * hint points at the wrong square.
 */
export function squareCentre(square: string, orientation: Orientation = 'w'): { x: number; y: number } {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]);
  const x = orientation === 'w' ? file : 7 - file;
  const y = orientation === 'w' ? 8 - rank : rank - 1;
  return { x: (x + 0.5) * 12.5, y: (y + 0.5) * 12.5 };
}

export interface ArrowEnds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The line from one square to another, pulled back a third of a square at the
 * target end so the arrowhead sits on the square rather than in the middle of it,
 * and null when either end is not a square — a hint that is not a pair of squares
 * gets no arrow instead of a line full of `NaN`.
 */
export function arrowEnds(from: string, to: string, orientation: Orientation = 'w'): ArrowEnds | null {
  if (!isSquare(from) || !isSquare(to)) return null;
  const start = squareCentre(from, orientation);
  const end = squareCentre(to, orientation);
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  // A square onto itself has no direction; the `|| 1` keeps the division honest
  // rather than letting 0/0 turn every coordinate into NaN.
  const length = Math.hypot(dx, dy) || 1;
  return {
    x1: start.x,
    y1: start.y,
    x2: end.x - (dx / length) * ARROW_HEAD_INSET,
    y2: end.y - (dy / length) * ARROW_HEAD_INSET,
  };
}
