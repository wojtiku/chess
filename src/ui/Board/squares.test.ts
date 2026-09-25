import { describe, expect, it } from 'vitest';
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
  it('is light on a1 and dark on h1', () => {
    expect(squareColor('a1')).toBe('light');
    expect(squareColor('h1')).toBe('dark');
  });

  it('is dark on a8', () => {
    expect(squareColor('a8')).toBe('dark');
  });

  // The brief asserted 'light' here. With a1 light, e4 is an odd number of steps
  // away (4 files + 3 ranks) and must therefore be dark: a1, h1 and a8 are
  // mutually consistent and e4 was the odd one out. In standard chess (a1 dark)
  // e4 is light, but then h1 and a8 are not dark either.
  it('is dark on e4, because a1 light and e4 differ by an odd number of steps', () => {
    expect(squareColor('e4')).toBe('dark');
  });

  it('colours the rest of the board', () => {
    expect(squareColor('b1')).toBe('dark');
    expect(squareColor('d1')).toBe('dark');
    expect(squareColor('e1')).toBe('light');
    expect(squareColor('a2')).toBe('dark');
    expect(squareColor('d4')).toBe('light');
    expect(squareColor('h8')).toBe('light');
  });

  it('splits the board 32 light and 32 dark', () => {
    const light = ALL_SQUARES.filter((square) => squareColor(square) === 'light');
    expect(light).toHaveLength(32);
  });

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

  it('starts on a dark square and alternates across the first row', () => {
    const squares = displaySquares('w');
    expect(squares[0]?.light).toBe(false);
    expect(squares[1]?.light).toBe(true);
    expect(squares[2]?.light).toBe(false);
    expect(squares[7]?.light).toBe(true);
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
