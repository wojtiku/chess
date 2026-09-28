// Calling the provider.
//
// The only thing this module is allowed to do is hand a Fact pack to a model and
// bring back either text or a classified failure. It decides nothing about
// chess, and it must not: ADR-0001 puts every chess claim behind a Detector, and
// the model phrases what this app already established.
//
// The failure taxonomy is measured, not designed. Four distinguishable classes:
//
//   400 API_KEY_INVALID   fatal      the key is wrong; retrying cannot help
//   403 PERMISSION_DENIED fatal     no key, or the wrong shape
//   429 quota             transient  and NOT session-ending
//   503 UNAVAILABLE       transient  the provider is busy
//
// The 429 is the one that matters. During planning, eight consecutive calls gave
// 429, 200, 429 — quota recovers inside a minute, so treating a 429 as "stop for
// the session" would lock a learner out for an hour over a one-second hiccup.
// There is no `Retry-After` header on it, so the backoff here is blind by
// necessity, and the retry budget comes from the recovery window that was
// actually observed.
//
// The timeout is 20s and not 10s. Latency measured 1.7s–15s, so a 10s cutoff
// would discard roughly half the calls that would have succeeded — and
// disproportionately the slow ones, which were working.

import type { FactPack } from '../detectors';
import { boardFacts } from '../detectors';
import { PROMPT, type FactPackText } from './prompt';
import { validateCoachMessage, type CoachFinding } from './validate';

export type CoachFailureKind =
  | 'key-invalid'
  | 'no-key'
  | 'out-of-quota'
  | 'provider-busy'
  | 'network'
  | 'timed-out'
  | 'unreadable';

export interface CoachFailure {
  kind: CoachFailureKind;
  /** What the learner is told. A fact about what happened, never a blame. */
  message: string;
  /** Whether retrying could plausibly help. Fatal classes are never retried. */
  retryable: boolean;
}

export interface CoachReply {
  ok: true;
  text: string;
  /** What the model said that the Fact pack did not support. Empty is the goal. */
  findings: CoachFinding[];
  usage?: { promptTokens: number; candidateTokens: number; totalTokens: number };
  finish?: string;
  /** The pack that produced this, stored with the attempt for later review. */
  facts: FactPack;
}

export type CoachResult = CoachReply | { ok: false; failure: CoachFailure; facts: FactPack };

export interface CoachOptions {
  apiKey: string;
  /** Which provider the key is for. Recorded, not yet branched on: the map
   *  settled that a provider is a swappable dependency, and the only provider
   *  with an endpoint is Gemini. A second one adds a branch here and nothing
   *  else. */
  provider?: string;
  model?: string;
  /** Overridable so the tests do not wait twenty seconds to prove a timeout. */
  timeoutMs?: number;
  /** Overridable so the tests do not sleep. */
  retryDelaysMs?: number[];
  /** Injectable so the tests can drive every branch without a network. */
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
}

export const DEFAULT_MODEL = 'gemini-3.8-flash';
export const DEFAULT_TIMEOUT_MS = 20_000;

/** The retry budget, from the measured recovery window.
 *
 *  A minute is enough for a per-minute quota to refill and a busy provider to
 *  recover. Past that, retrying is a way of holding the learner on a spinner. */
export const DEFAULT_RETRY_DELAYS_MS = [0, 2_000, 5_000];

/**
 * Classifies a failed response.
 *
 * Split out from the fetch so the mapping can be tested against the exact bodies
 * the provider returns, rather than inferred from a status code. The two are not
 * the same: a 403 is a missing key in one body and a permission problem in
 * another, and the learner needs a different sentence for each.
 */
export function classifyResponse(status: number, body: string): CoachFailure {
  const text = (() => {
    try {
      const parsed: unknown = JSON.parse(body);
      if (typeof parsed === 'object' && parsed !== null) {
        const err = (parsed as { error?: { message?: string; status?: string } }).error;
        if (err && typeof err.message === 'string') return err.message;
        if (err && typeof err.status === 'string') return err.status;
      }
    } catch {
      // A non-JSON body from a proxy or a captive portal. The status is all we
      // have, and that is enough to classify it.
    }
    return body.slice(0, 200);
  })();

  if (status === 400) {
    return {
      kind: 'key-invalid',
      message: 'The provider did not accept that key. Check it and try again.',
      retryable: false,
    };
  }
  if (status === 401 || status === 403) {
    return {
      kind: 'no-key',
      message: 'The provider would not accept the request. The key may be missing or for a different service.',
      retryable: false,
    };
  }
  if (status === 429) {
    return {
      kind: 'out-of-quota',
      message: 'The provider is out of quota for now. It usually clears within a minute.',
      retryable: true,
    };
  }
  if (status === 503 || status === 502 || status === 504) {
    return {
      kind: 'provider-busy',
      message: 'The provider is busy. Trying again shortly.',
      retryable: true,
    };
  }
  if (status === 400 && text.includes('API_KEY')) {
    return { kind: 'key-invalid', message: 'The provider did not accept that key.', retryable: false };
  }
  return {
    kind: 'unreadable',
    message: 'The provider sent something this app could not read. Nothing was changed.',
    retryable: false,
  };
}

