// Checking what the model said before a learner reads it.
//
// This is not a nicety. The probe's central finding is that detectors fail
// SILENTLY: a wrong chess.js API made every piece look undefended, and every
// model still wrote confident, correct-sounding teaching from the bad pack. The
// validator cannot detect that — it can only detect the model going beyond the
// pack it was GIVEN. So it catches one class of failure completely and a second
// class not at all, and the spec says so rather than implying otherwise.
//
// What this catches:
//   - a square mentioned that is empty or holds a different piece than claimed
//   - a piece claimed as "yours" that belongs to the opponent
//   - a move named that is not legal in this position
//   - a checkmate claimed where none exists
//   - a single plan presented as the only option
//   - jargon used without a plain-word gloss
//   - instructions broken that the reader can see broken (too long)
//
// What this cannot catch, and must not pretend to:
//   - an explanation that is true to the board and still misleading
//   - a reason that is wrong while every fact in it is right
//
// That limit is the reason the pedagogy lives in the shape of the interaction
// rather than in the wording. See .scratch/first-learning-release/spec.md.

import { Chess } from 'chess.js';
import type { FactPack } from '../detectors';

export type CoachFindingKind =
  | 'empty-square'
  | 'wrong-piece'
  | 'wrong-owner'
  | 'illegal-move'
  | 'false-mate'
  | 'sole-plan'
  | 'jargon'
  | 'too-long';

export interface CoachFinding {
  kind: CoachFindingKind;
  detail: string;
  /** How serious. A reader-facing message is only shown for `blocking`. */
  severity: 'blocking' | 'advisory';
}

const NAMES: Record<string, string> = {
  q: 'queen',
  r: 'rook',
  b: 'bishop',
  n: 'knight',
  p: 'pawn',
  k: 'king',
};

/** Chess words a beginner cannot be assumed to know.
 *
 *  The list is the probe's, plus the endgame terms. Each is a word the app's
 *  own concept names use, so a message that leans on one without explaining it
 *  is leaning on vocabulary the learner does not have. */
const JARGON = [
  'pin',
  'pinned',
  'fork',
  'forked',
  'skewer',
  'outpost',
  'zugzwang',
  'opposition',
  'isolani',
  'luft',
  'back rank',
  'interference',
  'deflection',
  'discovery',
  'trapped',
  'overloaded',
  'battery',
  'fianchetto',
  'zwischenzug',
];

/**
 * Validate a coach message against the pack it was given.
 *
 * Returns findings rather than a verdict, because there is no single verdict
 * available. A message can be factually clean and still be worth showing; a
 * message with a blocking finding is withheld. The caller decides what to do with
 * the advisory ones, and the honest default for release 1 is to show them.
 */
