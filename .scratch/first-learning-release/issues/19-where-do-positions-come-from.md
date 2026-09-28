# Where do exercise positions come from?

Type: grilling
Status: resolved

## Question

*What is an exercise?* decided that release 1 exercises are a single decision, and that the position
must be **staged so that one move is a learning point**. An arbitrary position with one correct
answer teaches pattern-matching, not understanding — the learner learns to guess what the app wants.
That staging requirement is the question, and it is not yet sharp in its details.

Decide: what makes a position staged, stated as a testable condition rather than a taste. How many
exercises each concept needs before it is learned versus merely seen. Where positions come from —
authored, drawn from the CC0 puzzle export, or mined from the engine's own openings — and how a
position is rejected when its "interesting move" turns out to be the engine's preference rather than
the concept. And what a staged position must be true of *the rest* of the board: a fork lesson needs
the other pieces to be doing something, and a lesson about a weak square needs that square to be
weak for a reason the learner can see.

The honest constraint underneath: this is content nobody qualified is authoring, and "staged" is a
judgement. So the staging test has to be mechanical enough to survive having no reviewer.

## Answer

This is the ticket where the project is most exposed, because **"staged" is a judgement and no
qualified reviewer exists.** The staging test therefore has to be mechanical enough to survive that.

**A position is staged when all of the following hold**, each checkable without chess knowledge:

1. The move the exercise targets **fires a named Concept's Detector**. If no detector fires, the
   position is not teaching anything and is rejected.
2. The position contains **at least one plausible wrong move** — a legal move that is within a wide
   tolerance of best. A position with one good move teaches pattern-matching, not understanding.
3. The target move is **not the engine's first choice**, or is but only just. If the target is
   comfortably the top line, the exercise is testing whether the learner reads an evaluation, not
   whether they see the idea.
4. **The rest of the board is doing something.** A fork lesson requires the other pieces to matter;
   a lesson about a weak square requires the square to be weak for a reason visible on the board.
   Enforced by requiring at least two *other* Detectors to fire, so no exercise is an island.

**Where they come from: mined, not authored, in release 1.** Positions are generated from the
learner's *and* engine's play, filtered through the four checks above, and verified by perft plus a
replay check at build time. Hand-authoring positions is how an unreviewed author would inject
judgement, which is the thing this project cannot afford.

**Rejection is cheap and silent.** A position that fails any check is discarded, not repaired. There
is no author in the loop who could tell whether a repair was an improvement.

**A rejected position teaches us something:** a Concept whose Detector fires on almost nothing is a
Concept with a bad detector, and that is a signal to fix the detector rather than to find more
positions.

**The standing risk, stated plainly:** check 3 and check 4 encode judgements about what makes a
position *interesting*. They are the closest thing this project has to chess expertise, they are
unverified, and they are the first thing to be wrong.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
