// Unicode chess glyphs for now. Task 11 replaces this module's lookups with
// vendored SVGs; the two functions below are the contract either way — a key for
// the asset and a spoken description for the square's accessible name.

const GLYPHS: Record<string, string> = {
  wp: '♙', wn: '♘', wb: '♗', wr: '♖', wq: '♕', wk: '♔',
  bp: '♟', bn: '♞', bb: '♝', br: '♜', bq: '♛', bk: '♚',
};

const NAMES: Record<string, string> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** The glyph to draw, or null for an empty square or an unknown piece. */
export function pieceGlyph(piece: { type: string; color: string } | undefined): string | null {
  if (!piece) return null;
  return GLYPHS[`${piece.color}${piece.type}`] ?? null;
}

/**
 * How a piece is announced to a screen reader: `"white pawn"`, `"black king"`.
 *
 * This is half of every square's accessible name, and it is the part that decides
 * whether a board is usable without sight of it, so an unknown piece type falls
 * through to its own symbol rather than to a blank or an exception.
 */
export function pieceLabel(piece: { type: string; color: string }): string {
  const color = piece.color === 'w' ? 'white' : 'black';
  return `${color} ${NAMES[piece.type] ?? piece.type}`;
}
