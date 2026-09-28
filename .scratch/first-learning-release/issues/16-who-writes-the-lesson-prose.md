# Who writes the lesson prose, and when?

Type: grilling
Status: resolved

## Question

The coach's answers are generated at runtime under the learner's own key. But the curriculum also
has fixed prose: lesson introductions, the question a lesson opens with, the wording of a hint
before the coach is involved. Something has to write that, and the licensing research makes the
timing a legal question rather than only a quality one — pre-generated text shipped in the bundle
is content the app would be redistributing, and at least one provider's terms appear to bar that.

Three candidates: we write it by hand, the model writes it at build time and we ship it, or the
model writes it at runtime alongside the coaching. Each has a different cost and a different
failure mode, and the third has a latency bill the learner pays on every lesson.

Decide where the line falls: which prose is fixed content and which is generated, who authors
each, and what the app ships.

## Answer

Resolved within [*When does the call fail?*](08-when-the-call-fails.md), where the licensing
constraint turned this from a quality question into a legal one, and where the answer to it was
already load-bearing.

**We write the prose. The model may draft it; we ship what we wrote.** Three kinds of prose, three
answers:

1. **Curriculum and lesson prose — ours.** Hand-written against the Steps Method ordering, carrying
   no chess claim that a Detector has not fired (ADR-0001). Bounded volume, and the writing is the
   same job as writing an exercise's hint ladder.
2. **The coach's answers — the model's, at runtime, under the learner's own key.** Not shipped in
   the bundle, so it never enters the redistribution question.
3. **Pre-prepared opening positions, 3–5 moves in — ours, hand-written, shipped in the bundle.**
   This exists so the learner's first moves work with no key. It is the clearest test of the rule:
   generating it at build time would have been the obvious choice and is the one thing barred
   outright, by Google's §5(e) prohibition on conveying generated content to third parties.

**Build-time bulk generation of shipped prose is out.** Not a preference: the licensing research
found that the runtime-only BYOK design likely avoids §5(e) entirely, and pre-generating would walk
straight into it. Shipping hand-written prose is what keeps the bundle's contents clean.

**One assumption left open, recorded rather than buried.** The instruction that produced this
answer was ambiguous between "AI drafts and we write the result" and "we generate at build time and
review it"; the first reading is recorded. Whether text a model drafted and a human then rewrote is
still "content returned from the APIs" under §5(e) is one of the items already routed to a qualified
opinion in [*What must release 1 carry?*](03-licensing-and-provenance.md). It is a live risk on this
answer, not a settled point, and it is why the answer leans on hand-written prose rather than
reviewed generation.
