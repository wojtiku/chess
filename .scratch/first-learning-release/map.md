# Turning the practice board into a tutor

## Destination

A build-ready spec for the app's **first learning release**: the learner's path from knowing
nothing about chess, through coached play, to revisiting their own mistakes — with every chess
decision settled by engine and detector evidence and a language model used only to phrase what
the code has already decided. Ready to hand to `/implement`.

This map finds the way there. It resolves decisions. It does not build the tutor.

## Notes

### Domain

A browser chess app. One learner, using it alone, on their own device. Play White against a
handicapped Stockfish, review the game afterwards, start over. That is the whole app today.

### The constraint that shapes every ticket

**Nobody who can adjudicate chess is available to this project.** The developer does not play
chess and wants to learn it. The first learner is the developer. Therefore:

- No learner-facing sentence may assert something about the position that the code has not
  established. This is a hard rule, not a style preference.
- Teaching content is *not* authored by a qualified human. The ordering of what to teach comes
  from published human curricula; the wording is ours; the chess comes from the engine.
- A qualified reviewer, if one ever appears, is treated as a future unlock, not a dependency.

**The language-model provider is swappable and is not a risk to plan around.** If one provider's
terms, pricing, rate limits or audience rules become a problem, the answer is to change provider —
so no ticket may treat a provider's current terms as a constraint on the design, and none does.
What survives a provider change is one design invariant, because it holds for every provider:
*model output is generated at runtime under the learner's own key and never shipped in the bundle.*
That is a property of how the app is built, not a complaint about any vendor.

**The engine is not swappable, and this is the one dependency that carries real obligations.**
Stockfish ships unmodified; see the licence decisions below.
- **Stockfish ships unmodified.** `copy-engine.mjs` copies npm files byte for byte, which keeps the
  app outside GPLv3 §5. Modifying the engine — even for a `searchmoves` wrapper — would change
  that, so it is a design constraint and not a matter of build hygiene.
- **Chess.com content is off-limits for automated derivation.** Its User Agreement (25 Mar 2026)
  §4.D prohibits using its content via AI or automated tools to develop educational tools. It was
  used in the curriculum research as a human-readable comparison point only, and nothing derived
  from it enters this project.

### Settled decisions (do not re-litigate; change them only by reopening this map)

- **Destination:** a build-ready spec for a first learning release, not a change made in place.
- **Learner:** an absolute beginner, onboarded quickly, then the main sequence. A mandatory
  quickstart, then a light diagnostic that decides whether to skip the basics.
- **Use:** solo. The learner record is kept cheap enough for a third party to review later, but
  nothing is designed around a teacher existing.
- **First pilot:** the developer, alone. Their confusion is the proxy for a beginner's confusion,
  and every moment they are misled gets written down as it happens.
- **The language model phrases; it never decides.** Facts are computed, the concept is chosen by
  code, the model writes the sentence, a validator checks it. See
  [the probe](../docs/research/2026-09-27-llm-coach-probe.md).
- **Learning is keyless; the key buys phrasing.** *(Reverses an earlier decision of "no key, no
  learning", on measured grounds: a free-tier key gave 3–8 calls then intermittent 429s, so gating
  learning on a key was unreliable with one and absent without one.)* Detectors, engine, exercises,
  grading, the attempt record and the review queue never needed the key. Keyless is a functional
  path, not a degraded mode, and we do not claim it is *complete* — that is unmeasured and belongs
  to the evaluation ticket.
- **A caching server, narrowly.** A flat-file cache on existing PHP hosting, keyed by position.
  The key stays in the browser; the server holds no keys and no learner records; no accounts, no
  sync, no key brokering. It is out of the "no backend" rule below, which governs everything else.
- **Curriculum:** a published human curriculum is the spec for topic order; the CC0 Lichess
  puzzle corpus is the practice bank; explanations and hint ladders are ours.
- **Prose is ours to write.** The model may draft; we ship what we wrote. Pre-prepared opening
  positions (3–5 moves in) exist so the learner's first moves work with no key. This is a build
  invariant, not a provider complaint: model output is generated at runtime and never shipped, so
  the bundle contains only text we wrote.
- **Shape:** the practice board stays home. Modes hang off it: Play (today, unchanged), Learn,
  Coach, Review. No landing screen, no router.