/** The body the provider is sent.
 *
 *  `thinkingBudget: 0` is not an optimisation, it is a correctness requirement.
 *  With thinking left on it consumed the entire output budget and the coach
 *  message arrived truncated mid-sentence — which looks exactly like the model
 *  failing to follow instructions, and cost a round of debugging during planning.
 */
export function requestBody(pack: FactPackText, model: string) {
  return {
    system_instruction: { parts: [{ text: PROMPT }] },
    contents: [{ role: 'user', parts: [{ text: pack.text }] }],
    generationConfig: {
      temperature: 0.2,
      maxOutputTokens: 2_000,
      thinkingConfig: { thinkingBudget: 0 },
    },
    _model: model,
  };
}

function url(model: string, key: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Asks the coach, once, and returns either a reply or a classified failure.
 *
 * Never throws. A call that fails is an ordinary event — a free-tier key runs
 * out — and an exception here would take down the panel the learner is looking
 * at. The Facts are returned on BOTH paths, deliberately: the panel shows them
 * when the call dies, and a learner told "you are out of quota" has learned
 * nothing about the piece they asked about.
 */
export async function askCoach(
  question: string,
  facts: FactPack,
  options: CoachOptions,
): Promise<CoachResult> {
  const model = options.model ?? DEFAULT_MODEL;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const delays = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const doFetch = options.fetchImpl ?? fetch;

  const pack = factPackFor(question, facts);

  let last: CoachFailure = {
    kind: 'unreadable',
    message: 'The provider could not be reached.',
    retryable: true,
  };

  for (let attempt = 0; attempt < delays.length; attempt++) {
    if (delays[attempt]! > 0) await sleep(delays[attempt]!);

    // A fresh controller per attempt: a timeout is per attempt, and reusing an
    // aborted one would make every retry fail instantly.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const body = requestBody(pack, model);
      const { _model: _ignored, ...payload } = body;
      const res = await doFetch(url(model, options.apiKey), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        last = classifyResponse(res.status, await res.text());
        if (!last.retryable) return { ok: false, failure: last, facts };
        continue;
      }

      const json: unknown = await res.json();
      const text = extractText(json);
      if (text === null) {
        last = {
          kind: 'unreadable',
          message: 'The provider sent something this app could not read. Nothing was changed.',
          retryable: false,
        };
        return { ok: false, failure: last, facts };
      }

      return {
        ok: true,
        text,
        findings: validateCoachMessage(text, facts),
        usage: extractUsage(json),
        finish: extractFinish(json),
        facts,
      };
    } catch (error) {
      const aborted = error instanceof DOMException && error.name === 'AbortError';
      last = aborted
        ? {
            kind: 'timed-out',
            // A timeout is a fact about the wait, and the facts are still right.
            message: 'The provider took too long to answer. The facts below are still correct.',
            retryable: true,
          }
        : {
            kind: 'network',
            message: 'The provider could not be reached.',
            retryable: true,
          };
    } finally {
      clearTimeout(timer);
    }
  }

  return { ok: false, failure: last, facts };
}

/** The text of the first candidate, or null if there is none.
 *
 *  A response with no text is not the same as an empty one: the first is a
 *  shape this app did not expect, and treating it as "the model said nothing"
 *  would show the learner a blank coach rather than an honest error. */
function extractText(json: unknown): string | null {
  if (typeof json !== 'object' || json === null) return null;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const first = candidates[0] as { content?: { parts?: unknown } };
  const parts = first.content?.parts;
  if (!Array.isArray(parts)) return null;
  const text = parts
    .map((p) => (typeof p === 'object' && p !== null ? (p as { text?: unknown }).text : null))
    .filter((t): t is string => typeof t === 'string')
    .join('')
    .trim();
  return text.length > 0 ? text : null;
}

function extractUsage(json: unknown): CoachReply['usage'] {
  if (typeof json !== 'object' || json === null) return undefined;
  const u = (json as { usageMetadata?: Record<string, unknown> }).usageMetadata;
  if (typeof u !== 'object' || u === null) return undefined;
  const num = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0);
  return {
    promptTokens: num('promptTokenCount'),
    candidateTokens: num('candidatesTokenCount'),
    totalTokens: num('totalTokenCount'),
  };
}

