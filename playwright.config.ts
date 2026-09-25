import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './src/test/e2e',
  // The engine is a ~1.8MB WASM download; give it room on a cold cache.
  timeout: 120_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    // `npm run preview` serves dist/, which is the whole point: it proves the
    // engine resolves in a production build and not only under the dev server.
    //
    // Three steps, in order. `build` materialises `dist/` and, via `prebuild`,
    // copies the engine in beside it. The harness build then appends one bundled
    // page to that `dist/` without touching it (`publicDir: false`,
    // `emptyOutDir: false`) so the test can reach the real `EngineClient` — a
    // production build serves no TypeScript, so there is no other way in. And
    // `preview` serves the result, engine assets included, from one origin.
    //
    // `--strictPort` so that if 4173 is taken the command fails immediately and
    // says so, rather than `vite` quietly binding 4174 and leaving Playwright to
    // spin for the full 180s on a timeout that reads like a build problem.
    command:
      'npm run build && npx vite build --config e2e.harness.vite.config.ts && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