- **The learner's first session is not a game.** A beginner who loses to Skill-1 Stockfish in
  eight moves learns "I'm bad at chess" instead of a concept.

### Measured facts this map relies on

- Engine + detectors + constrained prompt: correct on 4 of 5 probe positions; the one miss was
  *whose turn it is*, not chess.
- Fact pack ≈ 1,250 prompt tokens; ≈117 for a bare FEN. Latency 1.7s–15s, median ~5s.
- Free-tier provider keys gave 3–8 successful calls, then HTTP 429, repeatedly.
- A detector bug (wrong chess.js API) produced a fact pack in which every piece looked
  undefended. Every model still wrote confident, wrong teaching from it.
- The validator missed the worst defect and had four bugs of its own.
- **Every candidate detector is exact from `chess.js` and cheap: a full per-position sweep runs
  ~3ms.** The fact pack's cost is prompt tokens, not compute. (Verified during *What may the coach
  assert?* — and a second detector bug, a home-square table written for White only, was found the
  same way, which is the argument for testing detectors rather than reasoning about them.)

### Skills each session should consult

`grilling` and `domain-modeling` before resolving any `grilling` ticket. `research` for
`research` tickets. `prototype` for `prototype` tickets. Read
[2026-09-26-chess-tutor-options.md](../docs/research/2026-09-26-chess-tutor-options.md) for the
option landscape and the evidence behind the teaching techniques. Read
[2026-09-27-llm-coach-probe.md](../docs/research/2026-09-27-llm-coach-probe.md) before touching
anything to do with the coach.

### Glossary

Canonical vocabulary lives in [`CONTEXT.md`](../../CONTEXT.md). Three distinctions that matter most,
each of which has already cost something if blurred:

- an **Attempt** is *Assisted* or *Independent*, and a revealed move is assisted practice, never
  independent success;
- a **Concept** is a function from a position to a Fact, not a label;
- a **Curator** is a model that ranks, and is *not* a qualified human reviewer — the app must never
  imply a human reviewed the teaching.

The Curator needs a key. Without one it does not work. Settled, not to be revisited.

## Decisions so far

<!-- One line per resolved ticket: gist, then zoom the link for the detail. -->

