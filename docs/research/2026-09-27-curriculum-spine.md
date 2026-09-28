# What is the curriculum, concretely?

Research date: 27 September 2026. Follows [2026-09-26-chess-tutor-options.md](./2026-09-26-chess-tutor-options.md),
which chose a published human curriculum as the spec for topic order but did not name one or list
its topics. Follows [2026-09-27-llm-coach-probe.md](./2026-09-27-llm-coach-probe.md), which found
that the fact pack is the product and that detectors fail silently. This note names the spine,
writes down the actual topic order, and maps every topic onto the evidence the app can or cannot
compute. The person commissioning this work cannot play chess and cannot adjudicate chess content,
so every claim below is labelled as a first-party fact or as my judgement.

## Question

A published human curriculum is the spec for what to teach and in what order. Which one, what is its
actual topic sequence, and how much of it can this app supply evidence for?

## Recommendation

**Use the Steps Method's Step 1 and Step 2 as the spine. 28 topics. 27 of them can be
machine-evidenced; one cannot be evidenced at all and should be dropped or converted.**

The reason is not that the Steps Method is the best curriculum. It is that its ordering puts the
board facts *before* the ideas built on them, and this app can only compute board facts. Steps
Method Step 1 goes: moves → attacking and capturing → the pawn → **defending** → check and escaping
it → mate → castling → **profitable exchange** → twofold attack. ChessKid, by contrast, teaches
checkmate and three mating patterns as lessons 8, 10, 11 and 12 of its beginner span, and only
reaches "hanging pieces" and "learning to count" at lessons 18 and 19 — it teaches a learner to
mate before it teaches them that a piece can be lost. Lichess puts protection (defending) at stage
8 of 19; Chess.com has no standalone defending lesson at all. A detector-first architecture needs
attacked/defended/undefended to be prerequisites, because every later concept is a composition of
them. Only Steps Method orders it that way, and it is the only one of the four that publishes a
numbered lesson sequence rather than a catalogue.

Two supporting reasons. First, the Steps Method is a *teacher's* curriculum, so its units are
already built around one observable skill per lesson — which is exactly the glossary's definition
of a Lesson — and it separates base, extra, plus and mixed workbooks, which maps onto
Lesson / Exercise / transfer. Second, its sequencing is explicitly a pedagogical choice made
against the alternatives: the publisher states that it postpones teaching mate as long as possible
relative to other beginner materials, and its youngest-children workbook stops at lesson 6,
immediately before mate. That is a claim about ordering, not about effectiveness, and it is the
kind of claim we can legitimately borrow as a reference.

Confidence: **high** that the Steps topic lists below are what those editions contain. **Judgement**
that they are the right spine for this app. I found no controlled comparative study of beginner
chess curricula, so nobody can support the second claim with evidence, and this note does not
pretend to.

## Sources, and how to cite them

These sites move. Record what identifies the material, not the link.

