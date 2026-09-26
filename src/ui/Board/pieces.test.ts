// The single lookup every drawn piece goes through: the board, the captured panel
// and the promotion picker all resolve their artwork and their spoken names here,
// so this is the one test that can catch a piece set that has been changed in
// three places at once — and the one place where a mistake in two of those three
// would otherwise be invisible.
//
// The expected values are written out here rather than imported from the module.
// A test that reuses the lookup it is checking cannot fail.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PieceType, Side } from '../../chess/types';
import { pieceKey, pieceLabel, pieceName, pieceSrc, srcFor, type PieceLike } from './pieces';

/** `public/pieces/`, resolved from this file the way `copy-engine.test.ts` resolves
 *  the repo root — `import.meta.url` is not a `file:` URL under vitest, so the
 *  first attempt here failed on every case with "The URL must be of scheme file". */
const PIECES_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'public', 'pieces');

/** Narrowed here rather than in every call: the fixtures above are strings by
 * construction, and a cast repeated twelve times is a table nobody reads. */
const type = (t: string): PieceType => t as PieceType;
const side = (c: string): Side => c as Side;

const NAMES: Readonly<Record<string, string>> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

/** The twelve pieces, as they are drawn: `wQ` is `public/pieces/wQ.svg`. */
const ASSETS: ReadonlyArray<readonly [string, string, string]> = [
  ['w', 'p', 'wP'], ['w', 'n', 'wN'], ['w', 'b', 'wB'], ['w', 'r', 'wR'], ['w', 'q', 'wQ'], ['w', 'k', 'wK'],
  ['b', 'p', 'bP'], ['b', 'n', 'bN'], ['b', 'b', 'bB'], ['b', 'r', 'bR'], ['b', 'q', 'bQ'], ['b', 'k', 'bK'],
];

describe('pieceLabel', () => {
  it('names each of the twelve pieces as "<colour> <piece>"', () => {
    for (const [color, type] of ASSETS) {
      expect(pieceLabel({ color, type }), `${color}${type}`).toBe(
        `${color === 'w' ? 'white' : 'black'} ${NAMES[type]}`,
      );
    }
  });

  // A bishop announced as a knight is invisible to a test that only samples rooks,
  // queens and kings, so the twelve labels are required to be twelve.
  it('gives all twelve pieces a different name', () => {
    const labels = ASSETS.map(([color, type]) => pieceLabel({ color, type }));
    expect(new Set(labels).size).toBe(12);
  });

  it('spells the colours out, so a name is never a bare w or b', () => {
    expect(pieceLabel({ color: 'w', type: 'p' })).toBe('white pawn');
    expect(pieceLabel({ color: 'b', type: 'p' })).toBe('black pawn');
    for (const [color, type] of ASSETS) {
      expect(pieceLabel({ color, type }), `${color}${type}`).toMatch(/^(white|black) /);
    }
  });

  it('falls back to the raw type for a piece it has no name for', () => {
    expect(pieceLabel({ color: 'w', type: 'x' })).toBe('white x');
  });

  // A colour this table has no artwork for is a runtime value, not a compile-time
  // error, and the alternative to a name is a square announced as ", undefined".
  it('does not announce a colour it has no name for as "undefined"', () => {
    expect(pieceLabel({ color: 'x', type: 'p' })).toBe('black pawn');
  });
});

describe('pieceName', () => {
  it('names a piece type on its own, with no colour', () => {
    for (const [, t, key] of ASSETS) {
      expect(pieceName(type(t)), key).toBe(NAMES[t]);
    }
    expect(pieceName('q')).toBe('queen');
    expect(pieceName('n')).toBe('knight');
  });
});

