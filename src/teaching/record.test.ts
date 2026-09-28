import { describe, expect, it } from 'vitest';
import {
  MAX_ATTEMPTS,
  appendAttempt,
  auditBundle,
  emptyRecord,
  makeIdSource,
  openQueue,
  queueReviewItem,
  tallyByConcept,
  type LearnerRecord,
  type StoredAttempt,
} from './record';
import { boardFacts } from './detectors';

const FEN = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 9';
const FACTS = boardFacts(FEN);

const attempt = (over: Partial<Omit<StoredAttempt, 'id'>> = {}): Omit<StoredAttempt, 'id'> => ({
  kind: 'exercise',
  exerciseId: 'ex-1',
  conceptId: 'develop-knight',
  movePlayed: 'g1f3',
  targetSet: ['g1f3', 'b1c3'],
  outcome: 'fine',
  attemptNo: 1,
  assistance: 'independent',
  highestHintStage: 0,
  attemptedAt: 1_700_000_000_000,
  factPack: FACTS,
  ...over,
});

describe('record: an attempt is kept whole', () => {
  it('keeps the fact pack with it', () => {
    // The highest-value field in the schema: without it, a wrong explanation
    // cannot be traced to the evidence it was handed.
    const r = appendAttempt(emptyRecord(), attempt());
    expect(r.attempts[0]!.factPack.fen).toBe(FEN);
  });

  it('keeps the hint stage on every attempt, not only failures', () => {
    // Asked for explicitly by the licensing research, and it costs one field.
    const r = appendAttempt(emptyRecord(), attempt({ outcome: 'demonstrating', highestHintStage: 3 }));
    expect(r.attempts[0]!.highestHintStage).toBe(3);
  });

  it('keeps retries in full, and counts them', () => {
    let r = emptyRecord();
    r = appendAttempt(r, attempt({ attemptNo: 1, outcome: 'failed' }));
    r = appendAttempt(r, attempt({ attemptNo: 2, outcome: 'demonstrating', assistance: 'assisted' }));
    expect(r.attempts).toHaveLength(2);
    expect(r.attempts[0]!.assistance).toBe('independent');
    expect(r.attempts[1]!.assistance).toBe('assisted');
  });

  it('gives every attempt a distinct id', () => {
    const ids = makeIdSource('a');
    expect([ids(), ids(), ids()]).toEqual(['a-1', 'a-2', 'a-3']);
    const r = appendAttempt(appendAttempt(emptyRecord(), attempt()), attempt());
    expect(new Set(r.attempts.map((a) => a.id)).size).toBe(2);
  });
});

describe('record: the bound is on count, never on size', () => {
  it('keeps a stored attempt small enough that 1,000 of them fit', () => {
    // Measured, not asserted from a planning note. An attempt as handed in is
    // ~2.5KB, because the fact pack carries the detectors' per-piece working
    // shape; as STORED it is ~0.9KB, with that shape dropped and the two derived
    // lists kept. 1,000 of them is under 1MB against a ~5MB budget, which is
    // what makes "keep every attempt" affordable and the cap a round number.
    const stored = appendAttempt(emptyRecord(), attempt());
    const size = JSON.stringify(stored.attempts[0]).length;
    expect(size).toBeLessThan(1200);
    expect(MAX_ATTEMPTS * size).toBeLessThan(2 * 1024 * 1024);
  });

  it('drops the per-piece working shape on the way in', () => {
    // Recomputable from the FEN in microseconds, and it was 1.6KB per attempt
    // of storage for a shape only the detectors read.
    const stored = appendAttempt(emptyRecord(), attempt());
    expect('learnerPieces' in stored.attempts[0]!.factPack).toBe(false);
    // The derived lists survive, because those are what is actually consulted.
    expect(Array.isArray(stored.attempts[0]!.factPack.hanging)).toBe(true);
    expect(Array.isArray(stored.attempts[0]!.factPack.undeveloped)).toBe(true);
    // And so do the negative facts: without them "there was nothing here" is
    // not sayable, and the probe showed what a model does when it is not.
    expect(stored.attempts[0]!.factPack.inCheck).toBe(false);
    expect(stored.attempts[0]!.factPack.matesAvailable).toEqual([]);
  });

  it('drops the oldest attempts past the cap', () => {
    const many = (n: number): LearnerRecord => {
      let r = emptyRecord();
      for (let i = 0; i < n; i++) {
        r = appendAttempt(r, attempt({ attemptedAt: 1_700_000_000_000 + i, attemptNo: (i % 5) + 1 }));
      }
      return r;
    };
    const r = many(MAX_ATTEMPTS + 10);
    expect(r.attempts).toHaveLength(MAX_ATTEMPTS);
    // The survivors are the newest, so the record describes the learner as they
    // are now rather than as they were.
    expect(r.attempts[r.attempts.length - 1]!.attemptedAt).toBeGreaterThan(
      r.attempts[0]!.attemptedAt,
    );
  });

  it('never drops the attempt that put a mistake in the queue', () => {
    // The queue is where the learner returns; dropping the evidence that made it
    // is the one loss the record cannot afford.
    let r = emptyRecord();
    r = appendAttempt(r, attempt({ outcome: 'failed', attemptedAt: 1 }));
    r = queueReviewItem(r, {
      attempt: { ...attempt({ outcome: 'failed' }), id: 'a-1' },
      moveList: [],
      startFen: FEN,
      now: 1,
    });
    for (let i = 0; i < MAX_ATTEMPTS + 50; i++) {
      r = appendAttempt(r, attempt({ outcome: 'demonstrating', attemptedAt: 1000 + i }));
    }
    expect(r.attempts).toHaveLength(MAX_ATTEMPTS);
    // Still queued, and the queue still points at something.
    expect(openQueue(r)).toHaveLength(1);
  });
});