| Source | What identifies it | Retrieved | Confidence |
| --- | --- | --- | --- |
| **Steps Method** (Rob Brunia, Cor van Wijgerden) | *Manual for chess trainers Step 1*, **14th edition 2025**, 224 pp. *Workbook Step 1*, **22nd edition 2025**, 56 pp, 486 exercises. *Workbook Step 1 extra*, 9th ed. 2025. *Workbook Step 1 plus*, 7th ed. 2025. *Workbook Step 1 mix*, 4th ed. 2023, 723 mixed exercises. *Stepping stones 1*, 10th ed. 2023, covers "up to lesson 6 of the manual". *Stepping stones 2*, 8th ed. 2023, "starting with mate". *Manual Step 2*, **13th edition 2026**, 256 pp, **Dutch**. *Workbook Step 2*, 17th ed. 2024, 526 exercises. *Workbook Step 2 extra*, 6th ed. 2024, ~628 exercises. *Workbook Step 2 plus*, 6th ed. 2025, >600 exercises, 4-language. *Workbook Step 2 thinking ahead*, 5th ed. 2025. *Workbook Step 2 mix*, 4th ed. 2024, 718 mixed exercises. Sample PDFs are published per book (e.g. `en_lp_h1.pdf`, `en_lp_1.pdf`, `en_lp_1p.pdf`, `en_lp_h2.pdf`, `en_lp_2.pdf`); 12 sample exercises per workbook are playable; trainer answer keys are downloadable by trainers. | 27 Sep 2026 | High for the lesson lists |
| **ChessKid lesson map** | Article "Your Complete Guide to All ChessKid Lessons!" — **no publication date shown**. Seven named levels (Pawn, Knight, Bishop, Rook, Queen, King, SuperKing); 173 lessons; 1,236 topics. Identify lessons by **URL slug**, not by the link's `title` attribute — from King 94 onward the tooltips are stale copies of "King 93". | 27 Sep 2026 | High for the catalogue; **low** for the claim that the app enforces this order (behind an account) |
| **Lichess Practice** | `/practice`, 32 exercises in 5 sections: Checkmates 7, Fundamental Tactics 8, Advanced Tactics 10, Pawn Endgames 3, Rook Endgames 4. Lichess also publishes the four Study chapter modes in the official blog post "Improving your chess with Interactive Lessons (and some new Practice content)", **15 April 2018**. | 27 Sep 2026 | High |
| **Lichess Learn ("Chess basics")** | Source of truth is the lila repository, not the rendered page: `ui/learn/src/stage/list.ts` fixes the category and stage order; each `ui/learn/src/stage/<key>.ts` holds the levels; `ui/learn/src/assert.ts` holds the whole assertion vocabulary; `translation/source/learn.xml` holds the English goal strings. 4 categories, 19 stages. | 27 Sep 2026 (`master` branch) | High |
| **Lichess puzzle corpus** | `lichess_db_puzzle.csv.zst`, file last updated **2026-09-10**, 6,100,952 puzzles, fields `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate`. Theme vocabulary with a one-line first-party definition for each: `translation/source/puzzleTheme.xml`. | 27 Sep 2026 | High |
| **Chess.com** | Support article "How do Lessons work on Chess.com?", **13 July 2026**. Course page `Learn To Play`: **12 lessons, 35 challenges, released 12/18/2025**, level Beginner, theme Rules & Basics. User Agreement **last updated 25 March 2026**. | 27 Sep 2026 | High for Learn To Play and the User Agreement; **medium** for the Learn Path order (the per-level order is behind a login) |

Two housekeeping notes about the Steps Method site, both first-party and both reasons the URLs are
unstable: every page carries the banner "TESTOMGEVING — dit is geen live website" (staging
environment), and the top-level page is advertising a **2026** reissue of the Step 2 manual and
Step 5 plus workbook, so editions move under the same path. Re-verify the lesson list against the
edition you are authoring from.

## The ordered topic lists

### Steps Method, Step 1 — 15 base lessons

Source: *Manual for chess trainers Step 1*, 14th edition 2025, "Themes" section. The 13 reminders
in *Workbook Step 1* (22nd ed. 2025) follow the same order, merging two pairs.

1. Board and pieces
2. Moves of the pieces
3. Attacking and capturing
4. The pawn
5. Defending
6. Check and getting out of check
7. Mate (1)
8. Mate (2)
9. Castling
10. Profitable exchange
11. Twofold attack
12. Draw
13. Mating with the queen
14. Taking 'en passant'
15. The notation

*Step 1 plus* adds 8 lessons, described by the publisher as concentrating on board vision and on
choosing between two options: winning material, defending, mate, board vision, defending against
mate, draws, creating mate, the passed pawn. *Workbook Step 1 plus* (7th ed. 2025) names the
newer material as X-ray protection, the passed pawn, and defending against mate.

*Stepping stones 1* (10th ed. 2023) is the young-children workbook and **covers up to lesson 6 of
the manual**. That is the checkable form of the publisher's claim that it postpones mate: the
lowest-age book stops exactly one lesson before the first mate lesson.

### Steps Method, Step 2 — 13 base lessons

Source: *Manual Step 2*, 13th edition 2026, "Themes" section. The publisher's framing is that at
this level all games are decided by tactics, and that positional play is deliberately held back.

1. Activity of pieces
2. Double attack: queen (1)
3. Double attack: queen (2)
4. Pin
5. Eliminating the defence
6. The 3 golden rules
7. Mate in two
8. Double attack: R B N p K
9. Mating with the rook
10. Discovered attack
11. Defending against mate
12. The intermediate move
13. Solving tests

*Step 2 plus* adds 10: mate, pawn endings, the opening, legal or illegal, defending against the
scholar's mate, defending, route planner, working out mate, stalemate, winning material, playing
rules, defending against the passed pawn. *Solving tests* and *route planner* are formats, not
topics — the former is the mixed-exercise mode, the latter is "give check / go to the right square
/ trap / capture all pieces", a board-navigation exercise with a square as its answer.

The publisher also states, on its own workbooks page, two rules of thumb worth keeping: if you
solve 80% of a step's exercises you have mastered that level, and solving a page of same-topic
exercises is **not** evidence of playing strength because the exercises give a general notion of
the concept, not the ability to use it in new positions. That is the publisher's own argument for
a transfer exercise, and it agrees with the measurement section of the prior research report.

