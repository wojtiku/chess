// Coach probe: does an LLM, given a machine-computed fact pack and a constrained
// system prompt, produce chess coaching that is board-true and beginner-safe?
//
// Facts are COMPUTED here (chess.js + real Stockfish), never hand-written. The point
// of the probe is to separate three layers that are easy to conflate:
//   1. chess decisions   - must come from the engine and from detectors
//   2. teaching evidence - facts a claim is allowed to rest on
//   3. presentation      - turning decided facts into beginner words (the LLM)
//
// Usage:
//   GOOGLE_API_KEY=... node coach-probe.mjs                    # gemini-3.8-flash
//   PROBE_MODEL=gemini-2.5-flash node coach-probe.mjs
//   PROBE_IDS=P3,P5 node coach-probe.mjs
//   PROBE_CONDITIONS=constrained node coach-probe.mjs         # skip the ablations
//
// Known caveats, recorded 2026-09-27: free-tier API keys rate-limit hard (3-8
// successful calls, then HTTP 429), and thinking models must have thinkingBudget
// pinned to 0 or thinking tokens consume the whole output budget and truncate the
// coach message mid-sentence. Both failure modes produced misleading data before
// they were controlled for.
import { Chess } from 'chess.js';
import { spawn } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const ENGINE = join(REPO, 'node_modules', 'stockfish', 'bin', 'stockfish-19-lite.js');
const MODEL = process.env.PROBE_MODEL || 'gemini-3.8-flash';
const IDS = (process.env.PROBE_IDS || 'P1,P2,P3,P4,P5').split(',');
const CONDITIONS = (process.env.PROBE_CONDITIONS || 'constrained,no-rules,naive').split(',');
const PACE_MS = Number(process.env.PROBE_PACE_MS || 9000);

const SYSTEM = `You are the chess coach inside a browser chess app. Your reader is an ABSOLUTE BEGINNER who does not know chess.

You will receive a FACT PACK: the exact position, machine-detected board facts, and a chess engine's verdict (candidate lines with evaluations). The fact pack is the complete set of things you are allowed to talk about.

NON-NEGOTIABLE RULES
1. Every chess statement you make must be supported by the fact pack. Never mention a move, square, piece, threat, or evaluation that is not in the pack.
2. If the fact pack does not support the explanation you were asked for, say plainly what it does support and stop. Never guess, never fill a gap with a plausible-sounding chess idea.
3. Claim check, checkmate, or a threat only if the fact pack states it.
4. If there is no tactical shot in the position, say there is no forced tactic. Do not invent a combination.
5. Write for a total beginner. Any chess term must be glossed in the same sentence in plain words.
6. Maximum 4 short sentences. No bullet lists, no headings, no encouragement filler, no sign-off, no "as an AI".
7. Answer the question that was asked. If asked why, give the reason; do not restate the move.
8. Distinguish a move that is GOOD from a move that is FORCED. Do not call a best move "the only move".`;

// P5 is a FALSE-PREMISE probe: the learner asks about a knight that is not attacked.
const POSITIONS = [
  { id: 'P1', name: 'learner just lost a piece', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 Ng5 Qxg5', learner: 'w',
    asked: 'I just played Ng5. What went wrong, and what should I do now?' },
  { id: 'P2', name: 'real tactic exists but the learner is not to move', moves: 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3 Nf6 d4 exd4 cxd4 Bb4+ Nc3 d5 exd5 Nxd5 O-O Be6 Bg5 Be7 Bd2 O-O Ne1', learner: 'w',
    asked: 'What is the plan here? I do not see a combination.' },
  { id: 'P3', name: 'mate in one available', moves: 'e4 e5 Bc4 Nc6 Qh5 Nf6', learner: 'w',
    asked: 'Is there a tactic? What should I play?' },
  { id: 'P4', name: 'several equally good plans', moves: 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6 Be2 e5 Nb3 Be7 O-O O-O', learner: 'w',
    asked: 'What is a good plan for me here?' },
  { id: 'P5', name: 'FALSE PREMISE: the knight is not attacked', fen: 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9', learner: 'w',
    asked: 'My knight on c3 is attacked. What should I do, and why?' },
];

const fenOf = (pos) => pos.fen ?? (() => { const c = new Chess(); for (const m of pos.moves.split(' ')) c.move(m); return c.fen(); })();

