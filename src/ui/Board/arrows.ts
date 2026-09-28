import { isSquare, type Orientation } from './squares';

/**
 * What an arrow means.
 *
 * The inventory found one arrow style for every meaning, so "this is where your
 * piece went" and "this is where it could go" were drawn identically. A
 * consequence needs all three at once — what the learner played, what came
 * back, and what the engine wanted instead — and with one style the learner has
 * to read the squares to work out which is which. `hint` is the default so the
 * existing hint caller is unchanged.
 */
export type ArrowRole = 'hint' | 'played' | 'reply' | 'better';

export interface BoardArrow {
  from: string;
  to: string;
  /** Defaults to `hint`. */
  role?: ArrowRole;
}

export interface ArrowStyle {
  width: number;
  opacity: number;
  /** An SVG dash pattern, or undefined for a solid line. */
  dash?: string;
}

/** How each role is drawn.
 *
 * Weight encodes what the arrow is *for*, and it is the only cue the learner
 * gets: the learner's own move is context, the reply is the consequence, and
 * the better move is the answer. So the played move is thin and dashed and
 * faded, the reply is solid, and the reveal is the heaviest line on the board.
 */
const STYLES: Record<ArrowRole, ArrowStyle> = {
  hint: { width: 1.6, opacity: 0.85 },
  played: { width: 1.4, opacity: 0.5, dash: '3 3' },
  reply: { width: 2, opacity: 0.9 },
  better: { width: 3, opacity: 1 },
};

export function arrowStyle(role: ArrowRole = 'hint'): ArrowStyle {
  return STYLES[role];
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
