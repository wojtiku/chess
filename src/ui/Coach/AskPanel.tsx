import { useCallback, useState } from 'react';
import { askCoach, factsFor, type CoachResult } from '../../teaching/coach/call';
import { isShowable } from '../../teaching/coach/validate';
import { FACT_QUESTIONS, type CoachQuestion } from './questions';
import type { StoredProvider } from './providerKey';
import './CoachPanel.css';

/** A standalone demo fallback. The app always supplies the displayed board's FEN. */
const DEMO_FEN = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9';

/**
 * Ask a question, get an answer or the Facts.
 *
 * The two outcomes are the whole design:
 *
 *   - The call succeeds, the message passes the validator → the answer.
 *   - Anything else → **the Facts, shown anyway.** A learner who asked "is any
 *     of my pieces in danger?" and received "you are out of quota" has learned
 *     nothing about the piece, and the Facts were already computed before the
 *     call was made. Withholding them throws away work that is finished.
 *
 * The spinner is deliberately plain. The Facts would be better, and the
 * developer has said they will revisit the wait — so this is a spinner, not a
 * design that will be defended.
 */
export function AskPanel({
  provider,
  fen = DEMO_FEN,
}: {
  provider: StoredProvider;
  fen?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CoachResult | null>(null);
  const [asked, setAsked] = useState<string | null>(null);

  const ask = useCallback(
    async (question: CoachQuestion) => {
      setBusy(true);
      setAsked(question.text);
      setResult(null);
      const facts = factsFor(fen);
      // The panel is the one place that can shorten the retry budget: the
      // lesson on failure is already planned for the *next* question, and a
      // learner watching a button they just pressed for eight seconds learns
      // nothing. 20s per attempt stays — it is the timeout that was measured —
      // but the wait BETWEEN attempts is what is cut here.
      const r = await askCoach(question.text, facts, {
        apiKey: provider.key,
        provider: provider.provider,
        retryDelaysMs: [0, 1_500],
      });
      setResult(r);
      setBusy(false);
    },
    [fen, provider],
  );

  return (
    <div className="coach-ask">
      <div className="coach-ask-buttons" role="group" aria-label="Ask the coach">
        {FACT_QUESTIONS.map((q) => (
          <button
            key={q.id}
            type="button"
            data-testid={`coach-ask-${q.id}`}
            onClick={() => void ask(q)}
            disabled={busy}
          >
            {q.label}
          </button>
        ))}
      </div>

      {busy && (
        <p className="coach-status" data-testid="coach-busy" role="status">
          <span className="coach-spinner" aria-hidden="true" />
          Thinking…
        </p>
      )}

      {!busy && result !== null && <Answer result={result} />}
    </div>
  );
}

function Answer({ result }: { result: CoachResult }) {
  // The Facts are shown on EVERY path, and before the message when there is
  // one. They are the part of the answer the app is sure of.
  const facts = [
    `You are in check: ${result.facts.inCheck ? 'yes' : 'no'}`,
    `Your pieces attacked and undefended: ${
      result.facts.hanging.length > 0 ? result.facts.hanging.join(', ') : 'none'
    }`,
    `Checkmate available: ${
      result.facts.matesAvailable.length > 0 ? result.facts.matesAvailable.join(', ') : 'no'
    }`,
    `Material: White ${result.facts.material.w} - Black ${result.facts.material.b}`,
  ];

  if (!result.ok) {
    return (
      <div className="coach-answer" data-variant="failed">
        <p className="coach-answer-failure" data-testid="coach-failure" role="alert">
          {result.failure.message}
        </p>
        <Facts lines={facts} />
        <p className="coach-answer-footnote">
          The facts above were computed by this app and do not depend on the call.
        </p>
      </div>
    );
  }

  const showable = isShowable(result.findings);
  const blocked = result.findings.filter((f) => f.severity === 'blocking');

  return (
    <div className="coach-answer" data-variant={showable ? 'ok' : 'withheld'}>
      {showable ? (
        <p className="coach-answer-text" data-testid="coach-answer">
          {result.text}
        </p>
      ) : (
        <div data-testid="coach-withheld">
          <p className="coach-answer-failure" role="alert">
            The coach said something this app cannot check, so it has not been shown.
          </p>
          <ul className="coach-findings">
            {blocked.map((f, i) => (
              <li key={i} data-testid="coach-finding">
                {f.detail}
              </li>
            ))}
          </ul>
        </div>
      )}
      <Facts lines={facts} />
      {result.usage && (
        <p className="coach-usage" data-testid="coach-usage">
          {result.usage.totalTokens} tokens
        </p>
      )}
    </div>
  );
}

function Facts({ lines }: { lines: string[] }) {
  return (
    <div className="coach-facts" data-testid="coach-facts">
      <h4>What this app knows</h4>
      <ul>
        {lines.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </div>
  );
}