export function validateCoachMessage(text: string, facts: FactPack): CoachFinding[] {
  const findings: CoachFinding[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    return [{ kind: 'too-long', detail: 'The message was empty.', severity: 'blocking' }];
  }

  const game = new Chess(facts.fen);
  const stm = facts.learnerSide;

  // --- piece-on-square claims: "your knight on d3", "the queen on h5", and
  // "your rook IS on h5". The optional "is" is not decoration: without it the
  // most natural English phrasing of the claim — a statement, rather than a
  // label — matched nothing at all, and the gate silently passed every message
  // written that way. Found by writing a test sentence and watching the
  // validator agree with it when it should not have.
  for (const m of trimmed.matchAll(
    /\b(your|the|white's|black's)\s+(queen|knight|bishop|rook|king|pawn)\s+(?:is\s+|are\s+|sits\s+|stands\s+)?(?:on|at)\s+([a-h][1-8])\b/gi,
  )) {
    const [, owner, pieceName, squareRaw] = m;
    const square = squareRaw!.toLowerCase();
    const code = facts.pieceAt[square];
    const wanted = pieceName!.toLowerCase();

    if (code === undefined) {
      findings.push({
        kind: 'empty-square',
        detail: `The message says there is a ${wanted} on ${square}, and that square is empty.`,
        severity: 'blocking',
      });
      continue;
    }
    const actual = code[1]!;
    if (NAMES[actual] !== wanted) {
      findings.push({
        kind: 'wrong-piece',
        detail: `The message says a ${wanted} is on ${square}, and there is a ${NAMES[actual]}.`,
        severity: 'blocking',
      });
      continue;
    }
    // The reader is always White in release 1, so "your X" must be White's X.
    // This is the perspective defect the probe found most often, and it is the
    // one a reader who cannot play chess has no way to catch.
    const isMine = /^your$|^white's$/i.test(owner!);
    const colour = code[0]!;
    if (isMine && colour !== stm) {
      findings.push({
        kind: 'wrong-owner',
        detail: `The message calls the ${NAMES[actual]} on ${square} "your", and it belongs to the opponent.`,
        severity: 'blocking',
      });
    }
    if (!isMine && /^(black's|the)$/i.test(owner!) && colour === stm && actual !== 'k') {
      findings.push({
        kind: 'wrong-owner',
        detail: `The message calls the ${NAMES[actual]} on ${square} Black's, and it is the reader's.`,
        severity: 'blocking',
      });
    }
  }

  // --- move claims. Checked against the root AND a bounded continuation search,
  // because a move inside a line is legal in the position AFTER the moves before
  // it. Checking only the root produced false findings on every variation during
  // the probe's own validation pass.
  const legal = legalMovesWithin(game);
  const seen = new Set<string>();
  // Castling first, and as its own alternative. `O-O` is real SAN and a very
  // common thing for a model to say, and the from/to pattern cannot match it —
  // it is two letters, a dash and a letter. A move check that silently ignored
  // every castling claim would pass a message recommending an impossible castle.
  for (const m of trimmed.matchAll(/(?:^|[^\w#])(O-O-O|O-O|0-0-0|0-0)(?![\w])/g)) {
    const token = m[1]!.replace(/0/g, 'O');
    if (seen.has(token)) continue;
    seen.add(token);
    const bare = token.replace(/[+#].*$/, '');
    if ([token, bare, `${bare}+`, `${bare}#`].some((v) => legal.has(v))) continue;
    findings.push({
      kind: 'illegal-move',
      detail: `The message names the move ${token}, which is not legal in this position.`,
      severity: 'blocking',
    });
  }
  for (const m of trimmed.matchAll(/(?:^|[^\w#])([KQRBN]?[a-h]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w])/g)) {
    const token = m[1]!;
    if (seen.has(token)) continue;
    seen.add(token);
    if (/^[a-h][1-8]$/.test(token)) continue; // a bare square, not a move
    const bare = token.replace(/[+#=].*$/, '');
    if ([token, bare, `${bare}+`, `${bare}#`].some((v) => legal.has(v))) continue;
    findings.push({
      kind: 'illegal-move',
      detail: `The message names the move ${token}, which is not legal in this position.`,
      severity: 'blocking',
    });
  }

  // --- a mate claimed where none exists
  if (/\bmate\b|checkmate|#/i.test(trimmed) && facts.matesAvailable.length === 0) {
    let real = false;
    for (const mv of game.moves({ verbose: true })) {
      const after = new Chess(facts.fen);
      after.move(mv);
      if (after.isCheckmate()) real = true;
    }
    if (!real) {
      findings.push({
        kind: 'false-mate',
        detail: 'The message mentions checkmate, and there is none in this position.',
        severity: 'blocking',
      });
    }
  }

  // --- one plan presented as the only option
  if (/\b(the only|the best move|only move|you must)\b/i.test(trimmed)) {
    findings.push({
      kind: 'sole-plan',
      detail: 'The message presents one move as the only option, and positions usually have several reasonable ones.',
      severity: 'advisory',
    });
  }

  // --- jargon without a gloss
  for (const word of JARGON) {
    const re = new RegExp(`\\b${word}\\w*\\b`, 'i');
    if (re.test(trimmed) && !new RegExp(`\\b${word}\\b[^.]{0,80}\\b(means|which|that is|a piece|when)\\b`, 'i').test(trimmed)) {
      findings.push({
        kind: 'jargon',
        detail: `The message uses "${word}" without explaining it.`,
        severity: 'advisory',
      });
    }
  }

  // --- visible length. The rule is four sentences; a model that overruns it has
  // stopped listening, which is worth knowing even if every fact is right.
  const sentences = trimmed.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
  if (sentences.length > 6) {
    findings.push({
      kind: 'too-long',
      detail: `The message is ${sentences.length} sentences; the app asked for at most four.`,
      severity: 'advisory',
    });
  }

  return findings;
}

/** Every SAN reachable within ONE ply of any reply to the position.
 *
 *  Depth was measured, not chosen. Expanding this position:
 *
 *      1 ply     37 positions        7ms
 *      2 plies  1,360 positions      106ms
 *      3 plies 49,519 positions    3,561ms
 *
 *  Three plies is 3.5 SECONDS of main thread per coach message, which is longer
 *  than the call that produced the message took. Two plies is 106ms, which is a
 *  visible hitch on a phone and a non-event on a laptop, and it covers the case
 *  that actually arises: a model naming a move as the opponent's answer, or the
 *  continuation of the line it is describing. Three plies bought nothing a
 *  beginner is shown, so it is not paid for.
 *
 *  Bounded additionally so a pathological position cannot wedge the thread. */
function legalMovesWithin(game: Chess, depth = 2, cap = 2_000): Set<string> {
  const all = new Set<string>(game.moves());
  let frontier: Chess[] = [game];
  for (let d = 0; d < depth; d++) {
    const next: Chess[] = [];
    for (const position of frontier) {
      for (const mv of position.moves({ verbose: true })) {
        all.add(mv.san);
        if (next.length >= cap) break;
        const after = new Chess(position.fen());
        after.move(mv);
        next.push(after);
      }
      if (next.length >= cap) break;
    }
    if (next.length >= cap) break;
    frontier = next;
  }
  return all;
}

/** Whether a message should be shown to the learner.
 *
 *  Blocking findings are withheld. Advisory ones are shown, because a message
 *  that is factually sound and merely over-long or a little jargon-heavy is
 *  still more useful than nothing — and the alternative is building a phrasing
 *  system, which is the thing the app deliberately does not have. */
export function isShowable(findings: CoachFinding[]): boolean {
  return !findings.some((f) => f.severity === 'blocking');
}