### ChessKid — 7 levels, 173 lessons, 1,236 topics

Levels and counts, in the article's order: **Pawn** 6 lessons / 31 topics, **Knight** 3 / 16,
**Bishop** 3 / 15, **Rook** 5 / 25, **Queen** 9 / 53, **King** 100 / 860, **SuperKing** 47 / 236.
The beginner span, Pawn through Queen, is **26 lessons and 140 topics**. Within a level, lessons are
numbered and each lesson carries 5–10 numbered topics with their own URLs, so the intended order is
level-then-number.

The whole beginner span, in order: meet the rook, meet the bishops, meet the queen, meet the
king, meet the pawn, meet the knight (Pawn 1–6) → check, checkmate, stalemate (Knight 1–3) → help
needed for checkmate, king and queen mate, rook roller (Bishop 1–3) → how do I castle, special
pawns, back-rank mates, first moves part 1, first moves part 2 (Rook 1–5) → hanging pieces,
learning to count, tactics: double attack, tactics: the fork, tactics: the pin, tactics: the
skewer, tactics: discovered attacks and double checks, king and rook mate, your opponent
(Queen 1–9).

Two ordering facts from that list matter more than the rest. **Checkmate is lesson 8 of 26, and
three mating patterns are lessons 10, 11 and 12 — while "hanging pieces" and "learning to count" are
lessons 18 and 19.** And development does not appear until Rook 4 and Rook 5 (lessons 16 and 17),
after mating. The article is a catalogue with numbers, not a statement that the product gates on
them; I could not verify the gating without an account. Treat the numbers as the publisher's
intended order, at medium confidence.

### Lichess Learn (Chess basics) — 4 categories, 19 stages

Order as fixed by `ui/learn/src/stage/list.ts`. Stage titles are the English strings in
`translation/source/learn.xml`.

1. **Chess pieces** — rook, bishop, queen, king, knight, pawn
2. **Fundamentals** — capture, protection, combat, check in one, out of check, mate in one
3. **Intermediate** — board setup, castling, en passant, stalemate
4. **Advanced** — piece value, check in two

(The same file has `draw` and `fork` present but commented out of the stage list; they are not
currently taught on the Learn path, though `fork` remains a puzzle theme.)

Lichess is the only one of the four that ships its lesson data as a machine-readable file, and
that file is the most useful thing in this note for the architecture. Each stage declares a title,
a subtitle, an intro, a completion message and a list of levels; each level declares a **goal**, a
**FEN**, a **move budget** (`nbMoves`), a **success predicate**, a **failure predicate**, optional
**arrow/circle shapes** for board clues, and behavioural flags. The complete assertion vocabulary
in `ui/learn/src/assert.ts` is: a piece is / is not on a given square; no piece off a given set of
squares; a white pawn on any of a set of squares; one colour is **extinct** (no piece of that
colour remains); **in check**; **checkmate**; the last move equals a given SAN; **check within n
moves**; **no check within n moves**; negation and conjunction/disjunction; and a scripted
**scenario** where the opponent's replies are fixed and the learner's move must match, or the
level fails. Behavioural flags include `detectCapture: 'unprotected' | boolean` — an undefended-
piece detector — plus `pointsForCapture`, `captures` (a required capture count), `showPieceValues`,
`autoCastle`, `offerIllegalMove`, `showFailureFollowUp` (play out the refutation after a wrong
answer), `nextButton`, and `emptyApples`.

That is a complete answer to question 3 written by somebody else, and it is the same shape as this
app's Exercise, Fact pack and negative-Fact requirement. It is also the strongest single argument
for the Glossary's "Attempt is Independent or Assisted" rule: Lichess grades the same position as
a pass or a fail with no record of how much help was used, which is exactly the distinction the
glossary says must not be blurred.

### Chess.com — a library with a suggested path, not a curriculum

The 13 July 2026 support article documents a **Learn Path** divided into four skill levels —
**New to Chess** (moving pieces and the rules, including castling and en passant), **Beginner**
(basic strategy, finding checkmate, basic openings), **Intermediate** (endgames, full-board
strategy, pieces working together), **Advanced** (deeper endgame, opening, tactics) — with
courses and lessons inside each level, and a graduation marker at the end of a course. The article
also documents a separate **Lesson Library** with no order, filterable by skill level, theme and
instructor, and explicitly supports bypassing the path.

