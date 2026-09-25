import type { Chess } from '../../chess/rules';
import type { PieceType, Side } from '../../chess/types';
import './Captured.css';

/** Piece values in pawns. The king is present and worth 0 on purpose: a king is
 *  not material, and a lookup with no `k` at all would make `VALUE[cell.type]`
 *  `undefined` for a king, which `?? 0` would then quietly absorb — so the row is
 *  written out and a bare-kings position is asserted to be 0. */
const VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** The Unicode symbols, keyed by the colour of the piece that was taken — so a
 *  black queen taken by White is drawn as Black's queen, not as a white one.
 *  Written out here rather than imported from `Board/pieces` so this panel needs
 *  nothing but the rules layer; Task 11 replaces both tables with one. */
const GLYPH: Readonly<Record<Side, Readonly<Record<PieceType, string>>>> = {
  b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♟' },
  w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♙' },
};

/** Score-sheet order, heaviest first, which is also the display order. */
const BY_VALUE: ReadonlyArray<PieceType> = ['q', 'r', 'b', 'n', 'p'];

const PIECE_NAME: Readonly<Record<PieceType, string>> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const COLOUR: Readonly<Record<Side, string>> = { w: 'White', b: 'Black' };

/** White's material advantage in pawns, read off the board.
 *
 *  Positive means White is ahead. Counted from the pieces actually on the board
 *  rather than from the move list, because a promotion adds material without
 *  capturing anything, and the board is the only place that shows up. */
export function materialDiff(game: Chess): number {
  let diff = 0;
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell === null) continue;
      // chess.js's `type` is its own `PieceSymbol`; narrowed by membership in this
      // module's own table rather than asserted, so a sixth letter is a runtime
      // miss that contributes nothing instead of a cast that lies.
      if (!(cell.type in VALUE)) continue;
      const value = VALUE[cell.type as PieceType] ?? 0;
      diff += cell.color === 'w' ? value : -value;
    }
  }
  return diff;
}

export interface CapturedBy {
  /** Pieces taken by White, which are Black's. */
  w: PieceType[];
  /** Pieces taken by Black, which are White's. */
  b: PieceType[];
}

/** The pieces each side has captured, read from the move history.
 *
 *  NOT from a board scan. "Missing from the board" is a different question, and it
 *  gets this one wrong in three ordinary ways:
 *
 *  - a promoted pawn has left the board and was taken by nobody;
 *  - a piece that walked to another square is missing from its own starting square
 *    and is still standing;
 *  - a position loaded from a bare FEN has no history, so all thirty pieces would
 *    look captured.
 *
 *  chess.js reports what was taken on each move as `captured`, and `color` is the
 *  side that played it, so bucketing by the mover answers the question directly.
 *  The one trap is en passant: `move.isCapture()` is **false** for an en passant
 *  capture, because the taken pawn is not standing on the destination square. This
 *  keys on `captured` and never on `isCapture()`.
 *
 *  Cost: `history({ verbose: true })` rebuilds a position per ply — measured at
 *  ~10ms for a 400-ply game and under 3ms for a typical practice game. A board
 *  diff is an order of magnitude cheaper and wrong; this panel re-renders on a
 *  human timescale.
 *
 *  The one thing it cannot see is material that appeared without a capture, so a
 *  promotion shows in `materialDiff` and in neither list. That is right: nobody
 *  captured a queen, the pawn became one.
 */
export function capturedBy(game: Chess): CapturedBy {
  const taken: CapturedBy = { w: [], b: [] };
  for (const move of game.history({ verbose: true })) {
    const captured = move.captured;
    if (captured === undefined) continue;
    // Types are not enforced at runtime, and a seventh piece letter would otherwise
    // be pushed into a `PieceType[]` and then silently dropped by every lookup
    // below — a type error that renders as a missing piece. Filtered at the source.
    // `move.color` and `captured` are already `'w' | 'b'` and this module's
    // `PieceType`, so neither needs a cast.
    if (!(captured in VALUE)) continue;
    taken[move.color].push(captured);
  }
  return taken;
}

/** The symbols for a set of captured pieces, heaviest first, in their own colour. */
function symbolsFor(pieces: PieceType[], colour: Side): string {
  let out = '';
  for (const type of BY_VALUE) {
    for (const piece of pieces) {
      if (piece === type) out += GLYPH[colour][type];
    }
  }
  return out;
}

/** "a queen and a pawn", "3 pawns", or "nothing".
 *
 *  Every piece name starts with a consonant, so "a" is always the right article and
 *  no vowel-collision case has to be handled here. */
function pieceList(pieces: PieceType[]): string {
  const names = BY_VALUE.flatMap((type) => {
    const count = pieces.filter((p) => p === type).length;
    if (count === 1) return [`a ${PIECE_NAME[type]}`];
    if (count > 1) return [`${count} ${PIECE_NAME[type]}s`];
    return [];
  });
  if (names.length === 0) return 'nothing';
  return names.join(' and ');
}

/** What one row announces: what that side took, and — on the side that is actually
 *  ahead — by how much. The digits `+6` are not speakable, so the number has to be
 *  in the sentence as well as on screen. */
function rowLabel(side: Side, pieces: PieceType[], diff: number): string {
  const ahead = side === 'w' ? diff > 0 : diff < 0;
  const points = Math.abs(diff);
  // "1 point", not "1 points": a learner reading this aloud is exactly the audience
  // a plural agreement bug embarrasses, and one point is the commonest possible
  // difference there is — the first capture of any game.
  const material = ahead
    ? ` ${COLOUR[side]} is up ${points} point${points === 1 ? '' : 's'} of material.`
    : '';
  return `Captured by ${COLOUR[side]}: ${pieceList(pieces)}.${material}`;
}

function CapturedRow({
  side,
  pieces,
  diff,
}: {
  side: Side;
  pieces: PieceType[];
  diff: number;
}) {
  // The colour of the pieces on this row is the colour of the side that LOST them.
  const lostTo = side === 'w' ? 'b' : 'w';
  return (
    <div className="captured-row" data-side={side}>
      {/* `role="img"` because that is a role which accepts an accessible name: an
        `aria-label` on a plain `<div>` or `<span>` is ignored by several screen
        readers, so the brief's row-level `aria-label` would name nothing. */}
      <span
        className="captured-glyphs"
        role="img"
        aria-label={rowLabel(side, pieces, diff)}
        data-testid={`captured-by-${side}`}
      >
        {symbolsFor(pieces, lostTo)}
      </span>
      {/* Empty rather than "+0": a level game has no advantage to announce, and the
        testid exists so a test can assert the absence as precisely as a presence. */}
      <strong className="captured-adv" data-testid={`captured-advantage-${side}`}>
        {side === 'w' ? (diff > 0 ? `+${diff}` : '') : diff < 0 ? `${diff}` : ''}
      </strong>
    </div>
  );
}

export default function Captured({ game }: { game: Chess }) {
  const taken = capturedBy(game);
  const diff = materialDiff(game);
  return (
    <div className="captured">
      <CapturedRow side="w" pieces={taken.w} diff={diff} />
      <CapturedRow side="b" pieces={taken.b} diff={diff} />
    </div>
  );
}
