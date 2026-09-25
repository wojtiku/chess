import { describe, expect, it } from 'vitest';
import { cmd, isReliableScore, parseUciLine } from './uci';
import type { UciEvent, UciInfo } from './uci';

// Narrows an info event without a cast, so a misparse fails with a readable
// message instead of being waved through by `as never` or `!`.
function parseInfo(line: string): UciInfo {
  const e = parseUciLine(line);
  if (e === null || e.type !== 'info') {
    throw new Error(
      `expected an info event from ${JSON.stringify(line)}, got ${JSON.stringify(e)}`,
    );
  }
  return e;
}

describe('parseUciLine', () => {
  it('parses a full info line', () => {
    const e = parseUciLine(
      'info depth 20 seldepth 28 multipv 1 score cp 34 nodes 1000000 nps 500000 hashfull 100 tbhits 0 time 2000 pv e2e4 e7e5 g1f3',
    );
    expect(e).toEqual({
      type: 'info', depth: 20, selDepth: 28, multiPv: 1,
      scoreCp: 34, pv: ['e2e4', 'e7e5', 'g1f3'],
    });
  });

  it('parses a negative centipawn score', () => {
    const e = parseUciLine('info depth 12 multipv 1 score cp -145 nodes 5 nps 5 time 1 pv e2e4');
    expect(e).toMatchObject({ scoreCp: -145, pv: ['e2e4'] });
  });

  it('parses a mate score as scoreMate, not scoreCp', () => {
    const e = parseInfo('info depth 8 multipv 1 score mate 3 nodes 10 nps 10 time 1 pv d1h5');
    expect(e).toMatchObject({ scoreMate: 3 });
    expect(e.scoreCp).toBeUndefined();
  });

  it('parses a negative mate score', () => {
    expect(parseInfo('info depth 8 multipv 1 score mate -2 pv h5e8')).toMatchObject({
      scoreMate: -2,
    });
  });

  it('parses multiple pv lines distinctly', () => {
    const a = parseInfo('info depth 10 multipv 1 score cp 20 pv e2e4');
    const b = parseInfo('info depth 10 multipv 2 score cp 5 pv d2d4');
    expect(a).toMatchObject({ multiPv: 1, scoreCp: 20 });
    expect(b).toMatchObject({ multiPv: 2, scoreCp: 5 });
  });

  it('parses a lowerbound line and marks it unreliable', () => {
    const e = parseInfo('info depth 6 multipv 1 score cp 90 lowerbound pv a2a3');
    expect(e).toMatchObject({ bound: 'lower' });
    expect(isReliableScore(e)).toBe(false);
  });

  it('parses an upperbound line and marks it unreliable', () => {
    const e = parseInfo('info depth 6 multipv 1 score cp -30 upperbound pv h2h3');
    expect(e).toMatchObject({ bound: 'upper' });
    expect(isReliableScore(e)).toBe(false);
  });

  it('parses an info line with no pv', () => {
    expect(parseUciLine('info depth 1 currmove e2e4 currmovenumber 1')).toMatchObject({
      type: 'info', depth: 1, pv: [],
    });
  });

  it('parses bestmove', () => {
    expect(parseUciLine('bestmove e2e4')).toEqual({ type: 'bestmove', move: 'e2e4' });
  });

  it('parses bestmove with a ponder move', () => {
    expect(parseUciLine('bestmove e2e4 ponder e7e5')).toEqual({
      type: 'bestmove', move: 'e2e4', ponder: 'e7e5',
    });
  });

  it('parses bestmove null (no move available)', () => {
    expect(parseUciLine('bestmove (none)')).toEqual({ type: 'bestmove', move: null });
  });

  it('parses bestmove 0000 (no move available)', () => {
    expect(parseUciLine('bestmove 0000')).toEqual({ type: 'bestmove', move: null });
  });

  it('parses uciok and readyok', () => {
    expect(parseUciLine('uciok')).toEqual({ type: 'uciok' });
    expect(parseUciLine('readyok')).toEqual({ type: 'readyok' });
  });

  it('returns other for id/option/garbage lines', () => {
    expect(parseUciLine('id name Stockfish 19')).toEqual({ type: 'other', line: 'id name Stockfish 19' });
    expect(parseUciLine('option name Hash type spin')).toEqual({
      type: 'other', line: 'option name Hash type spin',
    });
    expect(parseUciLine('total nonsense')).toEqual({ type: 'other', line: 'total nonsense' });
  });

  it('returns null for a blank line', () => {
    expect(parseUciLine('')).toBeNull();
    expect(parseUciLine('   ')).toBeNull();
  });

  it('classifies a copyprotection line as other, without throwing', () => {
    const line = 'copyprotection failing checksum tests';
    expect(() => parseUciLine(line)).not.toThrow();
    expect(parseUciLine(line)).toEqual({ type: 'other', line });
  });

  it('does not treat a line that merely starts with "info" as an info record', () => {
    expect(parseUciLine('information about the engine')).toEqual({
      type: 'other', line: 'information about the engine',
    });
  });
});

