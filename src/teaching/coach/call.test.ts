import { describe, expect, it, vi } from 'vitest';
import { askCoach, classifyResponse, DEFAULT_MODEL, factPackFor } from './call';
import { isShowable, validateCoachMessage } from './validate';
import { boardFacts } from '../detectors';
import { PROMPT } from './prompt';

const FEN = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9';
const FACTS = boardFacts(FEN);

/** A fetch that returns one response, recorded. */
const reply = (text: string, extra: Record<string, unknown> = {}) =>
  vi.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1250, candidatesTokenCount: 40, totalTokenCount: 1290 },
        ...extra,
      }),
      { status: 200 },
    ),
  );

const fails = (status: number, body: unknown) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status }));

/** The body of the nth captured fetch call, typed. */
const sentBody = (f: { mock: { calls: unknown[][] } }, n = 0): unknown =>
  JSON.parse(String((f.mock.calls[n] as unknown as [string, { body: string }])[1].body));

const ask = (fetchImpl: ReturnType<typeof reply>, question = 'why did I lose that piece?') =>
  askCoach(question, FACTS, {
    apiKey: 'test-key',
    fetchImpl: fetchImpl as unknown as typeof fetch,
    retryDelaysMs: [0, 0, 0],
    timeoutMs: 50,
  });

describe('classifyResponse: four classes, measured bodies', () => {
  it('400 is a bad key and is never retried', () => {
    const f = classifyResponse(400, JSON.stringify({ error: { message: 'API key not valid.', status: 'INVALID_ARGUMENT' } }));
    expect(f.kind).toBe('key-invalid');
    expect(f.retryable).toBe(false);
  });

  it('403 is a missing key and is never retried', () => {
    const f = classifyResponse(403, JSON.stringify({ error: { message: 'Method doesn\'t allow unregistered callers', status: 'PERMISSION_DENIED' } }));
    expect(f.kind).toBe('no-key');
    expect(f.retryable).toBe(false);
  });

  it('429 is out of quota and IS retried', () => {
    // The one that matters. Eight calls during planning gave 429, 200, 429 —
    // quota recovers inside a minute, so it must not end the session.
    const f = classifyResponse(429, JSON.stringify({ error: { message: 'Quota exceeded' } }));
    expect(f.kind).toBe('out-of-quota');
    expect(f.retryable).toBe(true);
  });

  it('503 is a busy provider and IS retried', () => {
    expect(classifyResponse(503, '').retryable).toBe(true);
  });

  it('does not throw on a body that is not JSON', () => {
    // A proxy or a captive portal. The status is all there is, and that is
    // enough to classify it.
    expect(() => classifyResponse(418, '<html>tea</html>')).not.toThrow();
    expect(classifyResponse(418, '<html>tea</html>').kind).toBe('unreadable');
  });
});

describe('askCoach: the happy path', () => {
  it('returns the text and the facts it was given', async () => {
    const r = await ask(reply('Your knight on d3 is attacked and nothing defends it.'));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.text).toContain('d3');
    // The facts travel back on success so the panel can show them beside the
    // message without a second computation.
    expect(r.facts.fen).toBe(FEN);
    expect(r.usage?.totalTokens).toBe(1290);
  });

  it('sends the system prompt and the fact pack, and nothing that looks like a board image', async () => {
    const f = reply('ok');
    await askCoach('why?', FACTS, {
      apiKey: 'k',
      fetchImpl: f as unknown as typeof fetch,
      retryDelaysMs: [0],
    });
    const body = sentBody(f) as {
      system_instruction: { parts: Array<{ text: string }> };
      contents: Array<{ parts: Array<{ text: string }> }>;
    };
    expect(body.system_instruction.parts[0]!.text).toBe(PROMPT);
    expect(body.contents[0]!.parts[0]!.text).toContain('FACT PACK');
    expect(body.contents[0]!.parts[0]!.text).toContain(FEN);
  });

  it('pins the thinking budget to zero', async () => {
    // Not an optimisation. With thinking left on it ate the whole output budget
    // and the message arrived truncated mid-sentence, which looks exactly like
    // the model ignoring its instructions and cost a round of debugging.
    const f = reply('ok');
    await askCoach('why?', FACTS, {
      apiKey: 'k',
      fetchImpl: f as unknown as typeof fetch,
      retryDelaysMs: [0],
    });
    const body = sentBody(f) as { generationConfig: { thinkingConfig: { thinkingBudget: number } } };
    expect(body.generationConfig.thinkingConfig.thinkingBudget).toBe(0);
  });

  it('uses the model the probe measured against by default', async () => {
    const f = reply('ok');
    await askCoach('why?', FACTS, { apiKey: 'k', fetchImpl: f as unknown as typeof fetch, retryDelaysMs: [0] });
    expect(String((f.mock.calls[0] as unknown as [string])[0])).toContain(DEFAULT_MODEL);
  });
});

