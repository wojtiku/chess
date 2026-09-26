// The React door to the engine. Everything the app asks of Stockfish goes through
// here, and nothing else in the app touches `EngineClient` directly.
//
// Two rules are baked into this file, and both of them exist because the obvious
// version of the hook is wrong in a way that only shows up later.
//
// 1. **The client is constructed inside an effect and held in state, never in a
//    render-body ref.** `EngineClient.dispose()` is terminal: a disposed client
//    refuses to build another worker and rejects every outstanding promise with
//    `disposed`. React 19 StrictMode mounts an effect, cleans it up and runs it
//    again, so a client kept in a ref survives the cleanup and the hook hands the
//    app a permanently dead engine on the second run — every call rejects, and the
//    board sits on the opponent's turn forever. Holding it in state means the
//    second run constructs a *new* client.
// 2. **A client that was never constructed reports `error` rather than `idle`.**
//    `EngineClient` cannot exist without a `Worker` global, so "this environment
//    cannot run the engine" is a real answer, and it is the answer the UI needs in
//    order to fall back to local two-player play (spec §7.3). A hook that quietly
//    stayed `idle` would leave the board unplayable on Black's turn with no badge
//    to explain why.

import { useEffect, useMemo, useState } from 'react';
import {
  ADVICE_SKILL_LEVEL,
  EngineClient,
  EngineError,
  type EngineStatus,
} from '../engine/engineClient';
import { makeEngineSource, type Analysis } from '../analysis/evaluate';
import { createSearchQueue } from './searchQueue';

export interface EngineApi {
  /**
   * Whether a live client is in hand.
   *
   * Not derivable from `status`: a fresh client reports `idle` (Task 3's ruling
   * that a disposed client is indistinguishable from a new one by status), so
   * "the engine has not booted yet" and "the engine was torn down" look the same.
   * A caller that must not act on a missing engine — the opponent-reply effect,
   * the hint request — needs the distinction, or it fires into the void once and
   * is never retried.
   *
   * Says nothing about the *worker*: a client with a dead worker is still
   * available, because `EngineClient` drops and rebuilds that on its own.
   */
  available: boolean;
  /** The client lifecycle, exactly as `EngineClient.status` reports it. */
  status: EngineStatus;
  /** The cause of an `error` status, or null. */
  error: Error | null;
  /**
   * A multi-line evaluation of a position. Rejects if the engine cannot answer.
   *
   * The background lane: it waits for a search already running and is waited on
   * in turn by a move. It joins an identical question that is already in flight
   * rather than queueing behind it, so asking for the evaluation of the position
   * on screen while it is being worked out costs nothing.
   */
  analyze(fen: string, opts?: { multiPv?: number; movetimeMs?: number }): Promise<Analysis>;
  /** The engine's move in a position, or null when it has none. The urgent lane. */
  bestMove(fen: string, movetimeMs: number): Promise<string | null>;
  setSkillLevel(n: number): void;
  newGame(): Promise<void>;
}

/** One `Worker`-free environment is a known, reportable failure rather than a
 * silent hang, and `worker-died` is the code that means exactly that. */
const NO_WORKERS = 'This browser cannot run Web Workers, so the engine cannot start';

/** Swallows a rejection from an entry point the UI already reports elsewhere. */
const ignore = (): void => {};

function unavailable(): Promise<never> {
  return Promise.reject(new EngineError('worker-died', 'Engine unavailable'));
}

/** The client, wrapped in the one policy its callers must not each decide. */
interface Door {
  analyze(fen: string, opts?: { multiPv?: number; movetimeMs?: number }): Promise<Analysis>;
  bestMove(fen: string, movetimeMs: number): Promise<string | null>;
  setSkillLevel(n: number): void;
  newGame(): Promise<void>;
}

/**
 * The client, wrapped in the one policy its callers must not each decide.
 *
 * The scheduling itself lives in `./searchQueue`, next to the measurements that
 * justify it. What is added here is the mapping from *who is asking* to *how
 * urgent this is*, which is a fact about the app rather than about engines — and
 * the one that needs stating: a reply or a new game outranks a background
 * evaluation, an evaluation never interrupts anything, and the replacement search
 * is posted by the queue after the aborted one has settled, never from here.
 */
