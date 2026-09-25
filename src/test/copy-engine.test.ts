// Coverage for the build step that puts Stockfish in `public/engine/`.
//
// This is a build-correctness defect, so the coverage runs in the default
// `npm test` suite. It deliberately does not live in the Playwright suite: the E2E
// gate asserts size, MIME and "the engine answers a search", every one of which a
// stale-but-functional binary from a previous version satisfies. Verified — with a
// byte-different but working `stockfish.js` in `dist/engine/`, all four E2E tests
// still passed. Version drift is only observable by comparing the copied files
// against the installed package, which is what this file does.
//
// Most of it runs against a sandbox rather than the real tree: the script
// resolves both its `stockfish` package and its output directory from its own
// location, so a copy of it inside a temp directory with a fake
// `node_modules/stockfish` exercises every path — including a missing source
// build — without touching `public/engine/` or `node_modules/`.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repoRoot, 'scripts', 'copy-engine.mjs');
const realOutDir = join(repoRoot, 'public', 'engine');

const { buildVersion } = require('stockfish/package.json');
const realBinDir = join(dirname(require.resolve('stockfish/package.json')), 'bin');
const realSrc = (ext: string): string =>
  join(realBinDir, `stockfish-${buildVersion}-lite-single${ext}`);

const sandboxes: string[] = [];

/** A throwaway tree containing a copy of the script and a fake `stockfish`
 * package, so `require.resolve('stockfish/package.json')` and the script's
 * repo-relative output directory both land inside the sandbox.
 *
 * `buildVersion: '99'` names a build that does not exist in the real package, so
 * the sandbox can never collide with it. */
function sandbox(options: { emitJs?: boolean; emitWasm?: boolean } = {}): {
  root: string;
  outDir: string;
  run: () => string;
} {
  const { emitJs = true, emitWasm = true } = options;
  const root = mkdtempSync(join(tmpdir(), 'copy-engine-'));
  sandboxes.push(root);

  const pkgDir = join(root, 'node_modules', 'stockfish');
  const binDir = join(pkgDir, 'bin');
  mkdirSync(binDir, { recursive: true });
  // No `exports` field, so `require.resolve('stockfish/package.json')` resolves
  // through the filesystem the way the real package's does.
  writeFileSync(
    join(pkgDir, 'package.json'),
    JSON.stringify({ name: 'stockfish', version: '0.0.0', buildVersion: '99' }),
  );
  if (emitJs) writeFileSync(join(binDir, 'stockfish-99-lite-single.js'), 'FAKE JS PAYLOAD');
  if (emitWasm) writeFileSync(join(binDir, 'stockfish-99-lite-single.wasm'), 'FAKE WASM PAYLOAD');

  mkdirSync(join(root, 'scripts'), { recursive: true });
  const sandboxScript = join(root, 'scripts', 'copy-engine.mjs');
  writeFileSync(sandboxScript, readFileSync(script));

  return {
    root,
    outDir: join(root, 'public', 'engine'),
    // stderr is captured rather than inherited: one test provokes a deliberate
    // error, and its message belongs in the assertion, not in the suite output.
    run: () =>
      execFileSync(process.execPath, [sandboxScript], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }),
  };
}

afterEach(() => {
  for (const root of sandboxes.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('copy-engine', () => {
  it('copies both engine files, byte for byte, and nothing else', () => {
    const box = sandbox();

    const stdout = box.run();

    // Exactly two files, not "at least the two": `vite build` copies the whole
    // publicDir, so anything else in here ships to users.
    expect(readdirSync(box.outDir).sort()).toEqual(['stockfish.js', 'stockfish.wasm']);
    expect(readFileSync(join(box.outDir, 'stockfish.js'), 'utf8')).toBe('FAKE JS PAYLOAD');
    expect(readFileSync(join(box.outDir, 'stockfish.wasm'), 'utf8')).toBe('FAKE WASM PAYLOAD');
    // The names and sizes are reported, so a build log shows what was shipped.
    expect(stdout).toContain('stockfish.js 15 bytes');
    expect(stdout).toContain('stockfish.wasm 17 bytes');
  });

  it('creates the output directory when it does not exist yet', () => {
    // `predev` on a fresh clone: there is no `public/engine/` to clear or copy into.
    const box = sandbox();

    box.run();

    expect(readdirSync(box.outDir).sort()).toEqual(['stockfish.js', 'stockfish.wasm']);
  });

  it('removes a stale file left by an earlier version, under any name', () => {
    // I1. The reviewer's exact reproduction was the copy silently not happening
    // while a stale `stockfish.js` sat in the output directory: the old script
    // left the stale file in place and `npm run build` exited 0, shipping it.
    const box = sandbox();
    box.run();

    // Same name the script writes, so listing the directory would not catch it.
    writeFileSync(join(box.outDir, 'stockfish.js'), 'STALE — previous version');
    // A name the script no longer writes, which no per-name check ever looks at.
    writeFileSync(join(box.outDir, 'stockfish-v17.wasm'), 'STALE — an older layout');
    // A whole stale subdirectory, which `vite build` would also copy.
    mkdirSync(join(box.outDir, 'old'), { recursive: true });
    writeFileSync(join(box.outDir, 'old', 'stockfish.wasm'), 'STALE — nested');

    box.run();

    expect(readdirSync(box.outDir).sort()).toEqual(['stockfish.js', 'stockfish.wasm']);
    // The stale bytes must be gone, not merely outnumbered by a good copy.
    expect(readFileSync(join(box.outDir, 'stockfish.js'), 'utf8')).toBe('FAKE JS PAYLOAD');
    expect(readFileSync(join(box.outDir, 'stockfish.wasm'), 'utf8')).toBe('FAKE WASM PAYLOAD');
  });

  it('is idempotent, and does not disturb an already-correct output', () => {
    const box = sandbox();
    box.run();
    const first = readdirSync(box.outDir).sort();

    box.run();

    expect(readdirSync(box.outDir).sort()).toEqual(first);
    expect(readFileSync(join(box.outDir, 'stockfish.wasm'), 'utf8')).toBe('FAKE WASM PAYLOAD');
  });

  it('fails the build when the installed build is missing an engine file', () => {
    // The existence check, which now loops over the same list the copy does, so a
    // name cannot be validated on one line and then not acted on. Before this
    // round the check looped over extensions while the work was two hardcoded
    // `copyFileSync` calls, and the two could disagree.
    const box = sandbox({ emitWasm: false });

    expect(() => box.run()).toThrow(/Missing .*stockfish-99-lite-single\.wasm/);
  });

  it('leaves the real output directory matching the real installed build', () => {
    // The end-to-end statement of the invariant, against the real package: what
    // `npm run build` puts in `public/engine/` is exactly what node_modules has.
    // This is the check the E2E suite structurally cannot make.
    execFileSync(process.execPath, [script], { encoding: 'utf8' });

    expect(readdirSync(realOutDir).sort()).toEqual(['stockfish.js', 'stockfish.wasm']);
    for (const [ext, name] of [
      ['.js', 'stockfish.js'],
      ['.wasm', 'stockfish.wasm'],
    ] as const) {
      const dest = readFileSync(join(realOutDir, name));
      const original = readFileSync(realSrc(ext));
      expect(dest.length, `${name} is ${dest.length} bytes, expected ${original.length}`).toBe(
        original.length,
      );
      expect(
        dest.equals(original),
        `${name} does not match node_modules stockfish ${buildVersion}${ext} byte for byte`,
      ).toBe(true);
    }
  });
});
