// One request at a time, with a move ahead of a background question.
//
// This is the whole of the engine's scheduling policy, and it lives in its own
// module because it is not a React concern and because the two properties that
// matter are only testable away from a hook.
//
// **Why one at a time.** `EngineClient` answers one `go` at a time and rejects the
// older with `superseded`, but that is the smaller half of the problem: the engine
// does not *stop* the older search, it finishes it and only then reads the
// `position`/`go` posted meanwhile. A `go` posted before the previous search's
// `bestmove` has arrived **kills the 19-lite worker** — measured in Chromium against
// the real WASM with no app involved: `go 3000` then `go 1500` 200ms later dies, two
// `go`s 20ms apart die, `stop` then `go` 0ms later dies, and a strictly sequential
// pair (the second `go` 150ms after the first `bestmove`) is clean. So the rule is
// not "do not overlap searches", it is "never post a `go` before the previous
// `bestmove`", and only the caller can hold to it.
//
// **Why two lanes.** A move must not wait behind a 3s evaluation: with one lane, five
// learner moves took 10.99s of search time, and undo-then-replay paid a full extra
// search and think-floor for a reply nobody wanted. `abortInFlight` is the lever —
// it asks the running search to stop, which resolves it promptly with an empty
// result flagged `aborted` — and the replacement is started by `pump`, *after* that
// settle. Never from inside the abort, which is exactly the fatal `stop`-then-`go`
// shape above.

/** Asks whatever is running to stop. Called only for an urgent request. */
export type AbortInFlight = () => void;

export interface SearchQueue {
  /**
   * Run `task` when the engine is free.
   *
   * `urgent` puts it at the front of the queue and asks for the request in flight
   * to be abandoned, which is what keeps a move from queueing behind an
   * evaluation. A background request never interrupts anything.
   *
   * The returned promise is that task's own outcome, including a rejection: a
   * refused request is a rejected one, because a caller that asked for something
   * and did not get it has to hear about it.
   */
  enqueue<T>(task: () => Promise<T>, urgent: boolean): Promise<T>;
}

export function createSearchQueue(abortInFlight: AbortInFlight): SearchQueue {
  /** Requests not yet handed over, in the order they should start. */
  const waiting: Array<() => void> = [];
  let busy = false;

  const pump = (): void => {
    if (busy) return;
    const next = waiting.shift();
    // Nothing to start: a later `enqueue` comes back through this same door.
    if (next === undefined) return;
    busy = true;
    next();
  };

  const enqueue = <T,>(task: () => Promise<T>, urgent: boolean): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const slot = (): void => {
        // `Promise.resolve().then(task)`, and this is the load-bearing part of the
        // whole module: calling `task()` directly lets a task that throws
        // *synchronously* escape `slot`, escape `pump`, and be swallowed by the
        // Promise executor as that one caller's rejection — while `busy` stays true
        // forever. Every later request then queues behind a door that will never
        // open, and the board silently stops being playable with no error anywhere.
        // Going through a resolved promise turns any throw into a rejection this
        // chain can see, so the `.finally` below still releases the door.
        Promise.resolve()
          .then(task)
          .then(resolve, reject)
          .finally(() => {
            busy = false;
            pump();
          });
      };

      if (urgent) {
        // Not in a try of its own making: a throw from the abort hook would escape
        // into the executor exactly as a synchronous task throw does. A door that
        // wedges is worse than a missed abort, so the failure is contained here and
        // the request simply queues.
        try {
          abortInFlight();
        } catch {
          // The request in flight will be waited for instead.
        }
        waiting.unshift(slot);
      } else {
        waiting.push(slot);
      }
      pump();
    });

  return { enqueue };
}
