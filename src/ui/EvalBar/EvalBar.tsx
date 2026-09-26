import type { Side } from '../../chess/types';
import './EvalBar.css';

/**
 * The engine's score for a position, in the engine's own frame of reference.
 *
 * Stockfish reports `score cp` and `score mate` for the **side to move in the
 * position it searched**. A `+200` therefore means "the side to move is 2 pawns
 * up", which is White's advantage in half of all positions and Black's in the
 * other half. This interface exists so that the frame of reference is part of the
 * type: nothing in this module may be handed a bare number without being told
 * whose number it is, and `EvalBarProps` cannot be satisfied without naming the
 * side to move.
 *
 * `score mate` is a signed count of *moves*, on the same side-to-move scale:
 * positive means that side mates in N, negative means that side is mated in N.
 */
export interface EngineScore {
  sideToMoveCp?: number;
  sideToMoveMate?: number;
}

export interface EvalBarProps extends EngineScore {
  /** Whose turn it was in the analysed position. Required, on purpose: this is the
   *  one fact that decides which way the bar points, so a caller cannot render a
   *  bar without committing to it.
   *
   *  The prop makes the *conversion* impossible to get wrong. It does not make it
   *  impossible to pass the wrong turn: a caller holding a score for one position
   *  and a `sideToMove` from another will get a confidently mirrored number out of
   *  this component, with no error. That happened — the final review found that
   *  every learner move committed a render in which the previous position's score
   *  was converted with the new position's turn, because the effect that clears the
   *  analysis runs after the commit. `App` now gates on the `fen` the `Analysis`
   *  carries; this comment exists so the next reader knows the responsibility is
   *  shared and that the required prop is not, by itself, the guarantee. */
  sideToMove: Side;
  /** Which way round the board is drawn, `'w'` or `'b'`. Moves the fills around the
   *  track; it never changes what `data-white-share` means. */
  orientation: Side;
}

/** The same score, restated from White's point of view. */
export interface WhiteRelativeScore {
  /** White's advantage in centipawns. Positive means White is better off. */
  whiteCp?: number;
  /** Moves to mate **for White**: positive means White mates in N, negative means
   *  White is mated in N. */
  whiteMate?: number;
}

/** Restate an engine score as White's advantage.
 *
 *  The whole reason this function exists: `white = sideToMove === 'w' ? x : -x`,
 *  and the mate distance takes the same sign flip as the centipawns. A mate for
 *  the side to move becomes a mate *against* White when that side is Black, and a
 *  bar that misses this points the wrong way in every position where the engine
 *  was asked while Black was thinking — which is every position the app is in for
 *  half of each move pair.
 *
 *  Both scores may arrive together; the mate wins, matching `scoreOf` in
 *  `engine/engineClient.ts`, which is the layer that produced them. */
export function toWhiteRelative(score: EngineScore, sideToMove: Side): WhiteRelativeScore {
  if (score.sideToMoveMate !== undefined) {
    return { whiteMate: sideToMove === 'w' ? score.sideToMoveMate : -score.sideToMoveMate };
  }
  if (score.sideToMoveCp !== undefined) {
    return { whiteCp: sideToMove === 'w' ? score.sideToMoveCp : -score.sideToMoveCp };
  }
  return {};
}

/** The centipawn score at which the bar is as full as a centipawn score ever makes
 *  it, and the share it reaches there. 1000cp is a completely winning position and
 *  95% is deliberately not 100%: a full bar is reserved for a mate that has
 *  actually been found, so a big edge and a proven mate never look the same. */
const FULL_SCALE_CP = 1000;
const MAX_CP_SHARE = 95;

/** 0..100: the percentage of the track that belongs to White.
 *
 *  Takes a **White-relative** score, not an engine score: the perspective is
 *  settled by `toWhiteRelative` before anything is drawn, so this function cannot
 *  get the sign wrong — and cannot even be handed a number whose frame of
 *  reference is unstated. */