The one course I could read in full, **Learn To Play**, is 12 lessons and 35 challenges, released
12/18/2025: the king, the queen, the rook, the bishop, the knight, the pawn, en passant, capturing,
check, getting out of check, checkmate, castling — in that order, king first and castling last.
The Beginner level as a whole is an unordered mixture of instructor video courses, 99- and
130-challenge checkmate collections, tactical collections and a shelf of opening repertoires
("Learn the Sicilian Najdorf", "Learn the King's Indian Defense", and so on). It is a **library**,
and a comparison point, not an order to copy. I could not enumerate the New to Chess path's
internal order because it is behind a login.

## The proposed spine, and what a learner can demonstrably do at each topic

The 28 topics below are **my synthesis**: Steps Method Step 1 (15) plus Step 2 base (13), in Steps
Method's own order, with the cross-references that justify keeping each one. The "demonstrable"
column is written to be checkable on a board or on a detector, not to describe understanding.

| # | Topic (source: Steps lesson) | Corroboration | What the learner can demonstrably do, in checkable terms |
| --- | --- | --- | --- |
| 1 | Board and pieces (S1.1) | Lichess "board setup"; Chess.com "Learn To Play Chess" | Completes the array so that all 32 pieces are on their starting squares and no two overlap; then names what stands on e1 and on e8. |
| 2 | Moves of the pieces (S1.2) | Chess.com LTP 1–6; Lichess Chess pieces 1–6; ChessKid Pawn 1–6 | In a position containing one piece, plays a legal move to a named square, and says which squares that piece cannot reach. |
| 3 | Attacking and capturing (S1.3) | Lichess "capture"; ChessKid "hanging pieces" | In a fresh position, takes an undefended piece and takes nothing that is defended. |
| 4 | The pawn (S1.4) | Chess.com LTP 6; Lichess "pawns"; ChessKid Pawn 5 | Moves a pawn one square, captures diagonally, advances two squares only from its own starting rank, and promotes on arrival. |
| 5 | Defending (S1.5) | Lichess "protection"; ChessKid "learning to count" | Given a position where one of their pieces is attacked, plays a move that defends it, in a position they have not seen, including one where the piece is attacked by two pieces at once. |
| 6 | Check and getting out of check (S1.6) | Chess.com LTP 9–10; Lichess "out of check"; ChessKid "check" | Identifies that their king is in check and escapes it — by capturing the checker, by blocking, or by moving — in a position with no highlights. |
| 7 | Mate (1) (S1.7) | Chess.com LTP 11; Lichess "mate in one"; ChessKid "checkmate" | Finds a move that ends the game, in a fresh position. |
| 8 | Mate (2) (S1.8) | — | Finds a forced mate in two, and after playing the first move can say what the opponent's only legal reply is. |
| 9 | Castling (S1.9) | Chess.com LTP 12; ChessKid "how do I castle"; Lichess "castling" | Castles king-side and queen-side, and declines to castle when a right is gone or the king would pass through an attacked square. |
| 10 | Profitable exchange (S1.10) | Lichess "piece value"; ChessKid "when to trade" | Exchanges a piece for one of lower or equal value and does not exchange a higher-valued piece for a lower one, given the values. |
| 11 | Twofold attack (S1.11) | Steps S2.2–3, S2.8; Lichess theme `fork` | Finds a move after which two enemy pieces are attacked at once, and then says which of them is actually taken. |
| 12 | Draw (S1.12) | Lichess "stalemate"; ChessKid "stalemate" | Recognises a stalemate in a position where the side to move is not in check and has no legal move, and avoids creating one. |
| 13 | Mating with the queen (S1.13) | ChessKid "king and queen mate" | Delivers a king-and-queen mate from a position where the defender has only a king, and does not stalemate instead. |
| 14 | Taking 'en passant' (S1.14) | Chess.com LTP 7; Lichess "en passant"; ChessKid "special pawns" | Takes en passant on the move immediately after the opponent's two-square pawn move, and declines it when the window has closed or the capturing pawn is on the wrong rank. |
| 15 | The notation (S1.15) | — | Writes the correct SAN for a move just played. |
| 16 | Activity of pieces (S2.1) | Chess.com "opening principles"; ChessKid "first moves part 2" | Names which of their pieces is still on its starting square and plays a move that puts a piece where it can do more, in a fresh position. |
| 17 | Double attack: queen (1) (S2.2) | ChessKid "tactics: double attack" | As topic 11, with a queen as the attacker. |
| 18 | Double attack: queen (2) (S2.3) | — | As topic 17, and recognises the failed version — a double attack that wins nothing because the counter-capture is safe. |
| 19 | Pin (S2.4) | Lichess theme `pin`; ChessKid "tactics: the pin" | Identifies a piece that cannot move because doing so exposes a more valuable piece or the king, and moves a piece onto that square instead. |
| 20 | Eliminating the defence (S2.5) | Lichess theme `capturingDefender`; ChessKid "remove and destroy" | Names the piece that is defending a target square and removes it first, rather than attacking the protected piece directly. |
| 21 | The 3 golden rules (S2.6) | Chess.com "defeating pet openings" states the same four ideas | — see the evidence table: this one cannot be checked. |
| 22 | Mate in two (S2.7) | — | As topic 8, in a position with an obstruction that has to be removed first. |
| 23 | Double attack: R B N p K (S2.8) | — | As topic 11, with any piece as the attacker, and distinguishes a real double attack from one that also drops a piece. |
| 24 | Mating with the rook (S2.9) | ChessKid "king and rook mate", "rook roller" | Executes a king-and-rook mate from a position where the defender has only a king, waiting for the right moment to check. |
| 25 | Discovered attack (S2.10) | Lichess theme `discoveredAttack`; ChessKid "tactics: discovered attacks" | Finds a move that unmasks a second attacker, and a discovered check. |
| 26 | Defending against mate (S2.11) | Steps S1 plus; Chess.com "finding checkmate" | Finds the move that removes the mating threat, in a position where the threat is not yet mate. |
| 27 | The intermediate move (S2.12) | Lichess theme `intermezzo`; ChessKid "tactics: zwischenzug" | Plays a move that is not the threat but creates one the opponent must answer, and then continues with the original threat. |
| 28 | Solving tests (S2.13) | Steps S2 mix; the publisher's own "80%" rule | Answers a mixed set of positions where no topic is announced, and can say afterwards which of the earlier topics each one belonged to. |

