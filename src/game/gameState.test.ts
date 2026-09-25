import { describe, expect, it } from 'vitest';
import { legalMoves, newGame, statusOf } from '../chess/rules';
import type { GameStatus } from '../chess/types';
import {
  gameAt, initialState, isGameOver, isReviewing, reduce,
  type GameAction, type GameSnapshot,
} from './gameState';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const run = (actions: GameAction[], from = initialState()) =>
  actions.reduce(reduce, from);

const uci = (s: string) => ({ type: 'playUci', uci: s }) as const;

const uciList = (ucis: string[], from = initialState()) => run(ucis.map(uci), from);

/** SAN of the last recorded move, or null if there is none. */
const sanAfter = (s: GameSnapshot): string | null => s.moves.at(-1)?.san ?? null;

/** A real 108-ply game from the start position that never repeats a position and
 * never moves a pawn or makes a capture after ply 8, so the halfmove clock
 * reaches exactly 100 and the fifty-move rule fires. It is the only way to drive
 * the reducer to a fifty-move draw: see the test at the bottom of this file.
 * Verified by execution — the final position is
 * `r2qkb1r/1ppbpppp/p1n2n2/3p4/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQ - 100 55` with
 * `isThreefoldRepetition() === false` and `isDrawByFiftyMoves() === true`.
 *
 * The 109th ply of this tour (`c4b5`) is deliberately absent: a 109th ply would
 * be legal chess, but the clock is already at 100 after 108, so the game is
 * over and the reducer refuses it. */
const FIFTY_MOVE_TOUR = [
  // 1.e4 Nf6 2.Nf3 Nc6 3.Bb5 a6 4.Ba4 d5 — the last pawn move; the clock starts here.
  'e2e4', 'g8f6', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'd7d5',
  // White bounces the f1 bishop Bb5/Bc4, Black cycles its own pieces, so no
  // position ever occurs a third time.
  'a4b5', 'a8b8', 'b5c4', 'b8a8',
  'c4b5', 'a8a7', 'b5c4', 'c8d7',
  'c4b5', 'd8c8', 'b5c4', 'c8b8',
  'c4b5', 'b8d8', 'b5c4', 'd8c8',
  'c4b5', 'c8b8', 'b5c4', 'b8a8',
  'c4b5', 'e8d8', 'b5c4', 'a8b8',
  'c4b5', 'b8c8', 'b5c4', 'c8a8',
  'c4b5', 'a8b8', 'b5c4', 'b8c8',
  'c4b5', 'd8e8', 'b5c4', 'c8d8',
  'c4b5', 'd8b8', 'b5c4', 'b8c8',
  'c4b5', 'c8d8', 'b5c4', 'd8b8',
  'c4b5', 'b8a8', 'b5c4', 'h8g8',
  'c4b5', 'a8b8', 'b5c4', 'b8c8',
  'c4b5', 'c8d8', 'b5c4', 'd8b8',
  'c4b5', 'b8c8', 'b5c4', 'c8d8',
  'c4b5', 'd8a8', 'b5c4', 'e8d8',
  'c4b5', 'a8b8', 'b5c4', 'b8c8',
  'c4b5', 'c8a8', 'b5c4', 'a8b8',
  'c4b5', 'b8c8', 'b5c4', 'a7a8',
  'c4b5', 'a8b8', 'b5c4', 'd8e8',
  'c4b5', 'b8a8', 'b5c4', 'c8d8',
  'c4b5', 'a8b8', 'b5c4', 'b8c8',
  'c4b5', 'c8a8', 'b5c4', 'a8b8',
  'c4b5', 'b8c8', 'b5c4', 'g8h8',
  'c4b5', 'c8b8', 'b5c4', 'b8a8',
] as const;

