import { describe, expect, it } from 'vitest';
import { AnalysisCache } from './cache';
import { pickHint, type Hint } from './hints';
import type { Analysis } from './evaluate';
import type { PvLine } from '../engine/engineClient';

// The brief's cache and hint assertions are kept verbatim so that nothing here is
// weaker than the plan's. Everything after the first two `describe` blocks is
// additional: the brief pins no 50cp boundary *at* 50, never proves that good
// mode can return anything but the best move, and never compares a mate line
// with a centipawn line in either order — which is where its mixed-score
// comparison produces nonsense.

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const line = (uci: string, scoreCp?: number, scoreMate?: number): PvLine => ({
  uci, scoreCp, scoreMate, depth: 20, pv: [uci],
});

const analysis = (lines: PvLine[]): Analysis => ({
  fen: START_FEN,
  scoreCp: lines[0]?.scoreCp, scoreMate: lines[0]?.scoreMate, depth: 20, lines,
});

describe('AnalysisCache', () => {
  it('round-trips by FEN', () => {
    const c = new AnalysisCache();
    const a = analysis([line('e2e4', 30)]);
    c.set(a.fen, a);
    expect(c.get(a.fen)).toBe(a);
  });

  it('evicts the oldest entry past the limit', () => {
    const c = new AnalysisCache(2);
    c.set('a', analysis([line('e2e4')]));
    c.set('b', analysis([line('d2d4')]));
    c.set('c', analysis([line('c2c4')]));
    expect(c.size).toBe(2);
    expect(c.get('a')).toBeUndefined();
    expect(c.get('c')).toBeDefined();
  });

  it('clears', () => {
    const c = new AnalysisCache();
    c.set('a', analysis([line('e2e4')]));
    c.clear();
    expect(c.size).toBe(0);
  });

  // The brief's implementation refreshes recency on read, and calls that "genuinely
  // least-recently-used" — but its eviction test only ever inserts, so a FIFO
  // implementation passes it. These two are the tests that make the claim true.
  it('evicts by recency of use, not by insertion order', () => {
    const c = new AnalysisCache(2);
    c.set('a', analysis([line('e2e4')]));
    c.set('b', analysis([line('d2d4')]));
    expect(c.get('a')).toBeDefined(); // 'a' is now the newest
    c.set('c', analysis([line('c2c4')]));
    expect(c.size).toBe(2);
    expect(c.get('b')).toBeUndefined(); // 'b' was the least recently used
    expect(c.get('a')).toBeDefined();
    expect(c.get('c')).toBeDefined();
  });

  it('refreshes recency when an entry is re-set', () => {
    const c = new AnalysisCache(2);
    const a1 = analysis([line('e2e4')]);
    const b = analysis([line('d2d4')]);
    c.set('a', a1);
    c.set('b', b);
    c.set('a', a1);
    c.set('c', analysis([line('c2c4')]));
    expect(c.get('b')).toBeUndefined();
    expect(c.get('a')).toBeDefined();
  });

  it('re-setting a key does not grow the map', () => {
    const c = new AnalysisCache(2);
    const a = analysis([line('e2e4')]);
    c.set('a', a);
    c.set('a', a);
    expect(c.size).toBe(1);
  });

  it('keeps nothing when the limit is zero', () => {
    const c = new AnalysisCache(0);
    c.set('a', analysis([line('e2e4')]));
    expect(c.size).toBe(0);
    expect(c.get('a')).toBeUndefined();
  });

  it('defaults to 500 entries', () => {
    const c = new AnalysisCache();
    for (let i = 0; i < 500; i++) c.set(`fen-${i}`, analysis([line('e2e4')]));
    expect(c.size).toBe(500);
    // `fen-0` is not read before the insert below: a read is a use, and using it
    // would make it the newest entry rather than the eviction victim.
    c.set('fen-500', analysis([line('d2d4')]));
    expect(c.size).toBe(500);
    expect(c.get('fen-0')).toBeUndefined();
    expect(c.get('fen-500')).toBeDefined();
  });
});

