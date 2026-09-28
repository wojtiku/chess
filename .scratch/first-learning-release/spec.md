# Spec: the first learning release

Status: build-ready. Destination of [the map](../map.md), resolved ticket by ticket.

## What this is

A learning loop for one absolute beginner, on their own device, alone. Learn one idea → try it with
graduated help → use it in a game → revisit it later.

The organising constraint: **nobody who can adjudicate chess is available to this project.** The
author does not play chess and wants to learn. The first learner is the author. So no sentence shown
to a learner may assert something about a position that the code has not established.

## Architecture

Five layers, and the boundary between them is the whole design.

| Layer | Job | Owns |
| --- | --- | --- |
| **Rules** | legality | `chess.js`, unchanged |
| **Evidence** | what is true of this position | `chess.js` + Stockfish; ~3ms |
| **Teaching** | which Concept applies | Detectors; a Concept is a function from a position to a Fact, or nothing |
| **Policy** | what the learner is told, and how much | the Coaching module; graduated help; Standing |
| **Presentation** | words | the model, under the learner's own key |

The model **phrases and never decides**. See
[ADR-0001](../../docs/adr/0001-the-coach-phrases-it-does-not-decide.md).

## Core vocabulary

Full glossary: [`CONTEXT.md`](../../CONTEXT.md). The four that carry the most weight:

- **Concept** — not a label. A function from a position to a Fact. If it does not fire, the word is
  unavailable however apt it seems.
- **Fact** — machine-verified, including negative facts. Names its owner: "White's knight on d5 is
  attacked", never "your knight".