## Evidence: what the app can compute, and what it cannot

The classes below are mine. They turn on one question: **is the success check a function of the
position, computable by a rules engine and board arithmetic, or does it require someone to judge a
move?**

- **A — evidenceable now.** The Fact already exists in the probe's fact pack, or is a rule the
  chess library already enforces.
- **B — evidenceable with new detectors.** The success check is still an exact function of the
  position, but the detector does not exist in the app yet. These are buildable and, crucially,
  testable: each one can be given a unit test with hand-checked positions, which is the discipline
  the probe found we do not have.
- **C — evidenceable only with an authored answer policy.** The *fact* is computable but the
  *target* is a curated list of accepted moves, so someone who plays chess has to supply the list.
  The app can check compliance; it cannot originate the list.
- **D — not evidenceable.** The success check requires judging the quality or the purpose of a
  move. No amount of engine time settles it, and the map's hard rule forbids the Coach asserting
  it.

| # | Topic | Class | The evidence, specifically |
| --- | --- | --- | --- |
| 1 | Board and pieces | A | Piece occupancy is board state. lichess's `setup` stage asserts `pieceOn` for each piece in turn. |
| 2 | Moves of the pieces | A | Legal move generation is chess.js's job. Our own probe already recorded a legal-move count as a Fact. |
| 3 | Attacking and capturing | A | `attackedByOpponent` and the available-captures list are already in the fact pack. Negative form is already there too. |
| 4 | The pawn | A | All four rules are enforced by the library; a wrong move is rejected, which is the evidence. |
| 5 | Defending | A | `defendedByYou` is already a Fact. This is the detector the probe's bug broke, so it needs its test before it needs its lesson. |
| 6 | Check and getting out of check | A | `inCheck` is already a Fact, and the set of legal replies is the proof. |
| 7 | Mate (1) | A | Already handled by the library; the engine also reports a forced mate. |
| 8 | Mate (2) | A | Engine verdict, or a bounded check that every legal reply permits mate in one. |
| 9 | Castling | B | Castling rights are already a Fact, and the library refuses an illegal castle. What is missing is the readable post-condition — the king is on g1/c1 and the rook on f1/d1, the squares the king crossed were not attacked — which is a new but trivial detector. |
| 10 | Profitable exchange | A, with a stated simplification | Material is already a Fact. The check "did the material delta favour me, given the values" is arithmetic. **Caveat, and it is a real one:** "profitable" in chess is not material count. See the risk note below. |
| 11, 17, 23 | Twofold attack: queen (1), R B N p K | B | New detector: for each legal move, recompute the position and count enemy pieces attacked. Two or more is a fork, exactly, with no judgement. lichess's own `fork` theme is defined the same way in its first-party description. |
| 18 | Double attack: queen (2) | B / C | The fork itself is B, as above. The lesson's second half — recognising the *failed* double attack, where the counter-capture is safe — cannot be derived from the count, because whether the counter-capture is safe is exactly what the engine has to be asked, and which of several attacks is "the failed one" is our selection. The detector finds forks; an author has to say which fork is the lesson. |
| 12 | Draw | A / B split | Stalemate is A: not in check, and no legal move. Repetition and the fifty-move rule are B: both need move-history work the app does not yet do. **Insufficient material** is neither — it is a rulebook judgement the app cannot make, so "this is a draw" must never be asserted. |
| 13, 24 | Mating with the queen / the rook | A for the mate, C for the pattern | "This move is checkmate" is a Fact. "This is the rook roller" is a classification the app cannot verify, and teaching the name is teaching a label the code has not established. See the risk note. |
| 14 | En passant | A | The en-passant square is in the FEN, the rule is enforced, and the timing constraint is a property of that square. |
| 15 | The notation | A, and not chess | The library produces SAN. It needs no detector and no engine, and it is the only topic on the spine with no board content at all. Fits the Quickstart better than the main sequence. |
| 16 | Activity of pieces | B / C | Mobility is a Fact: count a piece's legal destinations. "Still on its starting square" is already a Fact. But *which* piece is "least active", and what counts as an acceptable improvement, is our policy — C. The honest split: compute the mobility, author the target. |
| 19 | Pin | B | Exact, and computable: for each enemy piece, remove it and test whether the opponent's king becomes attacked. If yes, the piece is pinned. The hard part is not the computation but the edge cases — relative pins, pins that only matter because of a third piece, x-rays. This is the topic where a wrong detector does the most damage, because the *name* is what the learner keeps. |
| 20 | Eliminating the defence | B | Exact: find the square that must be defended, find what defends it, and check whether a move removes the defender. lichess's `capturingDefender` theme is defined in exactly these terms. |
| 21 | The 3 golden rules | **D** | These are principles, not moves. "Develop, castle, control the centre" cannot be checked on a position; the app could only assert that a move matched an engine line and call that development, which is the exact substitution the prior report warned against ("the engine chose it because it improves your bishop" is a causal claim we cannot substantiate). Recommendation: drop it as a graded topic and keep its content as the wording inside the Fact for topic 16. |
| 22 | Mate in two | A | As topic 8. |
| 25 | Discovered attack | B | Exact: a move after which a previously blocked slider attacks a target. Same edge-case exposure as the pin. |
| 26 | Defending against mate | B | Bounded search: enumerate legal moves and keep those after which the opponent has no mate. The engine settles it; the app does not have to understand why. |
| 27 | The intermediate move | B / C | "This move creates a threat the opponent must answer" is computable, but deciding that a move is *the* intermediate move rather than the threat itself is a policy. Half B, half C. |
| 28 | Solving tests | A / B, as a format | A mixed set is a delivery mode over topics 1–27, not a topic. It is the right shape for the Diagnostic and for the review queue, and it is the format in which the app can notice a repeated weakness without ever naming the learner by it. |

