import type { Analysis } from './evaluate';

/** A bounded, FEN-keyed store of completed analyses.
 *
 * Keyed by whatever string the caller hands it — `makeEngineSource` uses the
 * FEN plus the two search options, so a request for 5 lines is never answered
 * out of a cached 1-line search (see `evaluate.ts`). The class itself knows
 * nothing about chess; it only knows recency.
 *
 * Deliberately synchronous and dependency-free: an analysis is a value, and
 * nothing here needs to await, so there is no window in which a half-finished
 * entry can be observed. */
export class AnalysisCache {
  /** Insertion order *is* the recency order: every path that touches an entry
   * re-inserts it, so the first key iterated by `Map` is always the least
   * recently used one. */
  private map = new Map<string, Analysis>();

  constructor(private limit = 500) {}

  get(fen: string): Analysis | undefined {
    const v = this.map.get(fen);
    if (v === undefined) return undefined;
    // Refresh recency so the eviction order is genuinely least-recently-used.
    this.map.delete(fen);
    this.map.set(fen, v);
    return v;
  }

  set(fen: string, value: Analysis): void {
    // Delete first so a re-set counts as a use, and so the size check below
    // measures distinct keys.
    this.map.delete(fen);
    this.map.set(fen, value);
    while (this.map.size > this.limit) {
      const oldest = this.map.keys().next();
      if (oldest.done) break;
      this.map.delete(oldest.value);
    }
  }

  clear(): void {
    this.map.clear();
  }

  get size(): number {
    return this.map.size;
  }
}
