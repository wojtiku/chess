// The learner record: the app's only evidence, in localStorage.
//
// Three record kinds, referencing each other by id:
//
//   Attempt      one try at one exercise, with the Fact pack it was given
//   ReviewItem   something to attempt again later, carrying a Concept
//   Game         a finished game, and its classification results
//
// The shape is the one fixed in .scratch/first-learning-release/spec.md, and the
// decisions behind it are in the same directory's tickets. Four of them are
// load-bearing enough to restate here, because they are the ones a later change
// would quietly undo:
//
//   1. EVERY attempt is kept in full, retries included. A fact pack is ~450
//      bytes, so 1,000 attempts is ~0.2MB against a ~5MB budget. The bound is
//      on attempt COUNT and not on size, because available localStorage is not
//      measurable portably and overflow is silent — a size-based policy fails
//      invisibly, which is the worst available failure for the only evidence
//      the app has. Oldest goes first. An unresolved review item goes last.
//
//   2. Version lives in the KEY, following the convention persistence.ts already
//      chose and already survived a schema removal with. A shape change means a
//      new key, and an old record is abandoned rather than migrated. Cheap now,
//      expensive later, and that trade is deliberate.
//
//   3. The Fact pack is stored with every attempt. Without it, a wrong
//      explanation cannot be traced: a reader looking at bad coaching cannot
//      tell whether the model invented something or was handed something false.
//      That is the single highest-value field in the schema.
//
//   4. Provenance is stored but never RENDERED. The Fact pack, the model, the
//      raw evaluations are for a third party auditing the app months later — not
//      for the learner's screen.
//
// `localStorage` in a module means the browser global, so this file is
// node-safe only because every access is inside a function that is called from
// a test with an injected store. Nothing here touches `window` at import time.

import type { AttemptOutcome } from './grading';
import type { EngineLine } from './grading';
import { toStoredFacts, type FactPack, type StoredFactPack } from './detectors';

export type AttemptOutcome_ = AttemptOutcome;

/** Where an attempt came from. A review attempt is Independent *and* distinct:
 *  without the distinction, "did it transfer" cannot be measured at all. */
export type AttemptKind = 'exercise' | 'review';

export interface StoredAttempt {
  id: string;
  kind: AttemptKind;
  /** Which exercise, or which review item. */
  exerciseId: string;
  conceptId: string;
  movePlayed: string;
  /** The moves that seed the Concept's accepted set. Never "the one answer". */
  targetSet: string[];
  outcome: AttemptOutcome;
  /** 1 for the first try. Everything after a shown consequence is assisted. */
  attemptNo: number;
  /** Independent iff attemptNo is 1. Recorded, never inferred. */
  assistance: 'independent' | 'assisted';
  /** The deepest rung of the help ladder that was reached. Stored on EVERY
   *  attempt, not only failures — the licensing research asks for it explicitly
   *  and it costs one field. */
  highestHintStage: number;
  attemptedAt: number;
  /** The evidence this attempt was given. Not shown to the learner. */
  factPack: StoredFactPack;
  /** Provenance for a later audit. Not shown to the learner. */
  provenance?: {
    model?: string;
    lineCount?: number;
    depth?: number;
  };
}

export interface StoredReviewItem {
  id: string;
  /**
   * Which exercise this item came from — the same field the Attempt carries, so
   * the two can be matched. It was missing from this type when the item was
   * first written, and the de-duplication that prevents queueing the same
   * mistake twice keyed on it: it compared `undefined === 'ex-1'`, never
   * matched, and every failure added another copy to the queue. A type that
   * omits a field the logic reads is worse than a wrong field, because the
   * compiler cannot see it.
   */
  exerciseId: string;
  /** `exercise` or `game`. */
  source: 'exercise' | 'game';
  /** The position, as a move list so it is replayable rather than a bare FEN.
   *  A FEN has no history, and a panel that needs captures is then wrong with
   *  no error — the Captured trap. */
  moveList: string[];
  startFen: string;
  conceptId: string;
  label: string;
  /** Ids of the attempts made against this item. */
  reattemptIds: string[];
  /** Never dropped while false: this is the thing the queue exists for. */
  resolved: boolean;
  createdAt: number;
}

