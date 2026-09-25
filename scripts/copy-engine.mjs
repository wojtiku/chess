// Build step: copy the Stockfish `lite-single` build out of node_modules into
// `public/engine/`, where Vite serves it as a static asset and the bundler never
// sees the WASM.
//
// The output names are load-bearing, and are deliberately unversioned: the engine
// derives its own WASM path by replacing '.js' with '.wasm' against
// `location.pathname`, so `stockfish.js` and `stockfish.wasm` must sit side by
// side under those exact names. Renaming either one breaks the worker at runtime,
// which is why the *source* name is versioned (read from buildVersion) and the
// *destination* name is not.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgPath = require.resolve('stockfish/package.json');
const binDir = join(dirname(pkgPath), 'bin');
const { buildVersion } = require('stockfish/package.json');

const base = join(binDir, `stockfish-${buildVersion}-lite-single`);

// The single source of truth for what this script deals in. The existence check,
// the copy and the report all loop over this one list, so a name cannot be
// validated on one line and then not acted on: the earlier shape (a loop that only
// checked extensions, followed by two hardcoded `copyFileSync` calls) made that
// drift easy, and it is exactly how a sabotaged copy passes review as a green
// build. If you add a file here, it is checked, copied and reported.
const FILES = [
  { ext: '.js', out: 'stockfish.js' },
  { ext: '.wasm', out: 'stockfish.wasm' },
];

for (const { ext } of FILES) {
  if (!existsSync(base + ext)) {
    console.error(`Missing ${base + ext}. Expected the lite-single build of stockfish ${buildVersion}.`);
    process.exit(1);
  }
}

// Resolved against this file rather than process.cwd(), so the script copies to
// the same place whether npm invokes it, a test runner invokes it, or a human
// runs `node scripts/copy-engine.mjs` from a subdirectory.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(repoRoot, 'public', 'engine');

// Clear the directory's *contents* before copying, so a file left behind by an
// earlier version — or by an earlier build that copied fewer files — cannot ride
// along into `dist/engine/`.
//
// This matters more than it looks. `vite build` copies the whole `publicDir`, so
// anything sitting in `public/engine/` ships. Previously this script only ever
// added or overwrote named files, which meant a stale binary survived a
// dependency downgrade, and it survived a *failed* copy too: with the `.js` copy
// removed from the script, the build still exited 0 and shipped whatever stale
// `stockfish.js` was lying around.
//
// The contents are removed rather than the directory itself: same guarantee, but
// never an `rm -rf` of a path derived from a URL. `public/engine/` is a
// gitignored build output regenerated on every build, so nothing here is user
// data.
if (existsSync(outDir)) {
  for (const name of readdirSync(outDir)) {
    rmSync(join(outDir, name), { recursive: true, force: true });
  }
}
mkdirSync(outDir, { recursive: true });

// The engine resolves its own wasm path by replacing '.js' with '.wasm' against
// location.pathname, so these two names and their co-location are load-bearing.
for (const { ext, out } of FILES) {
  copyFileSync(base + ext, join(outDir, out));
}

console.log(`Copied stockfish ${buildVersion} lite-single -> public/engine/`);
for (const { out } of FILES) {
  console.log(`  ${out} ${statSync(join(outDir, out)).size} bytes`);
}
