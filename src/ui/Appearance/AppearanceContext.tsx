import { createContext, useContext, useEffect, useId, useState, type CSSProperties, type ReactNode } from 'react';
import { BOARD_THEMES, DEFAULT_APPEARANCE, loadAppearance, saveAppearance, type Appearance } from './catalog';
import PiecePalette from './PiecePalette';
import './board-themes.css';

const AppearanceContext = createContext({
  appearance: DEFAULT_APPEARANCE,
  changeAppearance: (_patch: Partial<Appearance>) => {},
});

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(loadAppearance);
  const filterId = `piece-palette-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const theme = BOARD_THEMES.find((theme) => theme.id === appearance.boardTheme) ?? BOARD_THEMES[0];
  useEffect(() => saveAppearance(appearance), [appearance]);
  return (
    <AppearanceContext value={{
      appearance,
      changeAppearance: (patch) => setAppearance((previous) => ({ ...previous, ...patch })),
    }}>
      <PiecePalette id={filterId} tones={theme.pieceTones} />
      <div className="appearance-root" data-board-theme={appearance.boardTheme}
        style={{ '--piece-colour-filter': `url("#${filterId}")` } as CSSProperties}>
        {children}
      </div>
    </AppearanceContext>
  );
}

export const useAppearance = () => useContext(AppearanceContext);
