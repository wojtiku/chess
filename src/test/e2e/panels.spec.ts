import { expect, test } from '@playwright/test';

for (const width of [390, 900, 1024, 1440]) {
  test(`study panels stay with one board at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const initialPanel = (await page.getByRole('complementary').boundingBox())!;
    const initialTab = (await page.getByTestId('mode-play').boundingBox())!;
    for (const mode of ['play', 'learn', 'coach', 'review']) {
      await page.getByTestId(`mode-${mode}`).click();
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
      if (width > 980) {
        expect(p.x).toBeGreaterThan(b.x + b.width);
        expect(Math.abs(p.y - b.y)).toBeLessThan(12);
      } else {
        expect(p.y).toBeGreaterThan(b.y + b.height);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
    }
  });
}