export function whiteShare(score: WhiteRelativeScore): number {
  const { whiteCp, whiteMate } = score;
  if (whiteMate !== undefined && Number.isFinite(whiteMate)) {
    if (whiteMate > 0) return 100;
    if (whiteMate < 0) return 0;
    // `mate 0` is the engine reporting that the position is already mate. Its sign
    // is not a direction, so neither side is claimed.
    return 50;
  }
  // The finite check is first on purpose: `Math.min(1000, NaN)` is NaN, and an
  // unguarded clamp would put `data-white-share="NaN"` on screen. An infinite score
  // is not a winning position either — it is not a score.
  if (whiteCp === undefined || !Number.isFinite(whiteCp)) return 50;
  const clamped = Math.max(-FULL_SCALE_CP, Math.min(FULL_SCALE_CP, whiteCp));
  return 50 + (clamped / FULL_SCALE_CP) * (MAX_CP_SHARE - 50);
}

/** The text under the bar. Takes a White-relative score, as `whiteShare` does. */
export function formatEvalLabel(score: WhiteRelativeScore): string {
  const { whiteCp, whiteMate } = score;
  if (whiteMate !== undefined && Number.isFinite(whiteMate)) {
    // `>= 0` and not `> 0`: a zero mate is a mate, and the strict test printed
    // "-M0" for it, which reads as "mated in no moves at all".
    return `${whiteMate >= 0 ? 'M' : '-M'}${Math.abs(whiteMate)}`;
  }
  if (whiteCp === undefined || !Number.isFinite(whiteCp)) return '—';
  const pawns = whiteCp / 100;
  // The sign comes from the ROUNDED value, not the raw one: `(-0.04).toFixed(1)` is
  // "-0.0", a number no reader has ever seen in an eval bar.
  const tenths = Math.round(Math.abs(pawns) * 10) / 10;
  const sign = tenths === 0 ? '' : pawns < 0 ? '-' : '+';
  return `${sign}${tenths.toFixed(1)}`;
}

/**
 * The bar itself. Pure: it draws the score it is given and holds no state, so the
 * only thing that can make it jump is its caller.
 *
 * That is deliberate, and it is why the no-jitter requirement is split in two.
 * The *easing* is here, in `EvalBar.css` (a `transition` on the two fills), and it
 * cannot be tested in jsdom — CSS is not rendered. The *cadence* belongs to the
 * caller: the bar must be fed the result of a deeper search than the one on
 * screen, not every `info` line the engine emits, or it will step once per
 * centipawn as the search sharpens. A prop that would let this component enforce
 * that is deliberately not offered: a frozen score would be wrong the moment the
 * position changes, and only the caller knows the FEN and the depth.
 */
export default function EvalBar({ sideToMoveCp, sideToMoveMate, sideToMove, orientation }: EvalBarProps) {
  const score = toWhiteRelative({ sideToMoveCp, sideToMoveMate }, sideToMove);
  const share = Math.round(whiteShare(score));
  // White sits at the bottom of the track in the default orientation, so the white
  // fill is measured from the bottom; flipped, it is measured from the top.
  const whiteFromBottom = orientation === 'w' ? share : 100 - share;

  return (
    <div
      className="evalbar"
      data-testid="eval-bar"
      // Always White's share, in both orientations, so this attribute means one
      // thing and is assertable.
      data-white-share={share}
    >
      <div className="evalbar-track">
        {/* `data-fill` / `data-height` duplicate the inline height deliberately: which
            end the bar fills from is the behaviour under test, and jsdom applies no
            CSS, so a test can only read the number from an attribute. The class
            names are for the stylesheet. */}
        <div
          className="evalbar-black"
          data-fill="black"
          data-height={100 - whiteFromBottom}
          style={{ height: `${100 - whiteFromBottom}%` }}
        />
        <div
          className="evalbar-white"
          data-fill="white"
          data-height={whiteFromBottom}
          style={{ height: `${whiteFromBottom}%` }}
        />
      </div>
      <span className="evalbar-label">{formatEvalLabel(score)}</span>
    </div>
  );
}