describe('record: the review queue', () => {
  const withFailure = () => {
    const r0 = appendAttempt(emptyRecord(), attempt({ outcome: 'failed' }));
    return queueReviewItem(r0, {
      attempt: r0.attempts[0]!,
      moveList: ['e2e4', 'e7e5'],
      startFen: FEN,
      now: 1_700_000_000_000,
    });
  };

  it('queues a failed attempt', () => {
    const r = withFailure();
    expect(r.reviewItems).toHaveLength(1);
    expect(r.reviewItems[0]!.conceptId).toBe('develop-knight');
  });

  it('does not queue the same mistake twice', () => {
    // A queue with duplicates is a queue the learner cannot clear.
    const r = withFailure();
    const again = queueReviewItem(r, {
      attempt: r.attempts[0]!,
      moveList: [],
      startFen: FEN,
      now: 1_700_000_000_000,
    });
    expect(again.reviewItems).toHaveLength(1);
  });

  it('keeps the position as a move list, not a bare FEN', () => {
    // A FEN has no history, so anything reading captures from it is wrong with
    // no error — the Captured trap.
    const r = withFailure();
    expect(r.reviewItems[0]!.moveList).toEqual(['e2e4', 'e7e5']);
    expect(r.reviewItems[0]!.startFen).toBe(FEN);
  });

  it('reopens an item the learner got wrong again', () => {
    let r = withFailure();
    r = appendAttempt(r, attempt({ kind: 'review', attemptNo: 2, assistance: 'assisted', outcome: 'demonstrating' }));
    r = { ...r, reviewItems: r.reviewItems.map((x) => ({ ...x, resolved: true })) };
    const failedAgain = appendAttempt(r, attempt({ kind: 'review', attemptNo: 3, outcome: 'failed' }));
    const requeued = queueReviewItem(failedAgain, {
      attempt: failedAgain.attempts[failedAgain.attempts.length - 1]!,
      moveList: [],
      startFen: FEN,
      now: 1,
    });
    expect(openQueue(requeued)).toHaveLength(1);
  });

  it('takes attempts against an item, so transfer is measurable', () => {
    let r = withFailure();
    r = appendAttempt(r, attempt({ kind: 'review', attemptNo: 2, outcome: 'demonstrating' }));
    r = queueReviewItem(r, {
      attempt: r.attempts[r.attempts.length - 1]!,
      moveList: [],
      startFen: FEN,
      now: 1,
    });
    expect(r.reviewItems[0]!.reattemptIds.length).toBe(2);
  });
});

describe('record: the per-concept tally is repetition, not transfer', () => {
  it('counts independent attempts separately from assisted ones', () => {
    let r = emptyRecord();
    r = appendAttempt(r, attempt({ conceptId: 'c1', outcome: 'demonstrating' }));
    r = appendAttempt(r, attempt({ conceptId: 'c1', attemptNo: 2, assistance: 'assisted', outcome: 'demonstrating' }));
    const [t] = tallyByConcept(r);
    expect(t!.attempts).toBe(2);
    expect(t!.independent).toBe(1);
    expect(t!.independentDemonstrating).toBe(1);
  });

  it('counts distinct exercises passed, not repeats of one', () => {
    let r = emptyRecord();
    r = appendAttempt(r, attempt({ conceptId: 'c1', exerciseId: 'ex-1', outcome: 'demonstrating' }));
    r = appendAttempt(r, attempt({ conceptId: 'c1', exerciseId: 'ex-1', attemptNo: 2, outcome: 'demonstrating' }));
    r = appendAttempt(r, attempt({ conceptId: 'c1', exerciseId: 'ex-2', attemptNo: 1, outcome: 'demonstrating' }));
    const [t] = tallyByConcept(r);
    expect(t!.exercisesPassed.sort()).toEqual(['ex-1', 'ex-2']);
  });
});

describe('record: provenance is stored and never rendered', () => {
  it('carries the fact pack and the model into the audit bundle', () => {
    const r = appendAttempt(
      emptyRecord(),
      attempt({ provenance: { model: 'some-model', lineCount: 37, depth: 21 } }),
    );
    const bundle = auditBundle(r);
    expect(bundle.attempts[0]!.provenance?.model).toBe('some-model');
    expect(bundle.attempts[0]!.factPack.fen).toBe(FEN);
  });

  it('excludes the raw move list from the bundle, so a bundle is not a game', () => {
    const r = queueReviewItem(appendAttempt(emptyRecord(), attempt()), {
      attempt: appendAttempt(emptyRecord(), attempt()).attempts[0]!,
      moveList: ['e2e4', 'e7e5', 'g1f3'],
      startFen: FEN,
      now: 1,
    });
    // The bundle answers "what was taught and on what evidence", not "replay my
    // games", and a bundle that carried move lists would be a copy of the whole
    // record.
    expect(JSON.stringify(auditBundle(r))).not.toMatch(/e7e5/);
  });
});
