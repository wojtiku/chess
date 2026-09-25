import { Chess } from 'chess.js';
import type { Move as ChessMove, PieceSymbol, Square as ChessSquare } from 'chess.js';
import type { GameStatus, Move, Square } from './types';

export { Chess };
export type { GameStatus, Move, Square } from './types';

// chess.js types `square` as a 64-value union and `promotion` as a full
// PieceSymbol. Our `Square` is a plain string and our `promotion` is the four
// promotable pieces, so both are narrowed here at the library boundary.
function toPromotion(piece: PieceSymbol | undefined): Move['promotion'] {
  return piece === 'q' || piece === 'r' || piece === 'b' || piece === 'n' ? piece : undefined;
}

export function newGame(): Chess {
  return new Chess();
}

export function legalMoves(game: Chess, from?: Square): string[] {
  return from ? game.moves({ square: from as ChessSquare }) : game.moves();
}

export function legalMovesVerbose(game: Chess, from?: Square): ChessMove[] {
  return from
    ? game.moves({ square: from as ChessSquare, verbose: true })
    : game.moves({ verbose: true });
}

export function applyMove(game: Chess, m: Move): Move {
  const applied = game.move({ from: m.from, to: m.to, promotion: m.promotion });
  return {
    from: applied.from,
    to: applied.to,
    promotion: toPromotion(applied.promotion),
    san: applied.san,
  };
}

export function tryApplyMove(game: Chess, m: Move): Move | null {
  try {
    return applyMove(game, m);
  } catch {
    return null;
  }
}

export function statusOf(game: Chess): GameStatus {
  if (game.isCheckmate()) {
    // The side to move is mated, so the other side won.
    return { kind: 'checkmate', winner: game.turn() === 'w' ? 'b' : 'w' };
  }
  if (game.isStalemate()) return { kind: 'stalemate' };
  if (game.isThreefoldRepetition()) return { kind: 'threefold' };
  if (game.isDrawByFiftyMoves()) return { kind: 'fiftyMove' };
  if (game.isInsufficientMaterial()) return { kind: 'insufficientMaterial' };
  return { kind: 'playing', check: game.inCheck() };
}

export function hasSingleLegalMove(game: Chess): boolean {
  return game.moves().length === 1;
}

export function fenOf(game: Chess): string {
  return game.fen();
}

export function uciToMove(uci: string): Move {
  const from = uci.slice(0, 2);
  const to = uci.slice(2, 4);
  const promo = uci[4];
  return {
    from,
    to,
    ...(promo ? { promotion: promo as Move['promotion'] } : {}),
    san: '',
  };
}

export function sanSequence(startFen: string, uciMoves: string[]): string[] {
  const game = new Chess(startFen);
  const out: string[] = [];
  for (const uci of uciMoves) {
    const applied = tryApplyMove(game, uciToMove(uci));
    if (!applied) break;
    out.push(applied.san);
  }
  return out;
}
