# How do hints and mistakes teach without giving away the move?

Labels: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: 01

## Question

Define help and recovery for one-move and multi-move exercises. Hints should direct attention, not prescribe a move: where exactly is the boundary, can successive hints accidentally disclose the answer, and is an explicit solution reveal separate from hints? After a wrong move, what happens on the board, what feedback is given, where does retry resume, and can the learner skip?

Walk through an initially wrong move, a correct first move followed by a wrong continuation, a valid alternative, a requested hint, and a stuck learner. Specify assistance/retry/completion events needed downstream without equating assisted success with independent success.

## Answer

Resolved through live discussion with the user during planning.

### Hints and reveal are separate

- Hints may progress from a general observation to relevant pieces or relationships. They must not supply a destination square, move notation, or solution arrow.
- Hints apply to the current learner decision, not later moves in the continuation. Each decision has a finite, prepared set; check the set cumulatively so successive hints do not simply spell out the answer.
- Exhausting hints never automatically reveals a move. Say that no more hints are available for the position and keep retry, explicit reveal, and requesting another exercise available as appropriate.
- “Show solution” is always available as a deliberate action, independently of hints and mistake count. Do not automatically reveal after a fixed number of failures.
- Reveal demonstrates the remaining continuation step by step at the learner's pace, not as an instant full-line animation. Subsequent replay may be offered as assisted practice, never a fresh independent solve.

### Wrong moves and recovery

- Leave a wrong move visible with feedback, then let the learner choose “Try again” from immediately before that move. The learner controls when to retry; do not force a full reset or automatic opponent reply.
- Preserve correct earlier learner moves and prepared opponent replies. A mistake on the second learner move does not require repeating the first.
- Where a verified refutation is available, offer “Why doesn't this work?” to demonstrate it. Do not invent a refutation or require live engine analysis for every mistake. A refutation is explanatory assistance, not a neutral new first attempt.
- Accepted alternatives satisfying the objective proceed normally, as already agreed. Distinguish task failure from a chess blunder only where supported by evidence.
- “Another exercise” remains available without a penalty or forced reveal, including when stuck or out of hints.

### Outcome evidence

Preserve enough information to distinguish:

- completion correctly on the first try, without help;
- completion after mistakes but without hints or explanatory help;
- completion with hints or an explanation;
- solution revealed;
- skipped.

Record where mistakes and help occur within a continuation. A retry does not erase the earlier mistake. Reveal, skip, help, and completion are events to retain, not reasons to discard earlier history; exact storage and progress summaries remain downstream.

### Concrete cases

- Wrong first move: keep the move and feedback visible; optionally demonstrate a verified refutation; retry returns to the initial learner position.
- Correct first move, wrong follow-up: retain the accepted prefix and retry from the follow-up decision.
- Valid alternative: accept and continue through a supported branch or complete at its verified endpoint, not through the mistake flow.
- Hint request: show the next available attention-guiding hint for the current position and preserve assistance history.
- Stuck learner: allow further retries, explicit stepwise reveal, or skip; no forced reveal or penalty.

### Supersession and boundaries

- Replaces the old compulsory strongest-opponent-reply consequence and automatic reveal after a second failure from the previous learning model.
- Replaces a hint ladder whose final rung was reveal: revealing the solution is a separate deliberate action.
- Retains the distinction between assisted practice and independent success, while separately preserving unassisted completion after mistakes. Do not call an unassisted retry a first-try solve.
- Exact wording, hint-template implementation, rendering/animation timing, progress summaries, and repetition intervals are not decided here.
