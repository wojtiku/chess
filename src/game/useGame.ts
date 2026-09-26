// The game loop. This hook owns the move list, the settings, the position the app
// shows, and every question the app asks the engine — and it is the only place
// that decides *when* those questions are asked.
//
// The move list is the state, exactly as in `gameState.ts`. Nothing here mutates a
// position: a position is always `gameAt(snapshot)`, so an undo is a truncation of
// the list rather than a reversal of a move, and the threefold and fifty-move
// counters stay honest because they are recomputed from a history that happened.
//
// Three questions reach the engine, and they are not equal:
//
//  - the **reply**, which the learner is waiting for and which therefore comes
//    first and alone;
//  - a **hint**, which they asked for and which shares its search with the
//    evaluation below;
//  - the **evaluation**, which is a background nicety and yields to both.
//
// That ordering is the whole of the scheduling in this file. It matters because
// `EngineClient` answers one search at a time and rejects the older with
// `superseded`, so two questions about the same position issued together do not
// both get answered — the loser silently produces no move, and the board sits on
// the opponent's turn with nothing able to move.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  gameAt,
  initialState,
  isGameOver,
  isReviewing,
  reduce,
  type GameAction,
  type GameSnapshot,
} from './gameState';
import {
  DEFAULT_OPPONENT_MOVETIME_MS,
  thinkWaitMs,
  type Settings,
} from './difficulty';
import { clearGame, loadGame, loadSettings, saveGame, saveSettings } from './persistence';
import type { Move } from '../chess/types';
import { fenOf, type Chess } from '../chess/rules';
import { pickHint, type Hint } from '../analysis/hints';
import type { Analysis } from '../analysis/evaluate';
import { useEngine, type EngineApi } from '../engine/useEngine';
import type { EngineStatus } from '../engine/engineClient';

export interface GameApi {
  /** The move list, the cursor into it, and the live game's status. */
  snapshot: GameSnapshot;
  /** The position at the cursor, replayed. Never a FEN-loaded `Chess`. */
  game: Chess;
  settings: Settings;
  /** The cursor is behind the live position: this is a review, not a game. */
  reviewing: boolean;
  /**
   * The side the learner owns is to move, in a position that still accepts a move.
   *
   * **Not the same question as `canMove`**, and the difference is the whole of
   * local two-player play: with the engine gone, Black's turn is a human's turn,
   * so the board accepts a move while `playerTurn` is false.
   */
  playerTurn: boolean;
  /** Whether the board should accept a move right now. */
  canMove: boolean;
  gameOver: boolean;
  engineStatus: EngineStatus;
  engineError: Error | null;
  hint: Hint | null;
  hintBusy: boolean;
  /** The evaluation of the position on screen, or null while it is not known. */
  analysis: Analysis | null;
  play(move: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }): void;
  dispatch(a: GameAction): void;
  undo(): void;
  resign(): void;
  newGame(): void;
  goto(cursor: number): void;
  requestHint(): Promise<void>;
  playHint(): void;
  setSettings(next: Settings): void;
  flip(): void;
}

/**
 * How long to hold a reply back, given how long the engine took.
 *
 * `max(engine, floor)`: an instant reply feels like the bot is reading your mind
 * and steals the time you needed to think about your next move, while a search
 * that was already slow is never made slower — a Beginner does not watch a 40ms
 * reply arrive before the board has finished drawing, and a hard game is not padded.
 */
const sleep = (ms: number): Promise<void> =>
  // Nothing cancels this. An answer the learner has walked away from is refused by
  // the reducer, so there is no walk-away worth holding a timer open for — and a
  // timer that can be called off is a timer that can be called off by the wrong
  // thing.
  new Promise((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });

const ignore = (): void => {};

/** One stored move: the smallest record `loadGame` can replay. */
function storedMoveOf(move: Move): { from: string; to: string; promotion?: Move['promotion'] } {
  // The `promotion` key is omitted rather than set to `undefined`, so a quiet
  // game is written byte-for-byte as it was before promotions existed.
  return move.promotion === undefined
    ? { from: move.from, to: move.to }
    : { from: move.from, to: move.to, promotion: move.promotion };
}

/**
 * The state to open with: the stored move list replayed, and then the stored
 * resignation applied.
 *
 * The order and the absence of an early return are both load-bearing. A learner can
 * resign before playing a single move, `resign` does not touch `moves`, and a move
 * list cannot express a resignation — so the early return on an empty list that
 * this replaced dropped it, the game reopened as playable, and the reply effect
 * took another move in a game the learner had already given up.
 *
 * `loadGame` has already validated the list, so `reduce` accepts every move in it
 * and the result is the same game, with the same history, that was stored.
 */
