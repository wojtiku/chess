# Turning the chess game into a tutor

Research date: 26 September 2026. Scope: product options, teaching techniques, technical feasibility, and a recommended first release. This is research and a proposed direction, not an implementation plan or a claim of demonstrated learning gains.

## Recommendation

Build a connected learning loop: **learn one idea → try it with graduated help → use it in a game → revisit a mistake → solve a different position later**. Start with authored lessons and reliable engine-backed feedback. Add conversational AI only if it measurably improves explanations or learner engagement.

The strongest first direction is a combination of three features:

1. **A coach button that gives progressively more specific help**, keeping the move hidden initially.
2. **Short lessons about plans**, alongside basic tactics and endgames, with annotated positions and multiple reasonable answers.
3. **A personal review queue**, initially built from selected exercise failures, then from the learner's own games.

These are design recommendations. The evidence below supports individual learning mechanisms and establishes technical capabilities; it does not establish that this exact combination will improve a learner's chess rating.

## What our game already provides

Repository inspection found React/TypeScript, chess.js, and Stockfish 19 running in a browser worker. We already have legal moves, engine play, move history, undo, board arrows, keyboard interaction, and hint analysis. Relevant local sources:

| Existing capability or constraint | Consequence for the tutor |
| --- | --- |
| [Current interface](../../src/App.tsx) reveals the hint arrow and continuation, and offers “Play hint move.” | Introduce stages before the reveal. A revealed move should count as assisted practice, not independent success. |
| [Analysis service](../../src/analysis/evaluate.ts) has MultiPV, an options-aware cache, a three-second default analysis budget, and same-position coordination. | Reuse it for candidate comparisons and explanations, subject to latency and confidence checks. |
| [Hint selection](../../src/analysis/hints.ts) chooses the best move or an acceptable alternative within a score tolerance, with mate handling. | There is already a useful alternative-move foundation; “reasonable chess move” and “demonstrates this lesson” still need distinct grading. |
| [Search queue](../../src/engine/searchQueue.ts) prioritizes play over background analysis and serializes engine requests. | Preserve this boundary. Historical review must not interrupt gameplay or display results for an obsolete position. |
| [Move classification](../../src/game/classification.ts) exists but has no application consumers beyond its tests. | A classification utility is not yet a review feature or a diagnosis of what the learner misunderstood. |
| [Game state](../../src/game/gameState.ts) replays from the standard starting position; [game controller](../../src/game/useGame.ts) assumes the learner is White. | Exercises need starting FEN, learner side, side-aware undo, and lesson completion rules. |
| [Persistence](../../src/game/persistence.ts) stores the current game and settings, not learning evidence. | Add a separate versioned learner record and retain completed games for later review. |

The central gap is a teaching model and teaching content, rather than a stronger chess engine.

## Options and tradeoffs

The effort ratings below are relative to this repository, not delivery estimates. Rows are complementary, rather than competing complete products.

| Option | What the learner does | Main value | Main limitation | Relative effort / priority |
| --- | --- | --- | --- | --- |
| Progressive in-game coaching | Requests a question, clue, candidate, then explanation | Fits the existing game; preserves thinking before reveal | Reliable explanations for arbitrary positions are difficult | Medium; first |
| Authored strategy lessons | Chooses a plan, explains a choice, plays a continuation | Directly teaches development, activity, king safety, pawn structure | Requires content authoring and chess review | Medium; first |
| Themed tactical practice | Finds threats, forks, pins, mates, defensive resources | Large reusable data supply and clear correctness | Tactical success alone does not establish strategic understanding | Low–medium; early |
| Endgame practice | Converts or holds a position against the engine | Teaches a repeatable method over several moves | Many correct continuations; goal grading must allow them | Medium; early |
| Review of personal games | Retries a few instructive decisions, then compares lines | Makes practice relevant to actual mistakes | Analysis cost; “largest error” may be a poor teaching moment | Medium–high; second |
| Adaptive curriculum and spaced review | Receives due topics and fresh related examples | Connects sessions and tracks independence | Needs sound evidence, not just a puzzle rating or streak | Medium; simple version early |
| Conversational tutor | Asks “why?” and discusses alternatives | Flexible language and follow-up | Unsupported explanations, inference cost, operational complexity | High; optional later |
| Human-like opponent | Plays against common human choices at a chosen level | Potentially more relatable mistakes | Prediction accuracy is not evidence of teaching effectiveness | High; later |
| Opening repertoire trainer | Recalls sequences and typical plans | Useful once the learner has basic decision habits | Easy to become memorization without understanding | Medium; later |

