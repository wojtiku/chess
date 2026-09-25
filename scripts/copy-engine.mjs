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

import { copyFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pkgPath = require.resolve('stockfish/package.json');
const binDir = join(dirname(pkgPath), 'bin');
const { buildVersion } = require('stockfish/package.json');

const base = join(binDir, `stockfish-${buildVersion}-lite-single`);
for (const ext of ['.js', '.wasm']) {
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
mkdirSync(outDir, { recursive: true });

// The engine resolves its own wasm path by replacing '.js' with '.wasm' against
// location.pathname, so these two names and their co-location are load-bearing.
copyFileSync(base + '.wasm', join(outDir, 'stockfish.wasm'));
copyFileSync(base + '.js', join(outDir, 'stockfish.js'));

console.log(`Copied stockfish ${buildVersion} lite-single -> public/engine/`);
for (const name of ['stockfish.js', 'stockfish.wasm']) {
  console.log(`  ${name} ${statSync(join(outDir, name)).size} bytes`);
}
