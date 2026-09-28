# What does the learner record store?

Type: grilling
Status: resolved
Blocked by: 10, 11

## Question

Decide the shape of the versioned local record: what it holds, how it is keyed, how it migrates,
and what it deliberately does not hold. Two consumers must be served — the learner's own progress,
and a third party who might review it later, which is the only provenance this project will ever
have.

Also decide retention: completed games and their positions are needed for review, and localStorage
is small. What is kept, what is summarised, and what is dropped first when space runs out.

## Comments

## Answer

### Sized first, because "keep everything" should be checked rather than asserted

One attempt carrying its fact pack serialises to **166 bytes**. 1,000 attempts, plus review items and
game records, is **0.21MB** against a ~5MB budget. 10,000 would be 4.5MB and eviction becomes
likely. So [*How is an attempt graded?*](11-grading-an-attempt.md)'s "keep everything" is affordable
— but the bound has to be on **attempt count, not size**, because there is no portable way to measure
available localStorage, and overflow is silent. A size-based policy would fail invisibly, which is the
worst available failure for the app's only evidence.

### The decisions

**Q1 — separate records referencing each other by id.** An Attempt can become a Review item; a Review
item can have many re-attempts. Not a flat list, which cannot answer "did this concept stick" — the
question [*What would show the first release teaches?*](14-what-evidence-would-show-it-works.md)
exists to ask. Not an event log: localStorage is mutable, so append-only is one bug from being a lie,
and the app has no use for history it cannot show.

**Q2 — version in the key, following the convention already in the codebase.** `chess.record.v1`, and a
shape change means a new key. This is not a new decision: `persistence.ts:21` already chose it, and
the codebase has already survived a real schema removal with it — the `theme` field is now simply not
read, so an old save still loads instead of being invalidated. Reads stay field-by-field tolerant.

The cost, stated plainly: **an old record is abandoned, not migrated.** Cheap now, expensive later,
and worth knowing before the first shape change rather than after.

**Q3 — bounded by attempt count, dropping the oldest first; unresolved review items are never
dropped.** This bounds 11's "keep everything" rather than contradicting it. Oldest goes first,
because the newest attempts describe the learner as they are now. An unresolved review item is the
one thing the queue exists for, and it is the last thing to go. Not bounded on size — see the
measurement above.

**Q4 — one record serving both readers.** 08 already made this choice when it decided to store the
fact pack with each coach sentence: that exists so a wrong explanation is *attributable*, and a
reviewer can only tell whether the model invented something or was handed something false if the same
record holds both. The cost, recorded: **the learner's own view must never surface internal fields**
— the fact pack, the model, the raw evaluations. They are provenance, not interface.

**Q5 — finished games live in the same record, with their classification results.** Not re-derived on
demand: [`What is a review item?`](10-what-is-a-review-item.md) established that the analysis cache
does not survive a reload, so a re-walk costs 31 searches at ~1.6 minutes. Storing the result is the
whole point of deciding to walk a game once. One record also means one place to lose.

### The shape

> **Amended by [*What would show the first release teaches?*](14-what-evidence-would-show-it-works.md):**
> `attemptedAt` is now part of the Attempt. Retention is the research's core finding, and a spacing
> heuristic cannot be evaluated by an app that never recorded when anything happened. The field is
> cheap now and unrecoverable later.

```
Attempt      exercise | concept | movePlayed | targetSet | outcome
             (demonstrating | fine | failed) | attemptNo | assistance
             (independent iff attemptNo 1) | highestHintStage | attemptedAt | factPack
ReviewItem   id | source (exercise | game) | position (by move list) | concept
             | label | reattemptIds[]          -- never dropped while unresolved
Game         id | moveList | startFen | learnerSide | classifications[] | walkedAt
```
Provenance fields (model, ordering, raw evaluations) are stored but never rendered to the learner.

**One constraint inherited and worth restating:** analysis is computed once and stored, never
recomputed on demand. The in-memory cache does not survive a reload, so anything the record does not
hold is gone until the learner plays the position again.
