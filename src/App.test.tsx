// The wiring test. Everything here drives the real `App` against a fake UCI
// worker, because the thing under test is the wiring itself: which effect asks
// the engine a question, when it is allowed to ask, what it does with the answer,
// and what the app is still able to do when the engine cannot answer at all.
//
// Unit tests elsewhere pin each piece. None of them can see whether the pieces are
// connected to each other, and this file is where the three that matter meet: the
// reducer (a move is legal, a game ends, undo rewinds), the engine client (a
// search answers with one move), and the panels (the move list is what the learner
// sees happen).
//
// The fake worker is a real protocol peer, not a stub that returns a constant: it
// keeps the position it was given and answers with a move that is **legal in it**,
// because a move the reducer refuses would leave the test waiting for a reply that
// can never arrive — and that failure looks exactly like a wiring bug.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StrictMode } from 'react';
import App from './App';
import { useGame, type GameApi } from './game/useGame';
import { Chess } from './chess/rules';

const START_FEN = new Chess().fen();
const POSITION = 'position fen ';
const SKILL_OPTION = 'setoption name Skill Level value ';

/**
 * A Stockfish that speaks just enough UCI to satisfy `EngineClient`, plus the
 * knobs a test needs: what it scores, how long it takes, and what it plays.
 */
class FakeWorker {
  /** Centipawns every search reports, **from the side to move in the searched
   * position**. A fixed number is what makes the eval bar's sign assertable: the
   * same +20 is White's advantage on a White-to-move position and Black's on a
   * Black-to-move one. */
  static scoreCp = 20;
  /** How long a search takes before it answers. */
  static searchDelayMs = 0;
  /** How long a search for *this* position takes. FEN-keyed rather than global,
   * because "the answer is still coming" is only interesting for one position at
   * a time: a global delay also slows the searches a test needs to have finished. */
  static slowFen: string | null = null;
  /** How long a search for `slowFen` takes. Comfortably longer than the gap the
   *  staleness test leaves, so "the answer is still out" is a fact rather than a
   *  hope. */
  static slowMs = 600;
  /** Centipawns to report for *this* position, overriding `scoreCp`. Two
   *  positions need different scores for a stale answer to be visible at all: the
   *  bar converts whatever it is given with the turn of the position on screen, so
   *  one constant score shows the same number whichever position produced it. */
  static scores: Record<string, number> = {};
  /**
   * The move to play in a given position, keyed by FEN.
   *
   * Keyed rather than queued on purpose. The mount evaluation searches the start
   * position before the learner has touched anything, so a queue of scripted
   * replies would spend its first entry on a search no test is watching, and a
   * mate scripted in a test would be played in the wrong position — where the
   * reducer refuses it, silently, and the test waits for a reply that can never
   * come.
   */
  static play: Record<string, string> = {};
  /** Every command the app has posted, oldest first. */
  static sent: string[] = [];
  /** How many searches the app has started. */
  static searches = 0;
  /** The most searches ever in flight at the same moment. The real 19-lite WASM
   *  engine *dies* if a second `go` is posted while one is running — measured, not
   *  assumed — so this is the invariant the wiring has to keep, and it is
   *  measurable here in a way a jsdom-free assertion never was. */
  static maxConcurrentSearches = 0;
  static inFlightSearches = 0;
  /** Every worker the app has constructed. */
  static instances: FakeWorker[] = [];

  private message: ((ev: { data: string }) => void) | null = null;
  private error: ((ev: unknown) => void) | null = null;
  /** What is registered, per event type, so a removal can be identity-checked:
   * the client unhooks its listeners when it drops a worker, and a terminated
   * worker's output must go nowhere. */
  private readonly registered = new Map<string, (ev: never) => void>();
  private alive = true;
  private fen = START_FEN;

  constructor(readonly url: string) {
    FakeWorker.instances.push(this);
  }

  addEventListener(type: string, handler: (ev: never) => void): void {
    // `EngineClient` narrows the payload itself, and `never` is the only
    // parameter type a listener can be stored under without asserting the
    // client's own signatures — which is not what this file is checking.
    this.registered.set(type, handler);
    if (type === 'message') this.message = (ev) => handler(ev as never);
    if (type === 'error') this.error = (ev) => handler(ev as never);
  }

  removeEventListener(type: string, handler: (ev: never) => void): void {
    if (this.registered.get(type) !== handler) return;
    this.registered.delete(type);
    if (type === 'message') this.message = null;
    if (type === 'error') this.error = null;
  }

