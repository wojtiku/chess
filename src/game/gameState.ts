// The pure game reducer. No React, no engine, no DOM: a position is *always*
// derived by replaying the move list, never by reversing a move. That is what
// keeps the threefold and fifty-move counters honest, because chess.js tracks
// them from a move history and a reversal has no history to rewind.
//
// The move list is therefore the only authoritative state. `cursor` says how much
// of it is on screen; it never changes what the game *is*.

import {
  applyMove,
  newGame,
  statusOf,
  tryApplyMove,
  uciToMove,
  type Chess,
  type GameStatus,
} from '../chess/rules';
import type { Move, Side } from '../chess/types';

export interface GameSnapshot {
  /** The authoritative move list. Never mutated. */
  moves: Move[];
  /** How many of `moves` are in the displayed position. 0..moves.length. */
  cursor: number;
  /** Status of the *live* game (at `moves.length`), not of the displayed one. */
  status: GameStatus;
  resignedBy: Side | null;
}

export type GameAction =
  | { type: 'reset' }
  | { type: 'play'; move: Move }
  | { type: 'playUci'; uci: string }
  | { type: 'undo' }
  | { type: 'goto'; cursor: number }
  | { type: 'first' }
  | { type: 'prev' }
  | { type: 'next' }
  | { type: 'last' }
  | { type: 'resign' };

export function initialState(): GameSnapshot {
  // Derived from the rules layer rather than written out by hand, so a new
  // `GameStatus` kind cannot leave a stale literal behind here.
  return { moves: [], cursor: 0, status: statusOf(newGame()), resignedBy: null };
}

/** Every way a game can be over, as opposed to still being played. */
const OVER_KINDS: ReadonlySet<GameStatus['kind']> = new Set<GameStatus['kind']>([
  'checkmate',
  'stalemate',
  'threefold',
  'fiftyMove',
  'insufficientMaterial',
  'resigned',
]);

/** Whether the game is finished, so that no further move may be played on it.
 *
 * This is a product rule, not a chess rule. chess.js enforces only two of the
 * six endings by itself, because a mated or stalemated position has no legal
 * move at all. The other four are *states*, not move prohibitions: the moves
 * that reach them are legal, and so are the moves after them. Left to
 * chess.js, a repetition or a saturated halfmove clock is dissolved by the very
 * next move — a pawn push resets the clock, the following position is not a
 * repetition, and the draw silently becomes `playing` again. Resignation is
 * included for the same reason: it is a declaration about the game, and a
 * `play` that raced the resignation would otherwise erase it.
 *
 * Rewinding is deliberately *not* gated by this. `undo` and a `play` from a
 * rewound cursor both recompute the status from the resulting move list, so
 * taking a move back is how a learner leaves a game the rules have ended. */
export function isGameOver(status: GameStatus): boolean {
  return OVER_KINDS.has(status.kind);
}

/** Rebuilds the position after the first `upTo` moves.
 *
 * `upTo` is clamped to the list, because `GameSnapshot` is a public data shape
 * and the game is persisted as a bare move list: a deserialised snapshot can
 * carry a stale or hand-edited cursor, and `gameAt` is called on the way to
 * *rendering*, so it must degrade to the longest playable prefix rather than
 * throw. With `limit <= moves.length` the `moves[i]!` is honest. A move *inside*
 * the list that will not apply is a different failure — corrupt storage rather
 * than a stale cursor — and still throws, deliberately. */
function replay(moves: Move[], upTo: number): Chess {
  const game = newGame();
  // Only the upper bound needs clamping: a negative `upTo` already leaves the
  // loop body unentered, which is the start position anyway.
  const limit = Math.min(upTo, moves.length);
  for (let i = 0; i < limit; i++) {
    applyMove(game, moves[i]!);
  }
  return game;
}

/** The live position for a completed move list: cursor pinned to the end. */
function live(moves: Move[]): Pick<GameSnapshot, 'moves' | 'cursor' | 'status'> {
  return { moves, cursor: moves.length, status: statusOf(replay(moves, moves.length)) };
}

