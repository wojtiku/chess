# What must an exercise ask the learner to demonstrate?

Labels: wayfinder:grilling
Type: grilling
Status: resolved
Blocked by: none

## Question

Define the replacement Exercise and its success contract for preset positions: one move, a continuation, and any other task actually needed for the initial experience. What counts as completion, whose moves must be found, how are opponent replies chosen, and how are valid alternatives distinguished from missing the teaching objective? Use concrete one-move and multi-move examples; do not assume the engine's top move is the only correct answer.

Explicitly identify which single-decision, opponent, Concept, and Attempt definitions in `CONTEXT.md` and the previous learning plan are retained or reopened. Leave hint/retry details to their own ticket. Resolution is a product/domain contract, not a schema or implementation.

## Answer

Resolved through live discussion with the user during planning.

### Exercise contract

- The core task starts with a preset board position. The learner notices an important feature and plays one move or a continuation on the board. Feature-clicking, quizzes, predicting the opponent's moves, and plan-selection tasks are not initial core exercise types.
- The learner controls one side. The app plays the other side using predefined, verified replies chosen to illustrate the exercise. Stockfish is already available and may support verification or alternatives; unrestricted engine play is not the default teaching path. This does not assert that a production content collection has already been imported or verified.
- The prompt states the task, with variable guidance. It may name a motif (“find a knight fork”), describe an objective (“win material”), or ask for the strongest continuation without naming the motif. The hidden motif must not be required knowledge of an unstated success condition.
- Every exercise has a chosen teaching endpoint. A correct first move is not completion if the point requires a follow-up. A fork can continue through capturing its target; a mating combination continues to mate. Do not require playing out an unrelated won game. Longer endgame techniques need explicit completion conditions if included later.

### Valid answers and publication boundary

- Accept verified alternatives that satisfy the stated task, not just the recorded line. Two checkmating moves both satisfy a mate-in-one task. Winning material does not satisfy a task specifically asking for forced mate.
- Initially publish only exercises whose accepted answers can be reliably checked, through verified solution branches or an exact rule such as checkmate. Do not reject a move merely because it is absent from one recorded principal variation. If alternative correctness cannot be assessed reliably, the exercise is not ready for publication.
- A source solution line is not presumed to enumerate all correct alternatives. The content-trust ticket decides how correctness coverage is established; this ticket does not promise easy database lookup or runtime engine adjudication.
- Distinguish a playable move from a task-completing move when evidence supports that distinction. Do not call every non-solution a blunder or declare an unverified move playable. Exact wording and recovery behavior remain for the help-and-mistakes ticket.

### Relationship to the old model

- Supersedes the old single-decision/no-opponent Exercise definition and the corresponding restriction in the previous plan's “What is an exercise?” decision. A replacement Exercise may contain multiple learner moves and prepared opponent replies.
- Retains the distinction between chess quality and meeting the task, but does not carry forward the old fixed engine-tolerance or detector-fired grading mechanism as the new contract.
- The old detector-only Concept definition is reopened, not resolved here. The content-trust decision must establish how concept claims are justified.
- Retains the principle that assisted practice must not be reported as independent success. Attempt boundaries across a line, hints, retry, wrong-move consequences, and progress semantics remain for their respective tickets. Old recovery rules are not silently adopted.

### Newly stated preference

The user is comfortable using Chess.com's lessons as a product/teaching reference. Specific behavior, evidence, access, and reuse permissions have not been investigated. This is not approval to copy lesson content or to scrape the service; previous restrictions are not silently rescinded.
