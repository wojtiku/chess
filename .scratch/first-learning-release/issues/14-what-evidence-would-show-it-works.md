# What would show the first release teaches?

Type: grilling
Status: resolved
Blocked by: 11

## Question

Decide what evidence would count as the first release working, given one pilot who cannot play
chess and no expert to judge the content.

The research holds that puzzle completion, time spent and streaks measure engagement, not
learning, and that the meaningful measures are independent performance on an unseen related
position, delayed return, and fewer repeated errors in unaided play. Decide which of those this
release can actually measure, what the threshold is, and what would count as evidence that the
teaching is *misleading* rather than merely ineffective — which is the failure this project's
missing reviewer makes most likely.

Be explicit about what this cannot show. A single self-taught learner cannot establish that the
app improves anyone's rating, and the spec should not imply otherwise.

## Comments

## Answer

### What the record can and cannot measure, checked first

The record's shape was fixed in [*What does the learner record store?*](12-the-learner-record.md), so
the options here should not assume signals that don't exist.

**Measurable today, no new fields:** first-attempt accuracy; hint depth on first attempts; and
re-attempt after having seen it — the same concept, same item, an independent attempt, a different
outcome. The third is transfer-*shaped* and is already there.

**Not measurable today:** retention over time, because **the record has no timestamps**; transfer to
an unseen position, because no cross-exercise counter exists; and fewer errors in unaided play, which
needs games rather than exercises.

The research's definition of learning is signals 4 and 5, and **both were blocked on decisions
nobody had made.** This ticket is the decision to unblock them.

### The decisions

**Q1 — timestamp every attempt.** One field, written on every attempt. Cheap now, and the cost of not
having it later is unrecoverable: history cannot be reconstructed. The research is explicit that
spacing intervals are *a product heuristic to evaluate, not a research-derived optimum* — and a
heuristic cannot be evaluated by an app that never recorded when anything happened. This changes the
record shape in 12, and 12 is amended accordingly.

**Q2 — transfer is unmeasurable in release 1, and the spec says so.** The research's endpoint is a
*new* position on a seen concept, and that is blocked on
[*Where do exercise positions come from?*](19-where-do-positions-come-from.md). We build a per-concept
tally anyway — attempts, first-attempt Demonstrating rate, distinct exercises passed — because it is
nearly free once timestamps exist.

**That tally must be labelled as repetition, not transfer.** Four exercises of one concept is four
repetitions, and calling it transfer is exactly the category error this map exists to prevent. So the
tally is a *trend worth watching*, explicitly not a transfer measurement, and 19 graduating is what
unblocks the real thing.

**Q3 — a threshold, framed honestly as a smoke test.** First-attempt Demonstrating rate on the early
topics, unaided, sustained across a couple of sessions; plus the sanity check that a short game can be
completed without assistance. "Ship and see" is what a project does when it cannot measure — and we
can measure this, just not much.

**The spec must say what the number is:** a smoke test showing the loop runs and the concepts are
reachable, **not evidence that anyone learned anything.** "First-attempt accuracy 80%" must never read
as a claim about a rating, because with one self-taught pilot it cannot be one.

**Q4 — the strongest signal is free, and it is the most important answer here.** A concept where the
learner succeeds on the exercise *and still makes the mistake in a real game*. That is a direct,
unarguable measure of teaching not transferring, and **it needs no new data** — it already lives in the
record as one concept succeeding in an exercise and failing in a game, which is the two sources
[*What is a review item?*](10-what-is-a-review-item.md) unified.

A validator rejection is necessary but thin: a bug count, not a measure of misleading. Whether a
staged position actually demonstrates its concept is real and lands on 19.

**Q5 — one pilot, with the record built so a third party could audit it.** Release 1 is the developer
alone. Recruiting others is the named follow-up the map already records, and the auditability is a
*design* requirement flowing from 03's provenance checklist. It costs nothing now: the fields are
already there.

### What this settles about the destination

The destination asked for a spec for a first learning release, with the coach's chess coming from
engine evidence. That much is now decided and the loop is closed end to end: fact pack → exercise →
attempt graded three ways → review item → re-attempt as a distinct Independent type → Curator ranks →
record. **What release 1 cannot show is whether it teaches.** That is stated here rather than left
implicit, because a single self-taught pilot who cannot play chess is exactly the setup where a
confident-sounding metric would be believed by accident.

The honest summary for the spec: **release 1 can show the loop runs, the concepts are reachable, and
teaching is not contradicted by play. It cannot show that anyone's rating improves, and must not
imply it.**
