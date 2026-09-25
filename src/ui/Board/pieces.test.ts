import { describe, expect, it } from 'vitest';
import { pieceGlyph, pieceLabel } from './pieces';

// The test owns these tables rather than importing the production ones: a test that
// reuses the lookup it is checking cannot fail. Each entry is the piece's spoken
// name and the glyph it is drawn with, straight from the standard set of Unicode
// chess symbols.
const NAMES: Readonly<Record<string, string>> = {
  p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king',
};

const GLYPHS: ReadonlyArray<readonly [string, string, string]> = [
  ['w', 'p', '♙'], ['w', 'n', '♘'], ['w', 'b', '♗'], ['w', 'r', '♖'], ['w', 'q', '♕'], ['w', 'k', '♔'],
  ['b', 'p', '♟'], ['b', 'n', '♞'], ['b', 'b', '♝'], ['b', 'r', '♜'], ['b', 'q', '♛'], ['b', 'k', '♚'],
];

describe('pieceLabel', () => {
  it('names each of the twelve pieces as "<colour> <piece>"', () => {
    for (const [color, type] of GLYPHS) {
      const piece = { color, type };
      expect(pieceLabel(piece), `${color}${type}`).toBe(
        `${color === 'w' ? 'white' : 'black'} ${NAMES[type]}`,
      );
    }
  });

  // A bishop announced as a knight is invisible to a test that only samples rooks,
  // queens and kings, so the twelve labels are required to be twelve.
  it('gives all twelve pieces a different name', () => {
    const labels = GLYPHS.map(([color, type]) => pieceLabel({ color, type }));
    expect(new Set(labels).size).toBe(12);
  });

  it('spells the colours out, so a name is never a bare w or b', () => {
    expect(pieceLabel({ color: 'w', type: 'p' })).toBe('white pawn');
    expect(pieceLabel({ color: 'b', type: 'p' })).toBe('black pawn');
    for (const [color, type] of GLYPHS) {
      expect(pieceLabel({ color, type }), `${color}${type}`).toMatch(/^(white|black) /);
    }
  });

  it('falls back to the raw type for a piece it has no name for', () => {
    expect(pieceLabel({ color: 'w', type: 'x' })).toBe('white x');
  });
});

describe('pieceGlyph', () => {
  it('draws each of the twelve pieces with its own symbol', () => {
    for (const [color, type, glyph] of GLYPHS) {
      expect(pieceGlyph({ color, type }), `${color}${type}`).toBe(glyph);
    }
  });

  // The reason the previous suite missed a rook drawn as a queen: three sampled
  // glyphs cannot tell a unique mapping from a plausible-looking one.
  it('draws all twelve pieces differently', () => {
    const drawn = GLYPHS.map(([color, type]) => pieceGlyph({ color, type }));
    expect(new Set(drawn).size).toBe(12);
  });

  it('has nothing to draw for an empty square', () => {
    expect(pieceGlyph(undefined)).toBeNull();
  });

  it('has nothing to draw for a piece it has no glyph for', () => {
    expect(pieceGlyph({ color: 'w', type: 'x' })).toBeNull();
  });
});