## Teaching techniques and strength of evidence

### Attempt before revealing, and return after a delay

Roediger and Karpicke's experiments found benefits of retrieval practice for delayed retention of prose material. This supports testing the idea of asking learners to retrieve a principle or choose a move before revealing it; it does not directly establish better chess calculation or tournament performance. [Original study](https://pubmed.ncbi.nlm.nih.gov/16507066/)

Cepeda and colleagues studied fact learning with delayed review and testing. Effective spacing depended on the desired retention interval. This supports spreading practice over sessions, but does not prescribe a universal chess schedule. [Authors' paper](https://laplab.ucsd.edu/articles/Cepeda%20et%20al%202008_psychsci.pdf)

**Proposed application:** after learning a motif, revisit it on another day. A starting schedule such as 1, 3, 7, and 14 days is a product heuristic to evaluate, not a research-derived optimum. Mix a familiar position with an unseen example of the same idea. Record unaided success separately from success after hints. Repeatedly recalling the exact move in one diagram is insufficient evidence of transfer.

### Ask for reasoning, with manageable effort

Aleven and Koedinger's two classroom experiments with a geometry Cognitive Tutor found better understanding and transfer among students who explained their steps. This is evidence for a tutor mechanism in geometry, not proof of equivalent benefits in chess. [Original paper](https://pact.cs.cmu.edu/koedinger/pubs/Aleven%20%26%20Koedinger%2002.pdf)

**Proposed application:** occasionally ask “What does your opponent threaten?” or let the learner choose a reason such as “improve my least active piece.” Follow with feedback about the reason and the move separately. Do not require typing after every move. For a beginner, show an annotated example, then a similar exercise with fewer clues, then an unfamiliar position. Treat this particular progression as a design hypothesis to test.

### Use a curriculum; do not assume one universal sequence

Lichess Practice separates checkmates, tactical themes, and pawn/rook endgames. Its Study system supports playing positions against a computer, hidden continuation exercises, and interactive lessons with hints and move-specific feedback. These are useful first-party feature precedents, not controlled evidence of effectiveness. [Practice](https://lichess.org/practice), [Interactive Lessons](https://lichess.org/@/lichess/blog/interactive-lessons/WtDErSQA)

The Steps Method's first level emphasizes rules and foundational skills, supplies repetition and mixed exercises, and explicitly delays teaching mate compared with some other beginner materials. This demonstrates that curriculum ordering is a pedagogical choice. Its publisher's effectiveness claims should not be treated as independent experimental evidence. [Steps Method: Step 1](https://www.stappenmethode.nl/en/material/step1)

**Proposed curriculum:** a brief diagnostic routes absolute beginners through legal moves, captures, check, and safe pieces. Learners who know the rules can start with threats, simple tactics, development, king safety, and central control. Follow with piece activity, open files, pawn weaknesses, basic mating technique, and king-and-pawn endings. Test prerequisites rather than forcing everyone through every lesson. Include defending and choosing a quiet move, so learners are not trained to assume every position contains a winning combination.

## What “strategy hints” should mean

A tactical hint helps find a concrete sequence. A strategic hint helps choose a useful goal and recognize the conditions under which it is appropriate. Both need board-specific evidence.

For an **authored development position**, a proposed hint ladder is:

1. **Question:** “Which of your pieces is doing the least?”
2. **Principle:** “Improve an undeveloped piece while increasing control of the center.”
3. **Board clue:** highlight the relevant undeveloped minor pieces and target squares.
4. **Candidate comparison:** offer two plausible developing moves and ask which addresses the opponent's threat.
5. **Reveal and explanation:** show the accepted move, its purpose, and a short checked continuation. Contrast it with one tempting alternative.
6. **Transfer:** give a different position where the same principle applies, and later one where an urgent threat overrides it.

These are example interaction texts, not claims about an unspecified actual position. Each lesson needs a reviewed FEN and verified moves before use.

For a **tactical position**, use: “What changed after their last move?” → identify the motif → highlight a relevant piece → narrow the destination → reveal and demonstrate the line. For an **endgame**, provide the goal and method, then let the learner play multiple moves before intervention.

Avoid generic commandments such as “always castle early” or “never move a piece twice.” Make the condition explicit. A learner may choose a sensible plan and then execute it badly; feedback should distinguish those cases.

## How to produce trustworthy explanations

Stockfish supplies evaluations and candidate lines; it does not supply pedagogical annotations such as “blunder” or “brilliant.” Those are added by applications. Its displayed win/draw/loss estimates describe specified engine self-play conditions, not a beginner's personal chances. [Stockfish FAQ](https://official-stockfish.github.io/docs/stockfish-wiki/Stockfish-FAQ.html)

Recommended architecture:

1. **Chess rules:** establish legality, checks, captures, and board state.
2. **Analysis evidence:** obtain candidate lines and evaluate the learner's actual move.
3. **Teaching evidence:** use reviewed lesson annotations or conservative concept detectors, with the relevant squares and line attached.
4. **Teaching policy:** choose one useful observation, decide the hint stage, and adapt the vocabulary.
5. **Presentation:** render reviewed templates first; optionally use an LLM to phrase the evidence later.

The engine can refute an unsafe proposed plan; a favorable engine score alone does not prove why that plan is pedagogically appropriate. “This move improves your bishop” may be observable, but “the engine chose it because it improves your bishop” is a stronger causal claim we generally cannot substantiate.

For open play, begin with narrow explanations: a legal checking reply, a demonstrated lost piece, a verified fork sequence, or an immediate mating threat. Do not equate a raw attacker/defender count with “hanging”: pins, x-rays, tactical compensation, and sacrifices complicate that inference. When evidence is uncertain, offer a general calculation prompt or a line comparison instead of an invented explanation.

For strategy lessons, use human-reviewed plans and accepted alternatives. A position can have several reasonable moves; distinguish “sound alternative” from “demonstrates today's idea.” Exact match to one engine move is not a strategy mastery test.

An optional LLM should receive structured facts, legal moves, verified lines, lesson objectives, and permitted claims. Validate referenced squares and variations; fall back to templates when validation fails. This constrains some errors but does not guarantee explanatory truth. Keep chess adjudication outside the language model.

## Engines, content, and deployment choices

### Keep the existing browser engine for the first release

Stockfish.js provides WebAssembly builds including smaller single-threaded variants; its repository identifies the engine as GPLv3. A browser worker remains a practical fit for this app. A threaded build adds cross-origin isolation requirements for shared memory; changing engine builds should follow a measured performance need. [Stockfish.js](https://github.com/nmrugg/stockfish.js), [MDN shared-memory requirements](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)

Recommendation: lazy-load analysis, limit work on mobile, reuse cached results, and cancel obsolete UI requests. Precompute deep reference analysis for authored content, so every learner need not repeat it. A hosted engine is an option for heavy game review, but adds operational cost and an online dependency. It is unnecessary for a small local-first tutor.

Stockfish's UCI interface supports multiple candidate lines via `MultiPV`, restricted root moves via `searchmoves`, and search budgets. It recommends including move history for correct repetition handling. [UCI documentation](https://official-stockfish.github.io/docs/stockfish-wiki/UCI-Protocol-and-Stockfish-Commands.html)

Our wrapper currently exposes time, MultiPV, and skill, so targeted candidate analysis would require extension. A move missing from the top five is not automatically a mistake: explicitly search that move or analyze its resulting position. Normalize the score to the same player's perspective; handle mate separately from centipawns. Retain analysis settings/version and report uncertainty rather than grading close scores with false precision. Keep strong evaluation independent of the opponent's intentionally reduced playing strength.

### Use licensed data, with our own teaching layer

The Lichess puzzle export is CC0 and includes FEN, solution moves, rating, rating deviation, popularity, and themes. **Import detail:** its FEN is before the opponent's move; apply the first listed move before presenting the position. The learner's solution starts at the second move. Accept any checkmate in mate-in-one tasks, as the dataset specifically allows multiple answers. [Dataset specification](https://database.lichess.org/#puzzles)

Recommendation: curate a small static subset, validate all positions and lines at build time, and write original explanations. Puzzle tags can drive selection, but they are not explanations or direct evidence of a learner's misconception. Authored strategy positions are still needed. Retain source IDs and data provenance.

Lichess's public cloud-evaluation endpoint is a cache lookup, may return no result, and requests occasional use rather than bulk fetching. It should be an optional acceleration, not the tutor's only analysis path. [First-party endpoint specification](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/analysis/api-cloud-eval.yaml)

An optional endgame tablebase integration can supplement engine analysis for covered positions; respect the returned outcome semantics and draw rules rather than presenting a distance field as a universal move count. [First-party tablebase API specification](https://raw.githubusercontent.com/lichess-org/api/master/doc/specs/tags/tablebase/standard.yaml)

Stockfish's README describes distribution under GPLv3 and the corresponding-source requirement when distributing binaries. Include the applicable engine source, build provenance, and license notices in release planning. Dataset permission does not grant permission to copy arbitrary lesson prose or user studies; Lichess distinguishes licenses across its services. Review the actual combined distribution before choosing a product license. [Stockfish README](https://github.com/official-stockfish/Stockfish/blob/master/README.md), [Lichess licensing terms](https://lichess.org/terms-of-service)

### Human-like opponents are a separate later option

Maia-3 predicts human moves across skill levels. Its first-party implementation offers a Python-based UCI engine and lists AGPL-3.0 for repository code; model weights are downloaded separately and need their own license verification. The documented integration is not a drop-in browser-worker replacement. Its outcome predictions also have different semantics from Stockfish search scores. [Maia-3 repository](https://github.com/CSSLab/maia3)

Recommendation: explore this only after the learning loop works. A plausible human opponent might make practice more representative, but neither plausible mistakes nor move-prediction accuracy demonstrate learning gains.

## Proposed staged delivery

### Stage 1: a small, complete tutor loop

Assumption: target learners know some rules but struggle to choose moves; include a basics route for true beginners. Confirm age, reading level, and typical skill before finalizing content.

- Create roughly 6–8 short lessons, with a few reviewed examples each: safe pieces, opponent threats, forks/pins, development and center, king safety, active pieces, and a basic endgame. These quantities are scope suggestions, not evidence-based targets.
- Introduce graduated hints and a clear final reveal. Hide evaluation and engine continuations during an independent attempt, then show relevant feedback.
- Support exercises from FEN for either side, accepted alternatives, retry, and short continuation play.
- Track first-attempt correctness, maximum hint level, selected reason, and whether the learner solved an unseen related position.
- Provide a simple due-review queue and preserve the existing free-play mode.

Acceptance example: someone completes a development lesson, solves a related position without help, plays a game with optional coaching, then returns to a fresh development exercise later. That is a complete learning loop even before automatic game mining exists.

### Stage 2: learn from personal games

Save completed games and nominate two or three teaching moments after a game. Select for concept clarity, learner relevance, and analysis confidence, not just maximum score loss. Ask the learner to retry before revealing the original mistake. Attach a related authored exercise and add the concept to future review.

Keep this analysis behind active play in the existing search scheduler. Store the game's starting position and history, plus the exact decision point, so later branching cannot silently change the review record.

### Stage 3: broader adaptation and conversation

Expand the curriculum using observed gaps. Introduce richer endgame goals, plan comparison, optional explanations in natural language, and possibly a human-like opponent. Promote a feature only when it improves learner outcomes or solves a measured usability problem.

## Evaluation and failure checks

Measure learning through **independent performance on unseen related positions**, delayed retention, and fewer repeated errors in unaided games. Puzzle completion, time spent, streaks, and improvement while hints are visible are engagement or assisted-performance measures.

A practical pilot compares the present reveal-first hint with graduated hints, using baseline and delayed unseen exercises matched by concept. Keep assisted attempts out of the independent score. Report sample size, attrition, and uncertainty; a small pilot can reveal usability failures without supporting broad efficacy claims. A within-person comparison needs counterbalanced ordering and different positions to limit practice carryover.

Before release, review a fixture set with a competent chess teacher: sound alternative moves, sacrifices, pinned defenders, quiet defensive moves, promotion, drawn endings, both colors, and positions where a strategic rule has an exception. Validate legal variations and ensure uncertainty never becomes a confident false explanation. Test slow devices, engine failure, reload, undo, and review requests during opponent search.

Decisions still open: learner age and starting level, solo use versus teacher support, preferred session length, local-only versus cross-device progress, and whether conversational questions are essential. None prevents starting with a small authored curriculum and progressive help.

## Teaching-material library: books and online tutorials

Added 26 September 2026. The following is a curated authoring library, not a requirement that learners buy or complete every resource. Descriptions were checked against publisher pages, official course catalogs, and first-party documentation. This is not a full independent review of every book or paid course. The resources establish **what is taught and how it is presented**; publisher endorsements and improvement claims do not establish comparative teaching effectiveness. Proposed uses in our tutor are our design judgments.

### Books and structured print curricula

All six entries below are reference material for our authors. No permission to redistribute their lessons or exercise collections was established in this research.

| Resource and primary source | What it teaches and intended fit | Teaching format worth studying | Proposed use and limitation |
| --- | --- | --- | --- |
| **Steps Method**, Rob Brunia and Cor van Wijgerden. [Official overview](https://www.stappenmethode.nl/en), [Step 2 contents](https://www.stappenmethode.nl/en/step2.php/faq.php), [official samples](https://www.stappenmethode.nl/en/material/download) | A six-step curriculum for children and adults. Begin with rules and foundational skills; Step 2 introduces piece activity, double attacks, pins, defensive elimination, opening principles, rook mate, and defense against mate. | Trainer manuals paired with learner workbooks; themed practice, reminders, and additional/mixed workbooks. | Best candidate for our prerequisite map and teacher authoring process. Use early steps first. The manuals assume teaching support; an app must supply explanations and responsive feedback rather than merely reproduce worksheets. The site is migrating URLs, so retain edition/source details when authoring. |
| **Everyone's First Chess Workbook**, Peter Giannatos. [Publisher](https://www.newinchess.com/everyone-s-first-chess-workbook) | Fundamental tactics and checkmate patterns for improving beginners; the publisher lists 759 exercises with hints and solutions. | Focused positions, written answers, and material a coach can assign and review. | A reference for clear early tactical tasks and graded help. It complements strategy lessons; it does not provide the whole strategic curriculum. Our learners should show a line or purpose, not just tap a highlighted square. |
| **Learn Chess the Right Way**, Susan Polgar, five-book series. [Publisher's contents/excerpt catalog](https://www.russell-enterprises.com/excerptsdownloads) | The books explicitly separate must-know checkmates, winning material, defensive technique, sacrifices, and finding winning moves. Our proposed fit is rules-knowing beginners progressing to harder calculation. | A sequence of focused puzzle books; the publisher supplies contents and introduction samples for each volume. | Especially useful as a coverage reminder to teach defense, not only winning attacks. Before choosing individual exercises or an entry level, inspect the relevant volume; the series title alone is not a placement test. |
| **Logical Chess: Move by Move**, Irving Chernev. [Publisher](https://www.batsfordbooks.com/book/logical-chess-move-by-move-2/) | For readers who know how pieces move and want to understand purposeful play. Explains every move of 33 complete games and how pieces are used effectively. | Annotated complete games, connecting decisions across opening, middlegame, and ending. | A model for short game stories with “what would you do next?” pauses. Our adaptation should use original annotations, accept sound alternative moves, and explicitly show exceptions to principles. A historical game move is not automatically today's sole correct answer. |
| **Silman's Complete Endgame Course**, Jeremy Silman. [Publisher](https://www.silmanjamespress.com/shop/chess/silmans-complete-endgame-course/) | Endgames arranged by learner level, from basic mates through opposition, pawn-square ideas, Lucena/Philidor positions, triangulation, and more advanced concepts. | Learn only the endgame knowledge appropriate to the current stage, then build on it. | A strong basis for ordering endgame missions: mate with king and rook, escort a pawn, hold a draw, then rook endings. Grade whether the learner can execute the method over several moves. Treat the book's rating groupings as its authoring framework, not a conversion to an online platform's rating. |
| **How to Reassess Your Chess**, fourth edition, Jeremy Silman. [Publisher](https://www.silmanjamespress.com/shop/chess/how-to-reassess-your-chess-4th-edition/) | Positional evaluation through imbalances and turning those differences into plans; also practical chess psychology. The publisher targets an established intermediate/club audience rather than absolute beginners. | Explanations and annotated games that organize strategic thinking. | An author reference for later “compare plans” lessons. Simplify one concept at a time and attach it to observable board facts. Do not present the whole framework as a beginner checklist, or imply that choosing a label proves the plan works. |

### Online tutorials and interactive precedents

| Resource and primary source | What it teaches / format | What we should learn from it | Access and reuse distinction |
| --- | --- | --- | --- |
| **Lichess Learn, Practice, and Study**. [Basics entry](https://lichess.org/learn), [Practice catalog](https://lichess.org/practice), [official interactive lesson guide](https://lichess.org/@/lichess/blog/interactive-lessons/WtDErSQA) | Basics entry point; Practice covers mates, tactical motifs, pawn endings, and rook endings. Study supports hidden next moves, playing a position against the computer, hints, and feedback on particular moves. | The closest interactive reference for our app: show an idea, let the player act, explain a tempting error, and play out the result. Practice's catalog should be supplemented with our authored quiet strategy and planning lessons. | Free to use. Public visibility of a user study is not a verified license for our redistribution; check the particular content and applicable license. The separately documented CC0 puzzle export remains our clearest reusable tactical-data source. |
| **Chess.com Lessons**. [Official guide](https://support.chess.com/en/articles/8609703-how-do-lessons-work-on-chess-com), [lesson catalog](https://www.chess.com/lessons) | A guided path from rules through beginner strategy and checkmates to coordinated pieces, broader strategy, and deeper topics. Lessons use guidance and interactive challenges; a searchable library also offers topic-based exploration. | Combine an obvious next lesson with the ability to choose a relevant topic. Make explanation followed by action the normal unit. | The official guide describes both basic access and premium access. These are access arrangements, not permission to copy lessons. Check current limits when recommending it to learners. |
| **ChessKid Lessons and educator curriculum**. [Lesson map](https://www.chesskid.com/learn/articles/lessons-guide-all-levels-topics), [curriculum description](https://www.chesskid.com/learn/articles/chesskidcoms-curriculum), [teacher-guide sample](https://media.chesskidfiles.com/curriculum/sample_lessons_MBC.pdf) | A child-oriented progression from piece movement to more advanced topics, plus educator materials with essential questions, worksheets, activities, and mini-games. The sample describes instructor-guided use as the practical default and suggests fourth/fifth-grade reading ability for independent use. | Best reference here for playful small activities and teacher-facing lesson structure. Adapt the reading load and feedback to the actual audience; a classroom worksheet does not become self-guided simply by appearing on screen. | The curriculum is free for schools, but its page explicitly disallows commercial redistribution. Use it as a reference or seek an appropriate license; do not import the PDF into the app. Online account access is separate. |
| **Chessable / MoveTrainer**. [Official review-scheduling documentation](https://support.chess.com/en/articles/10319267-when-will-the-variations-be-ready-for-my-review) | A delivery mechanism for practicing course variations: individual moves have review timers, successful recall increases intervals, and mistakes shorten the next interval. It is a platform mechanism rather than one coherent beginner syllabus. | A useful precedent for a due-review queue. In our tutor, pair recall with explanation and unseen examples; remembering one variation is different from recognizing when its idea applies. | Course access and permissions depend on the specific course. This documentation verifies the mechanism, not the quality or reuse rights of every course, nor that its particular schedule is optimal for our users. |

### A small starter library for our authors

Start by examining **Steps 1–2 manuals and workbooks**, **Logical Chess**, and **Silman's Complete Endgame Course**, together with **Lichess Practice/Study** as an interaction reference. These cover sequencing, connected strategic reasoning, endgame progression, and acting on the board. Add **Giannatos** when expanding the tactical bank. If the audience is children, prioritize the **ChessKid teacher guide** for activity design and reading-level considerations. Use **Reassess Your Chess** later for deeper strategy authoring.

Polgar's series is an alternative or supplement to the tactical workbook, particularly for defensive coverage; it need not be an additional initial purchase. Chess.com and Chessable are useful comparative product references, not dependencies for our app. This shortlist is our recommendation based on the coverage above, not a measured ranking of learning outcomes.

### Turn the library into our own curriculum

The following mapping is a proposed synthesis. Sources in the tables above document the precedents; the order, activities, and success checks below are design proposals. Route learners using a brief skill check rather than assuming age, a self-reported label, or an exact Elo maps cleanly to a book level.

| Learning outcome | Reference coverage | Original activity to build | Evidence the learner understood |
| --- | --- | --- | --- |
| Move legally and recognize check | Steps 1; Lichess basics; ChessKid early lessons | A short piece journey, followed by a legal reduced-material game | Makes legal moves and escapes check in unfamiliar positions without highlights |
| Notice a threat before making a plan | Steps 2 defense; Polgar defensive volume | **Threat detective:** identify the opponent's next threat, then find a defense | Names the threat and chooses a defense in a fresh position, including a position with no immediate tactic |
| Recognize simple tactical patterns | Giannatos; Polgar; Lichess Practice | **Find it, then stop it:** solve a motif, then defend against the same idea in a different position | Finds the tactic without being told its theme and checks the opponent's reply |
| Develop pieces and protect the king | Steps 2; Chernev's game format; Chess.com beginner strategy | **Choose a plan:** compare two plausible plans, move, and see one consequence | Selects a useful goal and recognizes when an urgent threat overrides it |
| Improve pieces and coordinate a plan | Chernev; Silman's positional framework for later learners | **Give this piece a job:** select a useful destination, explain its role, and find a safe route | Distinguishes an attractive square from a reachable, tactically sound improvement |
| Convert a win or save a draw | Silman's endgame progression; Lichess Practice | **Endgame mission:** escort the pawn, deliver mate, or hold the draw against varied replies | Executes a method over several moves and avoids stalemate; succeeds from a changed position |
| Connect decisions across a game | Chernev; Lichess hidden-move Study mode | **Game story:** pause at a few important decisions, predict a plan, then play a short branch | Explains how a decision changes the next goal; sound alternatives receive useful feedback |
| Retain and apply ideas later | Chessable review mechanism; research evidence earlier in this report | **Your comeback challenge:** retry a personal mistake, then a new position sharing the concept | Delayed, unaided success on the new example; assistance remains visible in progress records |

Fun should come from discovering a plan, rescuing a difficult position, seeing consequences, and choosing what to try next. We can test optional narrative missions and visible skill milestones. Avoid making speed or an unbroken streak the default success condition; those would measure something different from careful reasoning. These are product hypotheses to test with learners, not claims that a particular reward system improves chess.

Keep the first mini-games within legal chess positions. Activities without kings or with special capture/point rules would require a separate training-rule model from our current chess.js game, so they should not quietly reuse normal-game adjudication.

### A reusable lesson specification

Create a small original lesson bank before expanding volume. For every lesson, record:

- **Objective and prerequisites:** one observable skill, expected reading level, and what the learner must already know.
- **Misconception:** the tempting wrong idea the lesson addresses, such as developing while ignoring a direct threat.
- **Positions:** reviewed starting FEN, side to play, learner color, and legal variations. Use original or appropriately licensed material.
- **Answer policy:** accepted moves and plans, sound alternatives, instructional targets, and the evidence for feedback. Separate a sound move from a move that demonstrates the target idea.
- **Hint ladder:** question → principle → board clue → candidate comparison → explanation. Record the strongest help used.
- **Explanation and counterexample:** why the idea works here and a contrasting position where it fails or another priority comes first.
- **Transfer and review:** a different position for an immediate check and another for delayed review; do not merely rotate the same diagram and call it transfer.
- **Provenance and review:** author, reference title/edition or URL, position source, permission/license, chess reviewer, engine/tablebase checks, and revision date.

### What we can reuse versus what we should author

For this project, treat books and proprietary lessons as **curriculum references and optional external reading** until specific reuse permission is established. Write our own explanations, hints, comparisons, and exercise sequences. Buying a book or accessing a free lesson is not evidence that we can package its teaching material in our app; New In Chess, for example, explicitly marks its material as rights reserved. [Publisher page and rights notice](https://www.newinchess.com/everyone-s-first-chess-workbook)

Use the **CC0 Lichess puzzle export** for a curated tactical-data seed, keeping source identifiers and writing our own teaching layer. Its license should not be generalized to every Lichess study, annotation, illustration, or code asset: the service expressly separates applicable licenses and user-content rights. [Puzzle dataset](https://database.lichess.org/#puzzles), [Lichess terms](https://lichess.org/terms-of-service)

If we want to offer an actual digitized book/course, arrange permission covering the material and intended distribution before importing it. ChessKid's free school curriculum is a concrete example where free access comes with a commercial-redistribution restriction. [Curriculum terms on its official page](https://www.chesskid.com/learn/articles/chesskidcoms-curriculum)

The remaining authoring gaps are **quiet strategic positions with multiple reasonable plans, defense without a winning tactic, representative beginner errors, and feedback understandable without a live teacher**. A large puzzle collection alone will not supply these. Commission or create a small reviewed set for those gaps, then test whether learners can use each idea in unfamiliar positions and actual games.
