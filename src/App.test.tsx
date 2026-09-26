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
import { useEngine } from './engine/useEngine';
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
  /** How many `stop`s the engine was sent, whether or not anything was running.
   * An idle `stop` is harmless and the client is allowed to send one. */
  static stops = 0;
  /** How many searches were actually *abandoned*: a `stop` that arrived with a
   * search in flight, so the engine answered a question the app had left. Counted
   * separately from `stops` because the two mean different things, and a test that
   * conflates them cannot say which happened. */
  static abandonedSearches = 0;
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
  /** The pending answer, so `stop` can replace it with `bestmove (none)`. */
  private answerTimer: ReturnType<typeof setTimeout> | undefined = undefined;

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
      return;
    }
    if (line === 'stop') {
      FakeWorker.stops += 1;
      // What the real engine does with a `stop`: end the search in flight, answer
      // `bestmove (none)`, and send no `info` line at all. A fake that ignored
      // `stop` would leave an interrupted search hanging until its budget ran out,
      // and every test of the abort would be measuring the timeout instead.
      this.abort();
    }
    // `ucinewgame`, `setoption` and `quit` are recorded and unanswered.
  }

  /**
   * The `stop` answer.
   *
   * A **real** move, not `(none)`, because that is what the engine does: measured
   * in Chromium against the real WASM, a `stop` 200ms into a `go` is answered 23ms
   * later with `bestmove d2d4 ponder g8f6` — a move chosen for the question the app
   * has just abandoned, with no `info` line at all. Answering `(none)` instead made
   * every abort test pass for the wrong reason: the reply path returns early on a
   * null move and never reaches the code that has to survive it, so a fake that
   * fell silent would have hidden the very bug this exists to pin.
   *
   * `pickMove` reads the position the *abandoned* search was given, which is the
   * point: the move is legal there, so the reducer would accept it, and only the
   * caller knowing the search was interrupted can tell it is not an answer.
   */
  private abort(): void {
    if (this.answerTimer === undefined) return;
    const move = this.pickMove();
    this.cancelAnswer();
    if (this.alive) FakeWorker.inFlightSearches -= 1;
    FakeWorker.abandonedSearches += 1;
    this.say(`bestmove ${move}`);
  }

  terminate(): void {
    this.alive = false;
    this.cancelAnswer();
  }

  /** What `Worker.onerror` looks like to the client: a dead worker mid-life. */
  die(detail = 'WebAssembly module failed to compile'): void {
    queueMicrotask(() => this.error?.(new Error(detail)));
  }

  private answer(): void {
    const move = this.pickMove();
    const score = FakeWorker.scores[this.fen] ?? FakeWorker.scoreCp;
    this.answerTimer = setTimeout(() => {
      this.answerTimer = undefined;
      if (this.alive) FakeWorker.inFlightSearches -= 1;
      this.say(`info depth 12 multipv 1 score cp ${score} pv ${move}`);
      this.say(`bestmove ${move}`);
    }, this.fen === FakeWorker.slowFen ? FakeWorker.slowMs : FakeWorker.searchDelayMs);
  }

  /** The engine never answers a search twice, so a cancelled answer is dropped
   * rather than left to arrive after the `stop` that replaced it. */
  private cancelAnswer(): void {
    if (this.answerTimer === undefined) return;
    clearTimeout(this.answerTimer);
    this.answerTimer = undefined;
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
  FakeWorker.stops = 0;
  FakeWorker.abandonedSearches = 0;
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
    // 'Not loaded' and not 'Loading engine…': the client exists from the mount
    // effect, but the search is handed to it on a microtask (the queue defers the
    // task so a synchronous throw cannot wedge the door), so at the end of `render`
    // it has not started. The transition to loading is the next test's subject.
    expect(screen.getByText('Engine not loaded')).toBeInTheDocument();
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

  it('abandons the evaluation in flight rather than queueing behind it', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    // The opening evaluation is slow, so it is certainly still running when the
    // learner moves — which is the ordinary case, and the one in which waiting for
    // it puts the opponent's move behind a 3s background search. Measured against
    // the real engine, that wait was most of a reply's latency.
    FakeWorker.slowFen = after();
    FakeWorker.slowMs = 3000;
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    // The positive control: that search really is running.
    expect(FakeWorker.inFlightSearches).toBe(1);

    await play(user, 'e2', 'e4');

    // Level, not wrong: the opening's score is White's, and the position on screen
    // now has Black to move, so showing it would point the bar the wrong way.
    expect(evalShare()).toBe('50');
    // The reply arrives well inside the evaluation's 3s budget, because it asked for
    // that evaluation to stop rather than waiting for it.
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 1500 });
    // And still one `go` at a time: the abort replaced the search, it did not
    // accompany it.
    expect(FakeWorker.maxConcurrentSearches).toBe(1);
    // The abandoned evaluation left nothing behind, so the bar fills in again for
    // the position the reply created.
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

  it('does not play a reply decided for a position the learner has left', async () => {
    const user = userEvent.setup();
    // A think floor long enough that the undo and the second move both land
    // while the engine's answer is being held back. That window is the reply's own
    // duration wide, and it is the one in which a decision made for a position that
    // is no longer on the board can still be dispatched.
    storeSettings({ minThinkTimeMs: 600 });
    // `d7d5` is legal after 1.e4 — the position the engine is asked about — and
    // equally legal after 1.d4. So a reply decided for the abandoned position is
    // not refused by the reducer; it simply appears on the board, and the learner
    // has made one move and been answered about a different one.
    FakeWorker.play = { [after('e2e4')]: 'd7d5' };
    render(<App />);

    await play(user, 'e2', 'e4');
    await act(async () => {
      await sleep(150);
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await play(user, 'd2', 'd4');

    await waitFor(() => expect(moves()).toHaveLength(2), { timeout: 5000 });
    // The engine answers the position actually on the board, and the abandoned
    // `d5` is nowhere in the list.
    expect(moves()).toEqual(['d4', 'Nc6']);
  });

  it('undo takes back the pair and hands the turn back', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });

    await user.click(screen.getByRole('button', { name: 'Undo' }));

    expect(moves()).toEqual([]);
    // "Your turn again", asserted by what the board offers: `Board` never renders
    // `disabled` on a square, so `toBeEnabled` on one proves nothing.
    await user.click(square('e2'));
    expect(square('e4')).toHaveAttribute('data-target');
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

  it('the bar shows the position on screen after a rapid back and forth', async () => {
    // The property, not a single line of code: whatever order the queue and the
    // position check between them produce, the number on the bar belongs to the
    // position the learner is looking at. Rapid review navigation is the case that
    // stresses it — a position whose evaluation is still in flight, one queued
    // behind it, and then the learner back at the first — with two different
    // scores so a stale write is visible rather than merely out of order.
    //
    // What this does NOT do is pin the position check on its own. The
    // `eval-drops-the-position-check` mutation survives it, and the traced reason is
    // in the report: with the door, every path where the evaluation declines to ask
    // about a new position coincides with the in-flight one being aborted or
    // failed, so the check has no reachable case left that ordering does not
    // already cover.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    // Ply 1 is slow to analyse and scores differently, so the two writes are
    // distinguishable rather than merely ordered.
    FakeWorker.slowFen = after('e2e4');
    FakeWorker.scores = { [after('e2e4')]: -900 };
    render(<App />);
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toEqual(['e4', 'Nc6']), { timeout: 5000 });
    // The live position's own evaluation, which is the one that gets queued below.
    await waitFor(() => expect(evalShare()).toBe('51'), { timeout: 3000 });

    await user.click(moveButton('e4')); // A: a slow search for the ply-1 position
    await user.click(screen.getByRole('button', { name: 'Last move' })); // B: queued
    await user.click(moveButton('e4')); // back to A, which joins A's own search

    // A resolves, then B. The bar settles on A's score: -900 for the side to move
    // there is +900 for White, so 91 — and 51 is B's, which would be stale.
    await act(async () => {
      await sleep(FakeWorker.slowMs + 300);
    });
    expect(evalShare()).toBe('91');
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
    // A finished game takes no moves, and the board says so by offering no
    // destination — the opposite polarity to the two tests above, and the reason
    // `toBeEnabled` on a square was worthless: it was true in both states.
    await user.click(square('e2'));
    expect(square('e4')).not.toHaveAttribute('data-target');
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

  it('restores a persisted game on reload', async () => {
    const user = userEvent.setup();
    storeGame([
      { from: 'd2', to: 'd4' },
      { from: 'd7', to: 'd5' },
    ]);
    render(<App />);

    expect(moves()).toEqual(['d4', 'd5']);
    // Two plies on, so it is the learner's move — asserted by what the board
    // *offers*, not by `toBeEnabled`: `Board` never renders `disabled` on a square,
    // so that assertion could not fail whatever the turn was.
    await user.click(square('g1'));
    expect(square('f3')).toHaveAttribute('data-target');
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

  /**
   * The review's CRITICAL, pinned at the door.
   *
   * UCI `setoption` is sticky, so a `Skill Level` sent for the opponent's move
   * used to stay in force for every evaluation and every hint. Stockfish's
   * `Skill Level` does not merely pick worse moves — below 20 it substitutes a
   * reduced-accuracy evaluation net from root depth 4 down — so the *score* was
   * handicapped too. Measured against the real engine in a position eight pawns
   * up: at Skill 1 the bar read `0.0` and the hint said `e4`; at Skill 20, `+8.8`
   * and `Bb2`.
   *
   * This asserts the exact bytes on the wire, which is the part a fake *can* see.
   * It cannot see that Stockfish's handicap is real, which is why the real-engine
   * E2E test exists too and why that one is the one that must never be deleted.
   */
  it('handicaps the opponent and never the advice', async () => {
    const user = userEvent.setup();
    storeSettings({ skillLevel: 1, minThinkTimeMs: 0 });
    render(<App />);

    // The opening evaluation: the learner's own strength must not reach it. Two
    // lines and the order is the contract — 1 from the `newGame` that boots the
    // client (the play level) and 20 from the search itself.
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    expect(skillOptions()).toEqual([`${SKILL_OPTION}1`, `${SKILL_OPTION}20`]);

    // A hint, which must not be handed the opponent's handicap. Asserted as "no
    // play-level option was posted" rather than as a search count: the hint for
    // the position on screen *joins* the evaluation already in flight (the
    // in-flight map is keyed on FEN alone, deliberately), so a new `go` here
    // would be a different behaviour and not this test's subject.
    FakeWorker.sent.length = 0;
    await user.click(screen.getByRole('button', { name: 'Hint' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Play hint move' })).toBeInTheDocument());
    expect(skillOptions(), 'a hint must never be searched at the play level').toEqual([]);

    // **And the reply is handicapped.** This is the half that must not be "fixed"
    // along with the other half: a door that sent 20 here would give the learner a
    // full-strength opponent, trading the advice bug for a worse one — the
    // difficulty control would stop doing the only thing it exists to do.
    //
    // The engine is at 20 after the evaluation, so the reply has to state 1 — and
    // it does, which is the assertion. (It is not the *last* line: the evaluation
    // of the position the reply created then posts 20 again, and that alternation
    // is the next test.)
    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toHaveLength(2));
    expect(skillOptions(), 'the opponent must play at the chosen strength').toContain(
      `${SKILL_OPTION}1`,
    );
  });

  it('re-states the play level after a hint, and still not for the next evaluation', async () => {
    // The two levels alternate on the wire as the learner moves and the app
    // evaluates: the reply at the play level, the evaluation at 20, the reply at
    // the play level again. A door that leaked the last level into the next search
    // would show up here as a missing or a repeated value.
    const user = userEvent.setup();
    storeSettings({ skillLevel: 1, minThinkTimeMs: 0 });
    render(<App />);
    await waitFor(() => expect(FakeWorker.searches).toBe(1));

    await play(user, 'e2', 'e4');
    await waitFor(() => expect(moves()).toHaveLength(2));
    await waitFor(() => expect(evalShare()).not.toBe('50'));

    // Reply (1), then the evaluation of the new position (20). Two searches, two
    // different levels, and the second is the advice channel.
    await waitFor(() => expect(FakeWorker.sent).toContain(`${SKILL_OPTION}20`));
    const levels = skillOptions();
    expect(levels.at(-1)).toBe(`${SKILL_OPTION}20`);
    expect(levels).toContain(`${SKILL_OPTION}1`);
  });

  // The theme is one field of the settings object, and it is the only preference
  // with no control of its own in the difficulty panel — so the header's switch is
  // the whole feature, and nothing else tests it.
  it('flips the theme, and the flip reaches the document and storage', async () => {
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0, theme: 'light' });
    render(<App />);

    // The attribute on <html> is what the stylesheet keys on, and it is set in an
    // effect rather than during render — so this asserts the effect ran, not that
    // the markup happened to be right.
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'));
    // And it is persisted, so the learner does not get their OS preference back
    // over their own choice on the next load.
    await waitFor(() =>
      expect(localStorage.getItem('chess.settings.v1')).toContain('"theme":"dark"'),
    );

    // Back the other way, and the button names the other action: a label that
    // reports the current state instead of the next one tells a screen-reader user
    // what they already know and leaves them guessing what pressing it does.
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));

    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('light'));
    expect(localStorage.getItem('chess.settings.v1')).toContain('"theme":"light"');
  });

  it('keeps every other setting when the theme is flipped', async () => {
    // A toggle that wrote `{ theme }` instead of `{ ...settings, theme }` would
    // silently reset the difficulty, the think time, the orientation and the hint
    // mode — and "I changed the theme and it started playing like a beginner" is
    // exactly the bug that is invisible until it has happened.
    const user = userEvent.setup();
    storeSettings({
      skillLevel: 1,
      minThinkTimeMs: 1200,
      orientation: 'b',
      theme: 'light',
      hintMode: 'good',
    });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));

    await waitFor(() =>
      expect(localStorage.getItem('chess.settings.v1')).toContain('"theme":"dark"'),
    );
    const stored = JSON.parse(localStorage.getItem('chess.settings.v1') ?? '{}');
    expect(stored).toEqual({
      skillLevel: 1,
      minThinkTimeMs: 1200,
      orientation: 'b',
      theme: 'dark',
      hintMode: 'good',
    });
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
    // The evaluation of the position *before* the mate is slow, and nothing will
    // interrupt it: the game ends, so no reply is owed and the evaluation is
    // gated off. It is the one window in which an answer for a position that is no
    // longer on screen can still arrive, and the bar must refuse it.
    FakeWorker.slowFen = after('f2f3', 'e7e5');
    render(<App />);

    await play(user, 'f2', 'f3');
    await waitFor(() => expect(moves()).toEqual(['f3', 'e5']), { timeout: 5000 });
    await play(user, 'g2', 'g4');
    await waitFor(() => expect(moves()).toEqual(['f3', 'e5', 'g4', 'Qh4#']), { timeout: 5000 });

    expect(screen.getByText('Checkmate — Black wins')).toBeInTheDocument();
    const searchesAfterMate = FakeWorker.searches;
    // A finished game is terminal: the engine is not asked for a reply in a
    // position with no legal move in it, and the board takes none. The wait runs
    // past the slow evaluation so that its answer arrives inside the assertions.
    await act(async () => {
      await sleep(FakeWorker.slowMs + 200);
    });
    expect(FakeWorker.searches).toBe(searchesAfterMate);
    expect(moves()).toHaveLength(4);
    // Level rather than showing the pre-mate position's score: the mate moved the
    // board, and that score is for a position that is no longer on screen.
    expect(evalShare()).toBe('50');
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
    await waitFor(() => expect(api().snapshot.moves).toHaveLength(2), { timeout: 5000 });
    // A second effect run would have asked again, and its move would be the third
    // ply. Nothing settles it, so a moment later is the only honest moment to look.
    await act(async () => {
      await sleep(50);
    });
    expect(api().snapshot.moves).toHaveLength(2);
    // The opening evaluation and the reply: one search each, never two at once.
    expect(FakeWorker.searches).toBe(before + 2);
    expect(FakeWorker.maxConcurrentSearches).toBe(1);
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

  it('asks again for a position it has already answered once, abandoning the old search', async () => {
    // Two things, and the second is the one the door used to get wrong. The reply is
    // deduped per game state, not per position: undo and play the same move again
    // reaches a position the engine has already answered, and a position-keyed guard
    // would refuse to ask, leaving the board on the opponent's turn with nothing
    // able to move. And the *new* reply must not sit behind the abandoned one —
    // measured at 1409ms for a reply against a 400ms engine, i.e. two searches and
    // two think floors for one move. A `stop` is how it does not.
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 400;
    const { result } = mount();
    act(() => result.current.play({ from: 'e2', to: 'e4' }));
    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });

    act(() => result.current.undo());
    expect(result.current.snapshot.moves).toHaveLength(0);
    act(() => result.current.play({ from: 'e2', to: 'e4' }));

    // What is in flight at this moment is the *evaluation* of the position the
    // learner just left, and it is abandoned rather than waited out: the whole cost
    // of a turn-back-and-replay used to be that search plus a second think floor.
    expect(FakeWorker.abandonedSearches).toBe(1);
    await waitFor(() => expect(result.current.snapshot.moves).toHaveLength(2), { timeout: 5000 });
    expect(result.current.snapshot.moves.map((m) => m.san)).toEqual(['e4', 'Nc6']);
    // And nothing else was interrupted: the search that answered was the one asked
    // for, and the engine is left running.
    expect(FakeWorker.abandonedSearches).toBe(1);
    expect(result.current.engineStatus).not.toBe('error');
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
    // The reply's own search, so the count below is not racing the queue.
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
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

  /**
   * The engine layer's own refusal, tested where the bug was.
   *
   * Asserted through `useEngine` and not through `useGame` on purpose: the position
   * check in the reply path also stops a stale move being played, so an app-level
   * test of this would pass whether or not the engine layer refused anything — and
   * that is precisely how a cross-file coupling goes unnoticed. Here there is no
   * second guard anywhere in the path.
   *
   * And the fake answers a `stop` with a real move, which is what the engine does,
   * so this fails if the refusal goes away. A fake that answered `(none)` would make
   * it pass for the wrong reason.
   */
  it('an interrupted reply search yields no move, even though the engine gives one', async () => {
    FakeWorker.searchDelayMs = 400;
    const { result } = renderHook(() => useEngine());
    const abandoned = after('e2e4');
    const wanted = after('d2d4');

    // Two moves in a row: the second interrupts the first, and what the engine
    // answers for the first is a perfectly good move for the position the app has
    // already left.
    const first = result.current.bestMove(abandoned, 1500);
    const firstSettled = first.then(
      () => 'settled with a move' as const,
      (e: unknown) => (e as { code?: string }).code ?? 'rejected',
    );
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    const second = result.current.bestMove(wanted, 1500);
    await waitFor(() => expect(FakeWorker.abandonedSearches).toBe(1));

    // The interrupted one is unmistakable: a rejection carrying the abort code, not
    // a move dressed up as an answer.
    expect(await firstSettled).toBe('aborted');
    // And the engine really did answer it — this is the line that would make the
    // test vacuous if the fake fell silent on a `stop`.
    expect(FakeWorker.sent).toContain('stop');
    // The search that is still wanted is unaffected: it runs, and it answers.
    await expect(second).resolves.toBe('b8c6');
    expect(FakeWorker.inFlightSearches).toBe(0);
  });

  it('still answers the position on screen when a reply is interrupted', async () => {
    // The reachable shape of the same thing, through the app: a move, then Undo and
    // a different move inside the search window. What this pins is the end state —
    // one reply, for the position the learner is actually on — not either guard
    // individually; the test above is the one that discriminates.
    const user = userEvent.setup();
    storeSettings({ minThinkTimeMs: 0 });
    FakeWorker.searchDelayMs = 400;
    render(<App />);
    // The opening evaluation starts *and* finishes first, so the only search this
    // test can abandon is the one it is about. Both halves are needed: the
    // in-flight count is 0 before the first search is even posted, so waiting on it
    // alone would pass instantly and the first move would abandon the opening
    // evaluation as well.
    await waitFor(() => expect(FakeWorker.searches).toBe(1));
    await waitFor(() => expect(FakeWorker.inFlightSearches).toBe(0));
    expect(FakeWorker.abandonedSearches).toBe(0);

    await play(user, 'e2', 'e4');
    await act(async () => {
      await sleep(100);
    });
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    await play(user, 'd2', 'd4');

    // A reply search was abandoned mid-answer, and the board is not left waiting:
    // the move the engine offered for 1.e4 is never played, and the engine still
    // answers the position that is on screen.
    expect(FakeWorker.abandonedSearches).toBe(1);
    await waitFor(() => expect(moves()).toEqual(['d4', 'Nc6']), { timeout: 5000 });
    expect(moves()).not.toContain('d5');
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