export interface StoredGame {
  id: string;
  moveList: string[];
  startFen?: string;
  learnerSide: 'w' | 'b';
  /** The engine's lines per move, so the walk is never repeated. The in-memory
   *  cache does not survive a reload, so a re-walk would cost 31 searches. */
  classifications: Array<{ ply: number; lines: EngineLine[] }>;
  walkedAt: number;
}

export interface LearnerRecord {
  attempts: StoredAttempt[];
  reviewItems: StoredReviewItem[];
  games: StoredGame[];
  updatedAt: number;
}

/** An empty record. A fresh visitor gets this, not `null`. */
export function emptyRecord(): LearnerRecord {
  return { attempts: [], reviewItems: [], games: [], updatedAt: 0 };
}

export const RECORD_KEY = 'chess.record.v1';

/**
 * The attempt cap.
 *
 * A number rather than a byte budget, for the reason above: a byte budget needs
 * to know the size of what is already stored, which needs the store, and the
 * store can lie. 1,000 attempts is comfortably inside a 5MB budget with room
 * for review items and games, and it is a long time for one learner — a hundred
 * exercises at ten tries each.
 */
export const MAX_ATTEMPTS = 1000;

/** Id generation, injectable so tests are deterministic and so nothing here
 *  depends on a clock. Falls back to a counter rather than a random value, so
 *  two records created in the same millisecond cannot collide. */
export interface IdSource {
  (): string;
}

export function makeIdSource(prefix: string, start = 1): IdSource {
  let n = start;
  return () => `${prefix}-${n++}`;
}

