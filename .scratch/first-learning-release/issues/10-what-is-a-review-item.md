# What is a review item, and where does it come from?

Type: grilling
Status: resolved

## Question

The research's loop ends with "revisit a mistake". Decide what a review item *is*, and what may
become one in this release.

Sources to weigh: exercise failures, positions the learner asked about in Coach mode, and
mistakes in their own finished free-play games. The last is the research's Stage 2 and the most
expensive — the largest evaluation drop is not necessarily the most teachable moment, and with no
qualified reviewer there is no way to tell.

Also decide what a review item points at: the exact position and decision, a concept, or both.
And whether reviewing an item re-attempts it or just shows it.

## Comments

## Answer

### The cost, measured first, because it decides what is feasible

Classifying a move needs an evaluation before and after it, and the engine reports a score for the
side to move, which flips across a move (`classification.ts:13`, FRAME CONTRACT). Naively that is
2N searches; for a 30-move game at a 3s budget on the serial queue, **three minutes**.

It is about half that, for free: **the position after move n is the position before move n+1**, so a
single sequential walk needs N+1 searches — 31 for a 30-move game, ~1.6 minutes. And each MultiPV
line already contains the following position, so a one-ply preview costs nothing further.

**The analysis cache does not help across sessions.** `AnalysisCache` is in-memory with a 500-entry
LRU (`src/analysis/cache.ts:18`), and the source is rebuilt per client, so it is lost on reload.
Re-reviewing yesterday's game re-runs every search — which is why a game is reviewed **once, at the
end, and the result stored**.

### The decisions

**Q1 — every failed attempt, plus mistakes and blunders from finished games.** Both sources, selected
by `classification.ts`, which is already written, tested, and unwired and is precisely the selector
this needs. Its mistake and blunder bands (50cp, 100cp) are the floor.

The research's warning is accepted rather than solved: "the largest error" is not necessarily the most
teachable moment, and **with no reviewer there is no way to know.** So release 1 does not claim to
pick the most teachable moment. It picks a defensible band and says so. Restating that limitation in
the spec is cheaper than a selection rule that pretends to more judgement than exists.

**Q2 — a review item points at both a position and a Concept.** The Concept is the *job*; the position
is the *evidence*. This resolves a tension the research raises directly: recalling the same diagram
is not evidence of transfer, so a review item must carry the idea to test — and the stored position is
what lets a later pass distinguish re-memorisation from re-learning. With positions alone, 14 cannot
tell them apart at all.

**Q3 — re-attempt the same position, with the previous move hidden.** A real test, and cheap: the
position is stored, so re-running it costs one search. The research's true endpoint is a *different*
position testing the same Concept, and that is recorded as the destination — it is out of reach until
[*Where do exercise positions come from?*](19-where-do-positions-come-from.md) settles the position
bank, and claiming otherwise would be a promise the app cannot keep.

**Q4 — a review attempt is Independent, and recorded as a distinct attempt type.** Neither "yes"
alone nor "no" survives contact with the map's own measure: if review attempts are indistinguishable
from first exposures, then "did it transfer" cannot be measured at all, which is the one thing
[*What would show the first release teaches?*](14-what-evidence-would-show-it-works.md) exists to
find. A distinct type costs one field and is the only way the app can later say "unaided twice"
versus "right first time".

**Q5 — after the game ends, once, with progress, and stored so it never recomputes.** Background
review during play is out for a measured reason, not a preference: the queue is one-at-a-time because
a `go` posted before the previous `bestmove` **kills the engine worker** — documented in
`src/engine/searchQueue.ts:7` from direct measurement in Chromium. Non-urgent review would sit behind
every learner move; urgent review would stall their play. So the walk happens once, after the game,
with a progress indicator, and its result is stored.

### The shape handed to the record

A review item is: source (**exercise attempt** or **free-play game**), the position (by move list, so
it is replayable), the move that was made, the Concept, the classification label, and the outcome of
any re-attempt. [*What does the learner record store?*](12-the-learner-record.md) inherits this
alongside the attempt schema from
[*How is an attempt graded?*](11-grading-an-attempt.md), and inherits one hard constraint from Q5:
**analysis is computed once and stored, never recomputed on demand**, because the in-memory cache
does not survive a reload.

## Addendum — the Curator

Raised by the developer against this ticket's own stated limitation ("with no reviewer there is no
way to know" which moment is most teachable). It is a good answer to that limitation, and it needs
recording as a distinct thing rather than folded into the ticket.

### The distinction this must not blur

Throughout this map, "reviewer" means **a qualified human who can adjudicate chess** — the person
[*What must release 1 carry?*](03-licensing-and-provenance.md)'s compliance story depends on
existing, and whose absence is why release 1 must not *display* a review value implying human review.

**A Curator is not that.** It is an LLM that ranks. The term is separate in the glossary for exactly
this reason: conflating them would let the app imply a human reviewed the teaching, which is the one
thing ticket 03 says it must not do.

### Why it works where free-form judgement would not

**The engine has already done the chess.** `classification.ts` graded the moves with facts; the
Curator is not deciding whether a move was bad. It is ranking the engine's graded errors by
teachability — a comparison over a small candidate set, not a free-form chess judgement.

That distinction is exactly what the probe's evidence supports. Constrained generation from a fact
pack was correct on 4 of 5 positions, and both failures were *perspective* and *over-claiming* —
neither about pedagogy, both catchable by the validator. Rank-versus-judge is a weaker task than the
one that was measured, and this one is weaker still.

### The failure mode, named

A model asked to pick the most interesting moment tends to pick the **most dramatic** one, because
that reads best. That is the research's own warning — "largest error is not necessarily the most
teachable moment" — arriving in new costume.

The structural guard, and the decision: **the Curator ranks, the band still floors.** It reorders
candidates and never adds or removes them. Its failure is therefore cosmetic (a poor ordering)
rather than structural (a lesson that never appears).

### The decisions

- **A ranker, not a selector, not a free-form judge.** A selector may drop candidates, which is
  where "most dramatic" starts costing coverage. Free-form judging reintroduces every
  confabulation risk the probe found, for no gain.
- **One call per game**, given a compact summary of each graded moment. Ranking is inherently
  comparative; a per-candidate call destroys the comparison that makes it good, and would cost 30
  calls instead of 1.
- **The key is an invariant for this feature; without one it does not work.** Settled, not to be
  revisited.
- **Its choice is recorded like any other decision** — which candidates, in what order, by which
  model — so a later reader can see the ordering was ranked rather than derived.
- **Release 1: ranking only.** Checking authored lessons against the positions they sit on is a
  named follow-up, and it is genuinely valuable: a hand-written explanation drifting out of sync
  with its position is a real failure mode, and it is *checkable*, because the facts already exist.
  Judging whether a staged position teaches what it claims is a different and much harder question,
  and is not taken on.

