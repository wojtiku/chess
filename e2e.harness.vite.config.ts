// A second, *test-owned* Vite build. `npm run build` must stay free of test
// code, so the harness page cannot be an input to the app build; it is appended
// to the finished `dist/` instead, by the Playwright `webServer` chain only.
//
// The two settings that make this a fair test rather than a rigged one:
//
//   publicDir: false  — the engine in `dist/engine/` is the one `npm run build`
//     produced via the `prebuild` copy-engine hook. If this build could copy the
//     engine itself, "the engine resolves in a production build" would be a claim
//     about the harness build, not about the app's.
//   emptyOutDir: false — the app build's output is the subject under test and
//     must not be replaced by it.
//
// One sharp edge, deliberate: this build mutates `dist/` in place, so a `dist/`
// left behind after an E2E run still contains `harness.html`. `dist/` is
// gitignored and a deployment runs `npm run build` for itself, which emits an
// app-only `dist/` (verified). Re-run the build before deploying a `dist/` that
// an E2E run has touched.

import { defineConfig } from 'vite';

export default defineConfig({
  // Rooted at the harness's own directory so the page is emitted as
  // `dist/harness.html` (URL `/harness.html`) rather than at a source-shaped
  // `/src/test/e2e/harness.html`. The URL is what a reader of a red CI log sees,
  // and a path that looks like served source would suggest the very thing this
  // gate exists to disprove.
  root: 'src/test/e2e',
  publicDir: false,
  build: {
    // Relative to `root`, so back out to the repo's `dist/` — the app build's
    // output, which must survive untouched.
    outDir: '../../../dist',
    emptyOutDir: false,
    rollupOptions: {
      // Explicit, because `root` moves Vite's default entry to
      // `src/test/e2e/index.html`, which does not exist.
      input: 'harness.html',
    },
  },
});