describe('reduce: playing', () => {
  it('starts from the standard position with White to move', () => {
    const s = initialState();
    expect(gameAt(s).fen()).toBe(START_FEN);
    expect(gameAt(s).turn()).toBe('w');
    expect(s.moves).toEqual([]);
    expect(s.cursor).toBe(0);
    expect(s.status).toEqual({ kind: 'playing', check: false });
    expect(s.resignedBy).toBeNull();
    // 0 < 0 is false: the start position is the live position, not a review.
    expect(isReviewing(s)).toBe(false);
  });

  it('records a move and advances the cursor', () => {
    const s = run([uci('e2e4')]);
    expect(s.moves.map((m) => m.san)).toEqual(['e4']);
    // `toMatchObject`, never `toStrictEqual`: `applyMove` always emits the
    // `promotion` key, `uciToMove` omits it.
    expect(s.moves).toMatchObject([{ from: 'e2', to: 'e4', san: 'e4' }]);
    expect(s.cursor).toBe(1);
    expect(gameAt(s).turn()).toBe('b');
    expect(gameAt(s).fen()).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    expect(s.status).toEqual({ kind: 'playing', check: false });
    expect(isReviewing(s)).toBe(false);
  });

  it('ignores an illegal move and leaves state untouched', () => {
    const before = initialState();
    const after = reduce(before, uci('e2e5')); // a pawn cannot jump two squares from e2
    expect(after).toBe(before);
  });

  it('rejects a move played for the side that is not to move', () => {
    // chess.js only matches `move()` against moves generated for the side to
    // move, so `tryApplyMove` rejects White's second e2e4 outright. The reducer
    // therefore does police turn order, and returns the same reference.
    const s = run([uci('e2e4')]);
    expect(gameAt(s).turn()).toBe('b');
    const after = reduce(s, uci('e2e4'));
    expect(after).toBe(s);
    expect(after.moves.map((m) => m.san)).toEqual(['e4']);
    expect(after.cursor).toBe(1);
  });

  it('rejects a uci string that is not a move at all', () => {
    const s = initialState();
    expect(reduce(s, uci('zzzz'))).toBe(s);
    expect(reduce(s, uci(''))).toBe(s);
  });

  it('accepts a Move object and records the rules layer SAN, not the empty one it was given', () => {
    // `playUci` synthesises a Move whose `san` is ''; the recorded move must
    // carry the SAN the rules layer computed.
    const s = run([{ type: 'play', move: { from: 'e2', to: 'e4', san: '' } }]);
    expect(s.moves.map((m) => m.san)).toEqual(['e4']);
    expect(s.moves).toMatchObject([{ from: 'e2', to: 'e4', san: 'e4' }]);
    expect(s.cursor).toBe(1);
    expect(gameAt(s).turn()).toBe('b');
    // ...and `play` and `playUci` agree.
    expect(run([{ type: 'play', move: { from: 'e2', to: 'e4', san: '' } }]).moves)
      .toEqual(run([uci('e2e4')]).moves);
  });

  it('rejects an illegal Move object', () => {
    const before = initialState();
    expect(reduce(before, { type: 'play', move: { from: 'e2', to: 'e5', san: '' } })).toBe(before);
  });

  it('detects checkmate reached by real play', () => {
    // Scholar's mate: 1.e4 e5 2.Bc4 Nc6 3.Qh5 Nf6 4.Qxf7#
    const s = run([
      uci('e2e4'), uci('e7e5'), uci('f1c4'), uci('b8c6'),
      uci('d1h5'), uci('g8f6'), uci('h5f7'),
    ]);
    expect(s.moves.map((m) => m.san)).toEqual([
      'e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#',
    ]);
    expect(s.status).toEqual({ kind: 'checkmate', winner: 'w' });
    // The winner is the side NOT to move, so pin the turn the winner comes from.
    expect(gameAt(s).turn()).toBe('b');
    expect(gameAt(s).isGameOver()).toBe(true);
    // Nothing may be played onto a finished game.
    expect(reduce(s, uci('e7e5'))).toBe(s);
  });

  it('records resignation with the other side as winner', () => {
    const s = run([{ type: 'resign' }]);
    expect(s.status).toEqual({ kind: 'resigned', winner: 'b' });
    // White was to move, so White is the one who resigned.
    expect(s.resignedBy).toBe('w');
  });

  it('records resignation against whichever side is to move', () => {
    const s = run([uci('e2e4'), { type: 'resign' }]);
    expect(gameAt(s).turn()).toBe('b');
    expect(s.status).toEqual({ kind: 'resigned', winner: 'w' });
    expect(s.resignedBy).toBe('b');
  });

  it('resigning while reviewing still resigns the live game', () => {
    // 4 plies, so it is White to move live; the cursor at 3 shows a position
    // where it is Black to move. Resignation is about the game, not the board
    // on screen, so it must still be White who resigned.
    const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), uci('b8c6')]);
    const reviewing = reduce(game, { type: 'goto', cursor: 3 });
    expect(gameAt(reviewing).turn()).toBe('b');
    expect(gameAt(game).turn()).toBe('w');
    const s = reduce(reviewing, { type: 'resign' });
    expect(s.status).toEqual({ kind: 'resigned', winner: 'b' });
    expect(s.resignedBy).toBe('w');
  });

  it('a resignation is terminal: a further move is refused', () => {
    // The learner has given up, so the board is no longer playable. `legalMoves`
    // shows e4 is perfectly legal here, so this refusal is the reducer's rule
    // and not chess.js rejecting an impossible move.
    const resigned = run([{ type: 'resign' }]);
    expect(legalMoves(gameAt(resigned))).toContain('e4');
    expect(reduce(resigned, uci('e2e4'))).toBe(resigned);
    expect(reduce(resigned, { type: 'play', move: { from: 'e2', to: 'e4', san: '' } })).toBe(resigned);
  });

  it('playing from a rewound cursor is still allowed, and abandons a resignation', () => {
    // The guard is on the position being played *from*, and a resignation blocks
    // only the live game. Rewinding to 0 and playing rewrites history, so this
    // is a new game: the old resignation no longer applies, exactly as it does
    // not survive an `undo`.
    const resigned = run([uci('e2e4'), uci('e7e5'), { type: 'resign' }]);
    expect(resigned.status).toEqual({ kind: 'resigned', winner: 'b' });
    expect(reduce(resigned, uci('g1f3'))).toBe(resigned); // live: refused
    const branched = reduce(reduce(resigned, { type: 'goto', cursor: 0 }), uci('d2d4'));
    expect(branched.moves.map((m) => m.san)).toEqual(['d4']);
    expect(branched.cursor).toBe(1);
    expect(branched.status).toEqual({ kind: 'playing', check: false });
    expect(branched.resignedBy).toBeNull();
  });

  it('a resignation is terminal even when the cursor is stale', () => {
    // Corrupt storage can pair a resignation with a cursor beyond the move
    // list. The game is still over, so the move must be refused — which is why
    // the live check is `cursor >= moves.length` and not `===`.
    const stale: GameSnapshot = {
      moves: [], cursor: 3, status: { kind: 'resigned', winner: 'b' }, resignedBy: 'w',
    };
    expect(reduce(stale, uci('e2e4'))).toBe(stale);
  });

  it('taking back after a resignation clears it too', () => {
    // Rewinding is the escape hatch from a finished game, and a resignation
    // recomputes like any other status.
    const resigned = run([uci('e2e4'), uci('e7e5'), { type: 'resign' }]);
    expect(resigned.resignedBy).toBe('w');
    expect(resigned.status).toEqual({ kind: 'resigned', winner: 'b' });
    const s = reduce(resigned, { type: 'undo' });
    expect(s.moves).toEqual([]);
    expect(s.resignedBy).toBeNull();
    expect(s.status).toEqual({ kind: 'playing', check: false });
  });

  it('records a promotion from a uci move', () => {
    // 1.a4 b5 2.axb5 h6 3.b6 h5 4.b7 h4 5.bxc8=Q
    const s = uciList([
      'a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4', 'b7c8q',
    ]);
    expect(s.moves).toHaveLength(9);
    expect(s.moves.at(-1)).toMatchObject({
      from: 'b7', to: 'c8', promotion: 'q', san: 'bxc8=Q',
    });
    expect(gameAt(s).get('c8')).toEqual({ type: 'q', color: 'w' });
  });

  it('rejects a promotion that names no piece, and one that names a king', () => {
    // Reached just before the promotion; only bxa8/bxc8 with q/r/b/n is legal.
    const at = uciList(['a2a4', 'b7b5', 'a4b5', 'h7h6', 'b5b6', 'h6h5', 'b6b7', 'h5h4']);
    expect(gameAt(at).turn()).toBe('w');
    expect(legalMoves(gameAt(at), 'b7')).toContain('bxc8=Q');
    expect(reduce(at, uci('b7c8'))).toBe(at);   // no piece named: chess.js refuses
    expect(reduce(at, uci('b7c8k'))).toBe(at);  // a king is not a promotable piece
    // ...while underpromotion is legal and is recorded as such.
    expect(sanAfter(reduce(at, uci('b7c8n')))).toBe('bxc8=N');
  });
});

