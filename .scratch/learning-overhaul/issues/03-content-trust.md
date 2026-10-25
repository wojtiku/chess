# What makes a preset exercise safe and useful to publish?

Labels: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 01

## Question

Given the exercise contract, establish a publication standard: provenance and reuse rights, legal positions and lines, accepted alternatives, pedagogical clarity, explanations, and hints. Which judgments can rules, engines, source metadata, original authoring, or a human reviewer support, and which must remain unclaimed? Must the core experience work without an AI key or network service?

Compare a small original/curated collection with a filtered open-data collection and a hybrid; choose the requirements and candidate sourcing approach, not a full ingestion architecture. Revisit detector-only concepts and old assumptions about authorship/review availability explicitly. Identify precise external facts needing research, graduating those into research tickets after this decision rather than treating either supplied report as verified evidence.

## Answer

Resolved through live discussion with the user during planning.

### Source and trust boundary

- Start with a small, deliberately selected collection from reusable databases, with Lichess as the trusted initial foundation, rather than inventing positions or exposing a huge undifferentiated feed.
- Trust Lichess's published positions, solutions, and motif tags. Do not routinely re-analyze the collection with Stockfish simply to re-prove source content.
- Verify our transformation: imported positions and continuations must remain legal and present the correct learner turn. Additional analysis is needed where we change the task or need alternative-answer coverage not established by the source.
- A recorded source line is not assumed to list every correct alternative. The previously agreed publication boundary still applies: only publish exercises whose valid answers can be reliably checked.
- Keep source identity and reuse provenance. Current source terms, format conventions, and answer guarantees require primary-source investigation; trusting chess quality does not establish those facts. See the new research ticket.

### Teaching content and publication gates

- Publication requires both chess correctness and teaching quality. The first covers legal positions/lines, reliable answer checking, and a verified teaching endpoint. The second covers a clear objective, understandable explanation, and attention-guiding hints appropriate to the position.
- Source motif tags may organize exercises and justify naming their concepts without a new custom detector for every motif. A tag does not justify arbitrary position-specific assertions.
- Use prepared, reusable, authored concept explanations and hint templates populated with verified position details. Do not depend on live generation or large amounts of bespoke/AI-generated prose for the initial collection.
- Check template applicability and referenced pieces/squares before publication. Where hints or explanations cannot be supported reliably, exclude the exercise from the initial collection rather than invent commentary.
- A concept-level explanation may be shared across exercises; a position-specific hint must fit the current position and must not prescribe the solution. Exact hint strength and recovery behavior remain for the help ticket.
- No qualified chess teacher is a prerequisite to the initial pipeline. This is not a claim that automated checks prove pedagogical effectiveness or that the collection is expert-reviewed. Test implementation details and selection thresholds remain downstream.

### Runtime dependencies and supersession

- Exercises, prepared replies, hints, explanations, and progress work without a learner-supplied AI key. Optional AI discussion may be considered later but is not a core dependency.
- No decision yet on bundled versus downloaded content, full offline operation, backend/storage design, or the precise Stockfish verification workflow.
- Explicitly supersedes ADR-0001's detector-only concept naming requirement for the replacement preset-exercise module, and the previous plan's mined-not-authored restriction insofar as it barred selected source content with prepared teaching material.
- Retains the principle that explanatory prose does not decide correctness. Existing runtime Coach restrictions are not globally removed, and teaching claims must still have support.

## Follow-up

- [What does Lichess guarantee about puzzle reuse, import semantics, and alternative answers?](09-lichess-source-contract.md) records the now-specific external investigation. This resolution chooses the trust policy; it does not claim that investigation has already happened.
