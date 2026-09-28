# What is the learner's path through the curriculum?

Type: grilling
Status: resolved
Blocked by: 02

## Question

Given the topic ordering, decide the shape of the route: what the mandatory quickstart contains
and how completion is verified; what the diagnostic actually asks and what it decides; what gates
progression; and what the learner sees when they are moved past material they already know.

The developer chose absolute beginners, onboarded quickly, and a first session that is not a game.
Those choices need a concrete path. Note that every rule in the quickstart is a fact chess.js can
verify, so this ticket is mostly about shape and wording, not about evidence.

## Comments

## Answer

**The quickstart is a short subset of Steps S1 lessons 1–6, then real exercises.** The boundary is
not a judgement call: lessons 1–6 are Board and pieces · Moves · Attacking and capturing · The pawn ·
Defending · Check and escaping check, and every one is something `chess.js` verifies without any chess
knowledge. Lesson 7 is Mate (1), and that is where a *concept* begins rather than a rules fact.

Taken as a subset: moves, capturing, check, castling, promotion, and the **idea** of defending. Not
lessons 1 and 4 whole — board and pieces, and the pawn, are reference material rather than anything
you *do*, and six lessons of rules before any chess happens is too long an opening. The quickstart is
about ten minutes of *doing*.

**Defending works with a White-only learner, and nothing decided elsewhere has to move.** A position
where Black has already attacked is a perfectly good White-to-move exercise: the learner defends by
answering. This is how the corpus works anyway, and it preserves both the curriculum's ordering and
[*What is an exercise?*](06-what-is-an-exercise.md)'s learner-as-White decision. The alternative —
waiting for a play-as-Black exercise — is a setting, not a dependency.

**Mate follows immediately, and there is a measured reason to be relaxed about it.** The probe found
**5 of 31** moves within the 50cp band in a mate position, against **15 of 37** in a quiet one,
because one move swings the evaluation discontinuously. Mate is therefore the most reliably gradable
thing in the whole curriculum — the one place the tolerance rule works — and ticket 11's own
measurement says so. It is *not* in the quickstart: Steps postpones mate precisely because it wants
the rules solid first, and that ordering is the claim we can legitimately borrow.

**No diagnostic.** Everyone starts at the quickstart. The arithmetic favours it: ten redundant
minutes cost less than a false skip, and the curriculum's whole claim is that *order* is what matters
— so skipping is the expensive mistake, not repetition. A placement gate can be wrong in the
dangerous direction, and a diagnostic that only offers optional material duplicates a progress list
the record already supports.

**Free play unlocks after the first few exercises, not after the quickstart.** A learner's first game
against a full-strength engine destroys whatever the lesson established. The map already holds that a
beginner who loses immediately learns about themselves rather than about chess, and that reasoning
applies *more* strongly once concepts are involved — not less. The research's attempt-before-reveal
principle says the same thing.

### The path

1. **Quickstart** — ~10 min, board actions verified by `chess.js`, no engine, no key.
2. **Exercises** — one decision each, White only, from lesson 5 (defending) onward, with the
   graduated ladder and the recovery step.
3. **Free play** — unlocks after the first few exercises, lowest engine level, coaching available
   throughout.
4. **Review** — failed attempts and graded mistakes accumulate from the start; the queue is there from
   the first session, and the Curator ranks it when there is a key.
