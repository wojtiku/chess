import { useEffect, useRef } from 'react';
import './PromotionPicker.css';

export interface PromotionPickerProps {
  /** The square the piece is arriving on, which the popover is anchored to. */
  square: string;
  onSelect: (promotion: 'q' | 'r' | 'b' | 'n') => void;
  onCancel: () => void;
}

const OPTIONS: ReadonlyArray<{ promotion: 'q' | 'r' | 'b' | 'n'; glyph: string; name: string }> = [
  { promotion: 'q', glyph: '♕', name: 'queen' },
  { promotion: 'r', glyph: '♖', name: 'rook' },
  { promotion: 'b', glyph: '♗', name: 'bishop' },
  { promotion: 'n', glyph: '♘', name: 'knight' },
];

/** The choice of piece when a pawn reaches the last rank. Underpromotion is offered
 * on equal terms with the queen, because it is a real move and not an afterthought.
 *
 * It is a popover rather than a modal: the board is inert until this is answered or
 * cancelled, but the board itself is still on screen behind it. So no `aria-modal`
 * and no focus trap — but Escape does cancel (on the window, so it works wherever
 * focus has got to), the first option takes focus, and there is a visible cancel
 * button so the popover is escapable without knowing the keyboard shortcut. */
export default function PromotionPicker({ square, onSelect, onCancel }: PromotionPickerProps) {
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
      {OPTIONS.map((option) => (
        <button
          key={option.promotion}
          type="button"
          onClick={() => onSelect(option.promotion)}
          aria-label={`Promote to ${option.name}`}
        >
          <span aria-hidden="true">{option.glyph}</span>
        </button>
      ))}
      <button type="button" className="promotion-cancel" onClick={onCancel} aria-label="Cancel promotion">
        <span aria-hidden="true">×</span>
      </button>
    </div>
  );
}
