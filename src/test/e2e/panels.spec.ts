import { expect, test } from '@playwright/test';
import { Chess } from '../../chess/rules';

for (const [width, height, sideBySide] of [
  [320, 568, false],
  [390, 844, false],
  [775, 900, false],
  [776, 900, true],
  [844, 390, true],
  [900, 900, true],
  [1024, 800, true],
  [1440, 900, true],
  [2560, 1440, true],
] as const) {
  test(`study panels stay with one board at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    const initialPanel = (await page.getByRole('complementary').boundingBox())!;
    const initialTab = (await page.getByTestId('mode-play').boundingBox())!;
    const initialBoard = (await page.getByRole('grid').boundingBox())!;
    for (const mode of ['play', 'learn', 'coach', 'review', 'settings']) {
      await page.getByTestId(`mode-${mode}`).click();
      // Clicking tabs below the board scrolls the stacked page. Measure from its
      // starting position so fitting in the viewport means the whole board fits.
      await page.evaluate(() => window.scrollTo(0, 0));
      const board = page.getByRole('grid', { name: 'Chess board' });
      const sidebar = page.getByRole('complementary');
      await expect(board).toHaveCount(1);
      await expect(sidebar.getByRole('navigation', { name: 'Mode' })).toBeVisible();
      const b = (await board.boundingBox())!;
      const p = (await sidebar.boundingBox())!;
      const tab = (await page.getByTestId('mode-play').boundingBox())!;
      expect(p.width, `${mode} panel width`).toBeCloseTo(initialPanel.width, 0);
      expect(p.x, `${mode} panel horizontal position`).toBeCloseTo(initialPanel.x, 0);
      expect(tab.width, `${mode} tab width`).toBeCloseTo(initialTab.width, 0);
      expect(b.width, `${mode} board size`).toBeCloseTo(initialBoard.width, 0);
      expect(b.x, `${mode} board horizontal position`).toBeCloseTo(initialBoard.x, 0);
      expect(b.y, `${mode} board vertical position`).toBeCloseTo(initialBoard.y, 0);
      expect(b.height, `${mode} square board`).toBeCloseTo(b.width, 0);
      const frame = (await page.locator('.board-frame').boundingBox())!;
      expect(frame.y).toBeGreaterThanOrEqual(0);
      expect(frame.y + frame.height, `${mode} board and coordinates fit`).toBeLessThanOrEqual(height);
      await expect(sidebar.getByRole('heading', { level: 1, name: 'Chess Practice Board' })).toHaveCount(1);
      if (sideBySide) {
        expect(p.x).toBeGreaterThan(b.x + b.width);
        expect(frame.y + frame.height / 2, `${mode} board vertically centered`).toBeCloseTo(height / 2, 0);
        expect(p.y + p.height).toBeLessThanOrEqual(height);
        expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(height);
      } else {
        expect(p.y).toBeGreaterThan(b.y + b.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}

test('sidebar content scrolls while the board, title, and modes stay put', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 450 });
  await page.goto('/');
  const board = page.getByRole('grid');
  const title = page.getByRole('heading', { level: 1 });
  const tabs = page.getByRole('navigation', { name: 'Mode' });
  const before = await Promise.all([board.boundingBox(), title.boundingBox(), tabs.boundingBox()]);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Hint quality').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Hint quality')).toBeInViewport();
  expect(await page.locator('.app-panel').evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  const after = await Promise.all([board.boundingBox(), title.boundingBox(), tabs.boundingBox()]);
  expect(after).toEqual(before);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);
  await page.getByTestId('mode-coach').click();
  await page.getByLabel('Provider API key', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Provider API key', { exact: true })).toBeInViewport();
  expect(await board.boundingBox()).toEqual(before[0]);
});

test('resizing keeps the board visible and releases sidebar scrolling when stacked', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  const original = (await page.getByRole('grid').boundingBox())!;
  await page.setViewportSize({ width: 1440, height: 1080 });
  const taller = (await page.getByRole('grid').boundingBox())!;
  expect(taller.width).toBeGreaterThan(original.width);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByLabel('Hint quality').scrollIntoViewIfNeeded();
  await expect(page.getByLabel('Hint quality')).toBeInViewport();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
  expect(await page.locator('.app-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(page.getByRole('grid')).toBeInViewport({ ratio: 1 });
});

test('a long game uses one sidebar scroll area and each mode opens at its heading', async ({ page }) => {
  // A legal 100-ply history, resigned to keep engine searches out of this layout
  // check. The move list and controls must both remain reachable.
  const game = new Chess();
  game.loadPgn('1. Nh3 h5 2. Na3 g6 3. b4 d5 4. c4 Bf5 5. cxd5 b6 6. Ng5 Rh6 7. e3 Qd6 8. Qg4 Nc6 9. h3 Be4 10. Rh2 Qd7 11. Ne6 fxe6 12. Ba6 Kd8 13. Qxe6 Nd4 14. Qxg6 Qf5 15. Be2 Qg5 16. Bd1 Qh4 17. Rb1 Nf6 18. Bb2 Bxg2 19. Bc1 Qg4 20. Qxh6 Kd7 21. h4 Nb5 22. Qg7 Ne4 23. Bb2 Ng3 24. Qe5 Nxa3 25. Ba4+ c6 26. Bb5 Bh6 27. Qc7+ Ke8 28. Qb7 a5 29. e4 Qf5 30. Rxg2 Nxe4 31. Qxc6+ Kd8 32. Qg6 a4 33. Qxb6+ Kc8 34. Rg7 Nd6 35. Qa5 Qf7 36. Rg2 Naxb5 37. Qxa4 Qg8 38. Kd1 Ra5 39. d3 Bd2 40. Kc2 Nc4 41. d6 Qg4 42. Rbg1 Kd8 43. Rd1 Bh6 44. f3 Ra7 45. d4 Kd7 46. Re1 e6 47. Ba3 Bc1 48. Kb3 Ra5 49. Kc2 Bd2 50. Kd3 Nb2+');
  const stored = {
    moves: game.history({ verbose: true }).map(({ from, to }) => ({ from, to })),
    resignedBy: game.turn(),
  };
  await page.addInitScript((saved) => {
    localStorage.setItem('chess.game.v1', JSON.stringify(saved));
  }, stored);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await expect(page.locator('.movelist-move')).toHaveCount(100);
  const board = (await page.getByRole('grid').boundingBox())!;
  await page.locator('.movelist-move').last().scrollIntoViewIfNeeded();
  await expect(page.locator('.movelist-move').last()).toBeInViewport();
  expect(await page.locator('.movelist').evaluate((el) => el.scrollHeight - el.clientHeight)).toBe(0);
  await page.getByRole('button', { name: 'New game', exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByRole('button', { name: 'New game', exact: true })).toBeInViewport();
  expect(await page.getByRole('grid').boundingBox()).toEqual(board);
  await page.getByTestId('mode-coach').click();
  expect(await page.locator('.app-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await page.getByTestId('mode-play').click();
  expect(await page.locator('.app-panel').evaluate((el) => el.scrollTop)).toBe(0);
  await expect(page.getByRole('heading', { name: 'Your game' })).toBeInViewport();
});
