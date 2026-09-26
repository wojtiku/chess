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

import { useEffect, useMemo, useRef, useState } from 'react';
import { EngineClient, EngineError, type EngineStatus } from '../engine/engineClient';
import { makeEngineSource, type Analysis } from '../analysis/evaluate';

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
 * One `go` outstanding at a time, with a move ahead of an evaluation.
 *
 * This is not politeness towards the engine, and it is not the `superseded`
 * bookkeeping `EngineClient` already does. Superseding rejects the older
 * *promise*; it does not stop the older *search*. The engine finishes what it was
 * doing and only then reads the `position` and `go` that were posted in the
 * meantime — and against the real 19-lite WASM build in Chromium, a second `go`
 * posted into a running search **kills the worker**: measured during this task,
 * a fourth ply killed it with `Engine worker error` and the opponent's reply went
 * with it, leaving the board on Black's turn with nothing able to move.
 *
 * So the invariant is not "one answer at a time" but "one search in flight", and
 * only the caller can keep it: the client answers one question at a time, and three
 * callers in this app ask it things.
 *
 * Two lanes rather than one queue, because a 3s evaluation must not stand between
 * the learner and the opponent's move. A move goes to the front, so it starts as
 * soon as the current search ends; an evaluation waits its turn. Nothing is
 * cancelled — the running search cannot be — so a move that arrives during one
 * waits for it, and that wait is bounded by the budget of the search in flight.
 */
function openDoor(client: EngineClient): Door {
  const source = makeEngineSource(client);
  /** Requests not yet handed to the client, oldest first within a lane. */
  const waiting: Array<() => void> = [];
  let busy = false;

  const pump = (): void => {
    if (busy) return;
    const next = waiting.shift();
    // Nothing to start: a later `enqueue` comes through this same door.
    if (next === undefined) return;
    busy = true;
    next();
  };

  const enqueue = <T,>(task: () => Promise<T>, urgent: boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const slot = (): void => {
        task().then(resolve, reject).finally(() => {
          busy = false;
          pump();
        });
      };
      if (urgent) waiting.unshift(slot);
      else waiting.push(slot);
      pump();
    });

  return {
    analyze: (fen, opts) => enqueue(() => source.analyze(fen, opts), false),
    // `search` rather than `analyze`: the reply needs the `bestmove` line, and
    // `Analysis` deliberately models an evaluation, not a move.
    bestMove: (fen, movetimeMs) => enqueue(async () => (await client.search(fen, { movetimeMs })).bestMove, true),
    setSkillLevel: (n) => {
      // Never rejects in practice, and never needs to: a failure here is an
      // option the engine did not take, and the next `ucinewgame` re-sends it.
      // Deliberately outside the queue — `setoption` is read when the *next*
      // search starts, so posting it mid-search is safe and needs no lane.
      void client.setSkillLevel(n).catch(ignore);
    },
    newGame: () =>
      enqueue(
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
