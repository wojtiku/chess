import './Controls.css';

export interface ControlsProps {
  /** Whether a take-back is available. The reducer's own rule: it lands on an even
   *  ply so it is the learner's turn again, and it is always available while a
   *  game is in progress — including a finished one, since taking a move back is
   *  how a learner leaves a game the rules have ended. */
  canUndo: boolean;
  canResign: boolean;
  canNewGame: boolean;
  onUndo(): void;
  onResign(): void;
  onNewGame(): void;
  /** Never disabled: flipping is a view, not a move. */
  onFlip(): void;
  onFirst(): void;
  onPrev(): void;
  onNext(): void;
  onLast(): void;
  /** The cursor is at ply 0: there is nothing before it. */
  atStart: boolean;
  /** The cursor is at the live position: there is nothing after it. */
  atEnd: boolean;
}

/** Move navigation and the game buttons.
 *
 *  A dumb panel on purpose. It reads the flags it is given and calls the callbacks
 *  it is given, and decides nothing: whether a game can be resigned, whether an
 *  undo lands somewhere legal and whether the cursor may move are the reducer's
 *  questions, and a second answer here is a second thing to be wrong.
 *
 *  Every button carries an `aria-label` because every navigation button is an icon;
 *  an icon with no name is a dead control for a screen reader and for anyone who
 *  cannot see it. The visible text is the icon, and the name carries the words. */
export default function Controls(p: ControlsProps) {
  return (
    <div className="controls">
      <div className="controls-nav" role="group" aria-label="Move navigation">
        <button type="button" onClick={p.onFirst} disabled={p.atStart} aria-label="First move">
          <span aria-hidden="true">⏮</span>
        </button>
        <button type="button" onClick={p.onPrev} disabled={p.atStart} aria-label="Previous move">
          <span aria-hidden="true">◀</span>
        </button>
        <button type="button" onClick={p.onNext} disabled={p.atEnd} aria-label="Next move">
          <span aria-hidden="true">▶</span>
        </button>
        <button type="button" onClick={p.onLast} disabled={p.atEnd} aria-label="Last move">
          <span aria-hidden="true">⏭</span>
        </button>
      </div>
      <div className="controls-main" role="group" aria-label="Game controls">
        <button type="button" onClick={p.onUndo} disabled={!p.canUndo}>
          Undo
        </button>
        <button type="button" onClick={p.onResign} disabled={!p.canResign}>
          Resign
        </button>
        <button type="button" onClick={p.onNewGame} disabled={!p.canNewGame}>
          New game
        </button>
        <button type="button" onClick={p.onFlip}>
          Flip board
        </button>
      </div>
    </div>
  );
}
