import type { GameStatus, Side } from '../../chess/types';
import './ResultBanner.css';

export interface ResultBannerProps {
  /** The status of the LIVE game (`GameSnapshot.status`), not of the position on
   *  screen: rewinding to review a finished game must not unsay its result. */
  status: GameStatus;
}

const NAME: Readonly<Record<Side, string>> = { w: 'White', b: 'Black' };

/** The sentence for a status.
 *
 *  A `switch` with a `never` default rather than a table of functions, for two
 *  reasons. A kind added to the `GameStatus` union without a line here is a compile
 *  error instead of a silently blank banner; and inside each case `status` is
 *  narrowed to its own kind, so the two winner cases read `status.winner` directly
 *  — the brief's `status.kind === 'checkmate' && status.winner === 'w'` re-tests a
 *  fact TypeScript already knows, and its `&&` fall-through would print "Black
 *  wins" for a White win if the test were ever wrong. */
function textFor(status: GameStatus): string {
  switch (status.kind) {
    case 'playing':
      // Never rendered: the component returns null for `playing` before it asks.
      return '';
    case 'checkmate':
      return `Checkmate — ${NAME[status.winner]} wins`;
    case 'stalemate':
      return 'Draw by stalemate';
    case 'threefold':
      return 'Draw by threefold repetition';
    case 'fiftyMove':
      return 'Draw by the fifty-move rule';
    case 'insufficientMaterial':
      return 'Draw by insufficient material';
    case 'resigned':
      return `Resigned — ${NAME[status.winner]} wins`;
    default: {
      const unhandled: never = status;
      return unhandled;
    }
  }
}

/** The outcome banner, for every terminal state.
 *
 *  Each ending names its own rule, because the rule is the lesson: a learner who
 *  is told "draw" learns nothing, and one told "Draw by the fifty-move rule" learns
 *  that the halfmove clock exists. `role="status"` announces it politely when it
 *  arrives — a result that interrupts the engine mid-search should be read out, but
 *  must not steal focus from the board. */
export default function ResultBanner({ status }: ResultBannerProps) {
  if (status.kind === 'playing') return null;
  return (
    <div className="result-banner" role="status" aria-live="polite" data-kind={status.kind}>
      {textFor(status)}
    </div>
  );
}
