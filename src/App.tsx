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
  // `sideToMove` is the turn of the position being *drawn*, which is `game`'s:
  // `useGame` only ever holds an analysis for the position on screen (it clears
  // the analysis when the position changes and refills it only if it still matches),
  // so the two are the same position by construction. Reading the turn of the
  // *live* game instead would be wrong here: while reviewing an earlier ply, that
  // is a different position, and the bar would convert one position's score with
  // another position's turn.
  const lastMove = (() => {
    const played = g.snapshot.moves[g.snapshot.cursor - 1];
    return played === undefined ? null : { from: played.from, to: played.to };
  })();

  return (
    <div className="app">
      <header className="app-header">
        <h1>Chess Practice Board</h1>
        <p className="app-sub">You play White. Take your time.</p>
      </header>

      <div className="app-main">
        <div className="app-board">
          <EvalBar
            sideToMoveCp={g.analysis?.scoreCp}
            sideToMoveMate={g.analysis?.scoreMate}
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
