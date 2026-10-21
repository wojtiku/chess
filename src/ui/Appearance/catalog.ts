// Five tones from shadow to highlight recolour every piece design consistently.
export const BOARD_THEMES = [
  { id: 'walnut', name: 'Walnut Club', description: 'Maple & polished walnut', pieceTones: ['#070504', '#1c1510', '#71604d', '#d9c8ae', '#fff8e9'] },
  { id: 'marble', name: 'Marble Hall', description: 'Ivory & green marble', pieceTones: ['#030b08', '#10271f', '#527365', '#d7dfd3', '#fffff5'] },
  { id: 'slate', name: 'Midnight Slate', description: 'Frost & blue-grey stone', pieceTones: ['#04090e', '#12202d', '#60778b', '#cbdbe6', '#f7fcff'] },
  { id: 'rosewood', name: 'Rosewood Salon', description: 'Honey birch & burgundy', pieceTones: ['#0d0408', '#2b101b', '#8a5c5c', '#e7cfaf', '#fff6e5'] },
  { id: 'porcelain', name: 'Porcelain', description: 'Chalk & glazed cobalt', pieceTones: ['#040912', '#11233e', '#647e9f', '#d6e3f0', '#ffffff'] },
  { id: 'monochrome', name: 'Black & White', description: 'Crisp white & deep charcoal', pieceTones: ['#050505', '#171717', '#686868', '#d9d9d9', '#ffffff'] },
] as const;

export const PIECE_SETS = [
  { id: 'staunton', name: 'Carved Staunton', description: 'Turned forms & carved detailing' },
  { id: 'tournament', name: 'Tournament', description: 'Bold, familiar silhouettes' },
  { id: 'geometric', name: 'Geometric', description: 'Circles, wedges & clean lines' },
  { id: 'deco', name: 'Art Deco', description: 'Stepped forms & metallic inlays' },
  { id: 'ink', name: 'Ink', description: 'Hand-drawn, expressive contours' },
  { id: 'modern', name: 'Modern Studio', description: 'Smooth ceramic & sculptural curves' },
  { id: 'storybook', name: 'Storybook', description: 'Rounded shapes & friendly faces' },
] as const;

export type BoardThemeId = typeof BOARD_THEMES[number]['id'];
export type PieceSetId = typeof PIECE_SETS[number]['id'];
export interface Appearance { boardTheme: BoardThemeId; pieceSet: PieceSetId }
export const DEFAULT_APPEARANCE: Appearance = { boardTheme: 'walnut', pieceSet: 'staunton' };
const STORAGE_KEY = 'chess.appearance.v1';

export function loadAppearance(): Appearance {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null');
    if (typeof saved !== 'object' || saved === null) return DEFAULT_APPEARANCE;
    const boardTheme = 'boardTheme' in saved
      ? BOARD_THEMES.find((theme) => theme.id === saved.boardTheme)?.id : undefined;
    const pieceSet = 'pieceSet' in saved
      ? PIECE_SETS.find((set) => set.id === saved.pieceSet)?.id : undefined;
    return {
      boardTheme: boardTheme ?? DEFAULT_APPEARANCE.boardTheme,
      pieceSet: pieceSet ?? DEFAULT_APPEARANCE.pieceSet,
    };
  } catch {
    return DEFAULT_APPEARANCE;
  }
}

export function saveAppearance(appearance: Appearance): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appearance));
  } catch {
    // Storage may be blocked; switching still works for this visit.
  }
}
