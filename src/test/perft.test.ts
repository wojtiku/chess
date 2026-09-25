import { describe, expect, it } from 'vitest';
import { Chess } from 'chess.js';

function perft(game: Chess, depth: number): number {
  if (depth === 0) return 1;
  let nodes = 0;
  for (const m of game.moves({ verbose: true })) {
    game.move(m);
    nodes += perft(game, depth - 1);
    game.undo();
  }
  return nodes;
}

const CASES: Array<[string, string | undefined, number[]]> = [
  ['startpos', undefined, [20, 400, 8902, 197281]],
  ['kiwipete', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', [48, 2039, 97862]],
  ['pos3', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', [14, 191, 2812, 43238]],
  ['pos4', 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1', [6, 264, 9467]],
  ['pos5', 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8', [44, 1486, 62379]],
];

const full = process.env.PERFT_FULL === '1';
// Default suite omits the two ~7-12s depths; `npm run perft:full` includes them.
const DEFAULT_MAX_DEPTH: Record<string, number> = {
  startpos: 3, kiwipete: 2, pos3: 4, pos4: 3, pos5: 2,
};

describe('perft', () => {
  for (const [name, fen, expected] of CASES) {
    const max = full ? expected.length : DEFAULT_MAX_DEPTH[name]!;
    for (let depth = 1; depth <= max; depth++) {
      it(`${name} depth ${depth} = ${expected[depth - 1]}`, () => {
        const game = fen ? new Chess(fen) : new Chess();
        expect(perft(game, depth)).toBe(expected[depth - 1]);
      });
    }
  }
});
