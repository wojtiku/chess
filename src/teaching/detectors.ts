// Detectors: the layer that turns a position into Facts.
//
// A Detector is exact or it is a bug. There is no room here for a judgement, an
// estimate, or a sense of what a position probably means — and that is the whole
// point of the design. The model downstream phrases what this layer decides, and
// cannot check it, so anything wrong here is taught confidently and without
// error. Two bugs in this layer were found by accident during planning (see the
// regression tests in `detectors.test.ts`); both produced fluent, plausible,
// wrong teaching, and neither announced itself.
//
// Everything is expressed in absolute terms — "White's knight on d5" — never in
// relation to a reader. Perspective was the single largest observed failure in
// the probe, and it is cheaper to make unexpressible than to ask a model to be
// careful.

import { Chess } from 'chess.js';
import type { PieceSymbol, Square as ChessSquare } from 'chess.js';
import type { Side, Square } from '../chess/types';

export type { Side, Square };

/** One of the side to move's own pieces, and what is true of it. */
export interface PieceFact {
  square: Square;
  piece: Exclude<PieceSymbol, 'k'>;
  /** The opponent attacks this square. */
  attackedByOpponent: boolean;
  /** One of the side to move's own pieces attacks this square. */
  defendedByYou: boolean;
  /** Attacked and undefended: the single most teachable fact about a beginner's game. */
  hangs: boolean;
  /** A non-pawn still on its starting square. Pawns are never "undeveloped". */
  undeveloped: boolean;
}

export interface FactPack {
  fen: string;
  sideToMove: Side;
  /** Whose pieces `learnerPieces` describes. Release 1 is always 'w'. */
  learnerSide: Side;
  inCheck: boolean;
  castlingRights: string;
  kingCastled: boolean;
  pieceAt: Record<Square, string>;
  /** In pawns: p=1, n=3, b=3, r=5, q=9, k=0. Keyed by chess.js colour codes. */
  material: Record<Side, number>;
  legalMoveCount: number;
  learnerPieces: PieceFact[];
  /** UCI, e.g. `h5xf7`. Only moves the side to move may actually make. */
  capturesAvailable: string[];
  checksAvailable: string[];
  matesAvailable: string[];
}

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** Home squares by type and colour. Rank-aware: Black's pieces live on rank 8. */
const HOME: Record<Side, Record<string, Square[]>> = {
  w: { n: ['b1', 'g1'], b: ['c1', 'f1'], r: ['a1', 'h1'], q: ['d1'], k: ['e1'] },
  b: { n: ['b8', 'g8'], b: ['c8', 'f8'], r: ['a8', 'h8'], q: ['d8'], k: ['e8'] },
};

const opponentOf = (side: Side): Side => (side === 'w' ? 'b' : 'w');

/** A capture in UCI spells the `x`; a quiet move does not. `h5f7` is not a move. */
const uciOf = (from: Square, to: Square, promotion?: string): string =>
  `${from}x${to}${promotion ?? ''}`;

/**
 * Everything verifiable about a position, in one plain-data packet.
 *
 * The FEN decides the side to move, so a fixture cannot quietly disagree with
 * the turn the facts are for. Mate and check are read by *making* the move and
 * asking, rather than by pattern-matching SAN — a `#` in a string is a
 * convention, `isCheckmate()` is the rule.
 */
export function boardFacts(fen: string, learnerSide?: Side): FactPack {
  const game = new Chess(fen);
  const stm = game.turn();
  const enemy = opponentOf(stm);
  const learner = learnerSide ?? stm;

  const pieceAt: Record<Square, string> = {};
  // Keyed by chess.js's own colour codes ('w' and 'b') rather than by the words
  // "white" and "black". The two disagree the moment anything writes into this
  // object by colour code: `material.w += 3` creates a *third* key, and the
  // total reads as undefined — so material came out as 0 or null and no position
  // ever had a material count. One spelling, used everywhere.
  const material: Record<Side, number> = { w: 0, b: 0 };
  // Read `square` off the cell rather than recomputing it from the indices.
  // `board()` is [rank 8 → rank 1][file a → file h], so deriving the name from
  // the loop variables inverts the rank and puts every piece on the wrong
  // square — which reports a full board as empty. The cell already knows its
  // own name, and using it is both shorter and impossible to get backwards.
  for (const row of game.board()) {
    for (const cell of row) {
      if (!cell) continue;
      const square = cell.square as Square;
      pieceAt[square] = cell.color + cell.type;
      material[cell.color] += VALUE[cell.type];
    }
  }

  const learnerPieces: PieceFact[] = [];
  for (const [square, code] of Object.entries(pieceAt) as [Square, string][]) {
    if (code[0] !== learner) continue;
    const piece = code[1] as PieceSymbol;
    if (piece === 'k') continue;
    // `isAttacked(square, colour)`, NOT `attacked(square, verbose)`. The two
    // have different signatures and the second silently answers the same
    // question twice, which made every piece look undefended. See the file
    // header and the regression test.
    const attackedByOpponent = game.isAttacked(square as ChessSquare, enemy);
    const defendedByYou = game.isAttacked(square as ChessSquare, learner);
    learnerPieces.push({
      square,
      piece,
      attackedByOpponent,
      defendedByYou,
      hangs: attackedByOpponent && !defendedByYou,
      // Pawns develop by advancing, so a pawn on its own square is not
      // "undeveloped" — it may be exactly where it wants to be.
      undeveloped: (HOME[learner][piece] ?? []).includes(square),
    });
  }

  const capturesAvailable: string[] = [];
  const checksAvailable: string[] = [];
  const matesAvailable: string[] = [];
  for (const m of game.moves({ verbose: true })) {
    const uci = uciOf(m.from as Square, m.to as Square, m.promotion);
    if (m.captured) capturesAvailable.push(uci);
    if (m.san.endsWith('#')) matesAvailable.push(m.san);
    else if (m.san.endsWith('+')) checksAvailable.push(uci);
  }

  // `castlingRights` is a private field on this build; the accessor is
  // `getCastlingRights()`, and it returns **all four keys** with boolean values
  // — not only the rights that survive. Filtering the keys by presence is
  // therefore always empty, and every FEN reports "-", i.e. a position with
  // full rights reported as having none. That is a Fact the coach is entitled
  // to assert, so it is worth getting right.
  // `getCastlingRights(color)` takes a **required** colour and returns that
  // side's rights, keyed by rook file: `{ k, q }`, lowercase. Called with no
  // argument it reads `this._castling[undefined]`, which is 0, so it reports
  // that *nobody* may castle — a position with full rights reported as having
  // none. Reading the FEN's fourth field directly is simpler and cannot fail
  // this way, so the FEN is the source of truth here.
  const field = fen.split(' ')[2] ?? '-';
  const castlingRights = field === '-' ? '-' : field;

  // Castled means the king has left its own square: e1 for White, e8 for Black.
  // Checking for the f1/g1 squares instead would report "castled" for any king
  // that merely happens to stand there.
  const kingStart = (learner === 'w' ? 'e1' : 'e8') as Square;
  const kingCastled = !Object.prototype.hasOwnProperty.call(pieceAt, kingStart);

  return {
    fen,
    sideToMove: stm,
    learnerSide: learner,
    inCheck: game.inCheck(),
    castlingRights,
    kingCastled,
    pieceAt,
    material,
    legalMoveCount: game.moves().length,
    learnerPieces,
    capturesAvailable,
    checksAvailable,
    matesAvailable,
  };
}
