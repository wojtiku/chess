import { describe, expect, it } from 'vitest';
// `Chess` is imported from `chess/rules`, not from `chess.js`: the project has an
// explicit rule that the library is reached through that boundary, and this file
// was the one place a *type* import went past it.
import { Chess } from '../../chess/rules';
import { FILES, RANKS, displaySquares, squareColor, stepSquare, type ArrowKey } from './squares';

const ALL_SQUARES = RANKS.flatMap((rank) => FILES.map((file) => `${file}${rank}`));

/** The square one file to the right, or null at the h-file. */
function eastOf(square: string): string | null {
  const file = square.charCodeAt(0) - 97;
  const fileName = FILES[file + 1];
  return fileName === undefined ? null : `${fileName}${square[1]}`;
}

/** The square one rank up the board as White sees it, or null at the top. */
function northOf(square: string): string | null {
  const rank = Number(square[1]);
  return rank >= 8 ? null : `${square[0]}${rank + 1}`;
}

describe('squareColor', () => {
  // The standard convention, and the one `chess.js` uses: a1 is dark, h1 is light,
  // and each side's queen starts on her own colour (d1 light, d8 dark). The
  // literals below are a readable sample; `agrees with the rules library on every
  // square` is what actually pins the convention.
  it('is dark on a1 and light on h1', () => {
    expect(squareColor('a1')).toBe('dark');
    expect(squareColor('h1')).toBe('light');
  });

  it('is light on a8', () => {
    expect(squareColor('a8')).toBe('light');
  });

  it('is light on e4', () => {
    expect(squareColor('e4')).toBe('light');
  });

  it('colours the rest of the board', () => {
    expect(squareColor('b1')).toBe('light');
    expect(squareColor('d1')).toBe('light');
    expect(squareColor('e1')).toBe('dark');
    expect(squareColor('a2')).toBe('light');
    expect(squareColor('d4')).toBe('dark');
    expect(squareColor('h8')).toBe('dark');
  });

  // The defence against the convention drifting. The sample above can be edited to
  // agree with a wrong board; this cannot, because chess.js is the library the
  // position itself comes from and it follows the standard convention.
  it('agrees with the rules library on every square', () => {
    const game = new Chess();
    // The library's narrow `Square` union, **derived from the class rather than
    // imported**. `chess/rules` re-exports this project's own `Square`, which is a
    // plain `string` — too wide for `game.squareColor`, and the reason this file
    // used to `import type { Square } from 'chess.js'` and so reached past the
    // boundary. `Parameters<…>[0]` takes the narrow type from the value that came
    // through the boundary, which is the same information without the crossing.
    type LibrarySquare = Parameters<Chess['squareColor']>[0];
    for (const square of ALL_SQUARES) {
      // The cast is the same narrowing the rules layer does at the library boundary:
      // chess.js types a square as a 64-value union, and `ALL_SQUARES` is built from
      // the same file and rank lists, so every one of these is a real square.
      expect(squareColor(square), square).toBe(
        game.squareColor(square as LibrarySquare),
      );
    }
  });

  it('puts each queen on her own colour, as on every real board', () => {
    const game = new Chess();
    for (const cell of game.board().flat()) {
      if (cell?.type !== 'q') continue;
      expect(game.squareColor(cell.square), cell.square).toBe(cell.color === 'w' ? 'light' : 'dark');
    }
  });

  it('keeps the a1–h8 diagonal one colour throughout, and dark', () => {
    for (const square of ['a1', 'b2', 'c3', 'd4', 'e5', 'f6', 'g7', 'h8']) {
      expect(squareColor(square), square).toBe('dark');
    }
  });

  it('splits the board 32 light and 32 dark', () => {
    const light = ALL_SQUARES.filter((square) => squareColor(square) === 'light');
    expect(light).toHaveLength(32);
  });

  // Tautological about the convention — it passes under either — but it still
  // catches an off-by-one in the index arithmetic, which the anchor alone would not.
  it('flips colour on every step right or up', () => {
    for (const square of ALL_SQUARES) {
      const east = eastOf(square);
      if (east !== null) expect(squareColor(east), `east of ${square}`).not.toBe(squareColor(square));
      const north = northOf(square);
      if (north !== null) expect(squareColor(north), `north of ${square}`).not.toBe(squareColor(square));
    }
  });
});