export function reduce(state: GameSnapshot, action: GameAction): GameSnapshot {
  switch (action.type) {
    case 'reset':
      return initialState();

    case 'play':
    case 'playUci': {
      // A move played from a rewound cursor truncates the future: moves[0..cursor)
      // is the branch point, and everything after it is abandoned.
      const base = state.moves.slice(0, state.cursor);
      const game = replay(base, base.length);
      // The game is not played on once it is over, and there are two different
      // reasons, checked in two different places.
      //
      // The rule-derived endings are read from the position the move is played
      // *from*. That is what lets a rewound cursor branch out of a draw: the
      // cursor has left the drawn position, and the status is recomputed from
      // the new list below.
      //
      // A resignation is the one ending that is not derivable from any position,
      // so it is read from the snapshot — but only when the move would extend
      // the live game, because rewinding already yields a new game whose status
      // is recomputed. `>=` rather than `===` so a stale cursor from corrupt
      // storage still counts as extending.
      const extendsLive = state.cursor >= state.moves.length;
      if (isGameOver(statusOf(game)) || (extendsLive && state.status.kind === 'resigned')) {
        return state;
      }
      const candidate = action.type === 'playUci' ? uciToMove(action.uci) : action.move;
      // `tryApplyMove` never throws, and chess.js only matches `move()` against
      // moves generated for the side to move, so this rejects illegal moves *and*
      // moves played for the wrong side. Unrecognised uci strings become a
      // no-op rather than a crash.
      const applied = tryApplyMove(game, candidate);
      if (!applied) return state;
      // A truncation is a new game, so any resignation of the abandoned one goes
      // with it. On the live path this cannot fire: the guard above refuses.
      return { ...state, ...live([...base, applied]), resignedBy: null };
    }

    case 'undo': {
      // A take-back must land on a position where it is the *learner's* turn
      // again, or they are left staring at a board waiting for the engine.
      //
      // PRODUCT ASSUMPTION: the learner plays White. So the learner is the side
      // to move in the starting position, which makes it the side to move at
      // every even move count. Take the largest even count strictly below the
      // cursor: two plies when the engine has just replied (4 -> 2), one when the
      // learner has just moved (3 -> 2), and the single opening move when the
      // engine has not answered yet (1 -> 0). Nothing here depends on White by
      // name, but a "play as Black" mode would have to revisit it.
      //
      // Not gated by `isGameOver`: taking a move back is how a learner leaves a
      // game the rules have ended, and the status is recomputed below.
      //
      // Deriving the cut from `moves.length - cursor` would be wrong: that is 0
      // at the live position, which made undo a no-op exactly when it matters
      // most.
      const base = state.moves.slice(0, state.cursor);
      // `keep` is negative only when `base.length === 0`, and that case is
      // caught by the identity check below, so it needs no clamping here.
      const keep = base.length - (base.length % 2 === 0 ? 2 : 1);
      const back = base.slice(0, keep);
      if (back.length === base.length) return state;
      return { ...state, ...live(back), resignedBy: null };
    }

    case 'goto': {
      const cursor = Math.max(0, Math.min(action.cursor, state.moves.length));
      return { ...state, cursor };
    }
    case 'first':
      return { ...state, cursor: 0 };
    case 'prev':
      return { ...state, cursor: Math.max(0, state.cursor - 1) };
    case 'next':
      return { ...state, cursor: Math.min(state.moves.length, state.cursor + 1) };
    case 'last':
      return { ...state, cursor: state.moves.length };

    case 'resign': {
      // Resigning ends the *live* game, so the side to move is read at the end
      // of the move list rather than at the cursor. `status` describes the live
      // game (see `GameSnapshot`), and a resignation judged from a review
      // position would name whichever side happened to be on screen — so
      // resigning while reviewing ply 3 of a 4-ply game would credit the wrong
      // player.
      const game = replay(state.moves, state.moves.length);
      const loser: Side = game.turn();
      return {
        ...state,
        status: { kind: 'resigned', winner: loser === 'w' ? 'b' : 'w' },
        resignedBy: loser,
      };
    }
  }
}

/** The position shown at the cursor. A fresh instance, safe to mutate. */
export function gameAt(state: GameSnapshot): Chess {
  return replay(state.moves, state.cursor);
}

export function isReviewing(state: GameSnapshot): boolean {
  return state.cursor < state.moves.length;
}
