# Chess Practice Board — domain glossary

The vocabulary this project uses when it talks about teaching chess. One context; no
implementation detail here. Decisions with consequences live in
[`.scratch/`](../.scratch/) and `docs/adr/`.

## The learner

The person using the app to learn chess. In the first release this is one adult learning alone,
on their own device, with no teacher. The app is designed for that learner and is not assumed to
have a second one.

## Coach

The advisory voice the learner can ask for help from. The Coach **explains and never decides**: it
does not choose what move is good, what concept applies, or when the learner has succeeded. Those
are settled before it speaks. It also does not move pieces for the learner — a move the learner
did not choose is not theirs.

## Decision

A settled question about a position: which moves are good, which is best, whether a tactic
exists, whether a piece is at risk. Every Decision is established by the engine or by detection,
never by the Coach.

## Fact

A statement about the current position that the app has verified and can show. A Fact is the only
thing a Claim is allowed to rest on. Facts include **negative** facts — "no piece of yours is
under attack" is a Fact, and must be as available as "your knight is under attack", or anything
asked about a threat will have one invented to explain it.

A Fact names its owner. "White's knight on d5 is attacked" is a Fact; "your knight is attacked"
is a Claim about the reader, and the distinction exists because perspective — whose piece it is,
whose turn it is — is the most common thing a model gets confidently wrong.

## Detector

The thing that turns a position into a Fact. Every Fact comes from a Detector, and nothing else may
make one. A Detector is exact or it is a bug: there is no room for a judgement, an estimate, or a
sense of what a position probably means.

## Fact pack

The complete set of Facts available for one position, handed to the Coach together with the
engine's verdict. It is the whole of what may be talked about. Anything not in it may not be
mentioned.

## Claim

A sentence the Coach says that asserts something about the position. Every Claim must be
supported by a Fact. A Claim can be true to the board and still mislead — naming the best move as
the only move, or a tactic as a plan — and no amount of checking catches that. Which is why the
teaching lives in the shape of the interaction rather than in the wording.

## Concept

A named chess idea a learner is meant to acquire — an undefended piece, a fork, development, king
safety.

A Concept is **not a label**. It is a function from a position to a Fact, or to nothing. The app
may say "undefended piece" only when the Detector for it has fired; otherwise the word is
unavailable, however apt it seems. This is what makes the teaching auditable: a Claim is wrong only
if a Fact is wrong or missing, and Facts are testable.

Not every Concept survives this. Some are exactly computable while their name is a judgement —
"There is a checkmate here" is a Fact, "this is the rook roller" is not. Such Concepts may have
their Fact taught and their name withheld. Some are not computable at all, and are not taught as
graded topics: "this is a draw" is a rulebook judgement, not a fact.

## Exercise

A position where the learner must choose a move, and be told whether it demonstrated the Concept.

An Exercise is a **single decision**. It does not continue into a game, and it has no opponent of
its own. It is graded on two independent axes, and a move can score well on one and badly on the
other:

- **Sound** — the move is within tolerance of the best available (see **Standing**).
- **Demonstrating** — the move fired the Concept's Detector.

A wrong move is **played, not refused**, and the opponent's best reply is shown as its consequence.
A refused move teaches nothing about why the alternative was better. But being shown a consequence is
Assistance: the first attempt is the Independent one, and nothing after it can be.

## Consequence

What actually happens after a wrong move: the move is played and the strongest available reply is
shown. The Consequence is the teaching. It is deliberately not a penalty and not a game — the
learner sees where the move led, then gets another attempt before the correct move is revealed.

## Recovery step

The step between a wrong move's Consequence and the end of the Exercise: another attempt first, the
correct move on request or after a second failure. Retry before reveal, because being made to
retrieve the move teaches more than being shown it — and bounded, because a stuck learner otherwise
keeps guessing. The highest rung reached is recorded with the Attempt.

## Standing

What the engine says about a move, as distinct from what the lesson wants. **Recommended** is the
engine's choice. **Also fine** is any move within the stated tolerance of it. They are different
answers, and the engine's recommendation is not the lesson's target: a position may have several
reasonable moves, and a move can be sound without demonstrating the Concept being taught.

## Presentation

Turning Decisions and Facts into words a beginner can act on. The only part of coaching that is
delegated, and the only part that can be replaced without changing what is taught.

## Lesson

A unit of instruction with one observable objective: after it, the learner can do one thing they
could not do before. A lesson is not a position; it may contain several.

## Exercise

A position where the learner must choose a move, and be told whether it demonstrated the Concept.
The unit of practice.

## Attempt

One try at an Exercise, together with the assistance it received. Every Attempt is one of:

- **Independent** — made with nothing but the position shown.
- **Assisted** — made after a hint was seen or requested, or after the move was revealed.

An Attempt the learner got right after being shown the move is a real Attempt and worth recording,
but it is **assisted practice, never independent success**. This distinction is the app's main
measure and must not be blurred for convenience.

## Hint stage

One rung of the help ladder: a question, then a principle, then a board clue, then a comparison of
candidates, then the reveal. Deeper rungs give more. The highest rung used is part of the Attempt.

## Quickstart

The mandatory opening sequence that takes a learner from nothing to making legal moves, capturing,
giving and escaping check. Short, verified rather than explained, and not skippable.

## Diagnostic

A short check, after the Quickstart, that decides where the learner starts. It routes; it does not
teach, and it does not grade.

## Review item

Something the learner is asked to attempt again later: a position they got wrong, or one they
asked about. A review item is a position and a Concept, never a verdict on the learner.

## Curator

The component that decides which Review items are worth the learner's attention now, by ranking
them. It is a language model, and it is **not** a qualified reviewer.

The distinction is not pedantry. A qualified reviewer is a person who can adjudicate chess; no such
person is available to this project, and nothing in the app may imply otherwise. A Curator cannot
judge whether a move was good — the engine already did that, from Facts. It only *orders* graded
candidates by how much they teach, and it never adds or removes one: the engine's band decides what
is eligible, so a Curator's failure is a poor ordering rather than a lesson that never appears.

A Curator needs the learner's provider key. Without one it does not work.

## Opponent

Whatever replies to the learner — the engine in free play, a reply in an exercise. The first
learner's first session is deliberately not a game, because a beginner who loses immediately
learns about themselves rather than about chess.
