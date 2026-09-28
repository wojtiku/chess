# What may the coach assert?

Type: grilling
Status: resolved

## Question

The coach may only say things the code has established. So what is the complete set of things it
is allowed to say, and what is the shape of the evidence each one rests on?

Concretely: which facts does the app compute for a position, which concepts may be named from
those facts, and what happens when a lesson needs a claim no fact supports — does the coach stay
silent, say less, or say something adjacent?

This is the load-bearing decision of the release. The probe
(`docs/research/2026-09-27-llm-coach-probe.md`) shows the fact pack doing the real work, and shows
that a detector bug produces confident wrong teaching with nothing downstream able to notice.

Evidence to bring: the probe's fact pack as a starting vocabulary, and its three findings —
detectors fail silently, negative facts must be assertable, and pieces must be named by owner
rather than by relation to the reader.

Resolving this should produce an ADR: it is hard to reverse once content is written against it,
surprising without context, and a genuine trade-off.

## Comments

## Answer

Recorded as [ADR-0001](../../../docs/adr/0001-the-coach-phrases-it-does-not-decide.md). The
governing move: **a Concept is not a label, it is a function from a position to a Fact or to
nothing.** "Undefended piece" is not a word the app may use; it is a Detector that fires or does
not. If it does not fire, the word is unavailable however apt it seems. Everything below follows
from that, and it is what makes the teaching auditable — a Claim is wrong only if a Fact is wrong
or missing, and Facts are testable.

**What may be asserted, and on what evidence.**

Tier 0, exact and free from `chess.js`: the board, side to move, check, castling rights, the
legal move set. Tier 1, exact by detection, ~3ms for a full sweep: material by piece type,
undeveloped pieces, attacked-by-opponent, defended-by-own, hangs (attacked and not defended),
captures available to each side, checks available, mates available, king safety and castled state,
isolated pawns. Tier 2, the engine, with its evaluations and candidate lines. Tier 3 is what may
**never** be asserted: that a plan is good, that an intention is right, that a position is
interesting, that the engine chose a move *because* something.

**The decisions.**

1. **The pack is tiered by the learner's question** (~400–800 tokens), not sent whole. The app
   classifies what was asked and computes only the detectors that can answer it. A misrouted
   question yields less evidence and therefore *less speech* — the one failure this architecture is
   built to tolerate. (a) was rejected because it hands the model the job of deciding what matters,
   which is the job we took away from it.
2. **Moves carry Standing, not verdicts.** "Recommended" and "also fine" are distinct labels,
   separated by a centipawn tolerance against the engine's best. `GOOD_ENOUGH_CP = 50` in
   `src/analysis/hints.ts` is the existing basis. The label is the decision: it is what stops the
   research's commandment failure, and it is a fact about evaluations rather than a judgement about
   taste.
3. **When nothing supports what we want to say, land on the nearest supported Fact.** Never invent;
   say plainly that there is no forced tactic. Silence was rejected as indistinguishable from a
   bug. Getting more evidence is right offline and wrong inside a 15-second call.
4. **A Concept may be named when its Detector fires; a plan may never be called right.** Naming is
   a Fact, asserting that an intention is correct is not, and the second does not ship.
5. **The fact layer is tested as a spec deliverable, not a follow-up** — unit tests per Detector
   plus golden fixtures diffed on every change. The honest limit: our tests prove a chess fact has
   not *changed* and that we meant what we wrote. They cannot prove it is *true*. That is weaker
   than a qualified review and the spec must say so rather than gloss it.
6. **Claims about the learner's habits carry the count, not the conclusion.** "You have left a piece
   undefended three times in your last six games" is a Fact. "You have a habit of overlooking
   undefended pieces" is a Claim with no Fact under it. The same rule that protects chess truth
   also stops the app from telling the learner what they are.

**Every Fact names its owner.** "White's knight on d5 is attacked", never "your knight". The
largest observed failure was perspective, not chess: told it was Black to move, the model advised
the White learner using "your knight". Cheap to enforce, and it removes the whole class.

**Banned outright in release 1, from the curriculum research:** "this is a draw" (insufficient
material is a rulebook judgement, not a computable fact), and the *names* of mating patterns — the
mate is a Fact, "this is the rook roller" is not. See *What do we do with the topics we cannot
evidence?*.

**Why the testing rule is not optional.** Two Detector bugs were found while resolving this. A wrong
`chess.js` API (`attacked` for `isAttacked`) made every piece look undefended; a home-square table
written for one colour reported no undeveloped pieces for the other, in every opening. Both would
have shipped, and models wrote confident, correct-sounding teaching from both. A Detector bug does
not announce itself — it produces fluent, plausible, wrong sentences, and the reader cannot play
chess well enough to notice. Neither is a story about carelessness. They are the argument.

**Verification performed.** All Tier 0–1 detectors were run against known positions: hangs,
checks, mates, captures, isolated pawns, castled state, and colour-aware undeveloped detection
were each confirmed correct and cheap. Cost note for later tickets: the fact pack's expense is
prompt tokens (~1,250 for a full pack, ~117 for a bare FEN), not compute (~3ms per position).