function extractFinish(json: unknown): string | undefined {
  if (typeof json !== 'object' || json === null) return undefined;
  const candidates = (json as { candidates?: unknown }).candidates;
  if (!Array.isArray(candidates) || candidates.length === 0) return undefined;
  const reason = (candidates[0] as { finishReason?: unknown }).finishReason;
  return typeof reason === 'string' ? reason : undefined;
}

/** The Fact pack, tiered by what was asked.
 *
 *  The base is always sent, because the model cannot be trusted to know which
 *  facts it needs. What the question *adds* is the topic: a question about a
 *  hanging piece gets that section and not the endgame one.
 *
 *  This is the tiering the map settled on, and its failure mode is the whole
 *  reason for it: a misrouted question produces LESS evidence, and therefore
 *  less speech. Silence is the safe direction. A pack that always sent
 *  everything would be simpler and would put the decision about what matters
 *  back into the model's hands. */
export function factPackFor(question: string, facts: FactPack): FactPackText {
  const q = question.toLowerCase();
  const sections: string[] = [];
  const wants = (words: string[]) => words.some((w) => q.includes(w));

  if (wants(['lose', 'lost', 'hang', 'attack', 'safe', 'defend', 'piece'])) {
    sections.push(
      `Your pieces, and whether the opponent currently attacks them:\n${describePieces(facts, 'attackedByOpponent')}`,
    );
  }
  if (wants(['develop', 'undeveloped', 'centre', 'center', 'piece', 'open'])) {
    sections.push(
      `Pieces still on their starting squares (undeveloped):\n${
        facts.undeveloped.length > 0 ? facts.undeveloped.join(', ') : 'none'
      }`,
    );
  }
  if (wants(['tactic', 'combination', 'mate', 'capture', 'take', 'attack', 'fork', 'pin'])) {
    sections.push(
      [
        `Checkmates available to you: ${facts.matesAvailable.length > 0 ? facts.matesAvailable.join(', ') : 'NONE'}`,
        `Checks available to you: ${facts.checksAvailable.length > 0 ? facts.checksAvailable.join(', ') : 'NONE'}`,
        `Captures available to you: ${facts.capturesAvailable.length > 0 ? facts.capturesAvailable.join(', ') : 'NONE'}`,
      ].join('\n'),
    );
  }
  if (wants(['king', 'safe', 'castle', 'check'])) {
    sections.push(
      [
        `Your king has castled: ${facts.kingCastled}`,
        `Castling rights remaining: ${facts.castlingRights}`,
        `You are in check: ${facts.inCheck}`,
      ].join('\n'),
    );
  }
  if (wants(['material', 'worth', 'pieces', 'advantage', 'even', 'lost', 'up'])) {
    sections.push(
      `Material in pawns: White ${facts.material.w} - Black ${facts.material.b} (pawn=1,knight=3,bishop=3,rook=5,queen=9)`,
    );
  }

  return {
    text: basePack(facts) + (sections.length > 0 ? `\n\nMore about what was asked:\n${sections.join('\n\n')}` : ''),
    sections: sections.length,
  };
}

function describePieces(facts: FactPack, flag: 'attackedByOpponent' | 'defendedByYou'): string {
  if (facts.learnerPieces.length === 0) return '  none';
  return facts.learnerPieces
    .map((p) => `  ${p.square} (${p.piece}): ${p[flag]}`)
    .join('\n');
}

/** The part of the pack that is always sent.
 *
 *  `learnerPieces` is not sent in full. It is the per-piece working shape, and
 *  the sections above already carry the columns that are consulted — sending it
 *  as well would put the same facts in the prompt twice in two different shapes,
 *  which is how a model ends up quoting the one that is easier to read. */
function basePack(facts: FactPack): string {
  return [
    'FACT PACK',
    `Position (FEN): ${facts.fen}`,
    `Side to move: ${facts.sideToMove === facts.learnerSide ? 'YOU' : 'the opponent'}`,
    `Your pieces: ${
      Object.entries(facts.pieceAt)
        .filter(([, code]) => code[0] === facts.learnerSide)
        .map(([sq, code]) => `${sq}=${code[1]}`)
        .join('  ')
    }`,
    `Material: White ${facts.material.w} - Black ${facts.material.b} (pawn=1,knight=3,bishop=3,rook=5,queen=9)`,
    `Your legal moves: ${facts.legalMoveCount}`,
    `You are in check: ${facts.inCheck}`,
    `Your pieces that are attacked and undefended: ${
      facts.hanging.length > 0 ? facts.hanging.join(', ') : 'NONE'
    }`,
  ].join('\n');
}

/** The Facts for a position, for a caller that has a FEN rather than a pack. */
export function factsFor(fen: string): FactPack {
  return boardFacts(fen);
}
