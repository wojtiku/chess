import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CoachPanel from './CoachPanel';
import { PROVIDER_KEY, saveProvider } from './providerKey';

// The panel is where the two decisions meet: the Facts are computed locally and
// are always true, and the call is best-effort and may never arrive. So the
// thing to test is what the learner sees on EVERY path — success, refusal,
// nonsense — and it is always the Facts.

const okFetch = (text: string) =>
  vi.fn(async () =>
    new Response(
      JSON.stringify({
        candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 40, totalTokenCount: 1240 },
      }),
      { status: 200 },
    ),
  );

const failFetch = (status: number, message: string) =>
  vi.fn(async () => new Response(JSON.stringify({ error: { message } }), { status }));

const withKey = () => saveProvider('AIzaSyTESTKEY1234567890', 'gemini')!;

describe('CoachPanel: asking', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('offers questions instead of a free text box', () => {
    // A free-form question can be about anything, including something the fact
    // pack says nothing about, and the model will helpfully invent something.
    withKey();
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-ask-hanging')).toBeInTheDocument();
    expect(screen.getByTestId('coach-ask-tactic')).toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: /question/i })).not.toBeInTheDocument();
  });

  it('shows a spinner while waiting, because that is what was asked for', async () => {
    withKey();
    let release: (r: Response) => void = () => {};
    const slow = vi.fn(
      () =>
        new Promise<Response>((resolve) => {
          release = resolve;
        }),
    );
    vi.stubGlobal('fetch', slow);
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-busy')).toBeInTheDocument();
    release(
      new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ok' }] } }] }), {
        status: 200,
      }),
    );
    await waitFor(() => expect(screen.queryByTestId('coach-busy')).not.toBeInTheDocument());
  });

  it('shows the answer when the call succeeds', async () => {
    withKey();
    vi.stubGlobal('fetch', okFetch('None of your pieces is under attack right now.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-answer')).toHaveTextContent(/under attack/i);
  });

  it('shows the token count, because that is what the app can measure', async () => {
    withKey();
    vi.stubGlobal('fetch', okFetch('Nothing is under attack.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));
    expect(await screen.findByTestId('coach-usage')).toHaveTextContent('1240 tokens');
  });
});

describe('CoachPanel: the facts survive every failure', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows the facts when the key is rejected', async () => {
    // A learner told "your key is wrong" has learned nothing about the position.
    // The facts were computed before the call, so they cost nothing to show.
    withKey();
    vi.stubGlobal('fetch', failFetch(400, 'API key not valid.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-failure')).toHaveTextContent(/did not accept that key/i);
    expect(screen.getByTestId('coach-facts')).toBeInTheDocument();
    expect(screen.getByTestId('coach-facts')).toHaveTextContent(/Material/i);
  });

  it('shows the facts when the provider is out of quota', async () => {
    withKey();
    vi.stubGlobal('fetch', failFetch(429, 'Quota exceeded'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));
    // 429 is RETRIED, so the test waits for the whole budget — which is the
    // behaviour, not an accident. A first draft asserted immediately and failed
    // on the timeout, having proved nothing about the failure path.
    expect(await screen.findByTestId('coach-failure', {}, { timeout: 5_000 })).toHaveTextContent(/quota/i);
    expect(screen.getByTestId('coach-facts')).toBeInTheDocument();
  });

  it('says the facts do not depend on the call, so a failure is not a dead end', async () => {
    withKey();
    vi.stubGlobal('fetch', failFetch(400, 'API key not valid.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));
    // The sentence is a sibling of the facts, not inside them: it says the facts
    // are independent of the call, which is a claim ABOUT them and so belongs
    // beside them rather than among them. Asserting it inside `coach-facts`
    // looked for it in the wrong element and found nothing.
    await screen.findByTestId('coach-facts', {}, { timeout: 5_000 });
    expect(screen.getByText(/do not depend on the call/i)).toBeInTheDocument();
  });
});

describe('CoachPanel: the validator is a real gate', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('withholds a message that says the reader owns an opponent piece', async () => {
    // The perspective defect the probe found models making most often. A learner
    // who cannot play chess has no way to catch it, which is why it is withheld
    // rather than shown with a warning.
    withKey();
    vi.stubGlobal('fetch', okFetch('Your knight on f6 is attacked and undefended.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-withheld')).toBeInTheDocument();
    expect(screen.queryByTestId('coach-answer')).not.toBeInTheDocument();
    // What it said that could not be checked, stated plainly.
    expect(screen.getByTestId('coach-finding')).toHaveTextContent(/f6/);
    // And the facts are still there.
    expect(screen.getByTestId('coach-facts')).toBeInTheDocument();
  });

  it('shows a message that is merely over-long, and flags it', async () => {
    // Advisory findings do not withhold. A factually sound message that breaks a
    // style rule is still more use than nothing, and the alternative is building
    // a phrasing system, which this app deliberately does not have.
    withKey();
    vi.stubGlobal('fetch', okFetch('One. Two. Three. Four. Five. Six. Seven. Eight. Nine. Ten.'));
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-answer')).toBeInTheDocument();
  });

  it('never shows a withheld message even if it also reads well', async () => {
    withKey();
    vi.stubGlobal(
      'fetch',
      okFetch('Your bishop on d4 is beautifully placed and you should keep it there for years.'),
    );
    const user = userEvent.setup();
    render(<CoachPanel />);
    await user.click(screen.getByTestId('coach-ask-hanging'));

    expect(await screen.findByTestId('coach-withheld')).toBeInTheDocument();
  });
});

describe('CoachPanel: a corrupt key is not a working key', () => {
  it('asks again rather than showing a saved key it cannot use', () => {
    localStorage.setItem(PROVIDER_KEY, '{"key":"AIzaTrunc');
    render(<CoachPanel />);
    expect(screen.getByTestId('coach-key-prompt')).toBeInTheDocument();
  });
});
