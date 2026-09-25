// The bridge that lets the Playwright test drive the app's *real* `EngineClient`
// inside a *production* bundle.
//
// The test cannot reach the client itself. A production build does not serve
// TypeScript sources, so `import('/src/engine/engineClient.ts')` — the obvious
// way in, and what the plan's first draft of this spec does — only ever resolves
// under `vite dev`, which is the opposite of what this gate is for. Exposing the
// client on `window` from `main.tsx` would work, but it would put test-only
// surface in the shipped app forever.
//
// So this page is built by `e2e.harness.vite.config.ts`: a second, test-owned
// Vite build that runs *after* `npm run build` and appends one HTML page to
// `dist/`, sharing the same origin. That buys three things at once —
//
//   * the client under test is the same source `main.tsx` imports, bundled by
//     the same bundler, with nothing stubbed;
//   * the engine it loads is `/engine/stockfish.js` from the *app* build's
//     `dist/`, because the harness build sets `publicDir: false` and therefore
//     cannot itself be the thing that put the engine there;
//   * `npm run build` on its own still emits an app-only `dist/`, so no test
//     code reaches a real deployment.
//
// `probeEngine` is a plain function over plain JSON because that is all that
// survives the CDP boundary; the assertions stay in the spec.

import { EngineClient, type EngineFailureCode, type EngineStatus } from '../../engine/engineClient';

export interface ProbeResult {
  ok: boolean;
  bestMove: string | null;
  lineCount: number;
  status: EngineStatus;
  /** The `EngineError.code` on failure, so a test can tell "no `Worker`
   * constructor" apart from "the WASM 404'd" — different bugs, same surface. */
  errorCode?: EngineFailureCode;
  error?: string;
}

/** The shape the spec finds on `window`. Exported so the test shares this one
 * definition instead of restating the client's interface. */
export interface E2EHandle {
  probeEngine(
    fen: string,
    opts: { movetimeMs: number; multiPv: number },
  ): Promise<ProbeResult>;
}

/** A fresh client per call, disposed in `finally`: `dispose()` is terminal, so a
 * client cannot be reused, and leaking one would leave a ~1.8MB worker running
 * for the life of the page. */
export async function probeEngine(
  fen: string,
  opts: { movetimeMs: number; multiPv: number },
): Promise<ProbeResult> {
  const c = new EngineClient();
  try {
    await c.newGame();
    const r = await c.search(fen, { movetimeMs: opts.movetimeMs, multiPv: opts.multiPv });
    return { ok: true, bestMove: r.bestMove, lineCount: r.lines.length, status: c.status };
  } catch (e) {
    const code = e instanceof Error && 'code' in e ? (e as { code?: EngineFailureCode }).code : undefined;
    return {
      ok: false,
      bestMove: null,
      lineCount: 0,
      status: c.status,
      ...(code === undefined ? {} : { errorCode: code }),
      error: e instanceof Error ? `${e.name}: ${e.message}` : String(e),
    };
  } finally {
    c.dispose();
  }
}

(window as unknown as Record<string, unknown>).__chessE2E = { probeEngine };