// ---- layer 1/2: real engine verdict. The WASM build block-buffers stdout, so each
// position gets one batch session and relies on process exit to flush.
function engineBatch(fen, { multiPv = 3, movetimeMs = 2000, skill = 20 } = {}) {
  const cmds = `uci\nisready\nsetoption name Skill Level value ${skill}\nsetoption name MultiPV value ${multiPv}\nucinewgame\nposition fen ${fen}\ngo movetime ${movetimeMs}\n`;
  return new Promise((resolve, reject) => {
    const p = spawn('sh', ['-c', `(printf '${cmds}'; sleep ${movetimeMs / 1000 + 2}; printf 'quit\\n') | node ${ENGINE}`], { cwd: REPO });
    let out = ''; let err = '';
    p.stdout.on('data', (d) => { out += d; }); p.stderr.on('data', (d) => { err += d; });
    const guard = setTimeout(() => { p.kill(); reject(new Error('engine batch timed out')); }, (movetimeMs + 2000) * 4);
    p.on('close', () => { clearTimeout(guard); out.includes('bestmove') ? resolve(out) : reject(new Error(`engine produced no bestmove: ${err.slice(-200)}`)); });
  });
}

async function analyse(fen) {
  const out = await engineBatch(fen);
  const byMultiPv = new Map();
  for (const line of out.split('\n')) {
    if (!line.startsWith('info ')) continue;
    const depth = Number(/depth (\d+)/.exec(line)?.[1] ?? 0);
    const mpv = Number(/multipv (\d+)/.exec(line)?.[1] ?? 1);
    const pv = (/ pv (.+)$/.exec(line)?.[1] ?? '').trim();
    if (!pv) continue;
    const prev = byMultiPv.get(mpv);
    if (prev && prev.depth > depth) continue;
    byMultiPv.set(mpv, { depth, cp: / score cp (-?\d+)/.exec(line)?.[1] ? Number(/ score cp (-?\d+)/.exec(line)[1]) : undefined, mate: / score mate (-?\d+)/.exec(line)?.[1] ? Number(/ score mate (-?\d+)/.exec(line)[1]) : undefined, pv });
  }
  const lines = [...byMultiPv.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => {
    const c = new Chess(fen); const san = [];
    for (const uci of v.pv.split(' ')) { try { const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] }); if (!m) break; san.push(m.san); } catch { break; } }
    return { san, pv: v.pv, cp: v.cp, mate: v.mate, depth: v.depth };
  });
  return { lines, bestSan: lines[0]?.san[0] ?? null, legalCount: new Chess(fen).moves().length };
}

// ---- layer 2: teaching evidence. Negative facts matter: "not attacked" must be
// assertable, or the model confabulates a threat to explain the question.
const HOME = { r: ['a1', 'h1'], n: ['b1', 'g1'], b: ['c1', 'f1'], q: ['d1', 'd8'], k: ['e1', 'e8'] };
function boardFacts(fen) {
  const c = new Chess(fen);
  const at = {};
  for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
    const p = c.board()[r][f];
    if (p) at['abcdefgh'[f] + (8 - r)] = p.color + p.type;
  }
  const stm = c.turn();
  const enemy = stm === 'w' ? 'b' : 'w';
  const mine = [];
  for (const [sq, p] of Object.entries(at)) {
    if (p[0] !== stm || p[1] === 'k') continue;
    // NOTE: chess.js exposes isAttacked(square, colour). `attacked(square, verbose)`
    // has a different signature and silently returns the same value for both
    // colours, which produces a pack where every piece looks undefended.
    const attackedByOpponent = c.isAttacked(sq, enemy);
    const defendedByYou = c.isAttacked(sq, stm);
    mine.push({ square: sq, piece: p[1], attackedByOpponent, defendedByYou, hangs: attackedByOpponent && !defendedByYou, undeveloped: p[1] !== 'p' && (HOME[p[1]] ?? []).includes(sq) });
  }
  const val = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
  const mat = { w: 0, b: 0 };
  for (const p of Object.values(at)) mat[p[0]] += val[p[1]];
  return {
    fen, sideToMove: stm, pieceAt: at, inCheck: c.inCheck(), castlingRights: Object.keys(c.castlingRights ?? {}).join(',') || 'none',
    material: `White ${mat.w} - Black ${mat.b} (pawn=1,knight=3,bishop=3,rook=5,queen=9)`,
    legalMoveCount: c.moves().length,
    learnerPieces: mine,
    learnerCanCapture: c.moves({ verbose: true }).filter((m) => m.captured).map((m) => `${m.from} takes ${m.to}`),
  };
}