  postMessage(line: string): void {
    if (!this.alive) throw new Error('worker terminated');
    FakeWorker.sent.push(line);
    if (line === 'uci') return this.say('uciok');
    if (line === 'isready') return this.say('readyok');
    if (line.startsWith(POSITION)) {
      this.fen = line.slice(POSITION.length);
      return;
    }
    if (line.startsWith('go movetime')) {
      FakeWorker.searches += 1;
      // Counted only while this worker is the live one: a timer left over from a
      // previous test's engine must not decrement the next test's tally, or the
      // assertion below reads whatever the leak left behind.
      if (this.alive) {
        FakeWorker.inFlightSearches += 1;
        FakeWorker.maxConcurrentSearches = Math.max(
          FakeWorker.maxConcurrentSearches,
          FakeWorker.inFlightSearches,
        );
      }
      this.answer();
    }
    // `ucinewgame`, `setoption`, `stop` and `quit` are recorded and unanswered.
  }

  terminate(): void {
    this.alive = false;
  }

  /** What `Worker.onerror` looks like to the client: a dead worker mid-life. */
  die(detail = 'WebAssembly module failed to compile'): void {
    queueMicrotask(() => this.error?.(new Error(detail)));
  }

  private answer(): void {
    const move = this.pickMove();
    const score = FakeWorker.scores[this.fen] ?? FakeWorker.scoreCp;
    setTimeout(() => {
      if (this.alive) FakeWorker.inFlightSearches -= 1;
      this.say(`info depth 12 multipv 1 score cp ${score} pv ${move}`);
      this.say(`bestmove ${move}`);
    }, this.fen === FakeWorker.slowFen ? FakeWorker.slowMs : FakeWorker.searchDelayMs);
  }

  private pickMove(): string {
    const scripted = FakeWorker.play[this.fen];
    if (scripted !== undefined) return scripted;
    // The first move chess.js generates for the searched position, as UCI. A
    // legal move is what makes "the opponent replied" mean something: the
    // reducer refuses anything else, silently. `verbose` because the plain list
    // is SAN, and `bestmove` is not.
    const first = new Chess(this.fen).moves({ verbose: true })[0];
    if (first === undefined) return '0000';
    return `${first.from}${first.to}${first.promotion ?? ''}`;
  }

  private say(line: string): void {
    queueMicrotask(() => {
      this.message?.({ data: line });
    });
  }
}

const latestWorker = (): FakeWorker | undefined => FakeWorker.instances.at(-1);

const skillOptions = (): string[] =>
  FakeWorker.sent.filter((line) => line.startsWith(SKILL_OPTION));

function resetEngine(): void {
  FakeWorker.scoreCp = 20;
  FakeWorker.searchDelayMs = 0;
  FakeWorker.slowFen = null;
  FakeWorker.slowMs = 600;
  FakeWorker.scores = {};
  FakeWorker.play = {};
  FakeWorker.sent = [];
  FakeWorker.searches = 0;
  FakeWorker.inFlightSearches = 0;
  FakeWorker.maxConcurrentSearches = 0;
  FakeWorker.instances = [];
}

/** The FEN reached by playing UCI moves from the start position. */
function after(...moves: string[]): string {
  const game = new Chess();
  for (const move of moves) {
    const applied = game.move({ from: move.slice(0, 2), to: move.slice(2, 4) });
    if (applied === null) throw new Error(`fixture move ${move} is not legal here`);
  }
  return game.fen();
}

/** A board square, by name. The label is `"e2, white pawn"`, hence the anchor. */
const square = (name: string): HTMLElement =>
  screen.getByRole('button', { name: new RegExp(`^${name},`) });

/** The SAN in the move list, oldest first. `[]` when no move has been played. */
function moves(): string[] {
  const list = screen.queryByRole('list', { name: 'Moves' });
  if (list === null) return [];
  return within(list).getAllByRole('button').map((button) => button.textContent ?? '');
}

/** One SAN in the move list — the same string a board square never carries, so
 * the two can be told apart by role. */
function moveButton(san: string): HTMLElement {
  const list = screen.getByRole('list', { name: 'Moves' });
  return within(list).getByRole('button', { name: san });
}

