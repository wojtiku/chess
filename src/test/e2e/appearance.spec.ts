import { expect, test } from '@playwright/test';

const themes = ['Walnut Club', 'Marble Hall', 'Midnight Slate', 'Rosewood Salon', 'Porcelain', 'Black & White'];
const sets = ['Carved Staunton', 'Tournament', 'Geometric', 'Art Deco', 'Ink', 'Modern Studio', 'Storybook'];

test('all 42 combinations render from Settings and persist across reloads and modes', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  const board = page.getByRole('grid', { name: 'Chess board' });
  const initialBox = await board.boundingBox();
  await expect(page.getByRole('region', { name: 'Appearance' })).toHaveCount(0);
  await page.getByTestId('mode-settings').click();
  const finishes = new Set<string>();
  for (const theme of themes) {
    await page.getByRole('button', { name: theme, exact: true }).click();
    finishes.add(await page.locator('.square.dark').first().evaluate((square) => getComputedStyle(square).background));
    for (const set of sets) {
      await page.getByRole('button', { name: set, exact: true }).click();
      await expect(page.getByRole('button', { name: theme, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(page.getByRole('button', { name: set, exact: true })).toHaveAttribute('aria-pressed', 'true');
      await expect(board.locator('img')).toHaveCount(32);
      await expect.poll(() => board.locator('img').evaluateAll((images) => images.every((image) =>
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0))).toBe(true);
      expect(await board.boundingBox()).toEqual(initialBox);
      if (theme === 'Black & White' && ['Modern Studio', 'Storybook'].includes(set)) {
        await page.getByRole('heading', { name: 'Settings', exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: testInfo.outputPath(set === 'Storybook' ? 'storybook.png' : 'modern.png') });
        if (set === 'Storybook') {
          await page.getByRole('group', { name: 'Piece design' }).screenshot({ path: testInfo.outputPath('piece-selector.png') });
        }
      }
    }
  }
  expect(finishes.size).toBe(6);
  await page.reload();
  await expect(page.locator('.appearance-root')).toHaveAttribute('data-board-theme', 'monochrome');
  for (const mode of ['learn', 'coach', 'review', 'play', 'settings']) {
    await page.getByTestId(`mode-${mode}`).click();
    await expect(page.locator('.appearance-root')).toHaveAttribute('data-board-theme', 'monochrome');
    await expect(board.locator('img').first()).toHaveAttribute('src', /\/pieces\/storybook\//);
  }
  await expect(page.getByRole('button', { name: 'Black & White', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Storybook', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

for (const width of [320, 390, 844]) {
  test(`settings choices fit and remain reachable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 844 });
    await page.goto('/');
    await page.getByTestId('mode-settings').click();
    await page.getByRole('button', { name: 'Black & White', exact: true }).click();
    await page.getByRole('button', { name: 'Art Deco', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Art Deco', exact: true })).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    await page.getByTestId('mode-play').click();
    await page.getByRole('button', { name: 'e2, white pawn' }).click();
    await expect(page.getByRole('button', { name: 'e4, empty' })).toHaveAttribute('data-target');
  });
}

test('board themes own piece colours across designs, previews and captures', async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem('chess.game.v1', JSON.stringify({
    moves: [
      { from: 'e2', to: 'e4' }, { from: 'd7', to: 'd5' },
      { from: 'e4', to: 'd5' }, { from: 'd8', to: 'd5' },
    ],
    resignedBy: 'w',
  })));
  await page.setViewportSize({ width: 1280, height: 1000 });
  await page.goto('/');
  await page.getByTestId('mode-settings').click();
  await page.getByRole('button', { name: 'Black & White', exact: true }).click();
  const palette = () => page.locator('.piece-palette-definitions feComponentTransfer').evaluate((transfer) =>
    [...transfer.children].map((channel) => channel.getAttribute('tableValues')));
  const monochrome = await palette();
  expect(new Set(monochrome).size).toBe(1);
  for (const set of sets) {
    await page.getByRole('button', { name: set, exact: true }).click();
    expect(await palette()).toEqual(monochrome);
  }
  const piece = page.locator('.board .piece').first();
  const source = await piece.getAttribute('src');
  await page.getByRole('button', { name: 'Porcelain', exact: true }).click();
  expect(await palette()).not.toEqual(monochrome);
  await expect(piece).toHaveAttribute('src', source!);
  const filter = await piece.evaluate((image) => getComputedStyle(image).filter.match(/^url\([^)]+\)/)?.[0]);
  expect(filter).toContain('piece-palette-');
  const previewFilters = await page.locator('.piece-swatch img').evaluateAll((images) =>
    images.map((image) => getComputedStyle(image).filter.match(/^url\([^)]+\)/)?.[0]));
  expect(previewFilters).toHaveLength(14);
  for (const preview of previewFilters) expect(preview).toBe(filter);
  await page.getByRole('group', { name: 'Piece design' }).screenshot({ path: testInfo.outputPath('piece-selector.png') });
  await page.getByTestId('mode-play').click();
  await expect(page.locator('.captured-piece')).toHaveCount(2);
  const captureFilters = await page.locator('.captured-piece').evaluateAll((images) =>
    images.map((image) => getComputedStyle(image).filter.match(/^url\([^)]+\)/)?.[0]));
  for (const capture of captureFilters) expect(capture).toBe(filter);
  const savedPalette = await palette();
  await page.reload();
  expect(await palette()).toEqual(savedPalette);
  await expect(page.locator('.appearance-root')).toHaveAttribute('data-board-theme', 'porcelain');
});

test('the monochrome board has strong square and legal-move contrast', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('mode-settings').click();
  await page.getByRole('button', { name: 'Black & White', exact: true }).click();
  await page.getByTestId('mode-play').click();
  await page.getByRole('button', { name: 'e2, white pawn' }).click();
  const colours = await page.locator('.square').evaluateAll((squares) => {
    const dark = squares.find((square) => square.classList.contains('dark'))!;
    const light = squares.find((square) => square.classList.contains('light'))!;
    return {
      dark: getComputedStyle(dark).backgroundColor,
      light: getComputedStyle(light).backgroundColor,
      targets: squares.filter((square) => square.hasAttribute('data-target')).map((square) => ({
        square: getComputedStyle(square).backgroundColor,
        dot: getComputedStyle(square, '::after').backgroundColor,
      })),
    };
  });
  const channels = (colour: string) => colour.match(/[\d.]+/g)!.map(Number);
  const luminance = (rgb: number[]) => rgb.slice(0, 3).map((n) => {
    const value = n / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i]!, 0);
  const contrast = (a: number[], b: number[]) => {
    const levels = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (levels[0]! + 0.05) / (levels[1]! + 0.05);
  };
  expect(contrast(channels(colours.dark), channels(colours.light))).toBeGreaterThan(12);
  expect(colours.targets).toHaveLength(2);
  for (const { square, dot } of colours.targets) {
    const background = channels(square);
    const foreground = channels(dot);
    const alpha = foreground[3] ?? 1;
    const composite = foreground.slice(0, 3).map((value, i) => value * alpha + background[i]! * (1 - alpha));
    expect(contrast(background, composite)).toBeGreaterThan(3);
  }
});