**Tally for the 28-topic spine: 12 are class A, 8 are class B, 6 are split (Draw A/B; the two
mating-pattern lessons A/C; activity of pieces, the second queen double-attack lesson and the
intermediate move B/C), 1 is a delivery format, and 1 — The 3 golden rules — is class D.** So
**27 of 28 topics can be machine-evidenced**, and the one that cannot should not be a graded topic.
The five topics that need a chess player to supply an answer policy, and therefore cannot be
authored by this project alone, are exactly the ones carrying a C: 13, 16, 18, 24 and 27.

Note what this does *not* say. It says the success check is computable. It does not say the
content is free: every one of the 28 still needs a starting FEN, a hint ladder, a counterexample
and an explanation, all written by us, in words nobody who plays chess has checked. That is
authoring work, and it is a different kind of risk from adjudication — but it is not zero, and the
honest count of "chess review we cannot get" is 5 answer policies plus 28 sets of prose.

### What the map's constraint does to this

The map's hard rule is that no learner-facing sentence may assert something about the position that
the code has not established. Class D topics cannot satisfy it, and class C topics satisfy it only
for the fact, not for the label. That is a strong argument for a spine that is mostly A and B: not
because A and B topics are better pedagogy, but because they are the only ones we can honestly
teach. The 28-topic Steps spine is unusually well suited to that, and it is worth being explicit
that this is the reason for the recommendation, since it is not the reason a curriculum
enthusiast would give.

