import { useCallback, useId, useMemo, useRef, useState } from 'react';
import type { CSSProperties, DragEvent, KeyboardEvent } from 'react';
import type { Chess } from '../../chess/rules';
import { legalMovesVerbose, parsePromotion } from '../../chess/rules';
import { displaySquares, stepSquare, type ArrowKey, type Orientation } from './squares';
import { arrowEnds, squareCentre, type BoardArrow } from './arrows';
import { pieceLabel, pieceSrc } from './pieces';
import PromotionPicker from '../PromotionPicker/PromotionPicker';
import './Board.css';

export interface BoardProps {
  game: Chess;
  orientation: Orientation;
  /** False on the opponent's turn and when the game is over: the board still looks
   * the same, it just refuses to move a piece. */
  interactive: boolean;
  lastMove: { from: string; to: string } | null;
  arrows: BoardArrow[];
  /**
   * The board never applies a move to `game` itself. `Chess` is a mutable
   * instance, so a board that moved a piece would leave React's idea of the
   * position and the position itself disagreeing; the parent owns it, and this is
   * how the board asks.
   */
  onMove: (m: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => void;
}

/** What a square is, as far as a selected piece's options go. */
interface Destination {
  /** The square is a legal destination: drawn as a dot, or as a ring when it captures. */
  isTarget: boolean;
  /** The move takes a piece: drawn as a ring. */
  isCapture: boolean;
}

type SquarePiece = { type: string; color: string };

const ARROW_KEYS: ReadonlySet<string> = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

/**
 * Every square the piece on `from` may legally reach, with the two facts a square
 * needs to be drawn right: that it is a destination at all, and whether arriving
 * there takes a piece. One map for both, so the dot and the ring can never disagree
 * about a square.
 */
function destinations(game: Chess, from: string | null, interactive: boolean): Map<string, Destination> {
  const map = new Map<string, Destination>();
  if (from === null || !interactive) return map;
  for (const move of legalMovesVerbose(game, from)) {
    // `move.captured`, not `move.isCapture()`: chess.js reports an en passant move
    // as *not* a capture, so a pawn taking d6 en passant would be drawn as a dot on
    // an empty square with no ring at all. `isEnPassant()` is checked as well so the
    // rule is stated here rather than inherited from one library field.
    const isCapture = Boolean(move.captured) || move.isEnPassant();
    // More than one move can land on the same square — the four promotions. The
    // ring beats the dot, so a capture is never lost to a later quiet promotion.
    const already = map.get(move.to);
    map.set(move.to, { isTarget: true, isCapture: isCapture || already?.isCapture === true });
  }
  return map;
}

/** The board's own pieces, by square. Built from `board()` so no square name is cast. */
function piecesBySquare(game: Chess): Map<string, SquarePiece> {
  const map = new Map<string, SquarePiece>();
  for (const row of game.board()) {
    for (const cell of row) {
      if (cell) map.set(cell.square, cell);
    }
  }
  return map;
}

function findKing(pieces: Map<string, SquarePiece>, color: string): string | null {
  for (const [square, piece] of pieces) {
    if (piece.type === 'k' && piece.color === color) return square;
  }
  return null;
}

/** The square a drop landed on, or null if it did not land on one.
 *
 * `e.target` is whatever was under the pointer, which on a square holding a piece
 * is the artwork inside the button, so the search walks up to the nearest square
 * rather than reading the target's own dataset. Off the grid there is no square,
 * and a drop with no square is a cancelled drop: returning the first square in
 * render order instead would silently move a piece to a8. */
function squareUnderPointer(event: DragEvent, board: HTMLElement | null): string | null {
  const target = event.target;
  if (!(target instanceof Element)) return null;
  const square = target.closest('[data-square]');
  // Scoped to the grid: the square has to be *inside* the board, not merely
  // somewhere on the page.
  //
  // **The reason this guard was originally given was false, and is corrected here
  // rather than deleted** — the guard is still worth having, but it was carrying an
  // invented justification. It used to say the promotion popover "carries a square
  // name of its own for anchoring", which would make `closest('[data-square]')`
  // match it. It does not: `PromotionPicker` renders `data-promotion-square`, and
  // `Board.test.tsx` has always tested a drop onto the popover by its
  // `role="dialog"`. So `closest` never needed this guard for the popover, and the
  // ledger flagged this exact comment at Task 8 as a false citation and deferred
  // it here.
  //
  // What the guard is actually for: `closest` walks *up* as well as down, and
  // nothing stops a `data-square` element from existing outside the grid — an
  // overlay, a browser extension's injected node. Defence in depth for a case that
  // does not exist yet, which is worth stating plainly rather than dressing up as a
  // present-tense requirement.
  if (square === null || board === null || !board.contains(square)) return null;
  return square.getAttribute('data-square');
}

/** Where the promotion picker sits: the centre of its destination square. */
function anchorStyle(square: string, orientation: Orientation): CSSProperties {
  const centre = squareCentre(square, orientation);
  // The arrow overlay's 0..100 space is the board's own box, so a square's centre
  // is already its offset across the board in percent.
  return { left: `${centre.x}%`, top: `${centre.y}%` };
}

export default function Board({
  game,
  orientation,
  interactive,
  lastMove,
  arrows,
  onMove,
}: BoardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{ from: string; to: string } | null>(null);
  /** The one square in the grid that Tab can reach; the arrow keys move it. */
  const [tabStop, setTabStop] = useState<string | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  // React's ids contain colons, which are not legal in a `url(#…)` reference.
  const markerId = `arrowhead${useId().replace(/:/g, '')}`;

  // `game` is a mutable instance, so its identity does not change when a move is
  // played and a memo keyed on it alone would keep serving the old position. The
  // FEN does change whenever the position does, which is all the pieces map below
  // depends on.
  const position = game.fen();
  const pieces = useMemo(() => piecesBySquare(game), [position, game]);
  const squares = useMemo(() => displaySquares(orientation), [orientation]);

  // The coordinate labels, taken from `squares` rather than from a second list of
  // files and ranks: `displaySquares` is the one thing that decides what order the
  // board draws in, so deriving the labels from it is what keeps a flipped
  // board's labels flipped. A label that is right the other way up is worse than
  // no label — it tells a learner the wrong square.
  const rankDigits = useMemo(
    () => squares.filter((_, i) => i % 8 === 0).map(({ square }) => square[1]),
    [squares],
  );
  const fileLetters = useMemo(() => squares.slice(0, 8).map(({ square }) => square[0]), [squares]);

  const turn = game.turn();
  // `inCheck()` rather than `statusOf(...).check`, because `checkmate` is a
  // terminal status with no `check` field: gating on `kind === 'playing'` would
  // leave the mated king unlit, and a mated king in check is the one position
  // whose king most needs to be obvious.
  const checkSquare = game.inCheck() ? findKing(pieces, turn) : null;
  const targets = destinations(game, selected, interactive);
  const [firstSquare] = squares;
  const focusAnchor = tabStop ?? firstSquare?.square;

  const clearSelection = useCallback(() => {
    setSelected(null);
    setDragging(null);
  }, []);

  /** Offer `from` to `to`. Never applies the move: the parent does that. */
  const attempt = useCallback(
    (from: string, to: string) => {
      const moves = legalMovesVerbose(game, from).filter((move) => move.to === to);
      const first = moves[0];
      if (first === undefined) {
        // Not a legal destination, so the piece snaps back to where it was.
        clearSelection();
        return;
      }
      // More than one legal move to one square only happens for a promotion, and
      // which piece to become is the player's decision — not one the board may make
      // for them, so the picker opens instead of defaulting to a queen.
      if (moves.length > 1) {
        setPendingPromotion({ from, to });
        return;
      }
      const promotion = parsePromotion(first.promotion);
      onMove({ from, to, ...(promotion ? { promotion } : {}) });
      clearSelection();
    },
    [game, onMove, clearSelection],
  );

  /** Click, Enter or Space on a square: select, move, or give up the selection. */
  const activateSquare = (square: string) => {
    if (!interactive) return;
    // A promotion in progress owns the board until it is answered or cancelled:
    // clicking a square behind the picker must not start a second move.
    if (pendingPromotion !== null) return;
    if (selected !== null && targets.get(square)?.isTarget === true) {
      attempt(selected, square);
      return;
    }
    const piece = pieces.get(square);
    if (piece !== undefined && piece.color === turn) {
      setSelected(square === selected ? null : square);
      return;
    }
    // An empty square, or the opponent's: nothing to pick up, so the selection goes.
    setSelected(null);
  };

  const onSquareKeyDown = (event: KeyboardEvent, square: string) => {
    if (ARROW_KEYS.has(event.key)) {
      // Arrow keys are focus movement here, not page scrolling.
      event.preventDefault();
      const next = stepSquare(square, event.key as ArrowKey, orientation);
      if (next !== null) boardRef.current?.querySelector<HTMLButtonElement>(`[data-square="${next}"]`)?.focus();
      return;
    }
    if (event.key === 'Enter') {
      // Handled here rather than left to the browser's button activation, and
      // `preventDefault` suppresses the click that would otherwise follow and toggle
      // the selection straight back off. Space is left alone on purpose: a browser
      // (and user-event) already turns Space on a button into a click on keyup, so
      // handling it here would fire twice.
      event.preventDefault();
      activateSquare(square);
    }
  };

  const onDrop = (event: DragEvent) => {
    // Without this the browser refuses the drop and navigates to the file instead.
    event.preventDefault();
    const from = dragging;
    setDragging(null);
    if (from === null || !interactive || pendingPromotion !== null) return;
    const to = squareUnderPointer(event, boardRef.current);
    if (to === null) return;
    attempt(from, to);
  };

  const onPromotionSelect = useCallback(
    (promotion: 'q' | 'r' | 'b' | 'n') => {
      if (pendingPromotion === null) return;
      onMove({ ...pendingPromotion, promotion });
      setPendingPromotion(null);
      clearSelection();
    },
    [pendingPromotion, onMove, clearSelection],
  );

  const onPromotionCancel = useCallback(() => {
    setPendingPromotion(null);
    clearSelection();
  }, [clearSelection]);

  return (
    <div className="board-frame">
      {/* Coordinates, in the gutter outside the grid. Absolutely positioned inside
          a wrapper of their own so they are neither grid items (which would add
          rows and columns to the 8x8) nor inside `.board-wrap` (whose percentages
          the promotion picker anchors itself to — see `anchorStyle`).
          `aria-hidden`: the board's accessible names already say which square
          every piece is on, so a screen-reader user gets "e2, white pawn" and
          "a file label in a list of sixteen" is noise on top of it. Decorative
          text, deliberately not part of the accessibility tree. */}
      <div className="coord coord-ranks" aria-hidden="true">
        {rankDigits.map((digit) => (
          <span key={digit}>{digit}</span>
        ))}
      </div>

      <div className="board-wrap">
        <div
          className="board"
          // `role="grid"` with `role="button"` cells is not strictly valid ARIA:
          // a grid's children should be `row`s containing `gridcell`s, and a
          // `gridcell` may not be a `button`. It is also, deliberately, what this
          // board is — 64 focusable, labelled, clickable squares that never move,
          // and every test in the suite (and every learner's screen reader,
          // which reads a button as something you can press) depends on it.
          //
          // Do not "fix" this by inserting `role="row"` wrappers or switching the
          // squares to `gridcell`: that changes every accessible name and every
          // query in the suite, and it would trade a documented inaccuracy for a
          // set of 64 controls a keyboard user can no longer Tab to.
          //
          // `aria-rowindex`/`aria-colindex` are NOT added either. They are only
          // valid on `row`, `gridcell` and `rowgroup` — also not `button` — so on
          // these squares they would be a second inaccurate attribute rather than
          // a repair of the first. Fixing this properly is a redesign of the
          // board's semantics and belongs in its own task, not in a task about
          // artwork.
          role="grid"
          aria-label="Chess board"
          ref={boardRef}
          onDragOver={(event) => event.preventDefault()}
          onDrop={onDrop}
        >
          {squares.map(({ square, light }) => {
            const piece = pieces.get(square);
            const target = targets.get(square);
            const isTarget = target !== undefined && target.isTarget;
            const isCapture = target !== undefined && target.isTarget && target.isCapture;
            return (
              <button
                key={square}
                type="button"
                className={`square ${light ? 'light' : 'dark'}`}
                data-square={square}
                data-target={isTarget || undefined}
                data-capture={isCapture || undefined}
                data-selected={selected === square || undefined}
                data-last={(lastMove?.from === square || lastMove?.to === square) || undefined}
                data-check={checkSquare === square || undefined}
                aria-label={`${square}, ${piece ? pieceLabel(piece) : 'empty'}`}
                // Roving tabindex: the grid is one Tab stop and the arrow keys move
                // within it, so reaching a square does not mean 64 presses of Tab.
                tabIndex={square === focusAnchor ? 0 : -1}
                draggable={piece !== undefined && piece.color === turn && interactive}
                onFocus={() => setTabStop(square)}
                onClick={() => activateSquare(square)}
                onKeyDown={(event) => onSquareKeyDown(event, square)}
                onDragStart={(event) => {
                  // Some browsers refuse to start a drag whose payload is empty.
                  event.dataTransfer?.setData('text/plain', square);
                  setDragging(square);
                }}
                onDragEnd={() => setDragging(null)}
              >
                {/*
                  The piece is an image with an empty `alt`, and the square's own
                  `aria-label` is what names it. An `alt` of "white pawn" would be
                  announced twice — once by the button's label and once by the image
                  inside it — so the artwork is hidden and the name comes from the
                  one place that already had it.
  
                  `src` is resolved once per render rather than read as a variable,
                  so a piece this set has no artwork for renders nothing at all
                  instead of an `<img>` with an empty `src` and the browser's
                  missing-image icon in the middle of a square.
                */}
                {pieceSrc(piece) !== null && (
                  <img
                    className="piece"
                    src={pieceSrc(piece) ?? undefined}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                    width={45}
                    height={45}
                  />
                )}
              </button>
            );
          })}
  
          <svg className="arrows" viewBox="0 0 100 100" aria-hidden="true" focusable="false">
            <defs>
              <marker
                id={markerId}
                markerWidth="4"
                markerHeight="4"
                refX="3"
                refY="2"
                orient="auto"
              >
                <path d="M0,0 L4,2 L0,4 z" fill="currentColor" />
              </marker>
            </defs>
            {arrows.map((arrow, index) => {
              const ends = arrowEnds(arrow.from, arrow.to, orientation);
              // A hint that is not a pair of squares gets no arrow rather than a line
              // full of NaN, and one bad hint does not hide the others.
              if (ends === null) return null;
              return (
                <line
                  key={`${arrow.from}-${arrow.to}-${index}`}
                  data-testid={`arrow-${arrow.from}-${arrow.to}`}
                  x1={ends.x1}
                  y1={ends.y1}
                  x2={ends.x2}
                  y2={ends.y2}
                  stroke="currentColor"
                  strokeWidth="1.6"
                  markerEnd={`url(#${markerId})`}
                />
              );
            })}
          </svg>
        </div>

        {pendingPromotion && (
          <div className="promotion-anchor" style={anchorStyle(pendingPromotion.to, orientation)}>
            <PromotionPicker
              square={pendingPromotion.to}
              onSelect={onPromotionSelect}
              onCancel={onPromotionCancel}
            />
          </div>
        )}
      </div>

      <div className="coord coord-files" aria-hidden="true">
        {fileLetters.map((letter) => (
          <span key={letter}>{letter}</span>
        ))}
      </div>
    </div>
  );
}