describe('pieceKey', () => {
  it('names a file for each of the twelve pieces', () => {
    for (const [color, type, key] of ASSETS) {
      expect(pieceKey({ color, type }), `${color}${type}`).toBe(key);
    }
  });

  // The reason the previous suite missed a rook drawn as a queen: three sampled
  // pieces cannot tell a unique mapping from a plausible-looking one.
  it('gives all twelve pieces a different file', () => {
    expect(new Set(ASSETS.map(([c, t]) => pieceKey({ color: c, type: t }))).size).toBe(12);
  });

  it('has no file for an empty square', () => {
    expect(pieceKey(undefined)).toBeNull();
  });

  it('has no file for a piece it has no artwork for', () => {
    expect(pieceKey({ color: 'w', type: 'x' })).toBeNull();
    expect(pieceKey({ color: 'x', type: 'p' })).toBeNull();
  });
});

describe('pieceSrc', () => {
  it('points at the vendored SVG for each of the twelve pieces', () => {
    for (const [color, type, key] of ASSETS) {
      expect(pieceSrc({ color, type }), `${color}${type}`).toBe(`/pieces/${key}.svg`);
    }
  });

  // The path is the whole contract with `public/`. A leading slash missing, or a
  // segment dropped, is a 404 that only a browser would ever find.
  it('uses a root-absolute path, so it resolves the same on any route', () => {
    for (const [color, type] of ASSETS) {
      expect(pieceSrc({ color, type }), `${color}${type}`).toMatch(/^\/pieces\/[wb][PNBRQK]\.svg$/);
    }
  });

  it('has nothing to draw for an empty square', () => {
    // `null`, not `''`: the board renders no `<img>` at all for a `null`, where an
    // empty `src` is the browser's broken-image icon in the middle of a square.
    expect(pieceSrc(undefined)).toBeNull();
  });

  it('has nothing to draw for a piece it has no artwork for', () => {
    expect(pieceSrc({ color: 'w', type: 'x' })).toBeNull();
    expect(pieceSrc({ color: 'x', type: 'q' })).toBeNull();
  });

  // The prototype keys, with a **valid colour**, so `isPieceType` is what has to
  // reject them.
  //
  // The previous version of this test used fixtures whose *colour* was also
  // hostile — `{ color: 'p', type: '__proto__' }` — and `pieceKey` checks the
  // colour first, so every one of them was turned away by `isSide` and
  // `isPieceType` was never reached. The test name said "hostile input" and the
  // review's comment on it was accurate: it passed without testing the thing it
  // was named for. `in` walks the prototype chain, so `toString` and
  // `constructor` are the two that really matter, and a valid colour is the only
  // way to prove the rejection came from the right check.
  it('rejects inherited property names as piece types, with a valid colour', () => {
    for (const inherited of ['toString', 'constructor', '__proto__', 'hasOwnProperty', 'valueOf']) {
      const piece = { color: 'w', type: inherited };
      expect(pieceKey(piece), inherited).toBeNull();
      expect(pieceSrc(piece), inherited).toBeNull();
      // And the spoken name falls back to the raw symbol rather than
      // "white function toString() { [native code] }".
      expect(pieceLabel(piece), inherited).toBe(`white ${inherited}`);
    }
  });

  it('never throws, and never answers, on missing or malformed input', () => {
    // What this one actually covers: absent fields, empty strings, a hostile
    // colour, and non-objects. The prototype-name cases are the test above — these
    // were folded in with them and never checked which guard answered.
    const hostile: ReadonlyArray<unknown> = [
      {},
      { color: '', type: '' },
      { color: '__proto__', type: 'p' },
      { color: 'x', type: 'q' },
      null,
      42,
    ];
    for (const raw of hostile) {
      const piece = raw as PieceLike | undefined;
      expect(() => pieceSrc(piece), JSON.stringify(raw)).not.toThrow();
      expect(pieceSrc(piece), JSON.stringify(raw)).toBeNull();
    }
  });
});