The same reasoning is why the Lichess Learn data file matters more than the Lichess Learn
*content*. It proves the shape is achievable — goal, FEN, success predicate, failure predicate,
board clue, refutation after a wrong answer — by a project with no chess teacher, which is our
exact situation. It does not prove the shape teaches.

### The four topics where this is most likely to go wrong

Ranked by how much damage a silent error does, which is the failure the coach probe actually
observed. All four are graded **B or C**, so none of them is blocked; all four are places where
the app will be wrong before it is right.

1. **Pin, discovered attack, and eliminating the defence (topics 19, 25, 20).** All three are
   exactly computable, which is precisely why they are dangerous: the detector will return a
   confident boolean, and the *name* of the concept is what the learner will remember. Relative
   pins, pins that only matter because of a third piece, x-ray lines, and a "pin" that exists only
   while a threat hangs are the edge cases, and each is a definition decision we would be making
   without a chess player. The probe's first detector used the wrong chess.js method and produced
   a fact pack in which every piece looked undefended; every model then wrote confident, wrong
   teaching. These three lessons need their detector test suites written before their prose, not
   after.
2. **Mating patterns (topics 13, 24).** "This move is checkmate" is a Fact; "this is the rook
   roller" is not. Teaching the pattern name means the app asserts a classification it cannot
   verify — the same shape as the probe's invented pin. These are the two topics where class A and
   class C sit inside a single lesson, and they should be split: grade the mate, and either drop
   the pattern name or present it explicitly as a label we are attaching rather than a fact we
   found.
3. **Profitable exchange (topic 10).** This looks like pure arithmetic and is the topic most
   likely to be quietly wrong. Material count is a Fact, but "profitable exchange" in chess is not
   material count: a bishop pair, doubled pawns and a pawn pair all change the answer, and
   lichess's own lesson reduces it to a rule — do not trade a higher value for a lower one — while
   its scoring code uses a different table from the values it teaches. That gap is a sign the
   simplification is a teaching device, not chess. As long as we present it as the rule it is, and
   not as an evaluation, it is honest; the day we say "this exchange is good", it is not.
4. **Activity of pieces (topic 16).** The first strategy topic, and the gateway to every later
   one. Mobility and "still on the home square" are computable, so the Fact is fine. What is not
   computable is designating a piece as the one to improve, or judging whether a move improved it —
   which is why it sits at B/C. There is a cheap trap here: the engine's preferred move is very
   often a developing move, so "the engine chose it, therefore it develops" is available and
   wrong, for exactly the reason the prior report gives about causal claims from a favourable
   score.

Draws (topic 12) is a fifth, lower-risk item worth naming: stalemate and the move-count rules are
computable, but **insufficient material is a rulebook judgement**, so "this is a draw" must never
be an assertable Claim in this release.

## Licensing: reference versus reuse

This is the part with a hard constraint in it, so it comes before any further recommendation.

**Chess.com is the strictest and it is aimed at us by name.** The User Agreement (last updated
25 March 2026) reserves all Content, grants only a limited, revocable, personal, non-commercial
licence to access, view and print, and prohibits using, copying, reproducing, distributing or
creating derivative works from anything obtained through the Services. Section 4 is titled
"Artificial Intelligence Restrictions" and prohibits automated or AI access to their content,
including — by name — using it to develop "chess engines, training models, **educational tools**,
or game databases", or to "create or improve any product or service that competes with or
substitutes for Chess.com". Public search and answer engines are allowed to index pages for
results; anything else needs prior written authorisation, at their discretion. **Consequence:
Chess.com may be read by a person for comparison. It may not be ingested, scraped, mirrored or
mined as a source for building this app's educational tool, and citing it in this document is the
limit of what we do with it.** I would not have found that clause by inference; it is written down.

**Lichess splits three ways.**
- The **puzzle database export is CC0** — "Use them for research, commercial purpose,
  publication, anything you like. You can download, modify and redistribute them, without asking
  for permission." This is the one substantial, unambiguous data permission in the whole ticket,
  and it is already the practice bank.
- The **lila code is AGPL-3.0-or-later**, per the ToS (last modified 1 August 2026). The Learn
  stage definitions, the assertion vocabulary and the theme descriptions I cite are all inside
  lila. Reading them as a design precedent is unproblematic; **copying them into this app would
  carry an AGPL obligation**, and this app already ships GPLv3 Stockfish, so that is a decision
  nobody has made yet.