describe('a finished game is terminal', () => {
  // chess.js enforces two of the six ways a game ends, by itself: a mated or
  // stalemated position has no legal move, so nothing can be played onto it.
  // Threefold, the fifty-move rule and insufficient material are draw *states*,
  // not move prohibitions — the moves that reach them are perfectly legal and
  // the moves after them are too. So a repetition or a saturated halfmove clock
  // must be refused by the reducer, or a pawn push resets the clock, the draw
  // banner disappears and the learner keeps playing a game the rules have
  // ended.
  it('a threefold draw is terminal: a further move is refused', () => {
    let s = initialState();
    for (let i = 0; i < 2; i++) {
      s = run([uci('g1f3'), uci('g8f6'), uci('f3g1'), uci('f6g8')], s);
    }
    expect(s.status).toEqual({ kind: 'threefold' });
    // d4 is legal here, so the refusal is the reducer's rule and not chess.js.
    expect(legalMoves(gameAt(s))).toContain('d4');
    expect(reduce(s, uci('d2d4'))).toBe(s);
    // Nothing about the draw moved: still 8 plies, clock still 8, still drawn.
    expect(s.moves).toHaveLength(8);
    expect(s.status).toEqual({ kind: 'threefold' });
    expect(gameAt(s).fen().split(' ')[4]).toBe('8');
  });

  it('a fifty-move draw is terminal: a further move is refused', () => {
    const s = uciList([...FIFTY_MOVE_TOUR]);
    expect(s.status).toEqual({ kind: 'fiftyMove' });
    // A pawn push and a capture are the two moves that dissolve a fifty-move
    // draw: both reset the halfmove clock to 0, and the next position is not a
    // repetition either, so the draw would silently become `playing`.
    expect(legalMoves(gameAt(s))).toContain('d4');
    expect(legalMoves(gameAt(s))).toContain('Bxd5');
    expect(reduce(s, uci('d2d4'))).toBe(s);
    expect(reduce(s, uci('c4d5'))).toBe(s);
    // Nothing about the draw moved.
    expect(s.moves).toHaveLength(FIFTY_MOVE_TOUR.length);
    expect(gameAt(s).fen().split(' ')[4]).toBe('100');
    expect(s.status).toEqual({ kind: 'fiftyMove' });
  });

  it('isGameOver names every way a game can end, and nothing else', () => {
    // The two kinds chess.js refuses on its own are included anyway, so the rule
    // does not depend on which of the six happen to be self-enforcing.
    const over: GameStatus[] = [
      { kind: 'checkmate', winner: 'w' },
      { kind: 'stalemate' },
      { kind: 'threefold' },
      { kind: 'fiftyMove' },
      { kind: 'insufficientMaterial' },
      { kind: 'resigned', winner: 'b' },
    ];
    for (const status of over) {
      expect(isGameOver(status)).toBe(true);
    }
    expect(isGameOver({ kind: 'playing', check: false })).toBe(false);
    expect(isGameOver({ kind: 'playing', check: true })).toBe(false);
  });

  it('rewinding is the way out of a finished game', () => {
    let s = initialState();
    for (let i = 0; i < 2; i++) {
      s = run([uci('g1f3'), uci('g8f6'), uci('f3g1'), uci('f6g8')], s);
    }
    const undone = reduce(s, { type: 'undo' });
    expect(undone.moves).toHaveLength(6);
    expect(undone.cursor).toBe(6);
    expect(undone.status).toEqual({ kind: 'playing', check: false });
    // ...and the game is playable again.
    expect(reduce(undone, uci('f3g1'))).not.toBe(undone);
  });
});

