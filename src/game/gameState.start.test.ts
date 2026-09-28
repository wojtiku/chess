import { describe, expect, it } from 'vitest';
import { gameAt, initialState, reduce, type GameAction, type GameSnapshot } from './gameState';
import type { Side } from '../chess/types';

const uci = (s: string) => ({ type: 'playUci', uci: s }) as GameAction;

const run = (actions: GameAction[], from?: GameSnapshot): GameSnapshot =>
  actions.reduce(reduce, from ?? initialState());

// A position where a learner as Black is genuinely to move on the first ply.
// Reaching it needs a start FEN: there is no move sequence from the standard
// opening that puts Black to move at length 0.
const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const BLACK_TO_MOVE = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 b - - 0 9';

const started = (startFen: string, learnerSide: Side) =>
  reduce(initialState(), { type: 'setStart', startFen, learnerSide });

describe('reducer: a start position', () => {
  it('replays from the standard start by default', () => {
    expect(gameAt(initialState()).fen()).toBe(START_FEN);
  });

  it('replays from an arbitrary start FEN', () => {
    const s = started(BLACK_TO_MOVE, 'b');
    expect(gameAt(s).fen()).toBe(BLACK_TO_MOVE);
    expect(gameAt(s).turn()).toBe('b');
  });

  it('applies moves onto the start position', () => {
    // Black is to move here and g8 holds the *king*, so Rb8 is the move —
    // the fixture was checked rather than assumed, after a first attempt at
    // Nf6 (which is a king move, and silently a no-op).
    const s = run([uci('a8b8')], started(BLACK_TO_MOVE, 'b'));
    expect(gameAt(s).turn()).toBe('w');
    expect(s.moves).toHaveLength(1);
  });

  it('refuses a move that is illegal from the start position', () => {
    // The learner's knight is on c3 in this position; e2e4 is not a legal move.
    const before = started(BLACK_TO_MOVE, 'b');
    expect(reduce(before, uci('e2e4'))).toBe(before);
  });

  it('reports status from the start position, not from the standard one', () => {
    // A position with the side to move in check is a real fact about *this*
    // exercise, and `initialState` must not answer from a different board.
    // Fool's mate is *mate*, not merely check, so the status legitimately
    // differs from the standard opening's — which is the point of the
    // assertion: a status read from the wrong board would say 'playing'.
    const mated = 'rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3';
    const s = started(mated, 'w');
    expect(s.status.kind).toBe('checkmate');
    expect(gameAt(s).inCheck()).toBe(true);
    // And the standard opening is still only 'playing', so the two differ.
    expect(initialState().status.kind).toBe('playing');
  });
});

describe('reducer: undo never leaves the learner waiting', () => {
  // The property the existing suite already states, generalised. The original
  // test expressed it in White terms — even ply counts, `turn() === 'w'` —
  // because White was the only case that existed. The assertion is about the
  // *learner*, so a Black learner satisfies the same sentence.
  const GAME = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'd7d5'];

  it('leaves the learner to move for a White learner', () => {
    const game = run(GAME.map(uci));
    for (let n = 1; n <= game.moves.length; n++) {
      const undone = reduce(reduce(game, { type: 'goto', cursor: n }), { type: 'undo' });
      expect(gameAt(undone).turn()).toBe(learnerOf(undone));
      expect(gameAt(undone).turn()).toBe('w');
    }
  });

  it('leaves the learner to move for a Black learner, at odd plies', () => {
    // The parity is a function of learner side. A Black learner is to move at
    // odd move counts, so an even-ply rule would strand them.
    const start = started(BLACK_TO_MOVE, 'b');
    const game = run(GAME.map(uci), start);
    for (let n = 1; n <= game.moves.length; n++) {
      const undone = reduce(reduce(game, { type: 'goto', cursor: n }), { type: 'undo' });
      expect(gameAt(undone).turn()).toBe(learnerOf(undone));
    }
  });

  it('takes back two plies when the opponent has just replied', () => {
    const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), uci('b8c6')]);
    const undone = reduce(game, { type: 'undo' });
    expect(undone.moves).toHaveLength(2);
    expect(gameAt(undone).turn()).toBe(learnerOf(undone));
  });

  it('takes back one ply when the learner has just moved', () => {
    const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3')]);
    const undone = reduce(game, { type: 'undo' });
    expect(undone.moves).toHaveLength(2);
    expect(gameAt(undone).turn()).toBe(learnerOf(undone));
  });

  it('undoes the opening move back to an empty list', () => {
    // After 1.e4 it is Black to move, so taking back the learner's own ply is
    // correct: 0 plies is a position the learner is to move from. The existing
    // suite's comment called this case out ("the single opening move when the
    // engine has not answered yet, 1 -> 0") and an earlier draft of this test
    // wrongly asserted the opposite — undoing here is not stranding anyone.
    const s = run([uci('e2e4')]);
    const undone = reduce(s, { type: 'undo' });
    expect(undone.moves).toEqual([]);
    expect(gameAt(undone).turn()).toBe('w');
  });

  it('refuses to undo at an empty list, which has nothing to give back', () => {
    const s = initialState();
    expect(reduce(s, { type: 'undo' })).toBe(s);
  });

  it('leaves the learner to move after undoing the opening move', () => {
    const s = run([uci('e2e4'), uci('e7e5')]);
    const undone = reduce(s, { type: 'undo' });
    expect(undone.moves).toHaveLength(0);
    expect(gameAt(undone).turn()).toBe(learnerOf(undone));
  });
});

/** Whose turn it is for the learner of this snapshot, from its start FEN. */
const learnerOf = (s: GameSnapshot): Side => s.learnerSide;
