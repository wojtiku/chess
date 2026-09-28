import { useCallback, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { QUICKSTART, checkQuickstartStep, type QuickstartOutcome, type QuickstartStep } from '../../teaching/quickstart';
import Board from '../Board/Board';
import type { BoardArrow } from '../Board/arrows';
import './Quickstart.css';

export interface QuickstartProps {
  /** The learner is White in release 1; the board orients to them. */
  onFinished: () => void;
  onCancel: () => void;
}

/**
 * The mandatory opening a learner plays before anything else.
 *
 * Purely local: no engine, no evaluation, no key, no network. That is the point
 * of it — the learner is asked to *do* things, and every answer is checked by
 * `chess.js`, which is the only thing in the app that can be trusted to say
 * whether a move is legal. It is also why this mode exists before the coach
 * does: it is the one part of the tutor that works with no key at all, so a
 * first-time visitor sees something happen.
 *
 * Each step is a fresh position rather than a continuation, because a step that
 * depended on the previous one could strand a learner who skipped or repeated
 * it. The learner is told what to do and why, and both are ours — no model is
 * involved in saying anything here.
 */
export default function Quickstart({ onFinished, onCancel }: QuickstartProps) {
  const [index, setIndex] = useState(0);
  const [attempt, setAttempt] = useState<{ from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' } | null>(null);
  const [outcome, setOutcome] = useState<QuickstartOutcome | null>(null);
  const [solved, setSolved] = useState<Set<number>>(new Set());

  const step: QuickstartStep = QUICKSTART[index]!;
  const fen = step.startFen === 'previous' ? QUICKSTART[0]!.startFen : step.startFen;

  // A fresh `Chess` per render of the step, so the board never sees a mutated
  // instance the parent still holds — the same rule the app follows in free play.
  const game = useMemo(() => new Chess(fen), [fen]);
  const isLast = index === QUICKSTART.length - 1;

  const advance = useCallback(() => {
    if (isLast) {
      onFinished();
      return;
    }
    setIndex((i) => i + 1);
    setAttempt(null);
    setOutcome(null);
  }, [isLast, onFinished]);

  const onMove = useCallback(
    (m: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      // One attempt per step until they move on. A second move after a wrong one
      // is not a retry here — the quickstart has no recovery step, and pretending
      // otherwise would let a learner stumble into the next lesson.
      if (outcome !== null) return;
      const result = checkQuickstartStep(step, fen, m);
      setAttempt(m);
      setOutcome(result);
      if (result === 'solved') {
        setSolved((s) => new Set(s).add(index));
      }
    },
    [outcome, step, fen, index],
  );

  const arrows: BoardArrow[] = attempt
    ? [{ from: attempt.from, to: attempt.to, role: outcome === 'solved' ? 'better' : 'played' }]
    : [];

  return (
    <div className="quickstart">
      <div className="quickstart-panel" role="group" aria-label="Quickstart">
        <p className="quickstart-progress" data-testid="quickstart-progress">
          Step {index + 1} of {QUICKSTART.length}
        </p>

        <h2 className="quickstart-instruction">{step.instruction}</h2>
        <p className="quickstart-purpose">{step.purpose}</p>

        {outcome === null && <p className="quickstart-goal">{step.goal ?? step.instruction}</p>}

        {outcome !== null && <Feedback outcome={outcome} step={step} />}

        <div className="quickstart-actions">
          {outcome === 'solved' && (
            <button type="button" onClick={advance} data-testid="quickstart-next">
              {isLast ? 'Finish' : 'Next step'}
            </button>
          )}
          {outcome !== null && outcome !== 'solved' && (
            <button type="button" onClick={onCancel} data-testid="quickstart-give-up">
              Skip the quickstart
            </button>
          )}
          {outcome === null && (
            <button type="button" onClick={onCancel} data-testid="quickstart-cancel">
              Cancel
            </button>
          )}
        </div>

        <ol className="quickstart-dots" aria-label="Steps completed">
          {QUICKSTART.map((s, i) => (
            <li
              key={s.id}
              data-done={solved.has(i)}
              data-current={i === index}
              title={s.instruction}
            />
          ))}
        </ol>
      </div>

      {/*
        While a wrong answer is on screen the board is inert: the move already
        happened and the learner is being told why it was a mistake. Letting them
        play again over the top of that is how the mark disappears.
      */}
      <div className="quickstart-board" data-testid="quickstart-board">
        <Board
          game={game}
          orientation="w"
          interactive={outcome === null}
          lastMove={attempt}
          arrows={arrows}
          onMove={onMove}
        />
      </div>
    </div>
  );
}

function Feedback({ outcome, step }: { outcome: QuickstartOutcome; step: QuickstartStep }) {
  if (outcome === 'solved') {
    return (
      <p className="quickstart-feedback" data-variant="solved" data-testid="quickstart-feedback">
        That is right.
      </p>
    );
  }
  return (
    <p className="quickstart-feedback" data-variant={outcome} data-testid="quickstart-feedback">
      {outcome === 'illegal'
        ? 'That is not a legal move. Try a different square.'
        : outcome === 'not-the-piece'
          ? `That was a legal move, but this step is about a different piece. ${step.goal ?? ''}`
          : `That is a legal move, but it is not the one. ${step.goal ?? ''}`}
    </p>
  );
}
