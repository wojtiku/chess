import { expect, test } from '@playwright/test';
import type { E2EHandle, ProbeResult } from './harness';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** White's 20 legal moves in the start position (perft(1) = 20; cross-checked
 * against chess.js, not hand-enumerated). Listed rather than derived so this
 * gate stays an engine test and not a rules test.
 *
 * The set is deliberately wider than "1.e4 or 1.d4". Stockfish's `Skill Level`
 * is stochastic by design — it picks at random among moves within a margin of the
 * best — so six searches of this exact position returned `e2e4 d2d4 e2e4 e2e4
 * g1f3 g1f3`. A test asserting only `e2e4`/`d2d4` would go red roughly one run
 * in three, and the next person to see it would reasonably blame the thing this
 * gate exists to protect. */
const LEGAL_OPENING_MOVES = [
  'a2a3', 'a2a4', 'b1a3', 'b1c3', 'b2b3', 'b2b4', 'c2c3', 'c2c4',
  'd2d3', 'd2d4', 'e2e3', 'e2e4', 'f2f3', 'f2f4', 'g1f3', 'g1h3',
  'g2g3', 'g2g4', 'h2h3', 'h2h4',
];

// `/harness.html` is emitted into `dist/` by `e2e.harness.vite.config.ts`, after
// `npm run build`, and exists only because the Playwright `webServer` chain runs
// that second build. It is how the test reaches the app's real `EngineClient`
// from a production bundle — see `harness.ts` for why nothing under `src/` is
// modified to allow it.
const HARNESS = '/harness.html';

// The cheap HTTP checks come first on purpose: if the server is not serving the
// engine at all they fail in a second, whereas the probe below would first burn
// the engine's 20s handshake timeout.
test('the engine wasm is served, not 404', async ({ page }) => {
  const response = await page.request.get('/engine/stockfish.wasm');
  // The status is asserted but is NOT the discriminating check, and cannot be:
  // an SPA host answers a *missing* .wasm with `200` and the app shell, so status
  // alone reads healthy for a file that is not there. Verified by sabotage — the
  // size and MIME below are what actually catch it.
  expect(response.status()).toBe(200);
  expect(Number(response.headers()['content-length'] ?? 0)).toBeGreaterThan(500_000);
  // Emscripten only takes the streaming-compile path for this exact type and
  // falls back to an ArrayBuffer read otherwise, so a host that mistypes .wasm
  // is a real production-only failure. Pinned rather than assumed.
  expect(response.headers()['content-type']).toContain('application/wasm');
});

test('the engine worker is served unprocessed and unrenamed', async ({ page }) => {
  const response = await page.request.get('/engine/stockfish.js');
  expect(response.status()).toBe(200);
  // A classic worker script: `new Worker()` refuses anything that is not a
  // JavaScript MIME, and EngineClient deliberately does not ask for a module
  // worker, which this file is not.
  expect(response.headers()['content-type']).toContain('text/javascript');
  // Both names are load-bearing: the engine rewrites '.js' to '.wasm' against its
  // own `location.pathname`, so any host that fingerprints or rewrites the asset
  // breaks the pair. Vite must never have seen this file.
  expect(response.url()).toMatch(/\/engine\/stockfish\.js$/);
});

test('the engine worker and its WASM load from a production build', async ({ page }) => {
  // Engine requests recorded as `status mime url`. The MIME has to be in here:
  // on an SPA host a *missing* `/engine/stockfish.wasm` is answered with
  // `200 text/html` (the app shell), so status alone reports a healthy 200 for a
  // file that does not exist. Verified by sabotage — see the report.
  const engineResponses: string[] = [];
  page.on('response', (r) => {
    if (r.url().includes('/engine/')) {
      const mime = (r.headers()['content-type'] ?? '').split(';')[0]?.trim() ?? '';
      engineResponses.push(`${r.status()} ${mime} ${r.url()}`);
    }
  });

  // The app's own bundle first, so a production build that throws on load shows up
  // as a failure here rather than as a puzzling probe failure later. Console
  // errors are collected only from the harness page after this: the engine gate
  // owns the harness, and it should not go red because some later task's UI logs
  // something in production.
  await page.goto('/');
  await expect(page.locator('#root')).not.toBeEmpty();

  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(HARNESS);

  const result = (await page.evaluate(
    async ([fen, opts]) => {
      const handle = (window as unknown as { __chessE2E?: E2EHandle }).__chessE2E;
      if (handle === undefined) {
        return {
          ok: false,
          bestMove: null,
          lineCount: 0,
          status: 'idle',
          error: 'harness did not load',
        } satisfies ProbeResult;
      }
      return handle.probeEngine(fen, opts);
    },
    [START_FEN, { movetimeMs: 1000, multiPv: 3 }] as const,
  )) as ProbeResult;

  // The engine script resolved from `dist/`, and the WASM it derived from its own
  // URL resolved beside it, as the right bytes. This is the assertion the whole
  // task exists for: the pair loads in a production build, from the same origin,
  // unprocessed by any bundler.
  const origin = new URL(page.url()).origin;
  const seen = engineResponses.join('\n');
  expect(seen, `engine requests:\n${seen}`).toContain(
    `200 text/javascript ${origin}/engine/stockfish.js`,
  );
  expect(seen, `engine requests:\n${seen}`).toContain(
    `200 application/wasm ${origin}/engine/stockfish.wasm`,
  );

  expect(errors, `page errors: ${errors.join(' | ')}`).toEqual([]);
  // `JSON.stringify` as the message: on failure this prints the EngineError code,
  // which is what separates "the WASM 404'd" from "no Worker constructor" — the
  // same red assertion, two unrelated bugs.
  expect(result.ok, JSON.stringify(result)).toBe(true);
  // A legal White opening move, so a null, a '(none)', or a truncated token
  // cannot pass as a successful search.
  expect(LEGAL_OPENING_MOVES, `bestMove was ${String(result.bestMove)}`).toContain(result.bestMove);
  // MultiPV 3 was requested, so three lines prove the parser read a real search
  // rather than a single stray `info`.
  expect(result.lineCount).toBe(3);
  expect(result.status).toBe('ready');
});

test('the production server does not serve the app as source', async ({ page }) => {
  // The status is *not* 404 here: vite preview's SPA fallback answers an unknown
  // path with index.html, so `await import('/src/engine/engineClient.ts')` gets a
  // 200 of HTML and fails on MIME ("TypeError: Failed to fetch dynamically
  // imported module"). Asserting `status() === 404` would therefore be asserting
  // an accident of the fallback. What matters is that no JavaScript module
  // comes back, so the passing probe above can only have run a real bundle.
  const response = await page.request.get('/src/engine/engineClient.ts');
  // `?? ''` rather than a bare `headers()['content-type']`: a host that omits the
  // header entirely would hand `undefined` to `toMatch`, which raises a matcher
  // type error and reads as a crash. Coerced, the same host produces an ordinary
  // assertion failure naming the missing header.
  expect(response.headers()['content-type'] ?? '').not.toMatch(/javascript/);
  expect(await response.text()).not.toContain('class EngineClient');
});