- **Standing** — moves carry Standing, not verdicts. **Recommended** (engine's choice) and
  **Also fine** (within tolerance) are different answers.
- **Attempt** — Independent or Assisted. A revealed move is assisted practice, **never** independent
  success. This is the app's main measure.

## Behaviour

### Entry: quickstart, then exercises, then a game

~10 minutes of board actions verified by `chess.js` — moves, capturing, check, castling, promotion,
and the idea of defending. No engine, no key, not skippable. Then one-decision exercises, White only,
from *defending* onward. Free play unlocks **after the first few exercises**, not after the
quickstart: a first game against a full-strength engine destroys what the lesson established.

**No diagnostic.** Ten redundant minutes cost less than a false skip, and order is what the
curriculum is actually for.

### An exercise

One decision. No opponent of its own. Graded on two independent axes:

- **Sound** — within tolerance of the best available move.
- **Demonstrating** — the Concept's Detector fired.

Outcome is one of three: **Demonstrating** (success) · **Fine** (sound, and *the better move is shown
anyway*, because the goal is making the best moves visible) · **Failed**.

A wrong move is **played, not refused** — the engine's full-strength reply is shown as its
**Consequence**, because a refused move teaches nothing about why the alternative was better. Then a
**recovery step**: another attempt first, the correct move on request or after a second failure.

Grading is **one search**: MultiPV returns an evaluation for every legal move, so the learner's move
is ranked against all alternatives with no `searchmoves` extension and **no key**.

### After answering

The learner can explore the other acceptable moves. Their evaluations are already in hand from the
grading search, so this is free; played lines cost a serial search each and are on request.

### Review

Failed exercise attempts, plus mistake and blunder moves from finished games, selected by
`classification.ts` (already written, tested, unwired). An item carries **a position (the evidence)
and a Concept (the job)**. Re-attempts are Independent *and a distinct attempt type* — without that
distinction, transfer is unmeasurable.

A game is walked **once**, after it ends, and stored. 31 searches, not 60, because the position after
move *n* is the position before move *n+1*. Never recomputed on demand: the analysis cache does not
survive a reload.

A **Curator** ranks candidates when there is a key. It reorders and never adds or removes — the
engine's band floors — so its failure is a bad ordering, not a missing lesson.

## The provider

Swappable, and not planned around. The key is stored locally and **never leaves the browser**. What
leaves the device is the position and the fact pack, disclosed *before* the key field. Cost is shown
in **token counts, not dollars** — the app measures its own usage exactly and cannot verify a price.

Failure taxonomy, measured: 400 invalid key and 403 no key are **fatal, never retried**. 429 and 503
are **transient** — and a 429 is *not* session-ending, because quota recovers within about a minute.
Timeout is **20s, not 10s**: a 10s cutoff discards roughly half the calls that would have succeeded.
**On failure the Facts are shown anyway** — a learner told "you're out of quota" has learned nothing
about the piece they asked about.

A position-keyed prose cache lives on the author's PHP hosting. It holds **no keys and no learner
records**. It is not a key broker.

## Data

```
Attempt      exercise | concept | movePlayed | targetSet | outcome
             (demonstrating | fine | failed) | attemptNo | assistance
             (independent iff attemptNo 1) | highestHintStage | attemptedAt | factPack
ReviewItem   id | source | position (by move list) | concept | label | reattemptIds[]
Game         id | moveList | startFen | learnerSide | classifications[] | walkedAt
```

Version in the key (`chess.record.v1`), following the convention already in `persistence.ts`. Reads
field-by-field tolerant; a dropped field is not read rather than invalidating the record. **Old
records are abandoned, not migrated** — cheap now, expensive later.

Bounded by **attempt count**, not size: ~166 bytes per attempt, so 1,000 is 0.21MB of ~5MB, but
available space is not measurable portably and overflow is silent. Oldest goes first; an unresolved
review item is the last thing dropped.

Provenance fields — fact pack, model, raw evaluations — are stored but **never rendered to the
learner**.

## Changes to the existing app

From [the inventory](issues/04-inventory-of-changes.md) and
[generalise-or-parallel](issues/07-generalise-or-parallel.md):

1. **A start position and a learner side in `GameSnapshot`.** `replay()` is the only function that
   knows where a game starts, and `newGame()` is called in two places. One field, threaded through
   two functions. The move list stays authoritative.
2. **Undo parity becomes computed.** It is currently the largest *even* ply count
   (`gameState.ts:163`), which is a property of learner-as-White; for Black it flips to odd. The
   property test at `gameState.test.ts:338` is already written as *"never leaves the board waiting on
   the opponent"* and merely checked in White terms — it generalises with the reducer. **This is the
   change most likely to break something.**
3. **Promotion artwork becomes colour-aware.** It draws White unconditionally today.
4. **`Captured`'s precondition becomes enforced.** It renders *correctly* for a FEN-loaded game: the
   material number is right and both capture lists are empty — a wrong answer with no error.
5. **Board gains arbitrary square highlighting and arrow styling** — a "this is where it went" arrow
   and a "this is where it could go" arrow are currently identical.
6. **A new Coaching module** owning the fact pack, the Detectors, the hint ladder, and validation.
7. **A validator with its own test suite** — it is a prerequisite, not a follow-up.

## Build order

Each step is verifiable on its own. Nothing later depends on an unverifiable earlier step.

1. **Detectors + fact pack + validator**, with the validator's own tests. The foundation, and the
   thing that fails silently if wrong. *Start here — and 05, the coaching prototype, is the first
   concrete case.*
2. **Start position + learner side** in the game model, undo parity, promotion artwork, `Captured`.
3. **Quickstart** — board actions verified by `chess.js`. Needs nothing above it, so it could go
   earlier if you want something visible fast.
4. **Exercise runner** — one decision, two grades, consequence, recovery step.
5. **Attempt + review + record**, with timestamps.
6. **Coach call** — key, disclosure, failure taxonomy, Facts-shown-anyway.
7. **Cache server** — last, because it is a convenience and it is the piece with security surface.
8. **Curator** — only if a key exists.

## What release 1 cannot show

Stated here so the spec cannot be read as claiming more than it does.

It **can** show: the loop runs, the concepts are reachable, and teaching is not contradicted by play.
The strongest signal it has is free — a concept passed on an exercise and still failed in a real game.

It **cannot** show that anyone's rating improves, and nothing in the app may imply it. Transfer to an
unseen position is **unmeasurable in release 1** and the per-concept tally is repetition, not transfer.
The release gate is a **smoke test** — first-attempt Demonstrating rate, unaided, across a couple of
sessions — and the spec says so in those words.

## Accepted risks

- **The evidence layer is not reviewed by a chess player.** Tests prove a fact has not *changed* and
  that we meant what we wrote. They cannot prove it is *true*. The pedagogy lives in the shape of the
  interaction for this reason, not in the wording.
- **Two Detector bugs were found by accident** while writing this spec — a wrong `chess.js` API that
  made every piece look undefended, and a home-square table written for one colour. Both produced
  confident, correct-sounding wrong teaching. This is why step 1 is tests-first.
- **Positions are mined, not authored, and the staging test encodes judgement** (checks 3 and 4) that
  is unverified. First thing likely to be wrong.
- **The Curator is a model, not a reviewer.** Nothing may imply a human signed off on the teaching.
- **Stockfish ships unmodified, and staying that way is a licence decision.** The engine is not
  swappable; the model provider is.
