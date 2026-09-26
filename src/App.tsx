// Where every subsystem meets. This file decides nothing: the reducer decides
// whether a move is legal, `useGame` decides when the engine is asked, and each
// panel decides what it looks like. What is left here is the wiring — which prop
// goes to which panel — and the two places where wiring is easy to get subtly
// wrong, both called out below.

import { useEffect } from 'react';
import { useGame } from './game/useGame';
import Board from './ui/Board/Board';
import MoveList from './ui/MoveList/MoveList';
import EvalBar from './ui/EvalBar/EvalBar';
import Captured from './ui/Captured/Captured';
import Controls from './ui/Controls/Controls';
import DifficultyControl from './ui/DifficultyControl/DifficultyControl';
import ResultBanner from './ui/ResultBanner/ResultBanner';
import EngineStatusView from './ui/EngineStatus/EngineStatus';
import './App.css';

export default function App() {
  const g = useGame();
  /** Everything that needs the engine is off, and the board is local two-player. */
  const engineUnavailable = g.engineStatus === 'error';

  useEffect(() => {
    document.documentElement.dataset.theme = g.settings.theme;
  }, [g.settings.theme]);

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
  // so the honest check is to compare that with the FEN being drawn, and until now
  // nothing did.
  //
  // **This invariant is structural, not test-observable in this stack, and that is
  // worth knowing before someone tries.** A test for it was written: a
  // MutationObserver recording every `data-white-share` the bar commits, driven by
  // a move. It passed against the unfixed code — `act()` and user-event both flush
  // passive effects before the observer's microtask runs, so the mirrored commit
  // never reaches the DOM the test can see. Sabotage confirmed it: removing this
  // gate leaves the test green. So the test was removed rather than shipped as one
  // that proves nothing, which is the failure mode this branch's reviews exist to
  // catch. Whether the frame reaches a real screen depends on React's effect-flush
  // ordering for a discrete click, so it may never be visible — but it is in
  // React's committed model, and a mirrored bar is a wrong bar.
  const drawnFen = g.game.fen();
  const drawn = g.analysis?.fen === drawnFen ? g.analysis : null;
  const lastMove = (() => {
    const played = g.snapshot.moves[g.snapshot.cursor - 1];
    return played === undefined ? null : { from: played.from, to: played.to };
  })();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Practice Board</h1>
        <p className="app-sub">You play White. Take your time.</p>
        {/*
          The theme switch, in the header and nowhere else, because it is a
          preference rather than a move: it writes one field of the settings object
          and reads nothing else. Kept inline rather than given a panel of its own
          because it has no logic — a target, a label, and a spread of the settings
          it was handed, so a component would be three lines of indirection around
          `setSettings`.

          The label is the ACTION and not the current state, so a screen-reader
          user hears what pressing it will do ("Switch to dark theme") rather than
          a state they already know and have to interpret. The default comes from
          `prefers-color-scheme` in `persistence.ts`, which is the one place that
          can tell "no stored preference" from "a stored light preference"; this
          button therefore only ever overrides it, and the override is persisted
          like every other setting.
        */}
        <button
          type="button"
          className="theme-toggle"
          onClick={() =>
            g.setSettings({ ...g.settings, theme: g.settings.theme === 'dark' ? 'light' : 'dark' })
          }
        >
          <span aria-hidden="true">{g.settings.theme === 'dark' ? '☀' : '☾'}</span>
          Switch to {g.settings.theme === 'dark' ? 'light' : 'dark'} theme
        </button>
      </header>

      <div className="app-main">
        <div className="app-board">
          <EvalBar
            sideToMoveCp={drawn?.scoreCp}
            sideToMoveMate={drawn?.scoreMate}
            sideToMove={g.game.turn()}
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
        </div>

        <aside className="app-panel">
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
        </aside>
      </div>
    </div>
  );
}
