# How is an attempt graded, and what counts as independent success?

Type: grilling
Status: resolved
Blocked by: 06

## Question

The research's central measurement commitment is that a revealed move is assisted practice, not
independent success. Decide what gets recorded and what the thresholds are.

In scope: what makes a move correct (exact, within a tolerance, or demonstrating the concept);
what counts as *assisted* — a hint seen, a hint requested, a move revealed and played; whether
first-attempt correctness is recorded separately from eventual success; and what a *successful
attempt* means when several moves were reasonable.

The trap to avoid: the engine's best move is not the lesson's target. "Sound alternative" and
"demonstrates today's idea" are different claims and the record must not confuse them.

## Comments

## Answer

### The measurement that shaped this: tolerance is a safety rule, not a grader

Before deciding anything, measured what `GOOD_ENOUGH_CP = 50` actually does as a grader, by asking
the engine for **every** legal move's evaluation (MultiPV returns them all — see
[*What is an exercise?*](06-what-is-an-exercise.md)) and counting what falls inside the band:

| position | legal moves | within 20cp | within 50cp | within 100cp |
| --- | --- | --- | --- | --- |
| Italian midgame | 37 | 5 (14%) | **15 (41%)** | 21 (57%) |
| Scholar's mate | 31 | 4 (13%) | **5 (16%)** | 18 (58%) |
| Open Sicilian | 43 | 3 (7%) | **17 (40%)** | 24 (56%) |

**On a quiet position, ~40% of every legal move is "also fine."** A beginner tapping any plausible
move lands in that band most of the time, so a grader saying "fine" to two moves in five is not
grading. The mate position is the outlier, and in the *good* direction — 5 of 31 — because one move
swings the evaluation discontinuously. **The tolerance rule discriminates precisely when the
position is decisive and fails when it is quiet, which is backwards from what a beginner needs.**

It is sound as a *safety* claim. That is a different job with a different number.

### The decisions

**Q1 — three outcomes, and "fine" is one of them.** Not pass/fail. The learner is told their move was
**fine**, and the better move is **shown anyway** — the point being to make the best moves visible,
not to withhold praise or manufacture a failure. So the vocabulary is:

- **Demonstrating** — fired the Concept's Detector. Success.
- **Fine** — sound, within tolerance, but did not demonstrate. A real result, and worth saying so.
- **Failed** — outside tolerance, or it hung material.

A move can be Fine and the learner still learns something real, and telling them "that's fine, and
here's the move that does the idea" teaches the difference between the two, which is the thing a
beginner most needs to see and least often gets to see.

**Q2 — two numbers, two jobs.** The collision found while measuring: `GOOD_ENOUGH_CP = 50` in
`src/analysis/hints.ts` means "good enough to accept" and `MISTAKE_CP = 50` in
`src/game/classification.ts` means "an error worth naming". **The same number, opposite meanings, in
two files.** Separating them is a latent-bug fix independent of this ticket:

- a **narrow safety band** — did this move give anything away (material, mate, a capture available);
- a **wide acceptance band** — is this move sound, for the purposes of "Fine" versus "Failed".

The exact values are an implementation detail; what is decided is that they are two numbers, named
for their jobs, and that neither is used as the sole test for passing.

**Q3 — three outcomes, and only one of them is success.** Independent success means
**Independent + Demonstrating**. A safe move found by accident teaches nothing about the Concept, and
the research is explicit that the meaningful measure is independent performance *on the idea*. But
Independent + Fine is recorded as its own outcome, because a beginner who held a position with no
tactic available *has* learned something, and grading that as a failure would make the app feel like
it marks on a coin flip.

**Q4 — keep everything, and the reason is worth correcting.** The challenge to my framing was right:
I cited a licensing floor as though it were a ceiling. The licensing research requires the fact pack
to be stored with each coach sentence and the highest hint stage on *every* attempt — that is a
**minimum**, not a cap, and keeping more than the minimum is always permitted.

The real constraint was checked rather than assumed: **a serialised fact pack is ~450 bytes**, so
1,000 attempts in full is 443KB against a ~5MB budget. Keeping everything is comfortably affordable,
and it is what we want — the exercises may be repeated later, and a record that only kept the first
attempt would be useless for that.

Recorded: **every attempt is kept in full**, including retries, with the fact pack, the hint stage
reached, the move played, and the outcome. No collapsing to a count. Storage growth is a real
constraint but not one that binds at release 1's volume, and
[*What does the learner record store?*](12-the-learner-record.md) will set the actual bound.

**Q5 — the Concept's Detector decides; the target move seeds it.** Demonstrating means the Detector
fired, not "played the target". A target move whose only role is to *seed the Detector's accepted
set* is the honest reading of "accepted alternatives": if a Concept has several good moves, they all
demonstrate it, and collapsing Demonstrating into Sound whenever that happens would throw away
exactly the distinction this ticket exists to draw.

**What this hands to the record.** The attempt row is: exercise, Concept, move played, the target set
that seeded the Detector, outcome (**Demonstrating** / **Fine** / **Failed**), attempt number,
Assistance level (Independent iff attempt 1, per [*What is an exercise?*](06-what-is-an-exercise.md)),
highest hint stage reached, and the fact pack. The concept is fixed: assistance is recorded, never
inferred, so a wrong explanation can always be traced to the evidence it was given.
