# The coach phrases; it does not decide

> Partially superseded for the replacement preset-exercise module by
> [What makes a preset exercise safe and useful to publish?](../../.scratch/learning-overhaul/issues/03-content-trust.md).
> Trusted Lichess motif tags may name concepts without bespoke detectors, and prepared source-backed
> teaching is permitted. The core module requires no live AI. The original runtime Coach policy
> remains historical context; explanatory prose still does not decide chess correctness.

A language model writes the coach's sentences. It never decides anything about the position.
Every fact is computed from the position, every concept is a detector that fires or does not, and
a validator checks the model's sentences before a learner sees them. Recorded as
[ADR-0001](../../.scratch/first-learning-release/issues/01-what-may-the-coach-assert.md).

## Context

No one on this project can adjudicate chess. The developer does not play chess and wants to
learn it; the first learner is the developer. So the app cannot have a human check the teaching
content before shipping it, and cannot fall back on a human when a claim turns out to be wrong.

## Decision

**A Concept is not a label, it is a function from a position to a Fact or to nothing.** "Undefended
piece" is not a word the app is permitted to use; it is a detector. If it does not fire, the word
is unavailable. This is the core of the decision — it converts a vocabulary question into a
testable one.

The rest follows from it:

- **The fact pack is computed, and it is the whole of what may be discussed.** Evidence is tiered by
  the learner's question, so a misrouted question yields less evidence, and therefore *less speech* —
  the one failure mode this architecture is built to tolerate.
- **Moves carry standing, not verdicts.** "Recommended" and "also fine" are different labels,
  distinguished by a centipawn tolerance against the engine's best. The engine's best move is not
  the lesson's target, and a position may have several reasonable moves.
- **Pieces are named by owner, not by relation to the reader.** The largest observed failure was
  perspective, not chess: told it was Black to move, the model advised the White learner using
  "your knight". Every fact line names the owner.
- **When nothing supports what we want to say, land on the nearest supported Fact.** Never invent.
  Say plainly that there is no forced tactic. Silence is available but reads as a bug; going to
  get more evidence is right offline and wrong inside a 15-second call.
- **A Concept may be named when its detector fires. A plan may never be called right.** Naming is a
  Fact; asserting that an intention is correct is not, and does not ship.
- **Claims about the learner's habits carry the count, not the conclusion.** "You have left a piece
  undefended three times in your last six games" is a Fact. "You have a habit of overlooking
  undefended pieces" is a Claim with no Fact under it, and does not ship.
- **The fact layer is tested like the rest of the repository, and its tests are a spec
  deliverable rather than a follow-up.** Unit tests per detector, plus golden fixtures diffed on
  every change.

## Consequences

The honest limit, which the spec must state rather than gloss: our tests cannot prove a chess fact
is *true*. They prove it has not *changed*, and that we meant what we wrote. That is weaker than a
qualified reviewer's, and no amount of engineering closes the gap. It is why the pedagogy lives in
the shape of the interaction — attempt before reveal, graduated help, accepted alternatives — and
not in the wording.

The same gap is why two concrete claims are banned outright in release 1: **"this is a draw"**
(insufficient material is a rulebook judgement, not a computable fact) and the **names** of mating
patterns (the mate is a fact; "this is the rook roller" is not).

Two bugs found while resolving this are the reason the testing rule is not optional. A wrong
`chess.js` API made every piece look undefended, and a home-square table written for one colour
reported no undeveloped pieces for the other — in every opening. Both would have shipped, and
models wrote confident teaching from both. A detector bug does not announce itself; it produces
fluent, plausible, wrong sentences. The evidence layer is not a component of the tutor. It is the
tutor.