describe('reduce: undo', () => {
  it('rewinds one ply when the player has just moved', () => {
    // e4 e5 Nf3: the learner has just played and the engine has not answered.
    const s = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), { type: 'undo' }]);
    expect(s.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(s.cursor).toBe(2);
    expect(gameAt(s).turn()).toBe('w');
    expect(isReviewing(s)).toBe(false);
  });

  it('rewinds two plies when the engine has just replied', () => {
    const s = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), uci('b8c6'), { type: 'undo' }]);
    expect(s.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(s.cursor).toBe(2);
    expect(gameAt(s).turn()).toBe('w');
  });

  it('never leaves the board waiting on the opponent', () => {
    // At every prefix length of a real game, undo must land on an even count
    // with White to move. This is the property the other undo tests sample.
    const game = uciList(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5', 'a7a6', 'b5a4', 'd7d5']);
    for (let n = 1; n <= game.moves.length; n++) {
      const undone = reduce(reduce(game, { type: 'goto', cursor: n }), { type: 'undo' });
      expect(undone.moves.length % 2).toBe(0);
      expect(undone.moves.length).toBeLessThan(n);
      expect(gameAt(undone).turn()).toBe('w');
    }
  });

  it('rewinds one ply when the opponent has not replied', () => {
    const s = run([uci('e2e4'), { type: 'undo' }]);
    expect(s.moves).toHaveLength(0);
    expect(s.cursor).toBe(0);
    expect(gameAt(s).turn()).toBe('w');
  });

  it('is a no-op at the start of the game', () => {
    const before = initialState();
    expect(reduce(before, { type: 'undo' })).toBe(before);
  });

  it('is a no-op when the cursor is already at the start while reviewing', () => {
    const game = run([uci('e2e4'), uci('e7e5')]);
    const atStart = reduce(game, { type: 'first' });
    expect(atStart.cursor).toBe(0);
    expect(isReviewing(atStart)).toBe(true);
    expect(reduce(atStart, { type: 'undo' })).toBe(atStart);
  });

  it('rewinds a capture pair, not a single ply', () => {
    // e4 d5 exd5 Qxd5 is four plies; undo removes the last two, leaving the
    // position after 1...d5 with the captured pawn back on e4.
    const full = run([uci('e2e4'), uci('d7d5'), uci('e4d5'), uci('d8d5')]);
    expect(full.moves.map((m) => m.san)).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
    const undone = reduce(full, { type: 'undo' });
    expect(undone.moves.map((m) => m.san)).toEqual(['e4', 'd5']);
    expect(gameAt(undone).fen()).toBe(gameAt(run([uci('e2e4'), uci('d7d5')])).fen());
    // The capture really is undone: the black pawn is back on d5.
    expect(gameAt(undone).get('d5')).toEqual({ type: 'p', color: 'b' });
  });

  it('undo while reviewing rewinds from the cursor and drops the future', () => {
    // A take-back is a take-back: the moves after the cursor are discarded, not
    // preserved. Pinned here because the brief does not specify it.
    const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), uci('b8c6')]);
    const atThree = reduce(game, { type: 'goto', cursor: 3 });
    expect(isReviewing(atThree)).toBe(true);
    const undone = reduce(atThree, { type: 'undo' });
    expect(undone.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    expect(undone.cursor).toBe(2);
    expect(gameAt(undone).turn()).toBe('w');
  });
});

