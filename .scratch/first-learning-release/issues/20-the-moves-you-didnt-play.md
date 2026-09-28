# What happens to the moves you didn't play?

Type: grilling
Status: resolved

## Question

*What is an exercise?* added, after resolution, that a learner should be able to explore the other
acceptable moves and their consequences after answering. The grading search already returns an
evaluation for **every legal move**, so part of this is free and part is not, and the ticket is
about where that line falls.

Decide: which alternatives are offered — every "also fine" move, the top few by evaluation, or the
ones that share the Concept; whether the learner sees an evaluation, a played-out line, or both;
whether exploring is available immediately after answering or only after the recovery step; whether
it is offered for a move that was *wrong* as well as one that was sound (the tempting-alternative
comparison the research asks for); and what a learner is meant to conclude from two consequences
that both look fine, given that a sound move is not a winning one.

The cost to weigh: evaluations are free, played lines are one serial search each against a
rate-limited key. The lesson to weigh: the research's "compare a tempting error" step is one of the
few things that teaches a *reason* rather than a fact, so this may be worth paying for deliberately
rather than by default.

The independence question is already settled and not re-opened here: the first attempt is recorded
before any alternative is shown, so exploring cannot make it Assisted.

## Answer

An exploration step, after the answer, showing what the other acceptable moves would have done.

**Evaluations are free; played lines are not.** The grading search already returns an evaluation for
**every legal move** (MultiPV returns them all), so showing "here is what else was available, and how
good each was" costs no extra search. Playing each out costs one serial search per alternative,
against a rate-limited key. **The default is evaluations; played lines are on request.**

**Which alternatives:** those sharing the Concept, then any move within the wide acceptance band
from [*How is an attempt graded?*](11-grading-an-attempt.md) — capped at a small number, because a
list of thirty-seven moves is not an explanation.

**Available for a wrong move as well as a sound one.** This is the expensive case and the valuable
one: comparing a tempting error against what was intended is one of the few things that teaches a
*reason* rather than a fact, which is the research's own recommendation.

**The learner should be able to conclude something.** Two consequences that both look fine teach the
distinction between *safe* and *good*, which is the concept the whole Standing vocabulary exists to
carry. The framing is comparative, never evaluative: "this also holds, and it does this instead".

**The independence question is settled and not re-opened.** The first attempt is recorded before any
alternative is shown, so exploring cannot make it Assisted and is not recorded as though it did.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