function nextId(existing: readonly { id: string }[], prefix: string): string {
  const used = new Set(existing.map((r) => r.id));
  let n = 1;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Adds an attempt, applying the bound.
 *
 *  Oldest first, and an unresolved review item's attempts are exempt only from
 *  being *dropped* — the queue is where the learner returns, so the evidence
 *  that put it there is what makes it usable. */
export function appendAttempt(
  record: LearnerRecord,
  attempt: Omit<StoredAttempt, 'id'>,
): LearnerRecord {
  const id = nextId(record.attempts, 'a');
  // Reduced on the way in, not on the way out: the per-piece detail is
  // recomputable from the FEN in microseconds, and storing it costs 1.6KB per
  // attempt for nothing.
  const attempts = [...record.attempts, { ...attempt, factPack: toStoredFacts(attempt.factPack), id }];
  return { ...record, attempts: boundAttempts(attempts), updatedAt: attempt.attemptedAt };
}

/** Trims to the cap, oldest first, never dropping an attempt that failed.
 *
 *  Two rules, in this order, and the second is absolute:
 *
 *   1. An attempt that did NOT demonstrate its concept is kept. That is the
 *      evidence which put a mistake in the queue, and the queue is where the
 *      learner returns — dropping it is the one loss the record cannot afford.
 *   2. Everything else goes oldest first, until the cap is met.
 *
 *  A previous version computed this by slicing a filtered list and re-adding
 *  exemptions, which returned MORE attempts than the cap whenever an exemption
 *  was in the dropped region — the bound silently stopped being a bound. It is
 *  written as an explicit pass instead: walk from the newest backwards, keep
 *  what is exempt, and fill the remaining budget from the most recent of the
 *  rest. */
function boundAttempts(attempts: StoredAttempt[]): StoredAttempt[] {
  if (attempts.length <= MAX_ATTEMPTS) return attempts;

  // Newest first, so "the oldest go first" is expressed as "the tail is dropped".
  const newestFirst = [...attempts].reverse();

  // Pass 1: the exempt ones, newest first, up to the whole cap. A learner who
  // has failed this concept a thousand times is unusual, and the honest answer
  // then is the most recent thousand.
  const keep: StoredAttempt[] = [];
  for (const a of newestFirst) {
    if (keep.length >= MAX_ATTEMPTS) break;
    if (a.outcome !== 'demonstrating') keep.push(a);
  }

  // Pass 2: fill whatever is left from the newest of the rest, so the record
  // still describes the learner as they are now.
  for (const a of newestFirst) {
    if (keep.length >= MAX_ATTEMPTS) break;
    if (a.outcome === 'demonstrating') keep.push(a);
  }

  return keep.reverse();
}

/** A review item for a failed attempt, if it is not already queued.
 *
 *  Idempotent by (exerciseId, conceptId): the same mistake queued twice is one
 *  lesson, not two, and a queue with duplicates is a queue the learner cannot
 *  clear. */
export function queueReviewItem(
  record: LearnerRecord,
  input: { attempt: StoredAttempt; moveList: string[]; startFen: string; now: number },
): LearnerRecord {
  const { attempt } = input;
  const already = record.reviewItems.find(
    (r) => r.exerciseId === attempt.exerciseId && r.conceptId === attempt.conceptId,
  );
  if (already) {
    // Already queued: re-attempts are appended so progress against it is kept.
    if (already.resolved) {
      return {
        ...record,
        reviewItems: record.reviewItems.map((r) =>
          r.id === already.id ? { ...r, resolved: false, reattemptIds: [...r.reattemptIds, attempt.id] } : r,
        ),
        updatedAt: input.now,
      };
    }
    return {
      ...record,
      reviewItems: record.reviewItems.map((r) =>
        r.id === already.id && !r.reattemptIds.includes(attempt.id)
          ? { ...r, reattemptIds: [...r.reattemptIds, attempt.id] }
          : r,
      ),
      updatedAt: input.now,
    };
  }
  const item: StoredReviewItem = {
    id: nextId(record.reviewItems, 'r'),
    exerciseId: attempt.exerciseId,
    source: attempt.kind === 'review' ? 'exercise' : attempt.kind,
    moveList: input.moveList,
    startFen: input.startFen,
    conceptId: attempt.conceptId,
    label: attempt.outcome,
    reattemptIds: [attempt.id],
    resolved: false,
    createdAt: input.now,
  };
  return { ...record, reviewItems: [...record.reviewItems, item], updatedAt: input.now };
}

/** The per-concept tally, which is repetition and NOT transfer.
 *
 *  Named and commented because the temptation is to call this "mastery" and
 *  four exercises of one concept is four repetitions. A real transfer number
 *  needs a position the learner has not seen, which release 1 does not have —
 *  see .scratch/first-learning-release/issues/14-what-evidence-would-show-it-works.md. */
export interface ConceptTally {
  conceptId: string;
  attempts: number;
  /** Attempts that were unaided. */
  independent: number;
  /** Independent attempts that demonstrated the concept. */
  independentDemonstrating: number;
  /** Distinct exercises passed, which is the closest thing to breadth available. */
  exercisesPassed: string[];
}

export function tallyByConcept(record: LearnerRecord): ConceptTally[] {
  const byConcept = new Map<string, ConceptTally>();
  for (const a of record.attempts) {
    const t =
      byConcept.get(a.conceptId) ??
      { conceptId: a.conceptId, attempts: 0, independent: 0, independentDemonstrating: 0, exercisesPassed: [] };
    t.attempts++;
    if (a.assistance === 'independent') {
      t.independent++;
      if (a.outcome === 'demonstrating') t.independentDemonstrating++;
    }
    if (a.outcome === 'demonstrating' && !t.exercisesPassed.includes(a.exerciseId)) {
      t.exercisesPassed.push(a.exerciseId);
    }
    byConcept.set(a.conceptId, t);
  }
  return [...byConcept.values()];
}

/** The open queue, oldest first, because a queue a learner cannot finish is a
 *  queue they stop opening. */
export function openQueue(record: LearnerRecord): StoredReviewItem[] {
  return record.reviewItems.filter((r) => !r.resolved);
}

/** Everything a third party needs to audit the app's teaching, and nothing the
 *  learner sees. Fact packs, models, raw evaluations — provenance, not interface. */
export function auditBundle(record: LearnerRecord) {
  return {
    attempts: record.attempts.map((a) => ({
      conceptId: a.conceptId,
      movePlayed: a.movePlayed,
      outcome: a.outcome,
      assistance: a.assistance,
      highestHintStage: a.highestHintStage,
      attemptedAt: a.attemptedAt,
      provenance: a.provenance ?? null,
      factPack: a.factPack,
    })),
    reviewItems: record.reviewItems.map((r) => ({
      conceptId: r.conceptId,
      source: r.source,
      resolved: r.resolved,
      createdAt: r.createdAt,
    })),
  };
}