/** The eval bar's White-relative share, 0..100. Always White's, by definition. */
function evalShare(): string | null {
  return screen.getByTestId('eval-bar').getAttribute('data-white-share');
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

function storeGame(moves_: Array<{ from: string; to: string }>, resignedBy?: string): void {
  localStorage.setItem(
    'chess.game.v1',
    JSON.stringify(resignedBy === undefined ? { moves: moves_ } : { moves: moves_, resignedBy }),
  );
}

function storeSettings(settings: Record<string, unknown>): void {
  localStorage.setItem('chess.settings.v1', JSON.stringify(settings));
}

/** Click a piece and then its destination. */
async function play(user: ReturnType<typeof userEvent.setup>, from: string, to: string) {
  await user.click(square(from));
  await user.click(square(to));
}

beforeEach(() => {
  localStorage.clear();
  resetEngine();
  vi.stubGlobal('Worker', FakeWorker);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('App', () => {
  it('renders the board, the side panel and the engine badge', () => {
    render(<App />);

    expect(screen.getAllByRole('button', { name: /^[a-h][1-8],/ })).toHaveLength(64);
    expect(screen.getByRole('button', { name: 'New game' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resign' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Undo' })).toBeInTheDocument();
    expect(screen.getByText('No moves yet.')).toBeInTheDocument();
    expect(screen.getByTestId('eval-bar')).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Beginner' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeInTheDocument();
    // The first search is issued from the mount effect, so the engine is already
    // on its way to loading by the time `render` returns.
    expect(screen.getByText('Loading engine…')).toBeInTheDocument();
  });

  it('brings the engine up to ready', async () => {
    render(<App />);
    await waitFor(() => expect(screen.getByText('Engine ready')).toBeInTheDocument());
  });

  it('plays a move and the opponent replies', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);

    await play(user, 'e2', 'e4');

    // The learner's move is the first in the list. How many moves are there *by
    // now* is not asserted: the reply can be that quick, and a test that raced it
    // would be testing the scheduler's luck.
    expect(moves()[0]).toBe('e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
  });

  it('waits for the evaluation in flight, then has the engine to itself', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    // The opening evaluation is slow, and so is every search after it, which
    // leaves a clear window in between: the opening's answer has landed and the
    // engine has not answered the move yet. That window is where a stale write
    // would be visible.
    FakeWorker.slowFen = after();
    FakeWorker.slowMs = 700;
    FakeWorker.searchDelayMs = 400;
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    const before = FakeWorker.searches;
    // The positive control for the assertions below: that search really is running.
    expect(FakeWorker.inFlightSearches).toBe(1);

    await play(user, 'e2', 'e4');

    // Nothing is asked while that search runs. This is the assertion the real
    // engine forced: a second `go` posted into a running search kills the worker,
    // and the opponent's reply dies with it.
    expect(FakeWorker.searches).toBe(before);
    expect(FakeWorker.inFlightSearches).toBe(1);

    // The opening's answer lands in here, and the bar is level rather than wrong:
    // that score is White's, and the position on screen now has Black to move, so
    // showing it would point the bar the wrong way for as long as the reply takes.
    await act(async () => {
      await sleep(900);
    });
    expect(moves()).toEqual(['e4']);
    expect(evalShare()).toBe('50');

    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    // The reply, and then the evaluation of the position the reply created.
    expect(FakeWorker.searches).toBe(before + 2);
    expect(FakeWorker.maxConcurrentSearches).toBe(1);
    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });
  });

  it('waits out the minimum think time before answering', async () => {
    const user = userEvent.setup();
    // The engine answers instantly; the floor is what holds the reply back.
    storeSettings({ minThinkTimeMs: 1200 });
    render(<App />);

    await play(user, 'e2', 'e4');
    await act(async () => {
      await sleep(300);
    });
    expect(moves()).toEqual(['e4']);

    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
  });

  it('does not add a wait the setting did not ask for', async () => {
    const user = userEvent.setup();
    // The default floor is 500ms, so a reply inside 400ms is evidence that the
    // wait is the setting's floor rather than a constant.
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 400 });
  });

  it('never has two searches in flight at once', async () => {
    // The invariant the real engine taught us the hard way: a second `go` posted
    // while one is running kills the Stockfish 19-lite worker, and the opponent's
    // reply dies with it. Every search the app asks for is measured here, over a
    // game where the evaluation is deliberately slower than the learner's moves —
    // so the two always want the engine at once.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 60;
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    for (const [from, to] of [
      ['e2', 'e4'],
      ['d2', 'd4'],
      ['g1', 'f3'],
      ['f1', 'c4'],
    ] as const) {
      const before = moves().length;
      await play(user, from, to);
      // Both plies: the learner's move and the engine's answer to it.
      await waitFor(() => expect(moves()).toHaveLength(before + 2), { timeout: 5000 });
    }
    await waitFor(() => expect(moves()).toHaveLength(8), { timeout: 10_000 });

    expect(FakeWorker.maxConcurrentSearches).toBe(1);
  });

  it('undo takes back the pair and hands the turn back', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(moves()).toEqual([]);
    // The board is interactive again, which is what "your turn" means here.
    expect(square('e2')).toBeEnabled();
  });

  it('does not move for the engine in a game that has ended', async () => {
    const user = userEvent.setup();
    // A think time long enough that the engine is still holding its answer when
    // the learner resigns on the engine's turn — the one moment a resignation
    // judges the side to move, so the loser is Black and the winner is White.
    storeSettings({ minThinkTimeMs: 2000 });
    render(<App />);
    await play(user, 'e2', 'e4');
    expect(moves()).toEqual(['e4']);
    // Captured BEFORE the resignation, because the guard under test is the one
    // that stops the resignation itself from starting a search: a count read after
    // the click would already include the search the mutation adds.
    const searchesBeforeResigning = FakeWorker.searches;

    await user.click(screen.getByRole('button', { name: 'Resign' }));
    expect(screen.getByText('Resigned — White wins')).toBeInTheDocument();

    await act(async () => {
      await sleep(300);
    });
    // The engine is not asked again for a game nobody is playing, and the answer
    // it was already holding is not played either.
    expect(FakeWorker.searches).toBe(searchesBeforeResigning);
    expect(moves()).toEqual(['e4']);
  });

  it('does not show a review position’s evaluation over the live one', async () => {
    // The bar is the one place a stale number is a *wrong* number rather than an
    // absent one: the engine's score is for the side to move, so one position's
    // score shown against another position's turn points the wrong way. This walks
    // into exactly that — a slow search for a reviewed ply answering after the
    // learner has returned to the live position.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.slowFen = after('e2e4');
    // Black is a pawn down after 1.e4, so this position's score is Black's -900
    // while every other position reports +20 for the side to move. Shown against
    // the live position's turn that stale answer would read 10 rather than 51,
    // which is what makes "the bar moved" a fact about *which* answer is on
    // screen rather than about the arithmetic.
    FakeWorker.scores = { [after('e2e4')]: -900 };
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });

    // One ply back, where it is Black to move. The engine is asked about *this*
    // position, and that answer is deliberately slow. -900 for Black is +900 for
    // White, so it reads 91 here — and 10 if it were converted with the live
    // position's turn, which is the sign error this whole test is about.
    await user.click(moveButton('e4'));
    // Cleared rather than wrong: the bar never shows one position's score against
    // another position's turn, so it reads level while the answer is out.
    expect(evalShare()).toBe('50');
    // Straight back to the live position, whose evaluation is already known, so
    // nothing is in flight for the return trip and the answer for the reviewed ply
    // can be neither superseded nor shown.
    await user.click(screen.getByRole('button', { name: 'Last move' }));

    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });

    // The late answer for the reviewed ply arrives in here, long after the learner
    // walked away from that position.
    await act(async () => {
      await sleep(FakeWorker.slowMs + 200);
    });
    expect(evalShare()).toBe('51');
  });

  it('shows the pieces each side has taken', async () => {
    // `Captured` reads `move.captured` out of the move history, so a caller that
    // handed it a FEN-loaded position would report a correct material difference
    // next to two empty capture lists — a wrong answer with no error and nothing
    // on screen to say so. This is the assertion that keeps the replay-built
    // position on the wire.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.play = { [after('e2e4')]: 'd7d5' };
    render(<App />);

    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'd5']), { timeout: 5000 });
    await play(user, 'e4', 'd5');

    expect(screen.getByRole('img', { name: /^Captured by White: a pawn\./ })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /^Captured by Black: nothing\./ })).toBeInTheDocument();
  });

  it('resigning names the winner and stops the game', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Resign' }));

    expect(screen.getByText('Resigned — Black wins')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
    expect(square('e2')).toBeEnabled();
  });

  it('keeps a resignation made before the first move across a reload', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Resign' }));
    expect(screen.getByText('Resigned — Black wins')).toBeInTheDocument();

    // A move list cannot express a resignation, so it is stored beside it.
    expect(localStorage.getItem('chess.game.v1')).toContain('"resignedBy":"w"');
    first.unmount();

    // The engine must not be asked at all on reopen: it is a game already lost.
    FakeWorker.sent = [];
    FakeWorker.searches = 0;
    render(<App />);

    expect(screen.getByText('Resigned — Black wins')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Resign' })).toBeDisabled();
    // After a wait, so the engine has had every chance to boot and start work
    // before the claim is made. Read synchronously this would pass for the wrong
    // reason: the handshake has not finished yet, so nothing could have been
    // asked in any case.
    await act(async () => {
      await sleep(50);
    });
    expect(FakeWorker.searches).toBe(0);
  });

  it('restores a persisted game on reload', () => {
    storeGame([
      { from: 'd2', to: 'd4' },
      { from: 'd7', to: 'd5' },
    ]);
    render(<App />);

    expect(moves()).toEqual(['d4', 'd5']);
    expect(square('d2')).toBeEnabled();
  });

  it('answers for a restored game that is the opponent’s turn', async () => {
    // An odd ply count means the engine owes a move the instant the app opens.
    // The engine does not exist yet on the first render — the client is built in
    // an effect — so the reply has to wait for it rather than be skipped.
    storeGame([{ from: 'd2', to: 'd4' }]);
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);

    await waitFor(() => expect(moves()).toEqual(['d4', 'Nc6']), { timeout: 5000 });
  });

  it('starts fresh when storage is corrupt', () => {
    localStorage.setItem('chess.game.v1', 'not json at all');
    localStorage.setItem('chess.settings.v1', '[]');
    expect(() => render(<App />)).not.toThrow();
    expect(screen.getAllByRole('button', { name: /^[a-h][1-8],/ })).toHaveLength(64);
  });

  it('reads the eval bar from the side to move in the position on screen', async () => {
    // A +20cp engine score is White's advantage when White is to move and
    // Black's when Black is. `whiteShare` rounds 50 + 0.9 to 51 and 50 - 0.9 to
    // 49, so one number with the wrong sign is a two-point difference — and a
    // bar that always says 51 is the bug the required `sideToMove` prop exists to
    // prevent, so this is the assertion that would catch it.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);

    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    // Two plies on, it is White's move again: the same engine score, the same
    // side of the bar.
    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });

    // One ply back, where it is Black's move. The engine is asked about *this*
    // position — reviewing is read-only for moves, not for looking at a position.
    await user.click(moveButton('e4'));
    await waitFor(() => expect(evalShare()).toBe('49'), { timeout: 3000 });
  });

  it('changes difficulty, persists it, and tells the engine', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    await user.click(screen.getByRole('radio', { name: 'Beginner' }));

    expect(localStorage.getItem('chess.settings.v1')).toContain('"skillLevel":1');
    // The engine is told, so the strength applies to the next move it plays
    // rather than the one after.
    expect(skillOptions().at(-1)).toBe(`${SKILL_OPTION}1`);
  });

  it('applies a restored difficulty before the first search', async () => {
    storeSettings({ skillLevel: 1, minThinkTimeMs: 0 });
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    // The first move the learner makes has to be played at the strength they
    // chose, and `EngineClient`'s own default is 8, so a leading 8 here is the
    // bug this catches.
    expect(skillOptions().at(0)).toBe(`${SKILL_OPTION}1`);
  });

  it('flips the board without touching the game', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    const firstSquare = () =>
      screen.getAllByRole('button', { name: /^[a-h][1-8],/ })[0]?.getAttribute('data-square');

    // a8 from White's side, h1 from Black's: the top-left corner of the view.
    expect(firstSquare()).toBe('a8');
    await user.click(screen.getByRole('button', { name: 'Flip board' }));

    expect(firstSquare()).toBe('h1');
    expect(moves()).toEqual(['e4', 'Nc6']);
  });

  it('offers a hint, draws it, and does not play it', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.play = { [after()]: 'a2a3' };
    render(<App />);
    await waitFor(() => expect(screen.getByText('Engine ready')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: 'Hint' }));

    await waitFor(() => expect(screen.getByTestId('arrow-a2-a3')).toBeInTheDocument());
    // A hint is advice. The move list is the record of what was played.
    expect(moves()).toEqual([]);
  });

  it('plays the hint move when asked, and the opponent answers it', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.play = { [after()]: 'a2a3' };
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Hint' }));
    const playHint = await screen.findByRole('button', { name: 'Play hint move' });
    await user.click(playHint);

    await waitFor(() => expect(moves()).toHaveLength(2), { timeout: 5000 });
    expect(moves()[0]).toBe('a3');
  });

  it('offers a hint only on the learner’s turn', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    // A search that takes long enough to still be running when the assertion is
    // made, so "it is the engine's turn" is observed rather than raced.
    FakeWorker.searchDelayMs = 300;
    render(<App />);
    expect(screen.getByRole('button', { name: 'Hint' })).toBeEnabled();

    await play(user, 'e2', 'e4');

    // The engine owns the turn: a hint would be an answer to the wrong question.
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    expect(screen.getByRole('button', { name: 'Hint' })).toBeEnabled();
  });

  it('marks the hint request in flight and never leaves it stuck', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 300;
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Hint' }));

    expect(screen.getByRole('button', { name: 'Thinking…' })).toBeDisabled();
    // A second request is refused rather than queued behind the first, and the
    // button has to come back either way.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Hint' })).toBeEnabled(), {
      timeout: 3000,
    });
  });

  it('will not ask for a hint while reviewing', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'e4' }));

    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
  });

  it('review is read-only and does not re-trigger the engine', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    // Back to the position after 1.e4, where Black's e7e5 would be perfectly
    // legal if the board were live.
    await user.click(screen.getByRole('button', { name: 'e4' }));
    expect(moveButton('e4')).toHaveAttribute('aria-current', 'true');
    // The board is showing that position: Black's e7 pawn is back on e7.
    expect(square('e7')).toHaveAccessibleName('e7, black pawn');
    const searchesBefore = FakeWorker.searches;
    await play(user, 'e7', 'e5');

    expect(moves()).toEqual(['e4', 'Nc6']);
    expect(FakeWorker.searches).toBe(searchesBefore);
  });

  it('returns to the live position and plays on', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'e4' }));
    await user.click(screen.getByRole('button', { name: 'Last move' }));

    await play(user, 'd2', 'd4');
    // The third move is the learner's, so the board is accepting moves again.
    // Its exact position in the list is not asserted: the engine may already
    // have replied, which is the point.
    expect(moves()[2]).toBe('d4');
  });

  it('starts a new game and plays it', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'New game' }));

    // A new move is the first in the list, so the old game is gone rather than
    // appended to.
    await play(user, 'd2', 'd4');
    expect(moves()[0]).toBe('d4');
    expect(screen.queryByText(/Checkmate|Resigned/)).not.toBeInTheDocument();
  });

  it('reports a mate and takes no further move', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    // Fool's mate, with both replies pinned to the move the ending needs rather
    // than to whatever the first legal move happens to be.
    FakeWorker.play = { [after('f2f3')]: 'e7e5', [after('f2f3', 'e7e5', 'g2g4')]: 'd8h4' };
    render(<App />);

    await play(user, 'f2', 'f3');
    await waitFor(() => expect(moves()).toEqual(['f3', 'e5']), { timeout: 5000 });
    await play(user, 'g2', 'g4');
    await waitFor(() => expect(moves()).toEqual(['f3', 'e5', 'g4', 'Qh4#']), { timeout: 5000 });

    expect(screen.getByText('Checkmate — Black wins')).toBeInTheDocument();
    const searchesAfterMate = FakeWorker.searches;
    // A finished game is terminal: the engine is not asked for a reply in a
    // position with no legal move in it, and the board takes none.
    await act(async () => {
      await sleep(50);
    });
    expect(FakeWorker.searches).toBe(searchesAfterMate);
    expect(moves()).toHaveLength(4);
  });

  it('degrades to a local two-player game when the engine dies', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await waitFor(() => expect(screen.getByText('Engine ready')).toBeInTheDocument());

    await act(async () => {
      latestWorker()?.die('WebAssembly module failed to compile');
    });
    await waitFor(() => expect(screen.getByText('Engine unavailable')).toBeInTheDocument());
    // What broke, not just that something did.
    expect(screen.getByText('WebAssembly module failed to compile')).toBeInTheDocument();
    // Engine-dependent features go; the board does not.
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Beginner' })).toBeDisabled();

    await play(user, 'e2', 'e4');
    expect(moves()).toEqual(['e4']);
    // Black is a human now. Without that the board would sit on the engine's
    // turn forever with nothing able to move.
    await play(user, 'e7', 'e5');
    expect(moves()).toEqual(['e4', 'e5']);
    await play(user, 'g1', 'f3');
    expect(moves()).toEqual(['e4', 'e5', 'Nf3']);
  });

  it('reports an unavailable engine when workers cannot exist at all', async () => {
    vi.stubGlobal('Worker', undefined);
    const user = userEvent.setup();
    render(<App />);

    expect(screen.getByText('Engine unavailable')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hint' })).toBeDisabled();
    // Still a board, and still playable on both sides.
    await play(user, 'e2', 'e4');
    await play(user, 'e7', 'e5');

    expect(moves()).toEqual(['e4', 'e5']);
  });

  it('keeps a resignation made mid-game across a reload', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    const first = render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    await user.click(screen.getByRole('button', { name: 'Resign' }));
    expect(screen.getByText('Resigned — Black wins')).toBeInTheDocument();
    first.unmount();

    // The same path with a move list behind it: the moves and the resignation are
    // restored together, and the winner is still White's opponent even though the
    // learner resigned on their own turn rather than on move 0.
    render(<App />);

    expect(screen.getByText('Resigned — Black wins')).toBeInTheDocument();
    expect(moves()).toEqual(['e4', 'Nc6']);
  });
});

