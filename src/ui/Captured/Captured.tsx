import type { ReactNode } from 'react';
import type { Chess } from '../../chess/rules';
import type { PieceType, Side } from '../../chess/types';
import { srcFor } from '../Board/pieces';
import './Captured.css';

/** Piece values in pawns. The king is present and worth 0 on purpose: a king is
 *  not material, and a lookup with no `k` at all would make `VALUE[cell.type]`
 *  `undefined` for a king, which `?? 0` would then quietly absorb — so the row is
 *  written out and a bare-kings position is asserted to be 0. */
const VALUE: Readonly<Record<PieceType, number>> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

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
      // chess.js's `type` is its own `PieceSymbol`; narrowed by an OWN-key check
      // against this module's table rather than asserted, so a sixth letter is a
      // runtime miss that contributes nothing instead of a cast that lies.
      // `Object.hasOwn` and not `in`, which walks the prototype chain and would
      // report `toString` as a piece — same correction as `Board/pieces.ts`, and
      // for the same reason: `in` is not the membership test the old comment called
      // it.
      if (!Object.hasOwn(VALUE, cell.type)) continue;
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
    // `PieceType`, so neither needs a cast. `Object.hasOwn` rather than `in`, as
    // above: the prototype chain is not a set of pieces.
    if (!Object.hasOwn(VALUE, captured)) continue;
    taken[move.color].push(captured);
  }
  return taken;
}

/**
 * The pieces on a row, heaviest first, in the colour of the side that LOST them —
 * so a black queen taken by White is drawn as Black's queen.
 *
 * The artwork comes from `Board/pieces`, the one module that knows which file draws
 * which piece. This panel used to carry its own second copy of the symbol table,
 * with a comment explaining why it was not imported; that reason did not survive
 * contact with a piece-set change, because a copy of a lookup is not a copy of the
 * thing it looks up. A fourth piece type appearing in a captured list is now one
 * edit here rather than two.
 *
 * The `k` case is unreachable — a king is never captured — and stays unreachable
 * rather than being special-cased: `BY_VALUE` does not list `k`, so a king in the
 * list is dropped, and `Captured.test.tsx` asserts the two list filters agree with
 * this ordering table.
 *
 * `key` is the position rather than the piece, because two captured pawns are two
 * elements that must both render: keying on the piece would make React reuse the
 * first `<img>` for the second, which for a list this short is invisible until
 * someone captures two queens.
 */
function pieceImgs(pieces: PieceType[], colour: Side): ReactNode[] {
  const out: ReactNode[] = [];
  for (const type of BY_VALUE) {
    for (const piece of pieces) {
      if (piece === type) {
        out.push(
          <img
            key={`${type}-${out.length}`}
            className="captured-piece"
            src={srcFor(type, colour)}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={20}
            height={20}
          />,
        );
      }
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
        readers, so the brief's row-level `aria-label` would name nothing. It also
        makes the row a single announcement: the sixteen `<img>`s inside it carry
        no names of their own, because a list of filenames is not "a queen and a
        pawn". */}
      <span
        className="captured-glyphs"
        role="img"
        aria-label={rowLabel(side, pieces, diff)}
        data-testid={`captured-by-${side}`}
      >
        {pieceImgs(pieces, lostTo)}
      </span>
      {/* Empty rather than "+0": a level game has no advantage to announce, and the
        testid exists so a test can assert the absence as precisely as a presence. */}
      <strong className="captured-adv" data-testid={`captured-advantage-${side}`}>
        {side === 'w' ? (diff > 0 ? `+${diff}` : '') : diff < 0 ? `${diff}` : ''}
      </strong>
    </div>
  );
}

export interface CapturedProps {
  /**
   * The position to report on. **It must be a replay-built `Chess`** — one whose
   * move history is intact, i.e. built by replaying the move list (`gameAt(state)`
   * from `game/gameState.ts`, or by calling `move()`), never by loading a FEN.
   *
   * The reason is that the two halves of this panel read two different sources, and
   * only one of them is the board:
   *
   *  - the captured pieces come from `move.captured` over `game.history({verbose:
   *    true})`, because "what has been taken" cannot be recovered from a board
   *    (see `capturedBy`);
   *  - the material difference comes from `game.board()`.
   *
   * So a caller that hands over a bare `new Chess(fen)` gets the **worse** of the
   * two failure modes, not an obvious one: the material number is computed from
   * the board and is therefore CORRECT, while both capture lists come back empty
   * because the history is empty. The panel renders `+1` next to no pieces at all
   * and says "Captured by White: nothing." — a wrong answer with no error, no
   * warning and no failed test. `Captured.test.tsx` pins that exact symptom so the
   * precondition stays true in executable form rather than only in prose.
   *
   * There is no runtime check for it. A `Chess` carries no flag saying whether it
   * was replayed or loaded, and refusing to render would mean guessing; the honest
   * options are to document the contract (here) or to widen the prop to the move
   * list itself, which is Task 10's to decide.
   */
  game: Chess;
}

export default function Captured({ game }: CapturedProps) {
  const taken = capturedBy(game);
  const diff = materialDiff(game);
  return (
    <div className="captured">
      <CapturedRow side="w" pieces={taken.w} diff={diff} />
      <CapturedRow side="b" pieces={taken.b} diff={diff} />
    </div>
  );
}
