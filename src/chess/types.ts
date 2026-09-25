export type Square = string;
export type Side = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Move {
  from: Square;
  to: Square;
  promotion?: 'q' | 'r' | 'b' | 'n';
  san: string;
}

export type GameStatus =
  | { kind: 'playing'; check: boolean }
  | { kind: 'checkmate'; winner: Side }
  | { kind: 'stalemate' }
  | { kind: 'threefold' }
  | { kind: 'fiftyMove' }
  | { kind: 'insufficientMaterial' }
  | { kind: 'resigned'; winner: Side };
