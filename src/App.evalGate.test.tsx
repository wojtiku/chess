// I1's invariant, pinned.
//
// The eval bar converts a score with `sideToMove`, and the engine's score is for
// the side to move *in the position it searched*. So handing the bar a score from
// one position and a turn from another produces a confidently **mirrored**
// number — and for a bar that is a wrong number rather than a missing one.
//
// `useGame` does clear the analysis when the position changes, but it does it in
// an effect, and React runs effects *after* the commit, so there is always a
// committed render in which the previous position's score is in hand alongside the
// new position's turn. `App` therefore gates on the `fen` the `Analysis` carries.
//
// **Why this is a separate file from `App.test.tsx`.** That file imports the real
// `useGame`, which is what it is testing; mocking the hook out from under it would
// change what it tests for every other case in it. Here the hook is replaced
// wholesale so the gate can be driven from the state it is a function *of* — which
// is the point: the gate is pure, so it is pinned by giving it committed state
// rather than by racing an effect. A previous attempt used a MutationObserver
// watching the bar over time and passed against the unfixed code, because `act()`
// and user-event both flush passive effects before the observer's microtask runs.
// **No effect is involved here at all**, which is why this version cannot pass for
// that reason.

import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Chess } from './chess/rules';
import { initialState } from './game/gameState';
import { DEFAULT_SETTINGS, type Settings } from './game/difficulty';
import type { GameApi } from './game/useGame';
import type { Analysis } from './analysis/evaluate';
import App from './App';

/** The FEN of the position the mock is showing. */
const SHOWN = new Chess('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1').fen();
/** A different position — here, one move later, so the *turn* differs too, which is
 *  what makes a mismatch a mirror rather than a harmless staleness. */
const OTHER = new Chess('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1').fen();

/** What the mocked hook hands back. Overwritten per test. */
let api: GameApi;

vi.mock('./game/useGame', () => ({
  useGame: (): GameApi => api,
}));

/** A complete `GameApi`, so a test states only what it is about. */
function makeApi(over: Partial<GameApi> = {}): GameApi {
  const game = new Chess(SHOWN);
  return {
    snapshot: initialState(),
    game,
    settings: { ...DEFAULT_SETTINGS } as Settings,
    reviewing: false,
    playerTurn: true,
    canMove: true,
    gameOver: false,
    engineStatus: 'ready',
    engineError: null,
    hint: null,
    hintBusy: false,
    analysis: null,
    play: vi.fn(),
    dispatch: vi.fn(),
    undo: vi.fn(),
    resign: vi.fn(),
    newGame: vi.fn(),
    goto: vi.fn(),
    requestHint: vi.fn(async () => {}),
    playHint: vi.fn(),
    setSettings: vi.fn(),
    flip: vi.fn(),
    ...over,
  };
}

const analysisFor = (fen: string, scoreCp: number): Analysis => ({
  fen,
  scoreCp,
  depth: 20,
  lines: [],
});

/** `data-white-share`, the bar's own reading of which way it points. */
const share = (): string => screen.getByTestId('eval-bar').getAttribute('data-white-share') ?? '';

describe("the eval bar's fen gate", () => {
  it('shows a score that belongs to the position on screen', () => {
    // The control: matching `fen`, so the bar is fed a +200 and must show White
    // ahead. Without this the test below would also pass on a bar that shows
    // nothing at all.
    api = makeApi({ analysis: analysisFor(SHOWN, 200) });
    render(<App />);

    expect(share()).not.toBe('50');
    expect(Number(share())).toBeGreaterThan(50);
  });

  it('ignores a score computed for a DIFFERENT position', () => {
    // **The invariant.** A +200 for the side to move in the position *after*
    // 1.e4, shown on the board *before* it: converting that with White to move
    // is legal, but it is a number for a board that is not on screen. The gate
    // must refuse it, and the honest rendering of "no analysis for this position"
    // is the neutral bar.
    api = makeApi({ analysis: analysisFor(OTHER, 200) });
    render(<App />);

    expect(share()).toBe('50');
  });

  it('ignores it even when the turn happens to agree', () => {
    // The same staleness with the turn matching — after 1.e4 and 1...e5 it is
    // White to move again, so a stale score converts without mirroring and the
    // number is *plausible*. It is still a number for another board, and a bar
    // that shows it is displaying an evaluation of a position the learner is not
    // looking at. A gate that only caught turn changes would pass this.
    const later = new Chess('rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2').fen();
    api = makeApi({ analysis: analysisFor(later, 200) });
    render(<App />);

    expect(new Chess(SHOWN).turn()).toBe('w');
    expect(new Chess(later).turn()).toBe('w');
    expect(share()).toBe('50');
  });

  it('ignores a mate score from another position just as it ignores centipawns', () => {
    // `whiteShare` takes the mate branch *before* the centipawn one, so a gate
    // that only reasoned about `scoreCp` would let a stale mate through and the
    // bar would read 100 — the strongest possible wrong answer.
    api = makeApi({ analysis: { fen: OTHER, scoreMate: 3, depth: 20, lines: [] } });
    render(<App />);

    expect(share()).toBe('50');
  });

  it('is neutral when there is no analysis at all', () => {
    // The ordinary "not known yet" state, and the value the two cases above must
    // be indistinguishable from — otherwise a learner could tell the two apart
    // only by the bar being wrong.
    api = makeApi({ analysis: null });
    render(<App />);

    expect(share()).toBe('50');
  });

  it('re-reads the gate when the position and the analysis change together', () => {
    // Not a transient: two renders of the same mounted app, the second with a
    // matching `fen`. The gate is a per-render comparison, so it has to re-evaluate
    // rather than latch — and this is the shape the real app takes when a
    // position arrives with its evaluation already in hand.
    const { rerender } = render(<App />);
    expect(share()).toBe('50');

    api = makeApi({ analysis: analysisFor(SHOWN, 200) });
    rerender(<App />);

    expect(Number(share())).toBeGreaterThan(50);
  });
});
