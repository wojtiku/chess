# What would exercises require us to change?

Type: task
Status: resolved

## Question

Not a decision: an inventory. Enumerate, from the actual code, everything that stands between
today's game and an exercise played from an arbitrary position by either colour.

Cover at minimum: starting FEN (nothing in the model accepts one), learner colour (three places
assume White, one of them the even-ply undo rule), the Board's missing affordances (no square
highlight, no side-to-move override, arrows carry no styling), per-move metadata in the move list,
undo and resign semantics, the one-game persistence slot, and the search queue's rule that
analysis never interrupts play.

For each item: the file and line, what breaks, and whether it is a change or a replacement. Flag
every assumption in the existing code that an exercise violates. Do not propose designs; the next
ticket decides.

## Comments

## Answer

An inventory, from the code. No designs proposed — that is
[*generalise or parallel?*](07-generalise-or-parallel.md)'s job.

### A. Starting position — the deepest change, and it is one line deep

`replay()` at `src/game/gameState.ts:86` opens with `newGame()`, which takes no FEN
(`src/chess/rules.ts:21`). `newGame()` is called in exactly two places: `initialState()` (`:45`) and
`replay()` (`:87`). Everything else in the file — the play guard, the truncation, the even-ply
undo, the status recompute — operates on *move lists* and is entirely independent of where the
list starts.

So adding a start position is **one field threaded through two functions**, not a rewrite. The move
list stays the authoritative state, which is the property that makes the existing tests meaningful.

The trap is `GameSnapshot` itself: it is `{moves, cursor, status, resignedBy}`. A start FEN added
there is inherited by every consumer, and **the promotion picker draws White artwork unconditionally**
(`src/ui/PromotionPicker/PromotionPicker.tsx:70`) with a comment saying the app gives the learner
White. That is a visible, shippable bug the moment a Black-to-move exercise exists — promotion is
the one place where the wrong colour's art is impossible to miss.

### B. Learner colour — the parity assumption is in the reducer, not the UI

The learner-as-White assumption appears in three places, and the one that matters is in the
reducer: `undo` cuts to the largest **even** ply count (`gameState.ts:163`), with an explicit
`PRODUCT ASSUMPTION` comment. The other two are `learnerToMove` in `useGame.ts:170` and the
promotion artwork above.

Measured: with the learner as White, the learner is to move at ply counts 0, 2, 4. With the learner
as Black, it is 1, 3, 5. **The parity flips.** So this is not "make a constant configurable" — the
undo rule is a function of learner side, and getting it wrong produces a take-back that leaves the
learner staring at the board waiting for the engine, which is precisely the bug the existing comment
warns about.

[*What is an exercise?*](06-what-is-an-exercise.md) answers **learner is White in release 1, but
the model carries a learner side from day one**. So this is a *field with one value used*, not a
behaviour change — which is the cheapest possible form of the retrofit and worth stating plainly,
because the alternative (hardcode White a fourth time) is what the codebase already did three times.

### C. Board affordances — two small props, one structural gap

`Board` reads four things off the `Chess` object and nothing else: `board()` (`:66`), `fen()` (`:143`),
`turn()` (`:158`, `:163`). It has `orientation` and `interactive` as props already, and
`interactive={false}` suppresses input — so "a position the learner may look at but not move" needs
no new prop at all.

Missing, and genuinely needed:
- **arbitrary square highlighting.** The only square states are `data-selected`, `data-target`,
  `data-last`, `data-check`, all derived internally. A hint that says "look at your undeveloped
  pieces" has no way to point at them.
- **arrow styling.** `BoardArrow` is `{from, to}` with one style. A "this is where it went" arrow and
  a "this is where it could go" arrow are visually identical today, which is a problem for a
  consequence demo and for anything comparing two lines.
- **side-to-move override.** The board reads `game.turn()` internally, so it cannot render a
  position where it is *not* the learner's turn without a matching `Chess`. For an exercise that
  needs the learner to consider a position where the opponent moves, this blocks it.

### D. Move list — the smallest change on this list

`MoveList` takes `moves: Array<{san}>` and reads only `.san`. A graded attempt needs the label
(Recommended / Also fine), the Concept, and the independence flag. Widening the element type is a
type change plus render work; nothing structural resists it.

### E. Persistence — one slot, two keys, and a lesson record that does not fit

`src/game/persistence.ts:33-34` hardcodes two keys, `chess.settings.v1` and `chess.game.v1`, with
the version in the key and no `version` field in either payload. `StoredGame` is a move list plus
`resignedBy`; **`saveGame` takes `resignedBy` as a required parameter**, deliberately. There is one
in-progress game and no history.

An exercise is not a game and a learner record is not a game. [*When does the call fail?*](08-when-the-call-fails.md)
already decided the cache stores the fact pack with each coach sentence, so the provenance record
has a home; it just is not this module.

### F. Search queue — the constraint is real and already documented

`src/engine/searchQueue.ts:7` is one-at-a-time by design, because `EngineClient` answers one `go` at
a time, and an urgent request aborts what is running. Play is urgent; background analysis is not.

Exercise grading is a **wide** search (MultiPV ≥ legal moves, up to 37) which occupies the engine for
its full budget. Two consequences for whoever builds this: an exercise search must not be urgent, or
it will abort a game in progress; and a consequence demo after a wrong move is a *second* search, so
the queue will visibly stall. This is the argument for pre-computing exercise analysis at build
time rather than per attempt.

### G. What already exists and is unwired

Worth knowing before building anything:
- `src/game/classification.ts` — complete, tested, **zero consumers** (only its own test imports it).
  `best`/`good`/`inaccuracy`/`mistake`/`blunder`/`forced` with 20/50/100cp bands.
- `hasSingleLegalMove` (`src/chess/rules.ts:65`) — also unwired outside tests, and it is the natural
  source of `classify`'s `forced` flag. Together these are most of "is this move good enough to
  accept", already written and already tested.
- `hintMode: 'best' | 'good'` and `GOOD_ENOUGH_CP = 50` in `src/analysis/hints.ts` — the tolerance
  rule that ADR-0001's Standing vocabulary is built on.

### H. Things that are *not* problems

Stated so a later session does not go looking for them:
- **Perft** is already a first-class test (`src/test/perft.test.ts`, 5 positions, a full-depth mode).
  Positions and move lists are verifiable to a known node count without a chess player.
- **`statusOf` and `isGameOver`** are pure functions over a position and carry over unchanged.
- **The engine needs no `searchmoves`.** Measured in the exercise answer: MultiPV returns every
  legal move, so grading is one ordinary search. This matters beyond convenience — the licensing
  research made patching Stockfish a licence decision, so "extend the engine" is not a shortcut here.