describe('askCoach: failures never throw and never lose the facts', () => {
  it('returns the facts on a fatal failure', async () => {
    // The panel shows them when the call dies. A learner told "you are out of
    // quota" has learned nothing about the piece they asked about.
    const r = await ask(fails(400, { error: { message: 'API key not valid.' } }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('key-invalid');
    expect(r.facts.fen).toBe(FEN);
    // The facts are returned whole, and this position happens to have nothing
    // hanging — the point is that the PACK is there, not that it is alarming.
    expect(r.facts.learnerSide).toBe('w');
    expect(typeof r.facts.inCheck).toBe('boolean');
  });

  it('does not retry a fatal failure', async () => {
    const f = fails(400, { error: { message: 'API key not valid.' } });
    await ask(f);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('retries a transient one and succeeds', async () => {
    // 429 is not session-ending, so a learner is not locked out over a hiccup.
    let n = 0;
    const f = vi.fn(async () => {
      n++;
      return n < 3
        ? new Response(JSON.stringify({ error: { message: 'Quota exceeded' } }), { status: 429 })
        : new Response(
            JSON.stringify({ candidates: [{ content: { parts: [{ text: 'nothing here' }] } }] }),
            { status: 200 },
          );
    });
    const r = await ask(f as unknown as ReturnType<typeof reply>);
    expect(r.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('gives up after the retry budget and says so', async () => {
    const f = fails(429, { error: { message: 'Quota exceeded' } });
    const r = await ask(f);
    expect(f).toHaveBeenCalledTimes(3);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.retryable).toBe(true);
  });

  it('reports a timeout as a timeout, and keeps the facts', async () => {
    const slow = vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        }),
    );
    const r = await askCoach('why?', FACTS, {
      apiKey: 'k',
      fetchImpl: slow as unknown as typeof fetch,
      retryDelaysMs: [0],
      timeoutMs: 5,
    });
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('timed-out');
    // A timeout is a fact about the wait, and the facts are still right.
    expect(r.facts.fen).toBe(FEN);
  });

  it('reports a body it cannot read, rather than showing an empty coach', async () => {
    const r = await ask(fails(200, { nothing: 'expected' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.failure.kind).toBe('unreadable');
  });

  it('treats an empty text as unreadable, not as silence', async () => {
    // No text is a shape the app did not expect. Treating it as "the model said
    // nothing" would show a blank coach rather than an honest error.
    const r = await ask(reply('   '));
    expect(r.ok).toBe(false);
  });
});

describe('factPackFor: tiered by the question', () => {
  it('always sends the base, including the negative facts', () => {
    const pack = factPackFor('anything at all', FACTS);
    expect(pack.text).toContain('FACT PACK');
    expect(pack.text).toContain('attacked and undefended');
    // A negative fact has to be sayable or a model asked about a threat will
    // invent one to explain the question.
    expect(pack.text).toMatch(/NONE|hang/);
  });

  it('adds the material section for a question about material', () => {
    expect(factPackFor('am I up on material?', FACTS).text).toContain('Material in pawns');
  });

  it('adds the tactic section for a question about a tactic', () => {
    const pack = factPackFor('is there a tactic here?', FACTS);
    expect(pack.text).toContain('Checkmates available to you');
    expect(pack.text).toContain('NONE');
  });

  it('adds nothing extra for a question about nothing in particular', () => {
    // The failure mode of tiering is silence, which is the safe direction — but
    // only if the base is complete on its own.
    const pack = factPackFor('hello', FACTS);
    expect(pack.sections).toBe(0);
    expect(pack.text).toContain('Your legal moves');
  });

  it('never sends the per-piece working shape as well as the sections', () => {
    // Sending it twice, in two shapes, is how a model ends up quoting the one
    // that is easier to read.
    const pack = factPackFor('is my knight hanging?', FACTS);
    expect(pack.text).not.toContain('defendedByYou');
  });
});

describe('validateCoachMessage: the gate', () => {
  // Verified against the position: the knight is on c3, defended, not attacked.
  // An earlier version of this sentence said d3, which holds a pawn — and the
  // validator caught it, which is the first evidence the gate works.
  const clean = 'Your knight on c3 is defended, so it is safe for now.';

  it('passes a true, plain sentence', () => {
    expect(validateCoachMessage(clean, FACTS)).toEqual([]);
    expect(isShowable(validateCoachMessage(clean, FACTS))).toBe(true);
  });

  it('catches a piece claimed on an empty square', () => {
    // h5 is empty in this position — verified.
    const f = validateCoachMessage('Your rook is on h5 and should stay there.', FACTS);
    expect(f.some((x) => x.kind === 'empty-square')).toBe(true);
    expect(isShowable(f)).toBe(false);
  });

  it('catches a piece claimed on a square holding a different piece', () => {
    // d3 holds a PAWN, so calling it a knight is a different defect from an
    // empty square, and the learner needs to be told which one it is.
    const f = validateCoachMessage('Your knight on d3 should move.', FACTS);
    expect(f.some((x) => x.kind === 'wrong-piece')).toBe(true);
  });

  it('catches the perspective defect the probe found most', () => {
    // Told it was Black to move, models advised the White learner using "your".
    // f6 holds Black's knight — verified — so calling it "your" is the exact
    // defect the probe found models making most often.
    const f = validateCoachMessage('Your knight on f6 is attacked.', FACTS);
    expect(f.some((x) => x.kind === 'wrong-owner')).toBe(true);
    expect(isShowable(f)).toBe(false);
  });

  it('catches a move that is not legal here', () => {
    // A7 is not a real square, so the move pattern cannot match it either. The
    // castling case below is the one that proves this check is live, because
    // O-O is real SAN.
    const f = validateCoachMessage('You should play Rh7 here in this position.', FACTS);
    expect(f.some((x) => x.kind === 'illegal-move')).toBe(true);
    expect(isShowable(f)).toBe(false);
  });

  it('catches an impossible castle, which the from/to pattern cannot match', () => {
    // O-O is real SAN and a common thing for a model to say. A move check that
    // only understood e2e4-style tokens ignored every castling claim entirely.
    // It is illegal here because the king is already on g1 — verified.
    const f = validateCoachMessage('You should castle kingside now with O-O.', FACTS);
    expect(f.some((x) => x.kind === 'illegal-move')).toBe(true);
  });

  it('accepts a move that IS legal, so the check is not simply always-on', () => {
    // Without this, a validator that flagged everything would pass every test
    // above. Bxf7+ is legal here — verified.
    const f = validateCoachMessage('Your bishop on c4 can take on f7, giving check.', FACTS);
    expect(f.some((x) => x.kind === 'illegal-move')).toBe(false);
    expect(f.some((x) => x.kind === 'wrong-piece')).toBe(false);
  });

  it('catches a checkmate that does not exist', () => {
    const f = validateCoachMessage('You had checkmate with Qxf7#.', FACTS);
    expect(f.some((x) => x.kind === 'false-mate')).toBe(true);
    expect(isShowable(f)).toBe(false);
  });

  it('flags one plan presented as the only option, without withholding it', () => {
    // The move named here must be LEGAL, or the message is withheld for a
    // different reason and the advisory severity is not tested at all. An
    // earlier version used O-O, which is genuinely illegal here because the king
    // is already on g1 — so the test passed for the wrong reason until the
    // blocking finding underneath it was noticed.
    const f = validateCoachMessage('The only good move is to develop a piece with Bb5.', FACTS);
    expect(f.some((x) => x.kind === 'sole-plan')).toBe(true);
    expect(f.some((x) => x.severity === 'blocking')).toBe(false);
    // Advisory, not blocking: a factually sound message that is merely
    // overconfident is still more use than nothing.
    expect(isShowable(f)).toBe(true);
  });

  it('flags jargon used without a gloss', () => {
    const f = validateCoachMessage('That is a classic pin.', FACTS);
    expect(f.some((x) => x.kind === 'jargon')).toBe(true);
  });

  it('accepts jargon that IS glossed', () => {
    const f = validateCoachMessage(
      'That is a pin, which means a knight is stuck defending a piece it cannot move.',
      FACTS,
    );
    expect(f.some((x) => x.kind === 'jargon')).toBe(false);
  });

  it('flags a message that ignored the length rule', () => {
    const long = 'One. Two. Three. Four. Five. Six. Seven. Eight.';
    expect(validateCoachMessage(long, FACTS).some((x) => x.kind === 'too-long')).toBe(true);
  });

  it('does not throw on an empty message', () => {
    expect(validateCoachMessage('', FACTS).length).toBeGreaterThan(0);
    expect(validateCoachMessage('   ', FACTS).length).toBeGreaterThan(0);
  });

  it('catches several defects in one message, not just the first', () => {
    const f = validateCoachMessage(
      'Your rook is on a5 and your queen is on z9, and the only move is Qxh7#.',
      FACTS,
    );
    expect(f.length).toBeGreaterThan(1);
    expect(isShowable(f)).toBe(false);
  });
});
