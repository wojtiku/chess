// The queue's own contract, away from React. Two of these are the whole reason the
// module exists: a door that wedges on a synchronous throw, and an urgent request
// that must reach the front *and* be allowed to abandon what is running.
import { describe, expect, it, vi } from 'vitest';
import { createSearchQueue } from './searchQueue';

describe('createSearchQueue', () => {
  it('runs one request at a time, in order', async () => {
    const queue = createSearchQueue(() => undefined);
    const events: string[] = [];
    let inFlight = 0;
    let peak = 0;

    const task = (name: string) => async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      events.push(`${name}:start`);
      await new Promise((r) => setTimeout(r, 5));
      events.push(`${name}:end`);
      inFlight -= 1;
      return name;
    };

    const [a, b, c] = await Promise.all([
      queue.enqueue(task('a'), false),
      queue.enqueue(task('b'), false),
      queue.enqueue(task('c'), false),
    ]);

    expect([a, b, c]).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end']);
    expect(peak).toBe(1);
  });

  it('a task that throws synchronously does not wedge the door', async () => {
    // The bug this guards: a synchronous throw escapes `slot` and `pump`, the
    // Promise executor swallows it as one caller's rejection, and `busy` stays true
    // for the rest of the session. Everything after the throw then queues behind a
    // door that never opens.
    const queue = createSearchQueue(() => undefined);
    const landmine = vi.fn(() => {
      throw new Error('threw before returning a promise');
    });

    const wedged = queue.enqueue(landmine as () => Promise<string>, false);
    const after = queue.enqueue(() => Promise.resolve('still here'), false);

    await expect(wedged).rejects.toThrow('threw before returning a promise');
    await expect(after).resolves.toBe('still here');
    expect(landmine).toHaveBeenCalledTimes(1);
  });

  it('an abort hook that throws does not wedge the door either', async () => {
    const queue = createSearchQueue(() => {
      throw new Error('the abort hook is broken');
    });
    const task = () => Promise.resolve('ran');

    await expect(queue.enqueue(task, true)).resolves.toBe('ran');
  });

  it('an urgent request asks for the running one to be abandoned', async () => {
    const aborts: number[] = [];
    const queue = createSearchQueue(() => aborts.push(1));
    let release = (): void => {};
    // A task signals when it has actually started, because the queue hands it over
    // on a microtask (see the `Promise.resolve().then(task)` note in the module), so
    // releasing before that would wait on a promise nothing has been handed yet.
    let running!: () => void;
    const started = new Promise<void>((resolve) => {
      running = resolve;
    });

    const slow = queue.enqueue(
      () => new Promise<string>((resolve) => {
        release = () => resolve('slow');
        running();
      }),
      false,
    );
    await started;
    const urgent = queue.enqueue(() => Promise.resolve('urgent'), true);

    // The abort is asked for on the way in, not after the slow one finishes.
    expect(aborts).toHaveLength(1);
    release();
    await expect(slow).resolves.toBe('slow');
    await expect(urgent).resolves.toBe('urgent');
  });

  it('an urgent request goes before a background one already queued', async () => {
    const queue = createSearchQueue(() => undefined);
    const order: string[] = [];
    let release = (): void => {};
    let running!: () => void;
    const started = new Promise<void>((resolve) => {
      running = resolve;
    });
    const blocked = queue.enqueue(
      () => new Promise<string>((resolve) => {
        release = () => {
          order.push('blocked');
          resolve('blocked');
        };
        running();
      }),
      false,
    );
    await started;
    const background = queue.enqueue(async () => {
      order.push('background');
      return 'background';
    }, false);
    const urgent = queue.enqueue(async () => {
      order.push('urgent');
      return 'urgent';
    }, true);

    release();
    await Promise.all([blocked, background, urgent]);

    expect(order).toEqual(['blocked', 'urgent', 'background']);
  });

  it('a background request interrupts nothing', async () => {
    const aborts: number[] = [];
    const queue = createSearchQueue(() => aborts.push(1));
    await queue.enqueue(() => Promise.resolve('first'), false);
    await queue.enqueue(() => Promise.resolve('second'), false);

    expect(aborts).toEqual([]);
  });
});