describe('reduce: navigation', () => {
  const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3'), uci('b8c6')]);

  it('first goes to the start', () => {
    const s = reduce(game, { type: 'first' });
    expect(s.cursor).toBe(0);
    expect(isReviewing(s)).toBe(true);
    expect(gameAt(s).fen()).toBe(START_FEN);
  });

  it('last returns to the live position', () => {
    const s = reduce(reduce(game, { type: 'first' }), { type: 'last' });
    expect(s.cursor).toBe(4);
    expect(isReviewing(s)).toBe(false);
    expect(gameAt(s).fen()).toBe(gameAt(game).fen());
  });

  it('prev and next step one ply and clamp at the ends', () => {
    let s = reduce(game, { type: 'prev' });
    expect(s.cursor).toBe(3);
    s = reduce(reduce(reduce(s, { type: 'prev' }), { type: 'prev' }), { type: 'prev' });
    expect(s.cursor).toBe(0);
    // One more `prev` from 0 must stay at 0, not go negative. Without this the
    // clamp is untested: three `prev`s from 4 only ever reach 0.
    s = reduce(s, { type: 'prev' });
    expect(s.cursor).toBe(0);
    expect(gameAt(s).fen()).toBe(START_FEN);
    s = reduce(reduce(s, { type: 'next' }), { type: 'prev' });
    expect(s.cursor).toBe(0);
  });

  it('next stops at the live position and cannot go past it', () => {
    const s = reduce(reduce(game, { type: 'next' }), { type: 'next' });
    expect(s.cursor).toBe(4);
    expect(reduce(s, { type: 'next' }).cursor).toBe(4);
    expect(isReviewing(s)).toBe(false);
    expect(gameAt(s).fen()).toBe(gameAt(game).fen());
  });

  it('goto clamps out-of-range cursors', () => {
    expect(reduce(game, { type: 'goto', cursor: 99 }).cursor).toBe(4);
    expect(reduce(game, { type: 'goto', cursor: -5 }).cursor).toBe(0);
  });

  it('navigation does not alter the move list', () => {
    expect(reduce(reduce(game, { type: 'first' }), { type: 'goto', cursor: 2 }).moves)
      .toHaveLength(4);
  });

  it('playing after navigating back truncates the future and continues from there', () => {
    // Cursor 1 is after 1.e4, so it is BLACK to move — the branching move must be
    // Black's. Playing a White move here is illegal and would be silently ignored.
    const back = reduce(game, { type: 'goto', cursor: 1 });
    expect(gameAt(back).turn()).toBe('b');
    expect(back.moves).toHaveLength(4);
    expect(gameAt(back).fen()).toBe(
      'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
    );
    const branched = reduce(back, uci('d7d5'));
    expect(branched.moves.map((m) => m.san)).toEqual(['e4', 'd5']);
    expect(branched.cursor).toBe(2);
    expect(isReviewing(branched)).toBe(false);
    expect(gameAt(branched).turn()).toBe('w');
    // Proof the branch really replaced the old future: 1.e4 d5, not the
    // mainline position after 1.e4 e5.
    expect(gameAt(branched).fen()).toBe(
      'rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2',
    );
  });

  it('a branched game still detects threefold repetition correctly', () => {
    let s = initialState();
    for (let i = 0; i < 2; i++) {
      s = run([uci('g1f3'), uci('g8f6'), uci('f3g1'), uci('f6g8')], s);
    }
    expect(s.status).toEqual({ kind: 'threefold' });
    // Navigate back, branch differently, and confirm repetition is recomputed.
    const branched = reduce(reduce(s, { type: 'goto', cursor: 0 }), uci('d2d4'));
    expect(branched.moves.map((m) => m.san)).toEqual(['d4']);
    expect(branched.status.kind).not.toBe('threefold');
    // ...and that the rewind alone, without branching, does NOT clear it: the
    // status describes the live game, not the position under the cursor.
    expect(reduce(s, { type: 'goto', cursor: 0 }).status).toEqual({ kind: 'threefold' });
  });
});

