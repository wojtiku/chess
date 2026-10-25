# Chess Practice Board — domain glossary

The vocabulary this project uses when it talks about teaching chess. One context; no
implementation detail here. Decisions with consequences live in
[`.scratch/`](../.scratch/) and `docs/adr/`.

## The learner

The person using the app to learn chess independently, whether an adult or a child.
The learning experience serves one learner at a time, without requiring a teacher.

## Coach

The advisory voice the learner can ask for help from. The Coach **explains and never decides**: it
does not choose what move is good, what concept applies, or when the learner has succeeded. Those
are settled before it speaks. It also does not move pieces for the learner — a move the learner
did not choose is not theirs.

## Decision

A settled question about a position: which moves are good, which is best, whether a tactic
exists, whether a piece is at risk. A Decision rests on trusted source evidence or verification,
never on the Coach's explanatory wording.

## Fact

A statement about the current position supported by trusted source evidence or verification. A Fact is the only
thing a Claim is allowed to rest on. Facts include **negative** facts — "no piece of yours is
under attack" is a Fact, and must be as available as "your knight is under attack", or anything
asked about a threat will have one invented to explain it.

A Fact names its owner. "White's knight on d5 is attacked" is a Fact; "your knight is attacked"
is a Claim about the reader, and the distinction exists because perspective — whose piece it is,
whose turn it is — is the most common thing a model gets confidently wrong.

## Detector

Something that establishes a specific Fact from a position. A Detector is exact rather than a
judgment or estimate; it is not the only possible source of evidence for a teaching Concept.

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

Trusted source motif tags may identify a Concept in an Exercise; a bespoke Detector is not
required for every Concept. Naming a Concept does not justify unsupported claims about the
position or determine whether a move completes the task.

## Exercise

A preset position with a stated task in which the learner plays one move or a continuation
against prepared replies. It is complete when the learner achieves its defined teaching endpoint,
not necessarily after the first correct move or at the end of a game.

## Objective

What the learner is asked to achieve in an Exercise. A move can be good chess without satisfying
the Objective, and different verified moves may satisfy the same Objective.

## Teaching endpoint

The point at which the learner has demonstrated what an Exercise asks, such as completing a fork's
capture or delivering checkmate. It bounds the task without requiring unrelated play afterwards.

## Consequence

The demonstrated result of a wrong move, offered on request when a verified refutation is available.
Seeing a Consequence is explanatory assistance, not a compulsory opponent reply or a penalty.

## Recovery step

The learner's choice after a mistake: retry the current decision, request available help, reveal
the solution, or leave for another Exercise. A retry preserves the correct prefix of a continuation.

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

## Attempt

A try at an Exercise with its mistake and assistance history. First-try completion without help,
unassisted completion after mistakes, and assisted completion are distinct; retrying does not erase
earlier mistakes, and replay after reveal is assisted practice.

## Hint stage

One of a finite set of attention-guiding clues for the current decision. Hint stages may name
relevant pieces or relationships, but do not prescribe a move; solution reveal is not a hint stage.

## Solution reveal

An explicit request to see the remaining solution step by step at the learner's pace.
It is separate from hints and never counts as independent success.

## Quickstart

The previous learning module's opening sequence for practicing legal moves, captures, and check.
It is not a mandatory gate for the replacement learning experience.

## Diagnostic

A check used in the previous learning plan to route the learner to a starting point, rather than
to teach or grade. The replacement learning experience does not require one before practice.

## Starting level

The learner's editable self-description of their chess experience, remembered across visits.
It is distinct from an ability estimate inferred from practice.

## Recommended practice

Practice in which the app chooses what to offer next, rather than staying within a topic selected
by the learner.

## Skipped exercise

An Exercise the learner leaves by requesting another before completion. Skipping is neither success
nor a wrong-move attempt, and does not by itself show inability.

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