function hydrate(): GameSnapshot {
  const stored = loadGame();
  if (stored === null) return initialState();
  const replayed = stored.moves.reduce(
    (state, move) => reduce(state, { type: 'play', move: { ...move, san: '' } }),
    initialState(),
  );
  return stored.resignedBy === undefined ? replayed : reduce(replayed, { type: 'resign' });
}

export function useGame(): GameApi {
  const engine = useEngine();
  const [snapshot, setSnapshot] = useState<GameSnapshot>(hydrate);
  const [settings, setSettingsState] = useState<Settings>(loadSettings);
  const [hint, setHint] = useState<Hint | null>(null);
  const [hintBusy, setHintBusy] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);

  /**
   * Refs, not state, for everything an async continuation reads.
   *
   * An effect that closes over the engine or the settings from the render it was
   * created in is reading a snapshot of the world, and its continuation runs
   * against whatever that snapshot said — which for the engine means a client that
   * may since have been disposed, and for the settings a think time the learner
   * has already changed. Assigning during render is what makes these *current*;
   * the alternative (`useEffect` assignment) is a render behind.
   */
  const engineRef = useRef<EngineApi>(engine);
  engineRef.current = engine;
  const settingsRef = useRef<Settings>(settings);
  settingsRef.current = settings;

  const dispatch = useCallback((a: GameAction) => setSnapshot((s) => reduce(s, a)), []);

  const game = useMemo(() => gameAt(snapshot), [snapshot]);
  const fen = useMemo(() => fenOf(game), [game]);
  const fenRef = useRef(fen);
  fenRef.current = fen;

  const gameOver = isGameOver(snapshot.status);
  const reviewing = isReviewing(snapshot);
  const engineDisabled = engine.status === 'error';
  const engineAvailable = engine.available;
  /** White: the side the learner owns. A "play as Black" mode would change this. */
  const learnerToMove = game.turn() === 'w';
  /** The position on screen is the live one and the game has not ended. */
  const playable = !gameOver && !reviewing;
  const playerTurn = playable && learnerToMove;
  /**
   * The board's interactivity. The one place the degradation rule is written down:
   * with the engine unavailable both sides are human, so the opponent's turn is
   * playable and the app is a local two-player board (spec §7.3). Everywhere else
   * asks `canMove`, so this decision cannot be made twice.
   */
  const canMove = playable && (engineDisabled || learnerToMove);
  /** The engine owes this position a move. The reply, and nothing else. */
  const replyDue = playable && !learnerToMove;

  /** False only after a real unmount. */
  const aliveRef = useRef(true);
  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  /** A second hint request is refused rather than queued, and this is the flag
   * that says so: a `disabled` button stops the click, this stops the call. */
  const hintInFlightRef = useRef(false);

  // Persist the move list and any resignation. A failed write is a no-op inside
  // `persistence`, and an empty unresigned game clears the stored one — the
  // `resignedBy` half of the condition is what keeps a resignation made on move 0
  // from being wiped by the very effect that is meant to save it.
  useEffect(() => {
    if (snapshot.moves.length === 0 && snapshot.resignedBy === null) {
      clearGame();
      return;
    }
    saveGame(
      snapshot.moves.map(storedMoveOf),
      snapshot.resignedBy ?? undefined,
    );
  }, [snapshot.moves, snapshot.resignedBy]);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Keep the engine's strength in step with the setting, before its first search:
  // declared first on purpose, so a level restored from storage is on the client
  // before the mount evaluation boots it. Otherwise the first search would boot
  // with `EngineClient`'s own default of 8 and the learner's choice would apply
  // from the second move onwards.
  useEffect(() => {
    engineRef.current.setSkillLevel(settings.skillLevel);
  }, [engineAvailable, settings.skillLevel]);

  // A hint is an answer about one position. Once the position on screen changes
  // the answer is stale, and the arrow drawn from it would point at a move that is
  // not legal in front of the learner.
  useEffect(() => {
    setHint(null);
  }, [fen]);

  /**
   * The opponent's reply.
   *
   * Every guard is a "not yet" or a "not this", and the effect body is the only
   * thing in the app that plays a move the learner did not make:
   *
   *  - `playable` — never from a review position, so navigating back cannot
   *    re-trigger the engine (review is read-only), and never after the game has
   *    ended, so a mate is not answered;
   *  - `learnerToMove`, and no moves — the engine plays Black. Asked about the
   *    start position it would answer with a *White* move, and the reducer would
   *    accept it, because it is legal there. The empty-board half of this is
   *    redundant with the turn half today: at ply 0 it is always White's move. It
   *    is kept because it is the one condition under which the engine would be
   *    asked to play the learner's own side, and a "play as Black" mode — which
   *    `reduce`'s undo rule already anticipates — would make it load-bearing
   *    rather than implied;
   *  - the engine being available and healthy — a dead engine is handled by the
   *    two-player fallback rather than a search that cannot start;
   *  - `replyDue` — this effect is the only search the engine is asked for while
   *    the opponent owes a move. The evaluation below is gated on the same fact
   *    from the other side, and the door behind both of them keeps one search in
   *    flight, so the two can never compete.
   *
   * There is deliberately no "wait for the handshake" guard, and deliberately no
   * "have I already asked for this state" record. Both were here, and both became
   * unreachable once the door serialised requests:
   *
   *  - Two searches issued inside the handshake window used to suspend on the same
   *    memoised boot, where the client hands the *first* caller a promise that
   *    resolves one microtask later than the second's — so the evaluation, having
   *    asked first, resumed last and superseded the reply. One request at a time
   *    leaves no second caller to be inverted against.
   *  - The record guarded against a re-run for an unchanged state. The engine's
   *    status is not a dependency of this effect, so the only re-run that keeps the
   *    state is the client appearing — and that first run returns above, before it
   *    could ask anything.
   *
   * What actually keeps a *duplicate* move off the board is the door (one search at
   * a time) and the reducer (a move that does not apply to the live position is
   * refused). Neither is a guard *here*, and a condition that cannot change an
   * outcome is not a guard. What keeps a *stale* one off the board is the position
   * check above, which is not redundant with either: the reducer accepts a move that
   * is legal in the new position, which is exactly the case a learner reaches by
   * undoing and trying something else.
   */
  useEffect(() => {
    if (!playable || learnerToMove || snapshot.moves.length === 0) return;
    if (engineDisabled || !engineAvailable) return;

    const asked = engineRef.current;
    // Captured rather than read after the await: the position this answer belongs
    // to is the one this run asked about, whatever the learner has done since.
    const askedFor = fen;

    void (async () => {
      const started = performance.now();
      try {
        const best = await asked.bestMove(askedFor, DEFAULT_OPPONENT_MOVETIME_MS);
        // `null` is the engine saying it has no move: a mate or a stalemate, and
        // the status is already terminal, so there is nothing to play.
        if (best === null) return;
        await sleep(thinkWaitMs(performance.now() - started, settingsRef.current.minThinkTimeMs));
        if (!aliveRef.current) return;
        // The position this answer belongs to, checked against the one on screen.
        // Undo and then play something else is an ordinary thing for a learner to
        // do, and the window is the reply's own duration wide — and the stale
        // answer is not necessarily illegal in the new position, so the reducer
        // will not catch it. A learner who made one move would be answered by a
        // decision made for a board that is no longer there. The same check the
        // hint and the evaluation both make, and the reason this one is the third
        // rather than the only is that it is the only one that moves a piece.
        //
        // Redundant with `useEngine`'s refusal to hand over an aborted search, and
        // deliberately so: the wait above is not a search, so a move made during it
        // never interrupts anything and only this check can catch it. If you are
        // reading this while thinking one of the two is the other's backup — the
        // engine layer's own comment says the same thing, and both are right.
        if (fenRef.current !== askedFor) return;
        dispatch({ type: 'playUci', uci: best });
      } catch {
        // Nothing to do, and that is the whole of it. Two different things arrive
        // here: a real engine failure, which the client has already turned into its
        // own `error` state for the badge to report, and an **aborted** search,
        // which `useEngine` rejects with `code: 'aborted'` because the app asked for
        // it — a newer move took the engine. Both are the same thing from here: this
        // run does not have an answer, and the run that superseded it has.
        //
        // (This comment used to argue that a stale answer was harmless, on a
        // reasoning that turned out to be false. It is deliberately not restated
        // here, because restating it is how it survived as long as it did: the check
        // above is what stops a move decided for an abandoned position from being
        // played, and the check exists because that reasoning was wrong.)
      }
    })();
  }, [snapshot, playable, learnerToMove, engineDisabled, engineAvailable, fen, dispatch]);

  /**
   * The evaluation behind the bar.
   *
   * **Not cleared on a position change, on purpose.** It used to be, and the
   * clearing was load-bearing for a while before it wasn't. The engine's score is
   * for the side to move *in the position it searched*, so an evaluation of one
   * position shown against another position's turn is a bar pointing the wrong way
   * — and `setAnalysis(null)` used to be the first line of this effect, which
   * papered over that for every render except the one between a move and this
   * effect, since React runs effects *after* the commit. `App`'s FEN gate is what
   * actually makes the invariant true; the clearing never did, and a comment here
   * once claimed it did.
   *
   * So the analysis is kept, and `App` decides what to do with it by comparing its
   * `fen` to the one on screen: a match is shown live, a mismatch is shown **dimmed
   * and in its own frame** — `Analysis.sideToMove`, the turn it was measured
   * against, never the board's. Clearing instead would mean the bar is blank for
   * the ~6s it takes the engine to run a reply search and *then* an analysis, and
   * `whiteShare` draws "no score" as exactly 50, so a blank bar claims the position
   * is level rather than admitting it does not know yet.
   *
   * `newGame` still clears it, which is the one case where holding the last score
   * would be plainly wrong: a fresh board has no relationship to the last game.
   *
   * While the engine owes a move for this position, the reply effect's search is
   * the one that matters, and a second search for the same position would supersede
   * it and leave the board with no opponent. A finished game is not evaluated at
   * all, and keeps whatever it last had, dimmed.
   */
  useEffect(() => {
    // A finished game is not thought about: the eval bar is for a position being
    // played, and a search for a mate the learner has already been shown would
    // be engine work with nothing to inform.
    if (!engineAvailable || engineDisabled || gameOver || replyDue) return;
    void engineRef.current.analyze(fen).then((a) => {
      if (fenRef.current === fen) setAnalysis(a);
    }, ignore);
  }, [fen, replyDue, gameOver, engineAvailable, engineDisabled]);

  const play = useCallback(
    (m: { from: string; to: string; promotion?: 'q' | 'r' | 'b' | 'n' }) => {
      // `canMove`, not `playerTurn`: with the engine gone this is how Black is
      // played. `san` is the reducer's to fill in; the input shape needs the key.
      if (!canMove) return;
      dispatch({ type: 'play', move: { ...m, san: '' } });
    },
    [canMove, dispatch],
  );

  /**
   * Ask for a hint. Refused on the opponent's turn (the answer would be about the
   * wrong question), when the game is over, while reviewing, when the engine is
   * unavailable, and while one is already in flight — and it never waits on
   * another request, so a second one cannot deadlock behind a first that is
   * waiting for the engine.
   */
  const requestHint = useCallback(async () => {
    if (engineDisabled || !engineAvailable) return;
    if (!playerTurn) return;
    if (hintInFlightRef.current) return;

    hintInFlightRef.current = true;
    setHintBusy(true);
    const asked = fen;
    try {
      const a = await engineRef.current.analyze(asked, { multiPv: 5 });
      if (fenRef.current !== asked) return;
      setHint(pickHint(a, settingsRef.current.hintMode));
    } catch {
      setHint(null);
    } finally {
      hintInFlightRef.current = false;
      setHintBusy(false);
    }
  }, [engineDisabled, engineAvailable, playerTurn, fen]);

  const playHint = useCallback(() => {
    if (hint === null) return;
    if (!playerTurn) return;
    dispatch({ type: 'playUci', uci: hint.uci });
  }, [hint, playerTurn, dispatch]);

  const newGame = useCallback(() => {
    dispatch({ type: 'reset' });
    setHint(null);
    setAnalysis(null);
    // A reply still in flight for the abandoned game cannot land: the engine only
    // ever plays Black, and a fresh board is White's to move, so the reducer
    // refuses it rather than the app having to remember to check.
    if (engineRef.current.available) {
      void engineRef.current.newGame().catch(ignore);
    }
  }, [dispatch]);

  const setSettings = useCallback((next: Settings) => setSettingsState(next), []);

  const flip = useCallback(
    () => setSettingsState((s) => ({ ...s, orientation: s.orientation === 'w' ? 'b' : 'w' })),
    [],
  );

  return {
    snapshot,
    game,
    settings,
    reviewing,
    playerTurn,
    canMove,
    gameOver,
    engineStatus: engine.status,
    engineError: engine.error,
    hint,
    hintBusy,
    analysis,
    play,
    dispatch,
    undo: useCallback(() => dispatch({ type: 'undo' }), [dispatch]),
    resign: useCallback(() => dispatch({ type: 'resign' }), [dispatch]),
    newGame,
    goto: useCallback((cursor: number) => dispatch({ type: 'goto', cursor }), [dispatch]),
    requestHint,
    playHint,
    setSettings,
    flip,
  };
}
