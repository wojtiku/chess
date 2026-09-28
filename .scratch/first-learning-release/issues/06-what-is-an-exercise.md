# What is an exercise, and who replies to the learner?

Type: grilling
Status: resolved

## Question

An exercise is a position where the learner must choose a move. Several things follow that need
deciding, and they pull against each other:

- One target move, a set of accepted moves, or a concept with many acceptable answers?
- Does the exercise continue for several moves, or stop at the first choice?
- Who replies? A scripted reply keeps the teaching moment intact but needs content we cannot
  author. The engine replies for free but is a weak, unpredictable teacher and a poor opponent for
  a beginner.
- What happens on a wrong answer: refuse and retry, refuse and reveal, or accept it as a move and
  show where it led?
- Can the learner play either colour, and does the board flip?

## Comments

## Answer

### Verified first, and it dissolved half the ticket's framing

The ticket assumed a scripted reply "needs content we cannot author." It does not.

- **The engine *is* the scripted reply.** In an exercise the learner is on one side, so the opponent
  is side-to-move and the engine's `bestmove` *is* the reply. No `searchmoves` extension needed —
  which matters, because the licensing research made patching the engine a licence decision.
- **MultiPV returns every legal move.** Measured: MultiPV 40 on a position with 31 legal moves
  returned 31 distinct lines, each with its own evaluation. Positions in real exercises reach 37.
  So the app can rank the learner's chosen move against *all* alternatives in **one** search, and
  grade instantly, offline, with no key. This is what makes the keyless path viable.
- **Cost, recorded because it constrains the design:** the search queue is serial, so a wide search
  occupies the engine. Grading needs one wide search from the position *before* the learner's move.
  The consequence demo needs a second, cheap search (MultiPV 1, ~1.5s) from *after* it. The correct-
  answer path pays only the first, so the common case is one search.

### The decisions

**Q1 — the answer is a set, not a target.** An exercise carries a target move *and* accepted
alternatives, ranked by the same tolerance rule as hints (ADR-0001), and grades two things
separately:

- **Sound** — is the move within tolerance of the best available? (`Recommended` / `Also fine`)
- **Demonstrating** — does it fire the lesson's Concept detector?

A move can be sound without demonstrating the idea, and that gap is exactly what the research warns
gets blurred. Recording both is the point. A single target move would make every exercise a riddle
with one door and teach the engine's taste; a bare "any move that wins material" is unauditable,
because a detector that fuzzy is how the probe's pin got invented.

**Q2 — a wrong move is played, not refused. And it is followed by a recovery step, which the ticket
as written had no room for and the developer caught.** A learner who sees only "that was wrong" learns
that they failed, not what the right move was — so after the consequence the learner gets **another
attempt first, and the correct move on request or after the second failure.** Retry before reveal
because retrieval beats recognition, and bounded because a stuck learner otherwise flails.

The grading consequence is exact and it is the app's main measure: **the first attempt is the
Independent one**; anything after a consequence has been shown is Assisted, however it turns out.
A successful retry is a real attempt worth keeping and is not independent success. This is the
distinction `CONTEXT.md` already insists on, and this is where it is actually earned.

Interaction design of the recovery step — what it looks like, where it sits in the ladder — belongs
to [*the coaching interaction*](05-the-coaching-interaction.md), not here.

**Q3 — one decision per exercise in release 1; a short line is a named follow-up.** Not because it
is easier, but because a single decision is what the curriculum's topic-at-a-time shape wants, and it
keeps grading to one lookup. The developer added the condition that makes this honest, and it
became its own ticket: **the position must be staged so the single move is a learning point.** An
unstaged position with one correct answer teaches pattern-matching, not understanding. See
[*Where do exercise positions come from?*](19-where-do-positions-come-from.md).

Endgame goals stay out: "hold the draw" needs a grading method that does not exist, and the
curriculum research already ruled "this is a draw" unassertable.

**Q4 — the engine plays at full strength, and it is the consequence, not the teacher.** Taken as
stated. Worth being precise about why this converges with the alternative: because Q3 makes each
exercise a single decision, the opponent only ever exists on the wrong-answer path. So "full-strength
opponent" and "no opponent in the exercise" describe the same build — the engine is the *consequence*,
shown only after a wrong move, and only to demonstrate it. They diverge when multi-ply arrives: then
the engine plays every ply, and the question becomes whether it is a real opponent or a scripted
line. That divergence is the endgame-goals fog item.

**Q5 — learner is White in release 1, but the exercise model carries a learner side from day one.**
The field is cheap now and expensive to retrofit, and it is not a second hardcoded assumption in a
codebase that already has three. Ultimately a setting; explicitly not in release 1. This answer
feeds [*the inventory*](04-inventory-of-changes.md) and
[*generalise or parallel*](07-generalise-or-parallel.md), which are both about precisely this.

## Addendum — added after resolution

The developer raised a gap in Q1's answer, and it is recorded here rather than silently folded in,
because it changes the Exercise and is a decision of its own.

**After answering, the learner should be able to explore the other acceptable moves and their
consequences.** "Several okay moves are possible" should not end at "yours was one of them" — the
interesting part is what the *others* would have done, and the grading search already paid for it.

**Why this is nearly free, and what it is not.** The MultiPV-every-legal-move result from the
answer means the *evaluations* of every alternative are already in hand, so showing "here is what
else was available, and how good each was" costs no extra search. Showing each one's *consequence* —
actually playing it out — costs one search per alternative, and that is a real cost against a serial
queue and a rate-limited key. Which of the two a learner gets is the open question, tracked in
[*What happens to the moves you didn't play?*](20-the-moves-you-didnt-play.md).

**One thing this does not disturb.** Exploration happens *after* the answer, so the first attempt —
the Independent one — is already recorded before the learner sees any alternative. Exploring cannot
retroactively make an attempt assisted, and must not be recorded as though it did.

