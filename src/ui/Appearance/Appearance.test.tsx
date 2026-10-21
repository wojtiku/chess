import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Chess } from '../../chess/rules';
import Board from '../Board/Board';
import Captured from '../Captured/Captured';
import PromotionPicker from '../PromotionPicker/PromotionPicker';
import { AppearanceProvider } from './AppearanceContext';
import AppearancePicker from './AppearancePicker';
import { loadAppearance, saveAppearance } from './catalog';

beforeEach(() => { localStorage.clear(); vi.restoreAllMocks(); });

describe('appearance preferences', () => {
  it('recovers each preference independently from stale or corrupt storage', () => {
    localStorage.setItem('chess.appearance.v1', '{broken');
    expect(loadAppearance()).toEqual({ boardTheme: 'walnut', pieceSet: 'staunton' });
    localStorage.setItem('chess.appearance.v1', JSON.stringify({ boardTheme: 'marble', pieceSet: 'retired' }));
    expect(loadAppearance()).toEqual({ boardTheme: 'marble', pieceSet: 'staunton' });
    localStorage.setItem('chess.appearance.v1', JSON.stringify({ boardTheme: 'retired', pieceSet: 'ink' }));
    expect(loadAppearance()).toEqual({ boardTheme: 'walnut', pieceSet: 'ink' });
  });

  it('still switches when reading or writing storage is refused', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    render(<AppearanceProvider><AppearancePicker /></AppearanceProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Art Deco' }));
    expect(screen.getByRole('button', { name: 'Art Deco' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('restores both choices on remount without touching a saved game', async () => {
    localStorage.setItem('chess.game.v1', 'keep this game');
    const view = render(<AppearanceProvider><AppearancePicker /></AppearanceProvider>);
    await userEvent.click(screen.getByRole('button', { name: 'Black & White' }));
    await userEvent.click(screen.getByRole('button', { name: 'Geometric' }));
    view.unmount();
    render(<AppearanceProvider><AppearancePicker /></AppearanceProvider>);
    expect(screen.getByRole('button', { name: 'Black & White' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Geometric' })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem('chess.game.v1')).toBe('keep this game');
  });
});

it.each([
  { name: 'Ink', set: 'ink' },
  { name: 'Modern Studio', set: 'modern' },
  { name: 'Storybook', set: 'storybook' },
])('$name updates the board, captures and promotions without resetting a selected move', async ({ name, set }) => {
  const game = new Chess();
  game.move('e4'); game.move('d5'); game.move('exd5'); game.move('Qxd5');
  const onMove = vi.fn();
  render(<AppearanceProvider>
    <AppearancePicker />
    <Board game={game} orientation="w" interactive lastMove={{ from: 'd8', to: 'd5' }} arrows={[]} onMove={onMove} />
    <Captured game={game} />
    <PromotionPicker square="a8" colour="w" onSelect={() => {}} onCancel={() => {}} />
    <PromotionPicker square="h1" colour="b" onSelect={() => {}} onCancel={() => {}} />
  </AppearanceProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'g1, white knight' }));
  await userEvent.click(screen.getByRole('button', { name }));
  const board = screen.getByRole('grid', { name: 'Chess board' });
  const surfaces = [board, screen.getByTestId('captured-by-w'), screen.getByTestId('captured-by-b'),
    ...screen.getAllByRole('dialog', { name: 'Choose promotion piece' })];
  for (const surface of surfaces) {
    const images = surface.querySelectorAll('img');
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) expect(img.getAttribute('src')).toContain(`/pieces/${set}/`);
  }
  expect(within(board).getByRole('button', { name: 'g1, white knight' })).toHaveAttribute('data-selected');
  expect(within(board).getByRole('button', { name: 'f3, empty' })).toHaveAttribute('data-target');
  await userEvent.click(screen.getByRole('button', { name: 'Midnight Slate' }));
  await userEvent.click(screen.getByRole('button', { name: 'f3, empty' }));
  expect(onMove).toHaveBeenCalledWith({ from: 'g1', to: 'f3' });
  expect(game.history()).toEqual(['e4', 'd5', 'exd5', 'Qxd5']);
});

it('uses the saved design when a black pawn opens the promotion picker', async () => {
  saveAppearance({ boardTheme: 'marble', pieceSet: 'deco' });
  const game = new Chess('4k3/8/8/8/8/8/1p6/4K3 b - - 0 1');
  const onMove = vi.fn();
  render(<AppearanceProvider><Board game={game} orientation="b" interactive lastMove={null} arrows={[]} onMove={onMove} /></AppearanceProvider>);
  await userEvent.click(screen.getByRole('button', { name: 'b2, black pawn' }));
  await userEvent.click(screen.getByRole('button', { name: 'b1, empty' }));
  const picker = screen.getByRole('dialog', { name: 'Choose promotion piece' });
  for (const img of picker.querySelectorAll('img')) expect(img.getAttribute('src')).toContain('/pieces/deco/b');
  await userEvent.click(screen.getByRole('button', { name: 'Promote to knight' }));
  expect(onMove).toHaveBeenCalledWith({ from: 'b2', to: 'b1', promotion: 'n' });
});