describe('the vendored files themselves', () => {
  /**
   * `ATTRIBUTION.md` claims the white and black versions of each piece are "the
   * same geometry with the two colours swapped, which is checked rather than
   * assumed". The review found the claim true by eye and the CHECK missing —
   * twelve byte-identical copies would have passed every other test in the suite,
   * so the document was asserting a guarantee nothing enforced. This is that
   * check, and the document now points here rather than at nothing.
   *
   * It reads the real files out of `public/`, so it fails if an asset is renamed,
   * deleted, hand-edited to a different size, or if someone recolours one piece of
   * a pair without its twin. A test that only compared `pieceSrc` output would
   * pass with every file deleted, because a path is a path either way.
   */
  const read = (name: string): string =>
    readFileSync(join(PIECES_DIR, name), 'utf8');

  const WHITE_FILL = '#f6f5f1';
  const BLACK_FILL = '#1d1f24';

  /**
   * Both palette values reduced to one token, so two documents that differ *only*
   * by colour compare equal.
   *
   * Written this way after two wrong versions. The first tried to substitute one
   * palette for the other *within each file* and compared — which can never
   * match, because `wP.svg` is `fill=light stroke=dark` and `bP.svg` is
   * `fill=dark stroke=light`, so swapping each one lands them in opposite
   * arrangements. The second used a space as the intermediate marker and rewrote
   * every real space in the file, turning `viewBox="0 0 45 45"` into
   * `viewBox="0#1d1f240#1d1f2445 45"`. Removing the colours entirely is the
   * formulation the property actually has, and it needs no marker at all.
   */
  const withoutColours = (svg: string): string =>
    svg.replaceAll(WHITE_FILL, 'C').replaceAll(BLACK_FILL, 'C');

  /** Text that differs between the two files but is not artwork: "White" / "Black". */
  const stripSide = (svg: string): string =>
    svg.replace(/White|Black/g, 'SIDE').replace(/\s+/g, ' ').trim();

  it.each(['P', 'N', 'B', 'R', 'Q', 'K'])(
    'w%s.svg and its black twin are the same drawing with the colours swapped',
    (letter) => {
      const white = read(`w${letter}.svg`);
      const black = read(`b${letter}.svg`);
      // Both files exist and are not empty: a missing asset makes `read` throw,
      // which is already a failure, and the assertion below would not run.
      expect(white.length, `w${letter}.svg`).toBeGreaterThan(0);
      expect(black.length, `b${letter}.svg`).toBeGreaterThan(0);
      // Not vacuous: each file really does use the palette, and in opposite
      // arrangements. Without this, two files with no colour in them at all would
      // satisfy the comparison below.
      expect(white, `w${letter}.svg uses the light fill`).toContain(WHITE_FILL);
      expect(black, `b${letter}.svg uses the dark fill`).toContain(BLACK_FILL);
      // The drawing itself: same viewBox, same stroke width, same paths, same
      // order, same labels modulo the side.
      expect(
        stripSide(withoutColours(white)),
        `w${letter}.svg vs b${letter}.svg`,
      ).toBe(stripSide(withoutColours(black)));
    },
  );

  it('draws all twelve, and no two are the same file', () => {
    const names = ['P', 'N', 'B', 'R', 'Q', 'K'].flatMap((l) => [`w${l}.svg`, `b${l}.svg`]);
    const bodies = names.map((n) => read(n).replace(/White|Black/g, 'SIDE'));
    // The pair test above allows wX/bX to match; across the whole set nothing may
    // be a duplicate, or two different pieces would be the same drawing.
    expect(new Set(bodies).size).toBe(12);
  });
});

describe('srcFor', () => {
  // `Captured` and the promotion picker call this instead, with an already-checked
  // `PieceType` and `Side`. It must agree with `pieceSrc` for every piece, or the
  // board and the side panel would draw the same piece two different ways.
  it('agrees with pieceSrc for all twelve pieces', () => {
    for (const [c, t] of ASSETS) {
      expect(srcFor(type(t), side(c)), `${c}${t}`).toBe(pieceSrc({ color: c, type: t }));
    }
  });
});