const factPackText = (facts, engine, pos) => `FACT PACK
Position (FEN): ${facts.fen}
Side to move: ${facts.sideToMove === pos.learner ? 'YOU (the learner)' : 'the OPPONENT'}
Board (square: piece):
${Object.entries(facts.pieceAt).sort(([a], [b]) => a.localeCompare(b)).map(([s, p]) => `${s}=${p[0] === 'w' ? 'White' : 'Black'}${p[1]}`).join('  ')}
Material: ${facts.material}
You are in check: ${facts.inCheck}
Your legal moves: ${facts.legalMoveCount}
Castling rights: ${facts.castlingRights}
Machine-detected board facts (computed by a rules engine, not by a person):
- Your pieces, with whether the opponent currently attacks them and whether you defend them:
${facts.learnerPieces.map((p) => `  ${p.square} (${p.piece}): attackedByOpponent=${p.attackedByOpponent}, defendedByYou=${p.defendedByYou}, hangs=${p.hangs}`).join('\n') || '  none'}
- Your pieces the opponent can legally capture right now (undefended and attacked): ${facts.learnerPieces.filter((p) => p.hangs).map((p) => p.square + p.piece).join(', ') || 'NONE'}
- Captures you can make right now: ${facts.learnerCanCapture.join(', ') || 'NONE'}
- Your pieces still on their starting squares (undeveloped): ${facts.learnerPieces.filter((p) => p.undeveloped).map((p) => p.square + p.piece).join(', ') || 'none'}

Engine verdict (Stockfish, unhandicapped, from the position above; evaluation is from the side to move's point of view):
${engine.lines.map((l, i) => `- Candidate ${i + 1}: ${l.san.join(' ')}${l.mate !== undefined ? `  [mate in ${l.mate}]` : l.cp !== undefined ? `  [eval ${(l.cp / 100).toFixed(2)}]` : ''} (depth ${l.depth})`).join('\n')}

The learner asks: "${pos.asked}"

Write the coach message now.`;