/**
 * The hook on its own, under StrictMode, for the things the rendered app cannot
 * show: an effect that runs twice, a continuation that outlives the position it
 * was started for, and a second caller arriving while the first is still working.
 */
describe('useGame', () => {
  /**
   * Mounts the hook in a real StrictMode tree.
   *
   * `renderHook`'s `wrapper` does NOT reproduce it: a probe showed the render is
   * double-invoked through the wrapper but its *effects* are not, so a test that
   * claims to cover a StrictMode mount through that route covers nothing. A plain
   * `render` under `StrictMode` runs mount → cleanup → mount, which is the
   * sequence `main.tsx` produces, and that is what this returns.
   */
  const mountStrict = (): (() => GameApi) => {
    const box: { api: GameApi | null } = { api: null };
    const Harness = () => {
      box.api = useGame();
      return null;
    };
    render(
      <StrictMode>
        <Harness />
      </StrictMode>,
    );
    return () => {
      if (box.api === null) throw new Error('the harness never rendered');
      return box.api;
    };
  };

  const mount = () => renderHook(() => useGame());

  it('keeps a working engine through a StrictMode double mount', async () => {
    const api = mountStrict();
    await waitFor(() => expect(api().engineStatus).not.toBe('idle'));
    await act(async () => {
      await api().requestHint();
    });

    // The discriminator. StrictMode mounts, cleans up and remounts, so the first
    // client is disposed and a second built; a client held in a render-body ref
    // would survive that cleanup and hand this call a terminal one, whose every
    // promise rejects with `disposed` and whose hint is therefore never set.
    expect(FakeWorker.instances.length).toBeGreaterThanOrEqual(1);
    expect(api().engineStatus).not.toBe('error');
    expect(api().hint).not.toBeNull();
  });

  it('plays the reply exactly once under a StrictMode double mount', async () => {
    storeSettings({ minThinkTimeMs: 0 });
    const api = mountStrict();
    // The opening evaluation is finished, so the engine is free and the count
    // below is the reply and nothing else.
    await waitFor(() => expect(api().analysis).not.toBeNull());
    const before = FakeWorker.searches;

    act(() => api().play({ from: 'e2', to: 'e4' }));

    // One search for the reply. Two would mean a second effect run started its
    // own, and the first run's answer was thrown away with the work it belonged to
    // — the reply then never lands.
    expect(FakeWorker.searches).toBe(before + 1);
    await waitFor(() => expect(api().snapshot.moves).toHaveLength(2), { timeout: 5000 });
  });

  it('answers a restored game that is the engine’s turn exactly once, under StrictMode', async () => {
    // The one shape where a mount-time effect has work to do: it only fires when
    // the app opens with the engine to move, which is a game restored from storage
    // at an odd ply count. A second search for the same position would supersede
    // the first — and the reply is the one search that must not be raced, because
    // the loser of that race delivers no move at all and the board waits forever.
    storeSettings({ minThinkTimeMs: 0 });
    storeGame([{ from: 'd2', to: 'd4' }]);
    // A search slow enough to still be in flight at the checkpoint below, so
    // "only one was asked" is observed rather than raced.
    FakeWorker.searchDelayMs = 200;
    const api = mountStrict();

    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    // Halfway through that search: still one. The engine owes a move here, so
    // nothing else may be asked for, and nothing may ask again for the same
    // position while the answer is on its way — the client walks its status
    // through `loading`, `ready` and `thinking` on the way, and each of those
    // re-runs the effect that asked.
    await act(async () => {
      await sleep(100);
    });
    expect(FakeWorker.searches).toBe(1);

    await waitFor(() => expect(api().snapshot.moves).toHaveLength(2), { timeout: 5000 });
    expect(api().snapshot.moves.map((m) => m.san)).toEqual(['d4', 'Nc6']);
    // The reply and the evaluation of the position it created. One more than that
    // is the same search asked for twice, which is what an unguarded re-run does.
    expect(FakeWorker.searches).toBe(2);
  });

  it('answers a move played before the engine has finished booting', async () => {
    // The engine takes long enough to load that a learner can open the app and
    // move before the handshake is done. Two searches issued inside that window
    // both wait for the same boot, and the one that asked first is handed a
    // promise that resolves last — so the evaluation would supersede the reply and
    // the opponent would never move.
    const { result } = mount();
    FakeWorker.searchDelayMs = 50;
    await waitFor(() => expect(result.current.engineStatus).not.toBe('idle'));

    act(() => result.current.play({ from: 'e2', to: 'e4' }));

    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });
  });

  it('asks again for a position it has already answered once', async () => {
    // The reply is deduped per game state, not per position. Undo and play the
    // same move again reaches a position the engine has already answered, and a
    // position-keyed guard would refuse to ask — leaving the board on the
    // opponent's turn with nothing able to move.
    storeSettings({ minThinkTimeMs: 0 });
    const { result } = mount();
    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });

    act(() => result.current.undo());
    expect(result.current.snapshot.moves).toHaveLength(0);
    act(() => result.current.play({ from: 'e2', to: 'e4' }));

    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });
    expect(result.current.snapshot.moves.map((m) => m.san)).toEqual(['e4', 'Nc6']);
  });

  it('drops a hint for a position the learner has left', async () => {
    storeSettings({ minThinkTimeMs: 0 });
    const { result } = mount();
    // Let the opening evaluation finish, so the start position is in the analysis
    // cache. That is what makes the step back below issue *no* search, and a
    // search is what would otherwise supersede the hint and hide the position
    // check behind a rejection.
    await waitFor(() => expect(result.current.analysis).not.toBeNull());
    FakeWorker.slowFen = after('e2e4', 'b8c6');
    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });

    act(() => {
      void result.current.requestHint();
    });
    expect(result.current.hintBusy).toBe(true);
    // Step back while the answer is being worked out.
    act(() => result.current.goto(0));

    await waitFor(() => expect(result.current.hintBusy).toBe(false), { timeout: 3000 });
    expect(result.current.hint).toBeNull();
  });

  it('refuses a hint on the engine’s turn even when the button cannot be pressed', async () => {
    // The rendered button is disabled on the engine's turn, so this is the call
    // itself being asked: a hint analysed while Black is to move would be a
    // *Black* move, drawn as an arrow on a board the learner cannot play it on.
    // A think time long enough to hold the engine's answer: the point is the turn,
    // and a reply that landed mid-test would also start the next evaluation and
    // make the search count mean something else.
    storeSettings({ minThinkTimeMs: 3000 });
    const { result } = mount();
    // Past the handshake, so the reply's search is issued by the move below and
    // the search count means what this assertion says it means.
    await waitFor(() => expect(result.current.engineStatus).toBe('ready'));
    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    expect(result.current.snapshot.moves).toHaveLength(1);
    expect(result.current.playerTurn).toBe(false);
    const searches = FakeWorker.searches;

    await act(async () => {
      await result.current.requestHint();
    });

    expect(result.current.hint).toBeNull();
    expect(result.current.hintBusy).toBe(false);
    expect(FakeWorker.searches).toBe(searches);
  });

  it('refuses a second hint and leaves neither request stuck', async () => {
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 200;
    const { result } = mount();

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.requestHint();
      // The DOM cannot produce this — the button is disabled while one is in
      // flight — so it is the call itself that has to refuse.
      second = result.current.requestHint();
    });

    // Both settle: a refused request is not a rejected one, so nothing here can
    // deadlock or surface as an unhandled rejection.
    await act(async () => {
      await Promise.all([first, second]);
    });
    expect(result.current.hintBusy).toBe(false);
    expect(result.current.hint).not.toBeNull();
  });

  it('does not play a reply into the game that replaced it', async () => {
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 200;
    const { result } = mount();

    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    // Reset while the engine is still thinking. The engine only ever plays Black
    // and a fresh board is White's to move, so the late answer is refused by the
    // reducer rather than having to be caught here.
    act(() => result.current.newGame());
    await act(async () => {
      await sleep(400);
    });

    expect(result.current.snapshot.moves).toEqual([]);
    expect(result.current.snapshot.status.kind).toBe('playing');
    expect(result.current.canMove).toBe(true);
  });

  it('plays both sides locally when the engine is gone', async () => {
    const { result } = mount();
    await waitFor(() => expect(result.current.engineStatus).toBe('ready'));
    act(() => {
      latestWorker()?.die('WebAssembly module failed to compile');
    });
    await waitFor(() => expect(result.current.engineStatus).toBe('error'));

    // The degradation rule, stated as one fact: the board accepts a move on the
    // engine's turn, while the learner's own turn is still reported separately.
    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    expect(result.current.playerTurn).toBe(false);
    expect(result.current.canMove).toBe(true);
    act(() => result.current.play({ from: 'e7', to: 'e5' }));

    expect(result.current.snapshot.moves.map((m) => m.san)).toEqual(['e4', 'e5']);
    // And the engine-dependent features are off rather than broken.
    await act(async () => {
      await result.current.requestHint();
    });
    expect(result.current.hint).toBeNull();
  });
});
