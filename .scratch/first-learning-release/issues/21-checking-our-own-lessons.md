# Can the model check our own lessons?

Type: grilling
Status: resolved

## Question

The Curator ranks the engine's graded errors, and works because the engine already did the chess.
The same argument suggests a bigger job: our authored lessons are hand-written prose sitting next to
computed positions, and prose drifts. If a lesson says "your knight is safe here" on a position where
the knight is attacked, nothing catches it.

Decide whether the model may check authored lesson text against the position it sits on, and what
"checked" would mean given it cannot play chess. The question is genuinely different from ranking:
here the model is inspecting *our* text for claims that contradict computed Facts, which is a
comparison the validator may already be able to do without a model at all — which would be the better
answer if it is true.

Also decide whether the check is a build-time gate (a lesson with a contradiction cannot ship) or a
review-time report, and what happens to a lesson that fails when nobody is available to rewrite it —
which is every ordinary day, since the author is the only person who can.

**Not taken on:** judging whether a staged position teaches what it claims. That is a judgement about
pedagogy with no oracle, no Facts to check against, and no evidence that a model is better at it than
we are.

## Answer

**Try it without a model first.** A lesson is hand-written prose sitting next to a position whose
Facts are already computed. The check that matters — "does this text contradict a Fact?" — is a
comparison over squares, pieces and moves, and the **validator already does this**. Running it over
authored prose is a smaller job than the Curator, and cheaper and more reliable.

**Only if that is insufficient, use a model** — and then only to inspect *our* text for claims that
contradict computed Facts, which is a different and much safer job than judging chess.

**A build-time gate, not a review-time report**, because a report that nobody reads is a report that
never catches anything.

**A failing lesson is blocked from shipping, and the author rewrites it.** That is the honest
consequence: the author is the only person who can fix prose, and a build gate that cannot be
satisfied by waiting is the only kind that works when there is no second person.

**Not taken on: judging whether a staged position teaches what it claims.** That is a judgement about
pedagogy with no oracle, no Facts to check against, and no evidence that a model is better at it
than we are. The Curator ranks because the engine already did the chess; this would be asking the
model to do the chess.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