describe('pickHint', () => {
  it('best mode always returns the first line', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 10)]);
    expect(pickHint(a, 'best')?.uci).toBe('e2e4');
  });

  it('good mode restricts to moves within 50cp of best', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 10), line('c2c4', -300)]);
    for (let i = 0; i < 20; i++) {
      const h = pickHint(a, 'good');
      expect(['e2e4', 'd2d4']).toContain(h!.uci);
    }
  });

  it('good mode can pick any acceptable move given different randomness', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 10)]);
    expect(pickHint(a, 'good', () => 0)!.uci).toBe('e2e4');
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d2d4');
  });

  it('returns null when there are no lines', () => {
    expect(pickHint(analysis([]), 'best')).toBeNull();
    expect(pickHint(analysis([]), 'good')).toBeNull();
  });

  it('exposes the SAN of the continuation', () => {
    const a = analysis([{ ...line('e2e4', 30), pv: ['e2e4', 'e7e5', 'g1f3'] }]);
    const h = pickHint(a, 'best')!;
    expect(h.san).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('carries a mate score without a centipawn score', () => {
    const a = analysis([line('d1h5', undefined, 3)]);
    const h = pickHint(a, 'best')!;
    expect(h.scoreMate).toBe(3);
    expect(h.scoreCp).toBeUndefined();
  });

  it('treats mate lines as acceptable in good mode even when cp is absent', () => {
    const a = analysis([line('d1h5', undefined, 2), line('a1b1', undefined, 1)]);
    expect(['d1h5', 'a1b1']).toContain(pickHint(a, 'good')!.uci);
  });

  it('includes a move exactly 50cp worse and excludes one 51cp worse', () => {
    const edge = analysis([line('e2e4', 30), line('d2d4', -20)]);
    expect(pickHint(edge, 'good', () => 0.99)!.uci).toBe('d2d4'); // loss 50
    const over = analysis([line('e2e4', 30), line('d2d4', -21)]);
    expect(pickHint(over, 'good', () => 0.99)!.uci).toBe('e2e4'); // loss 51
  });

  it('offers the whole acceptable pool, and only it', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 10), line('c2c4', 0), line('g1f3', -400)]);
    const offered = new Set<string>();
    for (let i = 0; i < 100; i++) {
      offered.add(pickHint(a, 'good', () => i / 100)!.uci);
    }
    expect([...offered].sort()).toEqual(['c2c4', 'd2d4', 'e2e4']);
  });

  it('clamps a random source that leaves [0, 1) instead of indexing off the end', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 10)]);
    expect(pickHint(a, 'good', () => 1)!.uci).toBe('d2d4');
    expect(pickHint(a, 'good', () => 42)!.uci).toBe('d2d4');
    expect(pickHint(a, 'good', () => -5)!.uci).toBe('e2e4');
  });

  // The engine reports multiPV lines in rank order, so `lines[0]` is the best
  // line by protocol. Pinned so a future re-ranking of `lines` cannot quietly
  // change what "best" means.
  it('trusts the engine ordering: the first line is the best', () => {
    const a = analysis([line('e2e4', 30), line('d2d4', 900)]);
    expect(pickHint(a, 'best')!.uci).toBe('e2e4');
  });

  it('reports the score from the side to move, unnegated', () => {
    // Black to move, and the engine says Black is 30cp *worse*. Inverting this
    // is the classic way a hint layer ends up advocating the worst move.
    const a: Analysis = {
      fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1',
      scoreCp: -30, depth: 20, lines: [line('e7e5', -30)],
    };
    const h = pickHint(a, 'best')!;
    expect(h.scoreCp).toBe(-30);
    expect(h.san).toEqual(['e5']);
  });

  it('truncates an unplayable continuation instead of throwing', () => {
    const a = analysis([{ ...line('h7h5', 30), pv: ['h7h5', 'e2e4'] }]);
    const h = pickHint(a, 'best')!;
    expect(h.uci).toBe('h7h5');
    expect(h.san).toEqual([]); // illegal in the start position: nothing displayable
  });

  // The mixed case. A centipawn line and a mate line are not comparable as
  // numbers, so the brief's `l.scoreCp === undefined` / `l.scoreMate !== undefined`
  // guards silently discard one of them and fall back to "the best line alone".
  // Here both orders are pinned on a single common scale.
  it('never offers a centipawn line as an alternative to a mate', () => {
    const a = analysis([line('d1h5', undefined, 3), line('a1b1', 40)]);
    // rand() is pushed to the end of the pool on purpose: if the centipawn line
    // were in the pool, this would hand it back.
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d1h5');
  });

  it('does not discard a mating line for lacking a centipawn score', () => {
    // The reference is still lines[0], per the engine-ordering contract. A line
    // that is *better* than it stays acceptable, so the mating line is offered
    // rather than filtered out for being unscoreable on the centipawn scale.
    const a = analysis([line('a1b1', 40), line('d1h5', undefined, 3)]);
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d1h5');
  });

  it('never offers a line that walks into mate as a good idea', () => {
    // Best is mate in 2; the alternative gets mated in 1. It is on the same
    // scale but a ply further away, so it is far outside the 50cp window.
    const a = analysis([line('d1h5', undefined, 2), line('e1f1', undefined, -1)]);
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d1h5');
  });

  it('does not offer a slower mate as an equally good idea', () => {
    const a = analysis([line('d1h5', undefined, 1), line('a1b1', undefined, 3)]);
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d1h5');
  });

  it('treats a longer defence as an improvement when already being mated', () => {
    // Mated in 1 (best) vs mated in 5: the five-move defence is better, so it is
    // acceptable. The brief's `scoreMate >= 0` guard excluded every losing line,
    // which left `acceptable` empty and fell back to the best line alone.
    const a = analysis([line('e8e7', undefined, -1), line('d8d7', undefined, -5)]);
    expect(['e8e7', 'd8d7']).toContain(pickHint(a, 'good')!.uci);
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('d8d7');
  });

  it('offers only the best line when the best line has no score at all', () => {
    const a = analysis([line('e2e4'), line('d2d4', 20)]);
    expect(pickHint(a, 'good', () => 0.99)!.uci).toBe('e2e4');
  });

  it('returns the same shape for a single-line analysis', () => {
    const a = analysis([{ ...line('e2e4', 30), pv: ['e2e4', 'c7c5'] }]);
    const expected: Hint = { uci: 'e2e4', san: ['e4', 'c5'], scoreCp: 30 };
    expect(pickHint(a, 'best')).toEqual(expected);
    expect(pickHint(a, 'good')).toEqual(expected);
  });
});
