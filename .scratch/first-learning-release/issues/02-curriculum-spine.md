# What is the curriculum, concretely?

Type: research
Status: resolved

## Question

A published human curriculum is the spec for what to teach and in what order. Which one, what is
its actual topic sequence, and how much of it can this app supply evidence for?

Produce: the ordered topic list with citations; for each topic, what a learner can demonstrably do
at that stage; which topics our detector vocabulary (see *What may the coach assert?*) can supply
evidence for and which need something that does not exist yet; and what licensing permits us to
use as a reference rather than a source.

Pay attention to Steps Method levels 1–2, the ChessKid curriculum map, and Lichess practice and
study as interaction precedents. Record edition and source, because these sites move.

## Comments

## Answer

**Spine: Steps Method Step 1 + Step 2, 28 topics, in the publisher's own lesson order.**
[Full findings](../../../../docs/research/2026-09-27-curriculum-spine.md).

Not because it is the best curriculum — no comparative study was found, so nobody can support
that — but because it is the only one of the four candidates that orders *defending* (S1.5) and
*profitable exchange* (S1.10) before the composite ideas, and the only one publishing a numbered
lesson sequence rather than a catalogue. ChessKid teaches checkmate at beginner-lesson 8 but
reaches "hanging pieces" only at 18: it teaches mating before it teaches losing a piece, which is
backwards for a detector-first architecture where attacked/defended/undefended are prerequisites.

**Evidenceability: 27 of 28 topics are machine-evidenceable, 1 is not.**

- 12 class A — a Fact already exists, or chess.js enforces it
- 8 class B — exactly computable, detector not yet written
- 6 split (A/B or B/C) — of which two mating-pattern lessons are A/C
- 1 delivery format (solving tests, mixed exercises)
- 1 class D — **the three golden rules, which cannot be checked and should not be a graded topic**

**The residual chess-review risk is 5 topics** (13, 16, 18, 24, 27) that need an authored answer
policy. Four are flagged as highest-risk, and the pattern is the same in each: the *fact* is
exactly computable, and it is the *concept name* that is not. "There is a pin" is a boolean;
"this is the rook roller" is not. Same shape as the probe's invented pin.

**Draws are excluded from assertable claims in release 1.** Insufficient material is a rulebook
judgement, not a computable fact, so "this is a draw" must never be said.

Publisher effectiveness claims across all sources are marketing, not evidence — including Steps'
own "practice has shown that this approach works perfectly" and its single-pupil rating. Treated
as positioning throughout.

*First-party facts (read 26 Sep 2026):* all Steps lesson lists and editions (Manual S1 14th ed.
2025, Manual S2 13th ed. 2026, workbooks), the "postpones mate" statement, ChessKid's 7 levels /
173 lessons / 1,236 topics, the Lichess practice catalogue (32 exercises) and Learn stage order,
and the Lichess Learn assertion vocabulary in `ui/learn/src/assert.ts`.

*Judgement, not fact:* the choice of Steps; the four evidence classes and the classification of
all 28 topics; the tally; dropping the golden rules; the risk ranking.
