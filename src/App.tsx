// Where every subsystem meets. This file decides nothing: the reducer decides
// whether a move is legal, `useGame` decides when the engine is asked, and each
// panel decides what it looks like. What is left here is the wiring — which prop
// goes to which panel — and the two places where wiring is easy to get subtly
// wrong, both called out below.

import { useCallback, useEffect, useState } from 'react';
import { useGame } from './game/useGame';
import Board from './ui/Board/Board';
import MoveList from './ui/MoveList/MoveList';
import EvalBar from './ui/EvalBar/EvalBar';
import Captured from './ui/Captured/Captured';
import Controls from './ui/Controls/Controls';
import DifficultyControl from './ui/DifficultyControl/DifficultyControl';
import ResultBanner from './ui/ResultBanner/ResultBanner';
import EngineStatusView from './ui/EngineStatus/EngineStatus';
import Quickstart from './ui/Quickstart/Quickstart';
import CoachPanel from './ui/Coach/CoachPanel';
import ReviewPanel from './ui/Review/ReviewPanel';
import { BoardWorkspace, type Mode } from './ui/TutorShell';
import './App.css';

export default function App() {
  const g = useGame();
  // One sidebar selection, no router or landing screen. Learn temporarily draws
  // an exercise board; useGame stays mounted so returning restores the game.
  const [mode, setMode] = useState<Mode>('play');
  const onMode = useCallback((m: Mode) => setMode(m), []);
  /** Everything that needs the engine is off, and the board is local two-player. */
  const engineUnavailable = g.engineStatus === 'error';

  // DELIBERATELY NO SIGN FLIP HERE. The engine's score is for the side to move in
  // the position it analysed, and `EvalBar` takes `sideToMove` and converts once,
  // in one tested function. The `whiteCp`/`whiteMate` ternary this replaces was a
  // per-render inline flip — the exact failure the required `sideToMove` prop
  // exists to eliminate — so do not restore it, and do not "fix" a type error by
  // keeping it.
  //
  // `sideToMove` is the turn of the position being *drawn*, which is `game`'s,
  // and `drawn` is gated to be the position the score was computed for. Reading
  // the turn of the *live* game instead would be wrong here: while reviewing an
  // earlier ply, that is a different position, and the bar would convert one
  // position's score with another position's turn.
  //
  // **The gate, and why the old comment was wrong.** This used to say the two are
  // "the same position by construction, because useGame clears the analysis when
  // the position changes". They are not, in the render that matters: `setAnalysis
  // (null)` runs inside a `useEffect`, and React runs effects *after* the commit.
  // So on every learner move React committed a render in which the PREVIOUS
  // position's side-to-move score was still in hand and was converted with the NEW
  // position's turn — a mirrored number, which for a bar is a wrong number rather
  // than a missing one. `Analysis` already carries the `fen` it was computed for,
  // so the check is to compare that with the FEN being drawn.
  //
  // Pinned by `App.evalGate.test.tsx`, which mocks this hook and hands `App` an
  // analysis for a different position. Three of its six assertions fail if this
  // line is removed, so it is a real gate and not a comment.
  //
  // **What the first version of that test got wrong, because it is the natural
  // mistake.** It used a MutationObserver watching `data-white-share` across a
  // move, and passed against the unfixed code: `act()` and user-event both flush
  // passive effects before the observer's microtask runs, so the mirrored commit
  // never reached the DOM. The conclusion drawn from that — "this invariant is not
  // test-observable" — was wrong, and the review was right to reject it. Effect
  // ordering defeats a test that watches the DOM *over time*; it says nothing about
  // a gate that is a pure function of committed state. That is what the new test
  // exercises, with no effect involved at all. Whether the mirrored frame reaches a
  // real screen still depends on React's effect-flush ordering for a discrete
  // click, so it may never be visible — but it is in React's committed model, and a
  // mirrored bar is a wrong bar.
  //
  // **A stale score is shown, not withheld.** The engine runs a reply search and
  // then an analysis, strictly one at a time, so for several seconds after every
  // learner move the position on screen has no evaluation of its own. Blanking the
  // bar draws `whiteShare`'s no-score answer, which is exactly 50 — and a bar
  // sitting precisely at the midpoint *claims the position is level*, which is a
  // different statement from "not known yet". So the last score is kept, dimmed,
  // and `sideToMove` is `shown.sideToMove` — the turn the score was measured
  // against. Taking the turn from the board instead is the mirroring bug above;
  // `App.evalGate.test.tsx` pins the two disagreeing.
  const drawnFen = g.game.fen();
  const shown = g.analysis;
  const stale = shown !== null && shown.fen !== drawnFen;
  const lastMove = (() => {
    const played = g.snapshot.moves[g.snapshot.cursor - 1];
    return played === undefined ? null : { from: played.from, to: played.to };
  })();

  return (
    <div className="app">
      {mode === 'learn' && (
          <Quickstart
            onFinished={() => setMode('review')}
            onCancel={() => setMode('play')}
            renderLayout={(board, panel) => (
              <BoardWorkspace board={board} mode={mode} onChange={onMode}>{panel}</BoardWorkspace>
            )}
          />
      )}

      {mode !== 'learn' && (
      <BoardWorkspace mode={mode} onChange={onMode} board={<>
          <EvalBar
            sideToMoveCp={shown?.scoreCp}
            sideToMoveMate={shown?.scoreMate}
            sideToMove={shown?.sideToMove ?? g.game.turn()}
            stale={stale}
            orientation={g.settings.orientation}
          />
          <Board
            // `gameAt`, so the move history is intact. `Captured` reads captured
            // pieces out of that history, and a FEN-loaded `Chess` would report a
            // perfectly correct material difference next to no captured pieces at
            // all, with nothing on screen to say so.
            game={g.game}
            orientation={g.settings.orientation}
            interactive={g.canMove}
            lastMove={lastMove}
            arrows={g.hint === null ? [] : [{ from: g.hint.uci.slice(0, 2), to: g.hint.uci.slice(2, 4) }]}
            onMove={g.play}
          />
        </>}>
          {mode === 'coach' && <CoachPanel fen={drawnFen} />}
          {mode === 'review' && <ReviewPanel onLearn={() => setMode('learn')} />}
          {mode === 'play' && <>
          <div className="app-panel-heading">
            <h2>Your game</h2>
            <p>Play, explore a move, or revisit the position.</p>
          </div>
          <ResultBanner status={g.snapshot.status} />
          <EngineStatusView status={g.engineStatus} error={g.engineError} />
          <Captured game={g.game} />

          <div className="app-hints" role="group" aria-label="Hints">
            <button
              type="button"
              onClick={() => void g.requestHint()}
              disabled={!g.playerTurn || g.hintBusy || engineUnavailable}
            >
              {g.hintBusy ? 'Thinking…' : 'Hint'}
            </button>
            {g.hint !== null && (
              <button type="button" onClick={g.playHint}>
                Play hint move
              </button>
            )}
          </div>
          {g.hint !== null && (
            <p className="app-hint-line">
              {/* `san` can be empty for a line that does not apply to the analysed
                  position, so the engine's own move is the floor rather than a
                  blank. */}
              Consider <strong>{g.hint.san[0] ?? g.hint.uci}</strong>
              {g.hint.san.length > 1 && <> — {g.hint.san.join(' ')}</>}
            </p>
          )}

          <MoveList
            moves={g.snapshot.moves}
            cursor={g.snapshot.cursor}
            onGoto={g.goto}
          />

          <Controls
            // `cursor`, not the moves *after* it: the take-back that matters most
            // is at the live position, where a "future length" would be zero and
            // the button would be disabled exactly when it is needed.
            canUndo={g.snapshot.cursor > 0}
            canResign={!g.gameOver}
            canNewGame
            atStart={g.snapshot.cursor === 0}
            atEnd={g.snapshot.cursor === g.snapshot.moves.length}
            onUndo={g.undo}
            onResign={g.resign}
            onNewGame={g.newGame}
            onFlip={g.flip}
            onFirst={() => g.dispatch({ type: 'first' })}
            onPrev={() => g.dispatch({ type: 'prev' })}
            onNext={() => g.dispatch({ type: 'next' })}
            onLast={() => g.dispatch({ type: 'last' })}
          />

          <DifficultyControl
            settings={g.settings}
            onChange={g.setSettings}
            disabled={engineUnavailable}
          />
          </>}
      </BoardWorkspace>
      )}
    </div>
  );
}
