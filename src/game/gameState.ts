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

/** Rebuilds the position after the first `upTo` moves.
 *
 * `moves[i]!` is honest: every caller passes an `upTo` in `0..moves.length`
 * (the cursor is clamped by `goto`/`prev`/`next`/`last` and set by `play`/
 * `undo`/`initialState`). A throw here would mean that invariant broke. */
function replay(moves: Move[], upTo: number): ReturnType<typeof newGame> {
  const game = newGame();
  for (let i = 0; i < upTo; i++) {
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
      const candidate = action.type === 'playUci' ? uciToMove(action.uci) : action.move;
      // `tryApplyMove` never throws, and chess.js only matches `move()` against
      // moves generated for the side to move, so this rejects illegal moves *and*
      // moves played for the wrong side. Unrecognised uci strings become a
      // no-op rather than a crash.
      const applied = tryApplyMove(game, candidate);
      if (!applied) return state;
      return { ...state, ...live([...base, applied]), resignedBy: null };
    }

    case 'undo': {
      // A take-back must land on a position where it is the *player's* turn
      // again, or the learner is left staring at a board waiting on the engine.
      // The player is the side to move in the starting position, so that is the
      // side to move at every even move count. Take the largest even count
      // strictly below the cursor: two plies when the engine has just replied
      // (4 -> 2), one when the player has just moved (3 -> 2), and the single
      // opening move when the engine has not answered yet (1 -> 0).
      //
      // Deriving the cut from `moves.length - cursor` would be wrong: that is 0
      // at the live position, which made undo a no-op exactly when it matters
      // most.
      const base = state.moves.slice(0, state.cursor);
      const keep = base.length - (base.length % 2 === 0 ? 2 : 1);
      const back = base.slice(0, Math.max(0, keep));
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
export function gameAt(state: GameSnapshot): ReturnType<typeof newGame> {
  return replay(state.moves, state.cursor);
}

export function isReviewing(state: GameSnapshot): boolean {
  return state.cursor < state.moves.length;
}
