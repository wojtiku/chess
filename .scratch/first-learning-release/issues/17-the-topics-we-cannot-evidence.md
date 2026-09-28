# What do we do with the topics we cannot evidence?

Type: grilling
Status: resolved
Blocked by: 01

## Question

The curriculum research found 28 topics, of which 27 are machine-evidenceable and 1 — the three
golden rules — is not, and 5 more carry a residual risk that needs an authored answer policy:
mating patterns, the second queen double attack, the intermediate move, activity of pieces, and
profitable exchange.

The pattern in every one of them is the same: the underlying fact is exactly computable, and it is
the concept *name* that is not. "There is a checkmate here" is a fact. "This is the rook roller"
is a label. The probe produced exactly this failure — inventing a pin that did not exist.

Decide: whether these topics ship with the label dropped (teach the fact, never the name), ship
deferred, or ship with some other treatment. Draws are already excluded — insufficient material is
a rulebook judgement, so "this is a draw" must never be an assertable claim.

## Answer

The pattern in every one of these is the same: **the underlying fact is exactly computable, and the
concept name is not.** "There is a checkmate here" is a Fact. "This is the rook roller" is not. The
probe produced exactly this failure — inventing a pin that did not exist.

**Teach the Fact, withhold the name.** For the five topics carrying residual risk (mating patterns
13 and 24, the second queen double attack 18, the intermediate move 27, activity of pieces 16,
profitable exchange 10):

- The exercise is **graded on the Fact** — the mate, the discovered attack, the material.
- The **name is never used** in learner-facing text, because a confident label attached to a correct
  fact is what teaches the wrong thing.
- If a name is genuinely needed to explain something, it is used as a *pointer to the Fact*, not as
  an assertion about the position.

**The three golden rules are not graded topics at all.** They cannot be checked, and Steps presents
them as reminders rather than as things a learner demonstrates. They may appear as prose; they may not
be something an exercise tests.

**Draws are excluded outright.** Insufficient material is a rulebook judgement, not a computable
fact, so "this is a draw" is never an assertable Claim in release 1. This is a permanent exclusion,
not a gap awaiting a detector.

**Profitable exchange (10) is a special case.** It looks like arithmetic and is not — Lichess itself
teaches a simplified rule while its scoring code uses a different table, which is a sign the
simplification is a teaching device. It may be taught **as the rule and only as the rule**, with the
approximation stated rather than hidden.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
