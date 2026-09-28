import { Chess } from 'chess.js';
import type { Move as ChessMove, Square as ChessSquare } from 'chess.js';
import type { GameStatus, Move, Square } from './types';

export { Chess };
export type { GameStatus, Move, Square } from './types';

const PROMOTION_PIECES = ['q', 'r', 'b', 'n'] as const;

// chess.js types `square` as a 64-value union and `promotion` as a full
// PieceSymbol, while this module's `Square` is a plain string and its
// `promotion` is the four promotable pieces. Both are narrowed here, at the
// library boundary. The character is checked rather than cast, because
// `uciToMove` feeds this from untrusted engine PV lines.
// Exported so that callers holding a raw chess.js `PieceSymbol` can narrow it the
// same way this module does, rather than asserting the type at the point of use.
export function parsePromotion(piece: string | undefined): Move['promotion'] {
  return PROMOTION_PIECES.find((p) => p === piece);
}

export function newGame(): Chess {
  return new Chess();
}

/** A game from a FEN, for an exercise that does not start at move zero.
 *
 * The one caveat is the same one `Captured` documents and cannot detect: a
 * FEN-loaded `Chess` has no move history, so anything read from `history()` —
 * the captured pieces — comes back empty while the material count, read from
 * the board, is correct. That is a wrong answer with no error attached, so a
 * caller that needs captures must replay a move list instead. */
export function gameFromFen(fen: string): Chess {
  return new Chess(fen);
}

export function legalMoves(game: Chess, from?: Square): string[] {
  return from !== undefined ? game.moves({ square: from as ChessSquare }) : game.moves();
}

export function legalMovesVerbose(game: Chess, from?: Square): ChessMove[] {
  return from !== undefined
    ? game.moves({ square: from as ChessSquare, verbose: true })
    : game.moves({ verbose: true });
}

export function applyMove(game: Chess, m: Move): Move {
  const applied = game.move({ from: m.from, to: m.to, promotion: m.promotion });
  return {
    from: applied.from,
    to: applied.to,
    promotion: parsePromotion(applied.promotion),
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
  const promotion = parsePromotion(uci[4]);
  return {
    from,
    to,
    ...(promotion ? { promotion } : {}),
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
