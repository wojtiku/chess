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
   * The white and black versions of each piece are "the same drawing, painted
   * differently, which is checked rather than assumed". That claim was once true by
   * eye with the CHECK missing — twelve byte-identical copies would have passed every
   * other test in the suite, so a document was asserting a guarantee nothing
   * enforced. This is that check.
   *
   * It reads the real files out of `public/`, so it fails if an asset is renamed,
   * deleted, hand-edited to a different size, or if someone recolours one piece of
   * a pair without its twin. A test that only compared `pieceSrc` output would
   * pass with every file deleted, because a path is a path either way.
   */
  const read = (name: string): string =>
    readFileSync(join(PIECES_DIR, name), 'utf8');

  /**
   * A file's outline colour, read out of the file.
   *
   * This used to be two hardcoded hexes, and pinning the value turned out to be
   * the wrong shape of assertion: the black pieces' outline was retuned from
   * #f4ead6 to #d8c9b0 for a measured reason, and the test failed on a value that
   * was never the thing being claimed. Worse, the knight kept passing — its eye is
   * painted in the *other* file's outline colour, so `bN.svg` still contained
   * #f4ead6 and the assertion was satisfied by the wrong pixel.
   *
   * What is actually claimed is a relationship: the two are outlined in opposite
   * colours, and neither uses the other's. That survives any future retune, which
   * is the test earning its keep rather than needing to be edited in step.
   */
  const outlineOf = (svg: string): string =>
    svg.match(/stroke="(#[0-9a-f]{6})"/)?.[1] ?? '';

  /**
   * The board's two square colours, written out rather than imported.
   *
   * `theme.css` is a stylesheet and there is nothing to import from it in a unit
   * test, but the duplication is the point rather than an oversight: these are the
   * two colours every piece has to be readable against, and a test that read them
   * from the one source would be asserting that the source equals itself and would
   * follow a palette change instead of catching it. If the board is repainted, this
   * is the list that should make the pieces fail.
   */
  const SQUARES = { light: '#e0c9a4', dark: '#8f6244' } as const;

  /** WCAG relative luminance. */
  const luminance = (hex: string): number => {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };

  /** WCAG contrast ratio, 1 to 21. */
  const contrast = (a: string, b: string): number => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };

  /**
   * Every hex colour, whatever it is for.
   *
   * This used to name two specific values and substitute them, which only worked
   * because the files held exactly two. They now hold a gradient as well, and a
   * white piece and a black piece do NOT have the same shading — a near-white top
   * and a warm cream bottom on one, a warm charcoal top and a near-black bottom on
   * the other. So the property is stated over every colour rather than over two:
   * the two files are the same drawing *painted differently*, and the drawing is
   * what must match.
   */
  const withoutColours = (svg: string): string => svg.replaceAll(/#[0-9a-f]{6}/gi, 'C');

  /**
   * XML comments, gone.
   *
   * Each side's `<defs>` carries a comment explaining the gradient, and the two
   * explain themselves in different words — one stands alone, the other says "see
   * the white pieces". They are prose about the artwork, not the artwork, and two
   * files that differed only in their comments are the same drawing. Comparing them
   * verbatim would have made this test a check on my prose.
   */
  const withoutComments = (svg: string): string => svg.replace(/<!--[\s\S]*?-->/g, '');

  /** Text that differs between the two files but is not artwork: "White" / "Black". */
  const stripSide = (svg: string): string =>
    svg.replace(/White|Black/g, 'SIDE').replace(/\s+/g, ' ').trim();

  it.each(['P', 'N', 'B', 'R', 'Q', 'K'])(
    'w%s.svg and its black twin are the same drawing with the colours swapped',
    (letter) => {
      const white = read(`w${letter}.svg`);
      const black = read(`b${letter}.svg`);
      // Both files exist and are not empty: a missing asset makes `read` throw,
      // which is already a failure, and the assertions below would not run.
      expect(white.length, `w${letter}.svg`).toBeGreaterThan(0);
      expect(black.length, `b${letter}.svg`).toBeGreaterThan(0);

      // Not vacuous: each file really does have an outline, the two outlines are
      // different, and neither file uses the other's. A pair of identical files
      // would satisfy the geometry comparison below perfectly, and "the same
      // drawing" is not the claim — "the same drawing, in opposite colours" is.
      const whiteEdge = outlineOf(white);
      const blackEdge = outlineOf(black);
      expect(whiteEdge, `w${letter}.svg has an outline`).toMatch(/^#[0-9a-f]{6}$/);
      expect(blackEdge, `b${letter}.svg has an outline`).toMatch(/^#[0-9a-f]{6}$/);
      expect(whiteEdge, `w${letter}.svg and b${letter}.svg must differ`).not.toBe(blackEdge);
      expect(white, `w${letter}.svg must not outline like the black piece`).not.toContain(blackEdge);
      expect(black, `b${letter}.svg must not outline like the white piece`).not.toContain(whiteEdge);

      // **The outline is load-bearing, and this is the number that says so.** A
      // black piece's body is 2.71:1 against the dark square and a white piece's is
      // about 1.1:1 against the light one — both under the 3:1 that means a shape is
      // visible at all. So on the worst square for each piece, the outline is the
      // only thing making it readable, and the two outlines are the values that keep
      // them apart from the wood.
      //
      // Nothing else in the suite can see this. jsdom has no layout, no unit test
      // renders a piece, and the geometry comparison above is byte-identical however
      // the colours move. A retune that quietly darkens the black outline until the
      // pieces sink into the brown squares would pass every other test here.
      expect(contrast(whiteEdge, SQUARES.light), `${letter}: white outline on the light square`)
        .toBeGreaterThanOrEqual(3);
      expect(contrast(blackEdge, SQUARES.dark), `${letter}: black outline on the dark square`)
        .toBeGreaterThanOrEqual(3);

      // The drawing itself: same viewBox, same stroke width, same paths, same
      // order, same labels modulo the side. Comments and colours aside.
      const drawing = (svg: string) => stripSide(withoutComments(withoutColours(svg)));
      expect(drawing(white), `w${letter}.svg vs b${letter}.svg`).toBe(drawing(black));

      // And the two are genuinely different files, so the comparison above is
      // comparing two real documents rather than one document to itself.
      expect(white).not.toBe(black);
    },
  );

  /**
   * The shading, pinned.
   *
   * `gradientUnits="userSpaceOnUse"` is the one attribute in these twelve files
   * that a reasonable person could "simplify" away and produce a piece that still
   * looks like a piece in a thumbnail. The default is `objectBoundingBox`, which
   * gives every SHAPE in the group a gradient relative to that shape's own box —
   * so the rook's crenellations and its base are each fully shaded, and the piece
   * bands into two unrelated objects stacked on a plinth. Nothing else in the suite
   * can see that: the geometry is identical either way, and no unit test has a
   * layout engine.
   */
  it.each(['P', 'N', 'B', 'R', 'Q', 'K'])(
    'w%s.svg and b%s.svg are shaded by ONE gradient across the whole silhouette',
    (letter) => {
      for (const side of ['w', 'b']) {
        const svg = read(`${side}${letter}.svg`);
        const gradients = svg.match(/<linearGradient\b[^>]*>/g) ?? [];
        // One, not one per shape: a second gradient is the banding described above
        // arriving by a different route.
        expect(gradients, `${side}${letter}.svg gradient count`).toHaveLength(1);
        expect(gradients[0], `${side}${letter}.svg is user-space`).toContain('gradientUnits="userSpaceOnUse"');
        // Spans the piece's height in the 45x45 viewBox rather than a 0-1 box.
        expect(gradients[0], `${side}${letter}.svg span`).toMatch(/y1="\d+"/);
        expect(gradients[0], `${side}${letter}.svg span`).toMatch(/y2="4[0-9]"/);
        // Three stops is a top highlight, a body, and a shaded base.
        expect(svg.match(/<stop\b/g) ?? [], `${side}${letter}.svg stops`).toHaveLength(3);
      }
      // And both sides are lit over the SAME range, or the two would not be the
      // same object in different paint — one catching the light where the other
      // does not.
      const span = (side: string) => read(`${side}${letter}.svg`).match(/y1="[\d.]+" x2="[\d.]+" y2="[\d.]+"/)?.[0];
      expect(span('w'), `w${letter} vs b${letter} light range`).toBe(span('b'));
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
