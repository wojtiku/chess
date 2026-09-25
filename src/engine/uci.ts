// Pure UCI protocol layer: a line parser and the command builders. No worker,
// no chess knowledge, no browser APIs. Task 3 wires this to a Stockfish worker;
// the rules layer validates whatever moves come out of it.

// A UCI move: from-square, to-square, optional promotion piece. Castling is
// king-takes-rook (e1g1), so 'k' is never a valid promotion suffix.
const UCI_MOVE = /^[a-h][1-8][a-h][1-8][qrbn]?$/;

export interface UciInfo {
  type: 'info';
  depth: number;
  selDepth?: number;
  multiPv: number;
  scoreCp?: number;    // centipawns, from the side-to-move's perspective
  scoreMate?: number;  // moves to mate; positive = side to move mates
  bound?: 'lower' | 'upper';
  pv: string[];        // UCI moves
}

export type UciEvent =
  | { type: 'uciok' }
  | { type: 'readyok' }
  | { type: 'bestmove'; move: string | null; ponder?: string }
  | UciInfo
  | { type: 'other'; line: string };

/** A bound is a search-window edge, not a verdict, so a bounded score must not
 * be shown to the learner as the engine's evaluation. */
export function isReliableScore(e: UciInfo): boolean {
  return e.bound === undefined;
}

function toInt(token: string | undefined): number | undefined {
  if (token === undefined) return undefined;
  const n = Number.parseInt(token, 10);
  return Number.isNaN(n) ? undefined : n;
}

/** The token following `key`, or undefined when `key` is absent.
 *
 * The `-1` guard is load-bearing and is why this exists rather than an inline
 * `parts[parts.indexOf(key) + 1]`: `indexOf` returns -1 when the key is missing,
 * and `-1 + 1 === 0`, so the inline form reads `parts[0]` — the literal 'info' —
 * as if it were a value. It happens to be harmless today only because
 * `toInt('info')` is NaN, and it silently reads the *wrong token* on any line
 * whose first token is numeric. */
function tokenAfter(parts: readonly string[], key: string): string | undefined {
  const i = parts.indexOf(key);
  return i === -1 ? undefined : parts[i + 1];
}

export function parseUciLine(line: string): UciEvent | null {
  const trimmed = line.trim();
  if (trimmed === '') return null;

  if (trimmed === 'uciok') return { type: 'uciok' };
  if (trimmed === 'readyok') return { type: 'readyok' };

  const parts = trimmed.split(/\s+/);

  // Exact first-token match, not startsWith: `information ...` is not an
  // engine info record and must not become a depth-0 search update.
  if (parts[0] === 'bestmove') {
    const rawMove = parts[1];
    // '(none)' and '0000' are the protocol's two spellings of "no move". Any
    // other non-move token means the record was truncated or is not a bestmove
    // line at all; reporting no move is the only safe reading, because a bogus
    // token here would be handed straight to the rules layer as a move.
    let move: string | null = null;
    if (
      rawMove !== undefined &&
      rawMove !== '(none)' &&
      rawMove !== '0000' &&
      UCI_MOVE.test(rawMove)
    ) {
      move = rawMove;
    }
    const ponder = tokenAfter(parts, 'ponder');
    return { type: 'bestmove', move, ...(ponder === undefined ? {} : { ponder }) };
  }

  if (parts[0] === 'info') {
    // `info string ...` messages and truncated output carry no depth. 0 keeps
    // the field total (Task 3's PvLine.depth is a number) without inventing a
    // search depth; multiPv 1 is the protocol default, and the engine only
    // emits `multipv` when it is greater than 1.
    const info: UciInfo = {
      type: 'info',
      depth: toInt(tokenAfter(parts, 'depth')) ?? 0,
      multiPv: toInt(tokenAfter(parts, 'multipv')) ?? 1,
      pv: [],
    };
    // Optional fields are assigned only when present, so a truncated line
    // leaves the key absent rather than present-and-undefined. `toEqual`
    // ignores the difference; `toStrictEqual`, spread, and JSON do not.
    const selDepth = toInt(tokenAfter(parts, 'seldepth'));
    if (selDepth !== undefined) info.selDepth = selDepth;
    if (parts.includes('lowerbound')) info.bound = 'lower';
    else if (parts.includes('upperbound')) info.bound = 'upper';
    // 0 and negative values are real scores (mate 0 is mate in zero), so the
    // guard is `!== undefined` and never a truthiness check.
    const scoreCp = toInt(tokenAfter(parts, 'cp'));
    if (scoreCp !== undefined) info.scoreCp = scoreCp;
    const scoreMate = toInt(tokenAfter(parts, 'mate'));
    if (scoreMate !== undefined) info.scoreMate = scoreMate;
    const pvIdx = parts.indexOf('pv');
    // `pv` runs to end-of-line, so slice is already total; the regex is what
    // keeps a non-move token out of the PV. It admits promotions (e7e8q) and
    // castling (e1g1), and drops '0000'-style nulls and stray words.
    if (pvIdx > -1) info.pv = parts.slice(pvIdx + 1).filter((t) => UCI_MOVE.test(t));
    return info;
  }

  return { type: 'other', line: trimmed };
}

export const cmd = {
  uci: (): string => 'uci',
  isready: (): string => 'isready',
  ucinewgame: (): string => 'ucinewgame',
  quit: (): string => 'quit',
  stop: (): string => 'stop',
  position: (fen: string): string => `position fen ${fen}`,
  setSkillLevel: (n: number): string => `setoption name Skill Level value ${n}`,
  setMultiPv: (n: number): string => `setoption name MultiPV value ${n}`,
  goMovetime: (ms: number): string => `go movetime ${ms}`,
};
