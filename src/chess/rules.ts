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

/** Whether an otherwise possible move from this square is forbidden by king
 * safety. Unlike an empty legal-move list, this distinguishes a pin from a piece
 * simply blocked by its neighbours. Never changes the caller's position. */
export function isKingSafetyRestricted(game: Chess, from: Square): boolean {
  const source = game.board().flat().find((cell) => cell?.square === from);
  if (!source || source.color !== game.turn()) return false;
  const king = game.board().flat().find((cell) => cell?.type === 'k' && cell.color === source.color);
  if (!king) return false;
  const legal = new Set(legalMovesVerbose(game, from).map((move) => move.to));
  const enemy = source.color === 'w' ? 'b' : 'w';
  const file = from.charCodeAt(0) - 97;
  const rank = Number(from[1]) - 1;
  // Normal FEN output omits en passant when it would expose the king — exactly
  // the move this detector needs to explain.
  const ep = game.fen({ forceEnpassantSquare: true }).split(' ')[3];

  // Enumerate ordinary movement geometry, then ask chess.js about attacks on a
  // private copy. Castling is deliberately excluded: it is a special permission,
  // not an ordinary king step blocked by exposing the king.
  for (const to of game.board().flatMap((row, rowIndex) =>
    row.map((_, col) => `${String.fromCharCode(97 + col)}${8 - rowIndex}` as ChessSquare),
  )) {
    if (legal.has(to) || to === from) continue;
    const occupant = game.get(to);
    if (occupant?.color === source.color || occupant?.type === 'k') continue;
    const dx = to.charCodeAt(0) - 97 - file;
    const dy = Number(to[1]) - 1 - rank;
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    const direction = source.color === 'w' ? 1 : -1;
    let possible = false;
    switch (source.type) {
      case 'n': possible = ax * ay === 2; break;
      case 'k': possible = Math.max(ax, ay) === 1; break;
      case 'b': possible = ax === ay; break;
      case 'r': possible = dx === 0 || dy === 0; break;
      case 'q': possible = ax === ay || dx === 0 || dy === 0; break;
      case 'p':
        possible = (dx === 0 && !occupant && (dy === direction ||
          (rank === (source.color === 'w' ? 1 : 6) && dy === 2 * direction))) ||
          (ax === 1 && dy === direction && (Boolean(occupant) || to === ep));
        break;
    }
    if (!possible) continue;
    if (source.type !== 'n') {
      let blocked = false;
      const steps = Math.max(ax, ay);
      for (let step = 1; step < steps; step++) {
        const between = `${String.fromCharCode(97 + file + Math.sign(dx) * step)}${rank + 1 + Math.sign(dy) * step}` as ChessSquare;
        if (game.get(between)) { blocked = true; break; }
      }
      if (blocked) continue;
    }
    const probe = new Chess(game.fen());
    probe.remove(source.square);
    probe.remove(to);
    if (source.type === 'p' && ax === 1 && !occupant && to === ep) {
      probe.remove(`${to[0]}${from[1]}` as ChessSquare);
    }
    probe.put({ type: source.type, color: source.color }, to);
    if (probe.isAttacked(source.type === 'k' ? to : king.square, enemy)) return true;
  }
  return false;
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
