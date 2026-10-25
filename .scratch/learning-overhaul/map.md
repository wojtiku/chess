# Rebuilding learning around position exercises

Labels: wayfinder:map

## Destination

An agreed, build-ready specification and staged implementation handoff for a replacement learning module centered on preset-position exercises for one independent learner, adult or child. This map is complete when no product or technical decisions remain before that handoff can be written and executed.

## Notes

- Planning only: charting creates the map; subsequent sessions resolve at most one non-research decision ticket each. Do not implement the learning module here.
- Confirmed by the user during charting: the primary entry is “give me an exercise,” without mandatory onboarding or a course gate. Investigate both learner-selected topics and app recommendations, not a random-only feed or mandatory curriculum.
- Hints guide attention without prescribing the answer: “notice this piece” rather than “play this move.” Decide their exact boundary and behavior in the help ticket.
- The user welcomes Chess.com lessons as a product/teaching reference. Investigate specific behavior and permitted access before relying on it; do not copy lesson content or assume scraping/reuse rights. Existing prior restrictions are not silently superseded by this preference.
- Cover single-move and multi-move tasks, mistakes, help, completion, revisiting exercises, sourcing, verification, difficulty, and progress. Exercise selection is only part of the learning loop.
- All previous learning decisions may be reopened. Reuse code only where it serves the new design. Do not delete or silently rewrite the previous map, spec, or ADRs; record explicit supersession when a replacement decision is resolved.
- Free play and ordinary game review remain outside the overhaul except for necessary learning integration. Personalized exercise generation from the learner’s games is a separate effort.
- Consult `grilling` and `domain-modeling` for conversation tickets, and `prototype` for prototype tickets. Use the repository's `CONTEXT.md` and `docs/adr/` as the existing domain baseline, not immutable requirements.
- Local tracker: `docs/agents/issue-tracker.md`. Child tickets live in `issues/`; `Blocked by` records dependencies. An open ticket has `Status: open`; claim by saving `Status: claimed` before work. Resolve with an `## Answer` and `Status: resolved`, then add a named link below. Only wayfinder labels, never triage labels.
- Source inputs: the two reports supplied in the charting conversation, “Chess Training Exercise Repositories and Datasets for Building Lesson Modules” and “Designing an Evidence-Based Chess Learning System for Children and Adults.” They motivate related positions, concept learning, fading help, and later retrieval. Their opaque citation markers, numerical claims, proposed schemas, and architecture are not independently verified requirements. Future external investigations must use research tickets and primary sources.
- Read-only baseline: Learn currently renders Quickstart; exercise/grading/record foundations exist but are not wired into a complete learning journey. Useful starting points: `src/App.tsx`, `src/teaching/`, `src/ui/Quickstart/`, `src/ui/Review/`, and `.scratch/first-learning-release/`.
- Core learning requires no AI key or qualified chess reviewer; Lichess is the trusted initial content foundation. Backend, content delivery, offline operation, and optional AI discussion remain undecided. Consult the resolved tickets rather than inheriting old dependencies accidentally.

## Decisions so far

<!-- Closed decision tickets only. User-confirmed charting boundaries are in Notes. -->

- [What must an exercise ask the learner to demonstrate?](issues/01-exercise-contract.md): preset-board move tasks can require full continuations against prepared replies, ending at a defined teaching endpoint; accept verifiable task-satisfying alternatives and distinguish task completion from chess quality.
- [How does the learner request and choose the next exercise?](issues/02-entry-and-choice.md): board-first entry with remembered optional level, persistent topic choice, penalty-free skipping, optional explanations, unfinished-exercise restoration, and explicit advancement after completion.
- [What makes a preset exercise safe and useful to publish?](issues/03-content-trust.md): trust selected Lichess content and motif tags, check imports and task-specific correctness coverage, and publish prepared template-based teaching without a live-AI or expert-review dependency.
- [How do hints and mistakes teach without giving away the move?](issues/04-help-and-recovery.md): finite current-decision hints never prescribe the move; reveal is explicit and stepwise, retries preserve the correct prefix, and mistake/help/reveal history remains distinct from first-try success.

## Not yet specified

- The reports' broad inventories are candidate directions, not a committed syllabus; the initial-curriculum ticket determines the first release's coverage. Exact lesson families and content production work become specifiable after that choice.
- Research into other sources or services may emerge if the initial curriculum cannot be supported by Lichess puzzles. The initial Lichess reuse/import/answer-guarantee investigation is now a child research ticket, not fog.
- Recognition versus calculation signals, assistance, and delayed retrieval may shape progress, but the evidence available depends on the interaction and selection decisions. Avoid a speculative mastery formula now.
- Child/adult presentation differences, accessibility, notation, and board affordances need a concrete exercise flow before a useful prototype can be specified.
- Runtime versus precomputed verification, storage, offline behavior, engine use, and optional AI discussion depend on content and interaction choices. Detector-only concept naming and single-move constraints have been superseded for the replacement module; detailed answer verification remains open.
- Detailed migration/removal work and acceptance tests become specific after the technical-boundary ticket settles replacement and staging policy. The eventual handoff must address them, not simply append another learning mode.

## Out of scope

- Implementing the overhaul or delivering a production corpus during Wayfinding.
- Personalized exercise generation or automatic teaching diagnoses from the learner's own games; separate effort, not deferred fog for this map.
- Redesigning free play or ordinary game review except where necessary to connect the replacement learning module.
- Teacher dashboards, classrooms, social features, or multiplayer learning; this effort serves one person learning alone.
