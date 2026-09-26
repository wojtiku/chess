// The single lookup every drawn piece goes through: the board, the captured panel
// and the promotion picker all resolve their artwork and their spoken names here,
// so this is the one test that can catch a piece set that has been changed in
// three places at once — and the one place where a mistake in two of those three
// would otherwise be invisible.
//
// The expected values are written out here rather than imported from the module.
// A test that reuses the lookup it is checking cannot fail.
import { describe, expect, it } from 'vitest';
import type { PieceType, Side } from '../../chess/types';
import { pieceKey, pieceLabel, pieceName, pieceSrc, srcFor, type PieceLike } from './pieces';

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

  // The prototype keys are the ones that matter: a lookup written as a plain
  // object literal and indexed by `${color}${type}` answers `'pconstructor'` and
  // `'__proto__'` with something truthy, and a `Record<string, string>` type does
  // not stop that — only a membership test does.
  it('never throws, and never answers, on hostile input', () => {
    const hostile: ReadonlyArray<unknown> = [
      {},
      { color: '', type: '' },
      { color: '__proto__', type: 'p' },
      { color: 'p', type: '__proto__' },
      { color: 'constructor', type: 'toString' },
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