describe('displaySquares', () => {
  it('has 64 squares', () => {
    expect(displaySquares('w')).toHaveLength(64);
    expect(displaySquares('b')).toHaveLength(64);
  });

  it('starts at a8 for White', () => {
    const squares = displaySquares('w');
    expect(squares[0]).toMatchObject({ square: 'a8' });
    expect(squares[7]).toMatchObject({ square: 'h8' });
    expect(squares[8]).toMatchObject({ square: 'a7' });
    expect(squares[56]).toMatchObject({ square: 'a1' });
    expect(squares[63]).toMatchObject({ square: 'h1' });
  });

  it('starts at h1 for Black', () => {
    const squares = displaySquares('b');
    expect(squares[0]).toMatchObject({ square: 'h1' });
    expect(squares[7]).toMatchObject({ square: 'a1' });
    expect(squares[8]).toMatchObject({ square: 'h2' });
    expect(squares[56]).toMatchObject({ square: 'h8' });
    expect(squares[63]).toMatchObject({ square: 'a8' });
  });

  it('covers every square exactly once in both orientations', () => {
    for (const orientation of ['w', 'b'] as const) {
      const all = displaySquares(orientation).map((s) => s.square);
      expect(new Set(all).size, orientation).toBe(64);
      expect([...all].sort(), orientation).toEqual([...ALL_SQUARES].sort());
    }
  });

  it('starts on a light square and alternates across the first row', () => {
    const squares = displaySquares('w');
    // a8 is light on a standard board, and h1 — the far corner of that same row
    // eight rows down — is light too, which is the "lighter on the right" rule.
    expect(squares[0]?.light).toBe(true);
    expect(squares[1]?.light).toBe(false);
    expect(squares[2]?.light).toBe(true);
    expect(squares[7]?.light).toBe(false);
  });

  it('agrees with squareColor on every square in both orientations', () => {
    for (const orientation of ['w', 'b'] as const) {
      for (const { square, light } of displaySquares(orientation)) {
        expect(light, square).toBe(squareColor(square) === 'light');
      }
    }
  });

  it('carries no piece, because the position is the Chess instance’s business', () => {
    for (const { piece } of displaySquares('w')) expect(piece).toBeNull();
  });
});

describe('stepSquare', () => {
  it('moves right and down the way the board looks for White', () => {
    expect(stepSquare('e2', 'ArrowRight', 'w')).toBe('f2');
    expect(stepSquare('e2', 'ArrowLeft', 'w')).toBe('d2');
    expect(stepSquare('e2', 'ArrowUp', 'w')).toBe('e3');
    expect(stepSquare('e2', 'ArrowDown', 'w')).toBe('e1');
  });

  it('moves the other way for a Black board, where h1 is top left', () => {
    expect(stepSquare('e2', 'ArrowRight', 'b')).toBe('d2');
    expect(stepSquare('e2', 'ArrowLeft', 'b')).toBe('f2');
    expect(stepSquare('e2', 'ArrowUp', 'b')).toBe('e1');
    expect(stepSquare('e2', 'ArrowDown', 'b')).toBe('e3');
  });

  it('stops at the edge instead of wrapping onto the next rank', () => {
    expect(stepSquare('h8', 'ArrowRight', 'w')).toBeNull();
    expect(stepSquare('h8', 'ArrowUp', 'w')).toBeNull();
    expect(stepSquare('a1', 'ArrowLeft', 'w')).toBeNull();
    expect(stepSquare('a1', 'ArrowDown', 'w')).toBeNull();
    expect(stepSquare('h1', 'ArrowLeft', 'b')).toBeNull();
    expect(stepSquare('h1', 'ArrowUp', 'b')).toBeNull();
  });

  it('has no neighbour for a square that is not on the board', () => {
    expect(stepSquare('j9', 'ArrowRight', 'w')).toBeNull();
    expect(stepSquare('', 'ArrowDown', 'w')).toBeNull();
  });

  it('round-trips: every square has a neighbour in each direction that has it back', () => {
    const opposite: Record<ArrowKey, ArrowKey> = {
      ArrowUp: 'ArrowDown',
      ArrowDown: 'ArrowUp',
      ArrowLeft: 'ArrowRight',
      ArrowRight: 'ArrowLeft',
    };
    for (const square of ALL_SQUARES) {
      for (const key of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] as const) {
        const there = stepSquare(square, key, 'w');
        if (there === null) continue;
        expect(stepSquare(there, opposite[key], 'w'), `${square} ${key}`).toBe(square);
      }
    }
  });
});
