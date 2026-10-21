import { BOARD_THEMES, PIECE_SETS } from './catalog';
import { useAppearance } from './AppearanceContext';
import { srcFor } from '../Board/pieces';
import './AppearancePicker.css';

export default function AppearancePicker() {
  const { appearance, changeAppearance } = useAppearance();
  const themeName = BOARD_THEMES.find((theme) => theme.id === appearance.boardTheme)?.name;
  const setName = PIECE_SETS.find((set) => set.id === appearance.pieceSet)?.name;
  return (
    <section className="appearance" aria-label="Appearance">
      <header className="appearance-heading">
        <h3 className="appearance-title">Appearance</h3>
        <p className="appearance-current">{themeName} / {setName}</p>
      </header>
      <div className="appearance-options">
        <p className="appearance-intro">Find your favourite combination. Changes appear on the board immediately.</p>
        <fieldset>
          <legend>Board theme</legend>
          <div className="board-choices">
            {BOARD_THEMES.map((theme) => (
              <button key={theme.id} type="button" className="board-choice"
                aria-label={theme.name} aria-pressed={appearance.boardTheme === theme.id}
                onClick={() => changeAppearance({ boardTheme: theme.id })} title={theme.description}>
                <span className="board-swatch" data-board-theme={theme.id} aria-hidden="true">
                  {Array.from({ length: 16 }, (_, i) => (
                    <span key={i} className={(Math.floor(i / 4) + i % 4) % 2 === 0 ? 'light' : 'dark'} />
                  ))}
                </span>
                <span className="choice-label">{theme.name}</span>
                <span className="choice-check" aria-hidden="true">{appearance.boardTheme === theme.id ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend>Piece design</legend>
          <div className="piece-choices">
            {PIECE_SETS.map((set) => (
              <button key={set.id} type="button" className="piece-choice"
                aria-pressed={appearance.pieceSet === set.id}
                aria-label={set.name} title={set.description}
                onClick={() => changeAppearance({ pieceSet: set.id })}>
                <span className="piece-swatch" aria-hidden="true">
                  <img src={srcFor('n', 'w', set.id)} width="48" height="48" alt="" />
                  <img src={srcFor('k', 'b', set.id)} width="48" height="48" alt="" />
                </span>
                <span className="choice-label">{set.name}</span>
                <span className="choice-check" aria-hidden="true">{appearance.pieceSet === set.id ? '✓' : ''}</span>
              </button>
            ))}
          </div>
        </fieldset>
        <p className="appearance-note">Colours follow your board theme. Your choices are saved on this device.</p>
      </div>
    </section>
  );
}
