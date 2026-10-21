import { useEffect, useRef } from 'react';
import { pieceName, srcFor } from '../Board/pieces';
import type { Side } from '../../chess/types';
import { useAppearance } from '../Appearance/AppearanceContext';
import './PromotionPicker.css';

export interface PromotionPickerProps {
  /** The square the piece is arriving on, which the popover is anchored to. */
  square: string;
  onSelect: (promotion: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
  /**
   * Whose pawn is promoting. Release 1 only ever has a White learner, so this
   * defaults to 'w' — but a picker hardcoded to White shows the *opponent's*
   * artwork the moment a Black learner exists, with no error to notice it by.
   * The learner picks a piece and their own pawn becomes the wrong colour.
   */
  colour?: Side;
}

/**
 * The four pieces a pawn may become, in the order they are offered: queen first,
 * because it is what a learner wants nine times in ten, and the three underpromotions
 * after it on equal terms, because they are real moves and not an afterthought.
 *
 * **The letters are the whole table.** The artwork and the spoken name are both
 * derived from `Board/pieces` — the one module that knows what a queen is called
 * and which file draws her. This panel used to carry its own copy of four Unicode
 * symbols, which meant a piece set that changed underneath it would leave four
 * buttons drawing glyphs nothing else on the screen draws, and there was no test
 * file here at all for anything to catch it.
 */
const OPTIONS: ReadonlyArray<'q' | 'r' | 'b' | 'n'> = ['q', 'r', 'b', 'n'];

/** The choice of piece when a pawn reaches the last rank. Underpromotion is offered
 * on equal terms with the queen, because it is a real move and not an afterthought.
 *
 * It is a popover rather than a modal: the board is inert until this is answered or
 * cancelled, but the board itself is still on screen behind it. So no `aria-modal`
 * and no focus trap — but Escape does cancel (on the window, so it works wherever
 * focus has got to), the first option takes focus, and there is a visible cancel
 * button so the popover is escapable without knowing the keyboard shortcut. */
export default function PromotionPicker({
  square,
  onSelect,
  onCancel,
  colour = 'w',
}: PromotionPickerProps) {
  const { appearance: { pieceSet } } = useAppearance();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    <div
      className="promotion"
      ref={ref}
      role="dialog"
      aria-label="Choose promotion piece"
      data-promotion-square={square}
    >
      {OPTIONS.map((promotion) => (
        <button
          key={promotion}
          type="button"
          onClick={() => onSelect(promotion)}
          aria-label={`Promote to ${pieceName(promotion)}`}
        >
          {/* The learner promotes to a piece of their OWN colour, which is the
              colour of the pawn arriving on the last rank. The label names the
              piece and not the colour, because the artwork already carries it
              and "promote to black queen" reads as the wrong instruction.
              `alt=""` because the button's own label already names the piece. */}
          <img
            className="promotion-piece"
            src={srcFor(promotion, colour, pieceSet)}
            alt=""
            aria-hidden="true"
            draggable={false}
            width={30}
            height={30}
          />
        </button>
      ))}
      <button type="button" className="promotion-cancel" onClick={onCancel} aria-label="Cancel promotion">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