describe('parseUciLine on truncated and fieldless input', () => {
  // Every case is a line the parser can plausibly be handed for real: a
  // chunked stream, an `info string` message, or output cut off mid-record.
  // toStrictEqual is deliberate — it also fails on keys that exist with the
  // value `undefined`, which is how NaN and dropped-field bugs hide.
  const cases: ReadonlyArray<readonly [string, UciEvent | null]> = [
    ['info', { type: 'info', depth: 0, multiPv: 1, pv: [] }],
    ['info string', { type: 'info', depth: 0, multiPv: 1, pv: [] }],
    ['info string best move by Stockfish 19', { type: 'info', depth: 0, multiPv: 1, pv: [] }],
    ['info depth', { type: 'info', depth: 0, multiPv: 1, pv: [] }],
    ['info depth seldepth', { type: 'info', depth: 0, multiPv: 1, pv: [] }],
    ['info depth 7 multipv', { type: 'info', depth: 7, multiPv: 1, pv: [] }],
    ['info depth 7 multipv x score cp', { type: 'info', depth: 7, multiPv: 1, pv: [] }],
    ['info depth 7 score cp', { type: 'info', depth: 7, multiPv: 1, pv: [] }],
    ['info depth 7 score mate', { type: 'info', depth: 7, multiPv: 1, pv: [] }],
    ['info depth 7 score cp 12 lowerbound', { type: 'info', depth: 7, multiPv: 1, scoreCp: 12, bound: 'lower', pv: [] }],
    ['info depth 7 seldepth 9', { type: 'info', depth: 7, selDepth: 9, multiPv: 1, pv: [] }],
    // Zero is a real score, not a missing one: mate 0 means mate in zero.
    ['info depth 9 score mate 0 pv d1h5', { type: 'info', depth: 9, multiPv: 1, scoreMate: 0, pv: ['d1h5'] }],
    ['info depth 7 score cp 0 pv e2e4', { type: 'info', depth: 7, multiPv: 1, scoreCp: 0, pv: ['e2e4'] }],
    // A CRLF-mangled line, as produced by splitting a text stream on \n.
    ['info depth 5 pv e2e4\r', { type: 'info', depth: 5, multiPv: 1, pv: ['e2e4'] }],
    ['bestmove', { type: 'bestmove', move: null }],
    ['bestmove ponder', { type: 'bestmove', move: null }],
    ['bestmove e2e4 ponder', { type: 'bestmove', move: 'e2e4' }],
    ['  bestmove   0000  ponder  e7e5  ', { type: 'bestmove', move: null, ponder: 'e7e5' }],
    ['', null],
    ['   \r\n ', null],
  ];

  for (const [line, expected] of cases) {
    it(`handles ${JSON.stringify(line)} without throwing or NaN`, () => {
      expect(() => parseUciLine(line)).not.toThrow();
      const e = parseUciLine(line);
      expect(e).toStrictEqual(expected);
      if (e !== null && e.type === 'info') {
        expect(Number.isFinite(e.depth)).toBe(true);
        expect(Number.isFinite(e.multiPv)).toBe(true);
      }
    });
  }
});

describe('parseUciLine pv filtering', () => {
  it('keeps promotion and castling moves', () => {
    expect(parseInfo('info depth 20 multipv 1 score cp 5 pv e7e8q e1g1').pv).toEqual([
      'e7e8q',
      'e1g1',
    ]);
  });

  it('drops tokens after pv that are not UCI moves', () => {
    expect(parseInfo('info depth 20 multipv 1 score cp 5 pv e2e4 zzz 0000 1-0').pv).toEqual([
      'e2e4',
    ]);
  });
});

describe('isReliableScore', () => {
  it('is true for a score with no bound', () => {
    expect(isReliableScore(parseInfo('info depth 6 multipv 1 score cp 34 pv e2e4'))).toBe(true);
    expect(isReliableScore(parseInfo('info depth 6 multipv 1 score mate 2 pv d1h5'))).toBe(true);
  });
});

describe('cmd', () => {
  it('builds the documented commands', () => {
    expect(cmd.uci()).toBe('uci');
    expect(cmd.isready()).toBe('isready');
    expect(cmd.ucinewgame()).toBe('ucinewgame');
    expect(cmd.quit()).toBe('quit');
    expect(cmd.stop()).toBe('stop');
    expect(cmd.position('8/8/8/8/8/8/8/K6k w - - 0 1'))
      .toBe('position fen 8/8/8/8/8/8/8/K6k w - - 0 1');
    expect(cmd.setSkillLevel(8)).toBe('setoption name Skill Level value 8');
    expect(cmd.setMultiPv(3)).toBe('setoption name MultiPV value 3');
    expect(cmd.goMovetime(1500)).toBe('go movetime 1500');
  });
});