function openDoor(client: EngineClient): Door {
  const source = makeEngineSource(client);
  const queue = createSearchQueue(() => client.interrupt());

  return {
    // **The advice channel runs at full strength, always.** `analyze` serves both
    // the eval bar and the hint, both are advice, and the spec's stated reason for
    // choosing Stockfish is that "weaker engines give advice that is sometimes
    // wrong, which is worse than no advice" (§3). `Skill Level` WAS reaching these
    // searches — UCI `setoption` is sticky, and `newGame()` was the only thing that
    // set it — so a learner on Beginner was told a position eight pawns up was
    // level. The level is now stated on the search, and this is the call that
    // supplies it.
    //
    // Said here as well as in `engineClient` because this is where the two channels
    // are told apart, and it is the one line a well-meaning edit is most likely to
    // break: `bestMove` two lines below deliberately does NOT do this.
    analyze: (fen, opts) =>
      queue.enqueue(() => source.analyze(fen, { ...opts, skillLevel: ADVICE_SKILL_LEVEL }), false),
    // `search` rather than `analyze`: the reply needs the `bestmove` line, and
    // `Analysis` deliberately models an evaluation, not a move.
    //
    // And the result is deliberately *not* reduced to a bare move string, because a
    // `stop` does not make the engine fall silent. Measured in Chromium against the
    // real WASM: a `stop` 200ms into a `go` is answered 23ms later with a **real**
    // bestmove (`bestmove d2d4 ponder g8f6`), chosen for the question the app has
    // already abandoned. Handing that back as `string | null` laundered an abandoned
    // answer into a playable move, and the only thing catching it was the position
    // check in another file — a cross-file coupling, untested, which is exactly the
    // kind that gets broken by a well-meaning edit. So an aborted search rejects
    // here with the same `code: 'aborted'` that `analyze` already throws.
    //
    // The two guards are deliberately redundant and neither is redundant *because*
    // of the other: `useGame` re-checks the position because a position can change
    // without any search being interrupted (a think-floor wait is not a search), and
    // the engine layer refuses the interrupted result because the position is not
    // the only thing that can invalidate an answer. Dropping either leaves a real
    // hole, so please do not helpfully collapse them into one.
    //
    // `skillLevel: client.playLevel` and nothing else. **This is the reply, and the
    // reply is the one search that is supposed to be handicapped** — it is the
    // opponent's own move, and the spec (§6.3) puts the effect of `Skill Level` on
    // the opponent's next move and nowhere else. Omitting it would be a
    // simplification that reads like the `analyze` line above, and it would trade
    // the advice channel being full strength for the opponent also being full
    // strength, which is a strictly worse version of the same mistake.
    bestMove: (fen, movetimeMs) =>
      queue.enqueue(async () => {
        const result = await client.search(fen, {
          movetimeMs,
          skillLevel: client.playLevel,
        });
        if (result.aborted) {
          throw new EngineError('aborted', 'Search interrupted by a newer request');
        }
        return result.bestMove;
      }, true),
    setSkillLevel: (n) => {
      // Never rejects in practice, and never needs to: a failure here is an
      // option the engine did not take, and the next `ucinewgame` re-sends it.
      // Deliberately outside the queue — `setoption` is read when the *next*
      // search starts, so posting it mid-search is safe and needs no lane.
      void client.setSkillLevel(n).catch(ignore);
    },
    newGame: () =>
      queue.enqueue(
        () =>
          client.newGame().catch((e: unknown) => {
            // `dispose` rejects a newGame in flight, and that is a normal unmount
            // rather than a failure to report.
            if (e instanceof EngineError && e.code === 'disposed') return;
            throw e;
          }),
        // Urgent, and not only for latency: `newGame` moves the client to `ready`,
        // so letting it land in the middle of a running search would have the
        // badge claim the engine is idle while it is thinking.
        true,
      ),
  };
}

export function useEngine(): EngineApi {
  const [client, setClient] = useState<EngineClient | null>(null);
  const [status, setStatus] = useState<EngineStatus>('idle');
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (typeof Worker === 'undefined') {
      setStatus('error');
      setError(new EngineError('worker-died', NO_WORKERS));
      return;
    }
    const created = new EngineClient();
    setClient(created);
    const off = created.onStatus((next) => {
      setStatus(next);
      // Cleared on the way out of `error` as well as set on the way in: a
      // recovered client nulls its own cause, so keeping it would put a stale
      // failure message next to a healthy badge.
      setError(next === 'error' ? created.error : null);
    });
    return () => {
      // Unsubscribe before disposing, so the dead client's terminal `idle` can
      // never overwrite the state of the one replacing it.
      off();
      created.dispose();
      setClient(null);
    };
  }, []);

  // The door is memoised on the client, so its queue, its analysis cache and its
  // same-position request map all belong to one client and are dropped with it.
  const door = useMemo(() => (client === null ? null : openDoor(client)), [client]);

  return useMemo<EngineApi>(
    () => ({
      available: client !== null,
      status,
      error,
      analyze: door === null ? unavailable : door.analyze,
      bestMove: door === null ? unavailable : door.bestMove,
      setSkillLevel: door === null ? ignore : door.setSkillLevel,
      newGame: door === null ? unavailable : door.newGame,
    }),
    [door, client, status, error],
  );
}