- [What is the curriculum, concretely?](issues/02-curriculum-spine.md): Steps Method S1+S2, 28 topics in publisher order, because it teaches defending before composites; 27 of 28 are machine-evidenceable, the three golden rules are not, 5 carry residual label risk, and "this is a draw" is never assertable.
- [What may the coach assert?](issues/01-what-may-the-coach-assert.md): a Concept is a function from a position to a Fact or to nothing, not a label; the pack is tiered by the learner's question; moves carry Standing (recommended / also fine) rather than verdicts; no Fact means land on the nearest Fact; facts name their owner; habit claims carry the count, not the conclusion. Recorded as [ADR-0001](../../docs/adr/0001-the-coach-phrases-it-does-not-decide.md).
- [When does the call fail?](issues/08-when-the-call-fails.md): **reverses "no key, no learning" — the apparatus is keyless and the key buys phrasing**, because a free-tier key gave 3–8 calls then intermittent 429s. Four distinguishable error classes, and a 429 recovers within a minute so the coach must never be disabled for a session; 20s timeout, not 10s; on failure the Facts are shown anyway; disclose in token counts before the key field; cache server-side by position, never caching a fatal error.
- [Who writes the lesson prose, and when?](issues/16-who-writes-the-lesson-prose.md): we write it, the model may draft; three kinds of prose with three answers (curriculum ours, coach answers the model's at runtime under the learner's key, opening preambles ours); build-time generation of shipped prose is barred by Google's §5(e), and whether model-drafted/human-rewritten text is also barred is an open question to a qualified opinion.
- [Does release 1 serve children?](issues/15-does-release-one-serve-children.md): closed as void — the premise was one provider's audience terms, and the provider is swappable; the residue is a reading-level question that belongs to the learner's path.
- [What is an exercise, and who replies?](issues/06-what-is-an-exercise.md): one decision per exercise, and the engine is the *consequence* shown only after a wrong move rather than an opponent to play against; the answer is a set with two grades — sound (within tolerance) and demonstrating (the Concept's detector fired) — and a wrong move is played and followed by a retry-then-reveal, so the first attempt stays the Independent one; MultiPV returns every legal move, so grading is one search and works keyless.
- [What would exercises require us to change?](issues/04-inventory-of-changes.md): a start position is one field in two functions, because the move list stays authoritative — but the undo rule's even-ply parity is a *function of learner side* and flips to odd for Black; `Captured` renders confidently wrong output for a FEN-loaded game; MultiPV grades without touching the engine binary; and `classification.ts` plus `hasSingleLegalMove` are already written, tested and unwired.
- [Generalise or parallel?](issues/07-generalise-or-parallel.md): **generalise** — the move list is already the whole model, and the decisive evidence is that the undo property test is written as "never leaves the board waiting on the opponent" and merely *checked* in White terms, so it already states the general case; a parallel model would fork 48 reducer and 65 persistence tests into two sets for the same chess rules. Promotion artwork and `Captured`'s FEN precondition are the deliberate consequences.
- [How is an attempt graded?](issues/11-grading-an-attempt.md): three outcomes — **Demonstrating** (the Concept's Detector fired) / **Fine** (sound, and the better move is shown anyway) / **Failed** — because measurement showed ~40% of all legal moves fall inside the 50cp band on a quiet position, so tolerance is a safety rule and not a grader; one number, two meanings (`GOOD_ENOUGH_CP` vs `MISTAKE_CP`) is now two; and every attempt is kept in full, because a fact pack is ~450 bytes and 1,000 attempts is 443KB.
- [What is a review item?](issues/10-what-is-a-review-item.md): failed attempts plus mistake/blunder moves from finished games, selected by the already-written `classification.ts`; an item carries both a position (the evidence) and a Concept (the job); re-attempts are Independent **and a distinct attempt type**, or transfer is unmeasurable; a game is walked once after it ends and stored, because the analysis cache does not survive a reload and the walk is 31 searches rather than 60.
- [What do we do with the topics we cannot evidence?](issues/17-the-topics-we-cannot-evidence.md) *(proposed, unexamined)*: teach the Fact, withhold the name; the three golden rules are not graded topics; draws are permanently excluded; profitable exchange is taught as the rule, with the approximation stated.
- [What exactly does the cache server do?](issues/18-the-cache-endpoint.md) *(proposed, unexamined)*: position-hash keyed, fact pack stored with each sentence, fatal errors never cached, bounded by entry count, endpoint authenticated or unlisted, with a stated condition under which it is disabled.
- [Where do exercise positions come from?](issues/19-where-do-positions-come-from.md) *(proposed, unexamined)*: four mechanical staging checks, mined rather than authored, rejected silently and never repaired — and the standing risk that checks 3 and 4 encode unverified judgement about what makes a position interesting.
- [What happens to the moves you didn't play?](issues/20-the-moves-you-didnt-play.md) *(proposed, unexamined)*: evaluations are free from the grading search and are the default; played lines cost a serial search each and are on request; available for wrong moves too, which is the valuable case.
- [Can the model check our own lessons?](issues/21-checking-our-own-lessons.md) *(proposed, unexamined)*: try the validator without a model first, since the same contradiction check already works; a build-time gate if needed; judging whether a position *teaches* is explicitly not taken on.
- [What does the learner record store?](issues/12-the-learner-record.md): attempts, review items and games as separate id-linked records, version in the key following the convention already in `persistence.ts`; bounded by attempt count (166 bytes each, 1,000 ≈ 0.21MB) and never on size, because overflow is silent; the fact pack is stored but never shown to the learner; and old records are abandoned rather than migrated.
- [The learner's path](issues/13-the-learners-path.md): quickstart is a short subset of Steps S1 lessons 1–6 — moves, capturing, check, castling, promotion plus the idea of defending — then real exercises; defending works with a White-only learner because the opponent has already attacked; mate follows immediately, and it is the most reliably gradable topic in the curriculum; no diagnostic, because skipping is the expensive mistake; free play unlocks after the first few exercises, not after the quickstart.
- [What would show the first release teaches?](issues/14-what-evidence-would-show-it-works.md): every attempt is timestamped so retention is measurable later; **transfer is declared unmeasurable in release 1** and the per-concept tally is explicitly repetition, not transfer; the threshold is a smoke test that the loop runs, not evidence anyone learned; and the strongest available signal is free — a concept passed in an exercise but still failed in a real game.
- [Where does the call live?](issues/09-where-the-call-lives.md) *(proposed, unexamined)*: the key never leaves the browser; the position and fact pack are what leaves the device, disclosed before the key field; cost in token counts, not dollars; cache server-side by position; multi-provider out of scope.
- [What must release 1 carry, and what must it record?](issues/03-licensing-and-provenance.md): shipping the engine is conveying under GPLv3 §6(d) with six obligations unmet; keeping it unmodified is what keeps the app out of §5; the BYOK runtime design means no provider term binds the app, but pre-generating shipped prose would walk into a redistribution bar.

## Destination reached

The spec exists: [`spec.md`](spec.md). What remains open is not a decision but an artefact —
[the coaching prototype](issues/05-the-coaching-interaction.md), which cannot be resolved without
the developer looking at it. It is the first task of the build, not a gap in the map.

## Not yet specified

Fog: in scope, but not sharp enough to ticket yet. Graduates as the frontier advances.

- **The cost of gating learning behind a key.** *Largely retired by
  [When does the call fails?](issues/08-when-the-call-fails.md)* — the apparatus is keyless, so a
  missing key no longer costs the learner the learning loop, and a provider that rate-limits is a
  provider to change. What survives is only this: release 1 must be worth something without a
  coach, which is a claim to test rather than a constraint to design around.
- **Multi-user deployment, and what it would cost.** Release 1 is the author, on the author's own
  hosting, which carries essentially no licence exposure. Handing it to anyone else makes the
  aggregate-versus-combined-work question real, and with it the cache's position on generated
  content — both currently routed to a qualified opinion. In scope the moment anyone else is a user;
  sharp now that a server exists and could be pointed at publicly by accident.
- **The learner's first minutes.** Whether the quickstart is a fixed sequence, a diagnostic, or a
  board the learner plays with coaching attached — and what a beginner's very first interaction
  with this app should be. Partly pre-empted: pre-prepared opening positions are agreed. Still
  open: whether the learner's first *game* is a game at all. Sharp once *the learner's path* has a
  curriculum ordering to gate on.
- **Teaching endgame goals.** "Hold the draw" and "escort the pawn" need a grading method that is
  not "did you match the engine", and there are many correct continuations. Now sharper, because
  [*What is an exercise?*](issues/06-what-is-an-exercise.md) fixed a single decision per exercise
  and made the engine the consequence rather than an opponent — so a multi-ply exercise is where the
  engine would have to become a real opponent, and that is the decision waiting here.
- **Delayed return.** Whether release 1 schedules anything, or leaves a queue the learner chooses
  from. Depends on what a review item is and what an attempt records.
- **Multi-provider support.** One provider or several, and what happens when a key is scoped to a
  different provider than the app expects. Sharp once *Where does the call live* fixes a provider.
- **Puzzle import mechanics.** *Largely graduated into
  [Where do exercise positions come from?](issues/19-where-do-positions-come-from.md).* What
  survives here is only the bulk-export question: whether release 1 draws from the CC0 puzzle export
  at all, or only from positions we stage ourselves.

## Out of scope

Work beyond the destination. It does not graduate; it returns only if the destination is redrawn,
as a fresh effort.

- **A conversational tutor.** Free-form "why?" dialogue with an LLM, per Stage 3 of the research.
  Latency measured at up to 15s per turn makes conversation the wrong shape for this release, and
  the trust floor has not been earned for open-ended claims.
- **A human-like opponent** (Maia or otherwise). It predicts human moves; that is not evidence of
  teaching, and it is a different engine with different licence and score semantics.
- **An opening repertoire trainer.** Memorising sequences before decision habits exist.
- **Accounts, sync, and any backend.** The app is local-first and static; the LLM is called
  directly from the browser with the user's own key. A backend contradicts the architecture the
  rest of the map assumes, so it cannot be an implementation detail of this release. *Exception:
  the position-keyed prose cache above, which is a cache and nothing else — no keys, no learner
  records, no accounts.*
- **Tablebase integration.** Optional per the research, and it raises draw-rule semantics that
  release 1 has no way to grade.
- **A cloud evaluation endpoint as an analysis accelerator.** Optional caching, not a dependency;
  release 1 must not have a network path it cannot take.
