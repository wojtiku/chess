# How does the learner request and choose the next exercise?

Labels: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: none

## Question

Define the primary “give me an exercise” journey, including the first visit without mandatory onboarding, returning visits, choosing a topic versus accepting a recommendation, and skipping or requesting another exercise. What minimal learner input is appropriate before the app knows their level? Where, if anywhere, do short concept explanations and related-position lessons fit without becoming a course gate?

Decide the learner-facing choices and first-session behavior, not the adaptive selection algorithm. Preserve both learner control and an app-recommended path.

## Answer

Resolved through live discussion with the user during planning.

### Entry and initial level

- Opening Learn immediately presents a recommended exercise, not a course catalog or mandatory onboarding. Topic selection is optional and must not block reaching the board.
- On the first visit, offer an optional starting-level choice: “New to chess,” “Know the rules,” “Play regularly,” or “Not sure.” No mandatory diagnostic, rating entry, or age question is needed to start. “Not sure” still starts an exercise immediately.
- Remember the learner's chosen starting level across visits and allow changes at any time. Keep this self-description separate from any ability estimate inferred from practice. Its exact effect on selection remains for the recommendation-policy decision.

### Choice and requesting another exercise

- Provide an optional “Choose a topic” control and a visible current practice choice. A selected topic remains active for subsequent exercises until the learner changes it or selects “Recommended practice.”
- “Another exercise” is available even before solving the current exercise, without a penalty or forced solution reveal. Skipping is distinct from solving and from submitting a wrong move.
- Remember skipped and failed exercises as possible repetition candidates. Skipping alone does not mean inability and does not require an immediate repeat. When they return is the selection-and-review ticket's decision.
- If suitable exercises in the selected topic run out, offer a choice to switch; do not silently change topics. Exact exhaustion/repetition policy remains downstream.

### Explanations and completion

- Offer a short, optional “About this idea” explanation; never require a preliminary lesson before attempting the position.
- When identifying the motif is part of the challenge, warn that opening this explanation may reveal the idea and count it as assistance. Detailed hint and recovery behavior remains for its own ticket.
- After completion, keep the completed board visible with a short explanation of the key idea. Wait for an explicit “Next exercise”; no automatic advance or countdown. Next follows the current topic or Recommended practice.

### Returning to an unfinished exercise

- Reopening Learn restores an unfinished exercise and its board position, with “Another exercise” still available.
- Restore assistance already received, including hints, so returning cannot reclassify assisted practice as independent success. The technical persistence mechanism and in-line attempt/recovery state are not chosen here.

### Scope and supersession

- Supersedes the old mandatory Quickstart/Diagnostic entry sequence for the replacement learning module. This does not change free-play access or establish the first curriculum's content.
- Preserves learner control alongside app recommendations. No recommendation algorithm, mastery score, review interval, account requirement, or storage architecture has been selected.
