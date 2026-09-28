# Generalise the game core, or run exercises beside it?

Type: grilling
Status: resolved
Blocked by: 04

## Question

Today's reducer replays from the standard start with the learner as White. Exercises need
starting positions and either colour. Two shapes:

- **Generalise** the existing model to carry a start position and a learner side. One game model,
  one undo rule, one persistence shape — but every assumption gets revisited, and free play is
  the thing currently under test.
- **Parallel**: leave free play exactly as it is and give exercises their own state. Cleaner
  boundary and no regression risk, at the cost of two models of a game and two sets of rules to
  keep straight.

Decide on the evidence from the inventory, not on taste. Consider that the engine already replays
arbitrary positions, and that the repository's stated discipline is a thin wrapper over chess.js
with heavy test coverage — both argue for one model, but neither settles what a *learner colour*
means for undo.

## Comments

## Answer

**Generalise. One model of a game, carrying a start position and a learner side.**

Decided on the inventory's evidence, not on taste. Three measurements decided it.

### 1. The move list is already the whole model

`replay()` (`gameState.ts:86`) is the only thing that knows where a game starts, and it takes a
move list. Every rule — the play guard, truncation, the status recompute, the resign handling —
operates on lists and is already position-agnostic. A start FEN is a field threaded through two
functions. There is no second model to write, because the existing one was never position-specific;
it only *looked* White-specific through the undo rule.

### 2. The White assumption is one line and one test, not a scattered assumption

The inventory found three places assuming White. Two are cosmetic (the subtitle, the promotion
artwork). **Exactly one is load-bearing: the even-ply parity in `undo`** — and it is a property test,
not a fixed expectation:

```
'never leaves the board waiting on the opponent'   gameState.test.ts:338
  expect(undone.moves.length % 2).toBe(0)
  expect(gameAt(undone).turn()).toBe('w')
```

That test states its property in prose — *never leaves the board waiting on the opponent* — and then
expresses it in White terms because White is the only case it currently runs. Generalising the
reducer generalises the assertion: parity becomes a function of learner side, and the same property
holds for Black. **The test was already written for the general case and happens to check one
instance of it.** This is the strongest single argument for generalising, and it is not a matter of
opinion.

### 3. The parallel model would have to re-implement, badly, things that already work

48 reducer tests, 65 persistence tests, 27 rules tests, 20 classification tests. A parallel exercise
model means a second replay, a second undo, a second status derivation, and a second persistence
validator — and then two sets of tests for the same chess rules, which is precisely the cost that
makes chess UIs wrong. `persistence.ts:241` (`replayStored`) is a hand-written second replay
*already*; forking that into two models doubles a subtlety nobody chose twice on purpose.

### What the decision does not claim

It does not claim free play is unaffected. Three things will change under generalising, and all
three are deliberate:

- `undo` parity becomes computed from learner side rather than hardcoded. **This is the change most
  likely to break something**, and the property test above is what will catch it.
- Promotion artwork becomes colour-aware. Today it draws White unconditionally
  (`PromotionPicker.tsx:70`); a Black-to-move exercise would otherwise show the wrong colour's
  pieces with no error.
- `Captured` needs its documented precondition enforced rather than trusted. It renders confidently
  wrong output for a FEN-loaded `Chess` — a correct material number beside empty capture lists, with
  no error. Exercise positions will trip this, so the prop should be widened to the move list or the
  contract made runtime-checked, as its own docs already suggest.

### Why not the third option nobody writes down

A separate exercise store that is not a game and not a free-play game — its own position, its own
attempt log, no undo — is genuinely simpler *per exercise*, and is what most tutorial apps do. It
was rejected for one reason: it cannot reuse the free-play board, undo and navigation that the
learner is about to be told to use, and the learner record ([*What does the learner record store?*](12-the-learner-record.md))
then spans two position models. Given that the learner record is the app's main evidence and the
review queue points at exact positions, one position model is worth more than the simplicity.

**Consequence for the record:** a start position and a learner side are now first-class fields of
the game model. [*What does the learner record store?*](12-the-learner-record.md) and
[*What would show the first release teaches?*](14-what-evidence-would-show-it-works.md) inherit
that, and any exercise record can point at an exact position without a second convention for naming
one.