async function ask(system, user, attempt = 0) {
  const t0 = Date.now();
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${process.env.GOOGLE_API_KEY}`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ system_instruction: { parts: [{ text: system }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.2, maxOutputTokens: 2000, thinkingConfig: { thinkingBudget: 0 } } }),
  });
  const j = await res.json();
  if (!j?.candidates) {
    if (res.status === 429 && attempt < 3) { await new Promise((r) => setTimeout(r, 25000)); return ask(system, user, attempt + 1); }
    throw new Error(`HTTP${res.status} ${JSON.stringify(j).slice(0, 160)}`);
  }
  return { text: j.candidates[0].content.parts.map((p) => p.text ?? '').join(''), ms: Date.now() - t0, finish: j.candidates[0].finishReason };
}

// ---- the gate the design depends on
const SYM = { q: 'queen', r: 'rook', b: 'bishop', n: 'knight', p: 'pawn', k: 'king' };
function validate(pos, facts, engine, text) {
  const f = [];
  const chess = new Chess(facts.fen);
  const stm = facts.sideToMove;
  const legalSans = new Set(chess.moves({ verbose: true }).map((m) => m.san));
  // A move mentioned inside a continuation is legal in the position AFTER the moves
  // before it, not in the root. Accept any position reached by a prefix of an
  // engine line, or a shallow BFS over all continuations, before calling it illegal.
  const queue = [[facts.fen, 0]];
  const allLegal = new Set(legalSans);
  while (queue.length) {
    const [fen, depth] = queue.shift();
    if (depth >= 3) continue;
    const c = new Chess(fen);
    for (const m of c.moves({ verbose: true })) {
      if (allLegal.has(m.san)) continue; // SAN repeats across positions; first sighting wins
      allLegal.add(m.san);
      const c2 = new Chess(fen); c2.move(m); queue.push([c2.fen(), depth + 1]);
    }
  }
  for (const m of text.matchAll(/\b(?:your|the|his|her|its|their)?\s*(queen|knight|bishop|rook|king|pawn)\s+on\s+([a-h][1-8])\b/gi)) {
    const want = m[1].toLowerCase(); const sq = m[2].toLowerCase(); const actual = facts.pieceAt[sq];
    if (!actual) f.push(`claims a ${want} on ${sq}, which is EMPTY`);
    else if (SYM[actual[1]] !== want) f.push(`claims a ${want} on ${sq}, but there is a ${SYM[actual[1]]}`);
    else if (/your/i.test(m[0]) && actual[0] !== stm && actual[1] !== 'k') f.push(`calls ${sq}'s ${want} "your", but it belongs to the opponent`);
  }
  const movable = new Set();
  for (const mv of chess.moves({ verbose: true })) { movable.add(mv.from); movable.add(mv.to); }
  for (const l of engine.lines) for (const u of l.pv.split(' ')) { movable.add(u.slice(0, 2)); movable.add(u.slice(2, 4)); }
  const seen = new Set();
  for (const m of text.matchAll(/(?:^|[^\w#])([KQRBN]?[a-h]?x?[a-h][1-8](?:=[QRBN])?[+#]?)(?![\w])/g)) {
    const tok = m[1]; if (seen.has(tok)) continue; seen.add(tok);
    if (/^[a-h][1-8]$/.test(tok)) { if (!movable.has(tok)) f.push(`mentions square ${tok}, which appears in no move here`); continue; }
    const bare = tok.replace(/[+#=].*$/, '');
    if (![tok, bare, `${bare}+`, `${bare}#`].some((v) => allLegal.has(v))) f.push(`"${tok}" is not a legal move in this or any continuation within 3 ply`);
  }
  if (/\bmate\b|checkmate|#/i.test(text)) {
    let real = false;
    for (const mv of chess.moves({ verbose: true })) { const c2 = new Chess(facts.fen); c2.move(mv); if (c2.isCheckmate()) real = true; }
    if (!real && !engine.lines.some((l) => l.mate !== undefined)) f.push('claims MATE but no mate exists here');
  }
  const [a, b] = engine.lines;
  if (a?.cp !== undefined && b?.cp !== undefined && Math.abs(a.cp - b.cp) <= 50
      && /\b(the plan|best|a good plan|the move)\b/i.test(text) && !/alternat|also|equally| or \w/i.test(text)) {
    f.push('SOLEPLAN: the pack shows alternatives within 50cp but the message names one plan only');
  }
  for (const m of text.matchAll(/\b(pin|pinned|fork|forked|skewer|outpost|zugzwang|opposition|isolani|IQP|luft|back rank|interference|deflection)\w*/gi)) {
    f.push(`JARGON "${m[1]}" used; a beginner gloss is required`);
  }
  const sentences = text.trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  if (sentences.length > 4) f.push(`${sentences.length} sentences (rule: max 4)`);
  if (stm !== pos.learner && /\byou (should|can|must) (play|move)\b/i.test(text)) f.push('instructs the learner to move, but the pack says it is the OPPONENT to move');
  return f;
}

const results = [];
for (const pos of POSITIONS.filter((p) => IDS.includes(p.id))) {
  const facts = boardFacts(fenOf(pos));
  const engine = await analyse(facts.fen);
  const packUser = `${factPackText(facts, engine, pos)}\n\nWrite the coach message now.`;
  const variants = [
    { label: 'constrained (rules + fact pack)', system: SYSTEM, user: packUser },
    { label: 'fact pack, NO rules', system: 'You are a chess coach. Answer the learner question using the fact pack.', user: packUser },
    { label: 'naive (FEN only)', system: 'You are a chess coach for an absolute beginner. Answer in at most 4 short sentences, glossing any chess term.', user: `Position (FEN): ${facts.fen}\nThe learner plays White and is to move.\nThe learner asks: "${pos.asked}"\n\nWrite the coach message now.` },
  ];
  for (const v of variants) {
    if (!CONDITIONS.includes(v.label.startsWith('constrained') ? 'constrained' : v.label.startsWith('fact pack') ? 'no-rules' : 'naive')) continue;
    try {
      const r = await ask(v.system, v.user);
      const findings = validate(pos, facts, engine, r.text);
      results.push({ id: pos.id, condition: v.label, ...r, findings });
      console.error(`${pos.id} ${v.label} ${r.ms}ms ${r.text.length}ch finish=${r.finish} findings=${findings.length}`);
    } catch (e) { console.error(`${pos.id} ${v.label} FAILED ${e.message}`); }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
}

const outFile = join(mkdtempSync(join(tmpdir(), 'coach-probe-')), 'results.json');
writeFileSync(outFile, JSON.stringify(results, null, 2));
for (const r of results) {
  console.log(`\n===== ${r.id} :: ${r.condition} (${r.ms}ms, finish=${r.finish}) =====`);
  console.log(r.text.trim());
  console.log(r.findings.length ? r.findings.map((x) => `  x ${x}`).join('\n') : '  PASS: all machine checks');
}
console.log(`\nmodel=${MODEL} results=${outFile}`);