describe('gameAt', () => {
  it('replays the move list to the cursor', () => {
    const game = run([uci('e2e4'), uci('e7e5'), uci('g1f3')]);
    const g = gameAt(reduce(game, { type: 'goto', cursor: 1 }));
    // chess.js omits the en passant square unless a capture is actually legal,
    // and no black pawn is on d4 or f4 here, so there is none to record.
    expect(g.fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
  });

  it('records the en passant square only when the capture is genuinely available', () => {
    // 1.e4 d5 leaves White's pawn on the 4th rank, so there is NO en passant
    // capture: chess.js correctly omits the ep square. (exd5 is an ordinary
    // capture, not en passant.)
    const noEp = run([uci('e2e4'), uci('d7d5')]);
    const g1 = gameAt(noEp);
    // Assert the stated cause before the consequence: the black pawn that just
    // double-stepped really is on d5, the white pawn really is still on e4 (not
    // e5, where it could capture on d6), and the d6 target square is empty.
    expect(g1.get('d5')).toEqual({ type: 'p', color: 'b' });
    expect(g1.get('e4')).toEqual({ type: 'p', color: 'w' });
    expect(g1.get('e5')).toBeUndefined();
    expect(g1.get('d6')).toBeUndefined();
    expect(g1.fen()).toBe('rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2');
    expect(legalMoves(g1)).not.toContain('exd6');

    // 1.e4 Nf6 2.e5 d5 puts the white pawn on the 5th rank, so exd6 e.p. is
    // legal and the ep square is recorded.
    const withEp = run([uci('e2e4'), uci('g8f6'), uci('e4e5'), uci('d7d5')]);
    const g2 = gameAt(withEp);
    expect(g2.get('e5')).toEqual({ type: 'p', color: 'w' });
    expect(g2.get('d5')).toEqual({ type: 'p', color: 'b' });
    expect(g2.get('d6')).toBeUndefined(); // the landing square is empty
    expect(g2.fen()).toBe('rnbqkb1r/ppp1pppp/5n2/3pP3/8/8/PPPP1PPP/RNBQKBNR w KQkq d6 0 3');
    expect(legalMoves(g2)).toContain('exd6');
  });

  it('returns an independent instance each call (no shared mutation)', () => {
    const s = run([uci('e2e4')]);
    const a = gameAt(s);
    const b = gameAt(s);
    expect(a).not.toBe(b);
    a.move('e5');
    // `b` and a third replay are untouched by mutating `a`, and the snapshot's
    // own status is unaffected.
    expect(b.fen()).toBe('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1');
    expect(gameAt(s).fen()).toBe(b.fen());
    expect(s.status).toEqual({ kind: 'playing', check: false });
  });

  it('clamps a cursor beyond the move list instead of throwing', () => {
    // `GameSnapshot` is a public data shape and the plan persists the game as a
    // bare move list, so a deserialised or hand-edited snapshot can carry a
    // stale cursor. `gameAt` is called on the way to *rendering*, so it must
    // degrade to the longest playable prefix rather than throw.
    const stale: GameSnapshot = {
      moves: [], cursor: 3, status: { kind: 'playing', check: false }, resignedBy: null,
    };
    expect(gameAt(stale).fen()).toBe(START_FEN);
    const game = run([uci('e2e4'), uci('e7e5')]);
    expect(gameAt({ ...game, cursor: 99 }).fen()).toBe(gameAt(game).fen());
  });

  it('clamps a negative cursor to the start', () => {
    const game = run([uci('e2e4'), uci('e7e5')]);
    expect(gameAt({ ...game, cursor: -4 }).fen()).toBe(START_FEN);
  });

  it('a fifty-move status is distinguishable from threefold', () => {
    // This half pins the *boundary* in the rules layer: the same position one
    // halfmove short is not a fifty-move draw. The reducer deriving `fiftyMove`
    // from a real game is asserted at the bottom of this file, which is the
    // assertion that matters.
    const at100 = newGame();
    at100.load('8/8/8/4k3/8/8/4P3/4K3 w - - 100 60');
    const at99 = newGame();
    at99.load('8/8/8/4k3/8/8/4P3/4K3 w - - 99 60');
    expect(statusOf(at100)).toEqual({ kind: 'fiftyMove' });
    expect(statusOf(at99).kind).not.toBe('fiftyMove');
    // A hand-built snapshot is still a usable snapshot: the module's derived
    // values must not depend on how the snapshot was made.
    const handBuilt: GameSnapshot = {
      moves: [], cursor: 0, status: { kind: 'fiftyMove' }, resignedBy: null,
    };
    expect(isGameOver(handBuilt.status)).toBe(true);
    expect(isReviewing(handBuilt)).toBe(false);
    expect(gameAt(handBuilt).fen()).toBe(START_FEN);
  });

  it('a threefold draw reached by real play is reported as threefold', () => {
    let s = initialState();
    for (let i = 0; i < 2; i++) {
      s = run([uci('g1f3'), uci('g8f6'), uci('f3g1'), uci('f6g8')], s);
    }
    expect(s.status).toEqual({ kind: 'threefold' });
    // Threefold fires long before the 100-halfmove threshold, so a shuffled
    // game can never reach `fiftyMove`.
    expect(gameAt(s).fen().split(' ')[4]).toBe('8');
  });

  it('a fifty-move draw reached by real play is reported as fiftyMove', () => {
    const s = uciList([...FIFTY_MOVE_TOUR]);
    expect(s.moves).toHaveLength(FIFTY_MOVE_TOUR.length);
    // Pin the facts that make this a fifty-move draw and not a repetition: the
    // halfmove clock has reached 100 and no position occurred three times. Note
    // this does NOT discriminate the precedence between the two — `statusOf`
    // is the thing that decides, and both facts holding false/true is only
    // consistent with it. See `src/chess/rules.test.ts` for the assertion that
    // actually discriminates, where both hold at once.
    const g = gameAt(s);
    expect(g.fen().split(' ')[4]).toBe('100');
    expect(g.isThreefoldRepetition()).toBe(false);
    expect(g.isDrawByFiftyMoves()).toBe(true);
    expect(s.status).toEqual({ kind: 'fiftyMove' });
  });
});

describe('reduce: reset', () => {
  it('clears everything', () => {
    const s = run([
      uci('e2e4'), uci('e7e5'), { type: 'resign' }, { type: 'reset' },
    ]);
    // The game really was resigned before the reset, so `resignedBy` is not
    // trivially null.
    expect(s.moves).toEqual([]);
    expect(s.cursor).toBe(0);
    expect(s.resignedBy).toBeNull();
    expect(s.status).toEqual({ kind: 'playing', check: false });
    expect(gameAt(s).fen()).toBe(START_FEN);
    expect(isReviewing(s)).toBe(false);
  });

  it('a reset game accepts moves again', () => {
    const s = run([uci('e2e4'), { type: 'reset' }, uci('d2d4')]);
    expect(s.moves.map((m) => m.san)).toEqual(['d4']);
    expect(s.cursor).toBe(1);
  });

  it('never mutates the state it is given', () => {
    // Pure means pure: a snapshot handed in must be byte-for-byte the same
    // afterwards, so an earlier `useReducer` state cannot change under React's
    // feet, and `gameAt` cannot be re-derived differently later.
    //
    // The state is deliberately left *rewound*, because at the live position an
    // in-place truncation of `moves` would be a no-op and go unnoticed.
    const live = run([uci('e2e4'), uci('e7e5'), uci('g1f3')]);
    const before = reduce(live, { type: 'goto', cursor: 1 });
    expect(before.moves).toHaveLength(3);
    expect(before.cursor).toBe(1);
    const pristine = { ...before, moves: before.moves.map((m) => ({ ...m })) };
    const actions: GameAction[] = [
      { type: 'goto', cursor: 0 },
      { type: 'prev' },
      { type: 'next' },
      { type: 'last' },
      { type: 'first' },
      { type: 'undo' },
      { type: 'resign' },
      { type: 'playUci', uci: 'e7e5' },
      { type: 'play', move: { from: 'd7', to: 'd5', san: '' } },
      { type: 'reset' },
    ];
    for (const action of actions) {
      reduce(before, action);
    }
    expect(before.moves).toEqual(pristine.moves);
    expect(before.cursor).toBe(pristine.cursor);
    expect(before.status).toEqual(pristine.status);
    expect(before.resignedBy).toBe(pristine.resignedBy);
    // The list the caller still holds is the same one, untouched.
    expect(live.moves.map((m) => m.san)).toEqual(['e4', 'e5', 'Nf3']);
  });
});