- **Study chapter content is user-submitted.** The ToS grants a worldwide, royalty-free,
  sub-licensable licence over content submitted through the services, but the terms also say
  different services carry different licences, reserve the right to change licensing, disclaim
  non-infringement, and prohibit distributing material you have no right to distribute. Public
  visibility is not a per-item licence and the author is unknown. Reference only.

**ChessKid is reference only.** The official curriculum page states the curriculum "is free for
use by schools and **may not be redistributed in any way for commercial use**", and the download is
behind a form. The lesson map article carries no licence statement. I did not read ChessKid's
Terms of Use, so I am not characterising them; the curriculum page's own sentence is enough. Do
not import the sample teacher PDF, and do not reuse the lesson text.

**The Steps Method is reference only, and it is the most likely to be over-read.** No licence
statement appears anywhere on the site. The colophon credits Brunia and van Wijgerden as
developers, Rupert van der Linden for the drawings, and a named English translation team; the site
is commercially operated and sells the books. The method is taught in schools and clubs across
several countries on that basis. Nothing here grants us anything: no CC licence, no permission, no
open material. **Public availability is not a licence** — the site publishes sample PDFs, twelve
playable sample exercises per workbook, and downloadable trainer answer keys, and none of that
changes the position. Use the sequence of lesson topics, the level definitions and the shape of a
lesson. Write every word and every position ourselves.

**Summary for the ticket:** reuse the CC0 puzzle export as data. Use all four curricula as
reference for topic order and level definitions. Copy no prose from any of them. Do not use
Chess.com's content for this purpose at all, on the express terms of its User Agreement.

## Confidence, and what this settles

**First-party facts in this document** (read directly, on 27 September 2026, from the sources named
in the table at the top): every Steps Method lesson list and every edition number; the Steps
Method's own statement about postponing mate and the Stepping stones 1 coverage; the ChessKid level
names, lesson numbers, lesson slugs and topic counts, and the stale tooltips; the Lichess Practice
catalogue and its 32 exercises in 5 sections; the Lichess Learn category and stage order, the
level schema, and the complete assertion vocabulary in `ui/learn/src/assert.ts`; the Lichess
puzzle export's licence, field list, size and update date; the Chess.com support article's four
skill levels and its statement that the Lesson Library has no order; the Learn To Play course's 12
lessons, 35 challenges and release date; the Chess.com User Agreement's ownership, licence,
use-restriction and AI-restriction clauses; the ChessKid curriculum page's redistribution term; the
Lichess ToS's last-modified date and its statement that licences differ per service.

**My judgements, not evidence:** that the Steps Method should be the spine; that its ordering
fits a detector-first architecture better than the alternatives; the four evidence classes and the
classification of all 28 topics; the 12/8/6/1/1 tally; the proposed observation wording in the
"demonstrably do" table; that The 3 golden rules should be dropped as a graded topic; that the five
topics carrying a C are the residual chess-review risk; the ranking of the four riskiest topics;
that the notation belongs in the Quickstart.

**Publisher effectiveness claims, which are marketing and are not treated as evidence here:** the
Steps Method site's assertion that postponing mate works because "practice has shown that this
approach works perfectly" and that "children learn to play chess very well"; ChessKid's
description of its curriculum as the only one of its kind, "organised to maximise effective
learning and retention", and free for schools; Chess.com's support article calling its lessons an
"incredible resource". None of these is a controlled comparison, and the Steps Method page's own
accompanying argument — a named pupil's rating rising from 1000 to 1772 — is a single uncontrolled
anecdote. I searched for comparative studies of beginner chess curricula and found none, so the
recommendation rests entirely on fit with our evidence layer. That is a legitimate reason. It is not
a reason to believe this order of topics teaches better than another.

**Limits of this note.** I could not verify the Chess.com Learn Path's internal order or whether
the ChessKid product gates on its level order, because both are behind a login. I read the Steps
Method topic lists from the publisher's product pages, not from the manuals themselves; the
manuals contain an introductory article on "Sequence of the teaching material" that is not
published online, so the published lesson lists may be a summary of a more granular sequence. The
ChessKid sample teacher PDF is a text-extraction-hostile scan and I read structure, not wording. I
did not read ChessKid's Terms of Use. The Steps Method site is a staging deployment carrying a
"not a live website" banner, so edition numbers on it may lead the printed books.

**What this settles.** It settles the topic order, and it settles which of those topics the app
can be honest about. It does not settle that the resulting lessons teach anything, and it does not
remove the residual risk: five answer policies still need a chess player, and all 28 sets of prose
will be written by a non-player. It follows that the curriculum ordering is the part of this
release we can defend, and the wording is the part we cannot — which is the same asymmetry the
coach probe found, one level up.
