# Chess Practice Board — Design Spec

**Date:** 2026-09-25
**Status:** Draft for review
**Sub-project:** A of three (see [Scope](#9-scope))

---

## 1. Summary

A browser-based chess app for learning to play better. You play against a computer
opponent whose strength you control, and the app tells you honestly whether you
made a good move.

The app is client-side only. No server, no account, no network calls at runtime.
Everything — rules, engine, persistence — runs in the browser.

## 2. Intent and success criteria

**Who it is for:** someone learning chess who wants a sparring partner they can
actually beat, and feedback they can trust.

**Success looks like:**

1. The rules are right. Every legal move, castling, en passant, promotion,
   check, checkmate, stalemate, the fifty-move rule and threefold repetition
   behave exactly as printed chess rules require. A wrong rules implementation
   would teach wrong chess, so this outranks every other concern.
2. The opponent is beatable at the low end and does not feel random. It plays
   like a weak human, not like a machine throwing away pieces.
3. The feedback is trustworthy. When the app says a move was bad, it was bad.
4. Refresh the page and your game is still there.

**Explicitly not the goal:** the strongest possible engine, a pretty portfolio
piece, or a competitive ladder.

## 3. Key decisions

| Decision | Choice | Why |
|---|---|---|
| Rules | `chess.js` | The most battle-tested JS chess library. Perft-validated, handles SAN, PGN, FEN, threefold, fifty-move, insufficient material and underpromotion natively. Removes the largest correctness risk in the project. |
| Engine | `stockfish` (Stockfish **19**, `lite-single` WASM build) in a Web Worker | Its NNUE evaluation is accurate enough to *teach from*. Weaker engines give advice that is sometimes wrong, which is worse than no advice. Also provides `Skill Level` for beatable-but-human play, and rich `info` output (score, depth, PV, MultiPV) that powers hints and the eval bar. |

**Engine licensing — GPL-3.0.** The `stockfish` npm package and the WASM binary it
ships are GPL-3.0 (the MIT notice in the package's `index.js` covers only that
Node wrapper, not the engine). This is fine for a local, self-hosted personal app
and is the reason we take the engine as an unmodified dependency rather than
vendoring its source. It would have to be revisited before this were ever
published or hosted as a closed-source product. `chess.js` is BSD-2-Clause.

**Engine size — smaller than assumed.** The `lite-single` build is ~1.8MB of
WASM (not the ~7MB quoted from the upstream README, which describes the
multi-threaded lite build). The lazy-load plan in §7.4 is comfortable at this
size.
| Difficulty | UCI `Skill Level` (0–20) | Purpose-built by Stockfish for playing below full strength. Gives believable beginner mistakes instead of random ones. |
| Build | Vite + React + TypeScript | Board, move list, hints and eval bar are interdependent state; React models this directly. |
| Architecture | Chess.js owns position; engine is a pure FEN-in/answer-out service | Prevents castling/en-passant state drift, which is the classic source of illegal games when an engine holds its own position. |

### Alternatives considered and rejected

- **`js-chess-engine` (single dependency, rules + AI):** appealing for being one
  small typed package. Rejected because its evaluation is material + piece-square
  tables at up to 12 ply — good enough to pick a move, not good enough to tell a
  learner they were wrong. Its lowest difficulty level is also 1-ply, so it
  plays randomly rather than humanly.
- **Hand-rolled engine (alpha-beta, PST eval, blunder knob):** best for learning
  *how* engines work. Rejected because the goal is learning chess, and because
  the rules engine would then also be ours to get right.
- **`chess.js` + our own simple bot, Stockfish added later:** fastest first win,
  but means writing throwaway AI. Rejected as speculative.
- **Next.js:** no server-side need today. Rejected as unjustified complexity.

## 4. Architecture

```
src/
  chess/
    rules.ts          Thin wrapper over chess.js. THE source of truth for legality.
    types.ts          Square, Move, GameStatus, GameResult, Side
  engine/
    uciClient.ts      Parse/serialize UCI protocol lines -> typed events. Pure.
    worker.ts         Web Worker hosting the Stockfish WASM binary.
    useEngine.ts      React hook: worker lifecycle, request/response, cleanup.
  analysis/
    evaluate.ts       analyze(fen, opts) -> { score, best, lines[], depth }
    hints.ts          Choose a hint move from an analysis result.
    cache.ts          FEN-keyed result cache, bounded size.
  game/
    useGame.ts        Game state machine: new game, move, undo, navigate, resign.
    history.ts        SAN move list, navigation cursor, replay.
    difficulty.ts     UI level <-> Skill Level mapping, think-time policy.
    persistence.ts    localStorage read/write with corrupt-input tolerance.
  ui/
    Board/            Squares, pieces, highlights, arrows, drag + click.
    MoveList/  Captured/  EvalBar/  GameControls/  DifficultyControl/  PromotionPicker/
  test/
```

**Dependency direction is strictly one-way:**
`ui/` → `game/` → `analysis/` → `engine/` → `chess/rules.ts`.
`ui/` never imports from `engine/` **at runtime**. A type-only import of the
engine's status union is permitted and erased at build time; it carries no
coupling. `chess/rules.ts` imports nothing from this app.

### Interfaces

These are the seams. Everything else is an implementation detail behind them.

```ts
// chess/rules.ts — the only place legality is computed
export function createGame(): ChessGame
export function legalMoves(game: ChessGame, from?: Square): MovesMap
export function applyMove(game: ChessGame, m: Move): MoveResult   // { game, san, status }
export function boardAtMove(moves: Move[], cursor: number): ChessGame  // replay
export function toFen(game: ChessGame): string
export function toSan(game: ChessGame, m: Move): string

// engine/uciClient.ts — pure, no worker, no chess knowledge
export type UciEvent =
  | { type: 'ready' }
  | { type: 'info'; depth: number; scoreCp?: number; scoreMate?: number;
      pv: string[]; multiPv: number }
  | { type: 'bestmove'; move: string | null }
export function parseUciLine(line: string): UciEvent | null

// analysis/evaluate.ts
export interface Line { uci: string; san: string[]; scoreCp?: number; scoreMate?: number }
export interface Analysis { fen: string; scoreCp?: number; scoreMate?: number;
                            lines: Line[]; depth: number }
// score is from the perspective of the side to move in `fen`.
export function analyze(fen: string, opts: { multiPv: number; movetimeMs: number }): Promise<Analysis>
```

`analysis/evaluate.ts` and `analysis/hints.ts` are the deep modules: a tiny
surface hiding engine lifecycle, UCI parsing, SAN conversion and caching. They
take a FEN and return a judgement. They know nothing about React, the DOM, or the
current game — which is exactly why they are unit-testable without a browser.

## 5. Data flow

**A computer move:**
1. `game/` derives the current FEN from the chess.js instance.
2. `analysis/evaluate.ts` posts `{ fen, multiPv, movetimeMs }` to the worker.
3. The worker lazily boots Stockfish on first use, sets `Skill Level`, sends
   `go movetime N`.
4. The worker streams `info` lines back; `uciClient` parses them; the final
   `bestmove` resolves the promise. The best `info` seen becomes the score/PV.
5. The engine's move (`e2e4`, `e7e8q`) is converted to `{from, to, promotion}`
   and applied to chess.js. **The SAN for display is read back from chess.js**,
   never constructed by hand.
6. `game/` advances the cursor. `ui/` re-renders from state.

**Undo / navigation** is always `boardAtMove(moves, cursor)` — a replay from the
start. See [§7.5](#75-undo--take-back).

## 6. Features

### 6.1 Game setup

New game starts from the standard position. You play White. The board can be
flipped (`Flip board` control) and that preference persists. There is no colour
choice in this sub-project — White only, which keeps the learning feedback
unambiguous (you are always reviewing your own moves).

### 6.2 Board interaction

- Click a piece to select it; legal destinations show as dots (empty squares) or
  rings (captureable). Click a destination to move. Clicking the selected piece
  again deselects.
- Drag-and-drop as an equal alternative, with a ghost piece under the cursor.
- Clicking an illegal destination snaps back with no state change.
- On the opponent's turn all interaction is inert.
- Promotion opens a small piece picker at the destination (Q/R/B/N). Escape
  cancels. Underpromotion is a first-class choice, not an afterthought.

### 6.3 Computer opponent

**Difficulty.** Five presets, mapped to UCI `Skill Level`:

| Preset | Skill Level | Intended opponent |
|---|---|---|
| Beginner | 1 | New player. Misses tactics, still forms a coherent plan. |
| Easy | 4 | |
| Medium | 8 | Default. Roughly a club beginner. |
| Hard | 13 | |
| Expert | 20 | Full strength. |

An advanced disclosure exposes the raw 0–20 slider for fine tuning. The two
controls are one setting with two views: moving the raw slider updates the preset
label to `Custom` (showing the exact level) and moving the preset slider snaps the
raw value to that preset's level. There is never a state where the displayed
preset and the actual `Skill Level` disagree.

`Skill Level` is re-sent after every `ucinewgame`, so changing difficulty
mid-game takes effect on the computer opponent's next move.

**Think time.** A single "minimum think time" control, 0–3000ms, default 500ms.
The wait before playing the reply is `max(engineElapsed, minThinkTime)`. The floor
exists because a 20ms reply feels like the bot is reading your mind and steals
the time you needed to think about *your* next move. Setting it to 0 gives the
genuinely minimal behaviour. A fixed always-the-same delay is deferred.

**Search budget.** `go movetime 1500` for normal play, 3000 for hint/analysis
requests. Hard-capped so the UI can never hang on a pathological position.

### 6.4 Hints

Two modes, chosen in the UI, because "best move" alone trains you to memorise a
single answer:

- **Best move** — the top engine line.
- **A good idea** — any move within 50 centipawns of best, selected
  pseudo-randomly. Closer to how a human chooses among reasonable moves.

Rendering: an arrow from origin to destination on the board, plus the engine's
continuation line in SAN underneath. **The hint never plays the move for you** —
there is a separate explicit "play this" button.

Analysis results are cached by FEN (bounded map, ~500 entries) so re-requesting a
hint for a position already analysed is instant. The eval bar shares this cache.

### 6.5 Undo / take-back

Undo rewinds **two plies** — your move and the engine's reply — so it is your turn
again. If the engine has not yet replied, it rewinds one ply.

Implementation is replay, not reversal: `boardAtMove(moves, cursor - n)` rebuilds
a fresh chess.js from the move list. This is O(n) and n is tiny. It is correct by
construction and, critically, it **preserves threefold-repetition counters** —
which any hand-rolled undo would silently corrupt.

Take-back is unlimited and not penalised. The app is a practice tool, not a rated
match.

### 6.6 Move list and navigation

Full move list in SAN, grouped into move-numbered pairs. The current position is
highlighted. `◀ ◀ ◀` and `▶ ▶ ▶` buttons and arrow keys step backward/forward
through the whole game without altering it. Stepping back does not hand control
to the other side — it is review, not a move.

### 6.7 Eval bar

A vertical bar beside the board showing the engine's evaluation, White at the
bottom. Centipawn scores render as a pawn fraction (`+1.4`); mate scores render
as a decisive marker (`M4` / `-M3`) rather than a number. The bar eases between
values rather than snapping, and only updates when a deeper search improves the
score, so it does not jitter during analysis.

### 6.8 Captured pieces and material

Captured pieces listed beside the board with the material difference shown. Purely
informational, and it makes blunders feel like blunders.

### 6.9 Controls

New game, undo, resign, flip board. Resign ends the game immediately and records
the result.

A result banner appears for **every** terminal state, not just resignation:
checkmate, stalemate, threefold repetition, the fifty-move rule, insufficient
material, and resignation. Each names the specific reason — "Draw by threefold
repetition" teaches something, "Game over" does not. The final position stays on
the board.

### 6.10 Persistence

Two `localStorage` keys, versioned:

- `chess.settings.v1` — difficulty preset, raw skill level, min think time,
  board orientation, theme, hint mode.
- `chess.game.v1` — the **move list**, plus result metadata. Never a bare FEN:
  a FEN alone loses the history that repetition detection depends on.

On load, both are parsed defensively. Any unparseable, wrong-version or
wrong-shaped value is discarded silently and the app starts fresh. **Corrupt
storage must never prevent the app from starting.** Writes are wrapped so a
quota or private-mode failure degrades to a session-only game without an error
dialog.

## 7. Design details worth pinning down

### 7.1 The engine never owns the position

Stockfish receives a FEN string and returns a move plus a score. That is the
entire contract. We never adopt the engine's internal board. If the engine's
position could become authoritative, castling rights and en-passant squares
drift out of sync with the real game and you get positions that are illegal or
unrecoverable. This one rule is what makes the whole design safe.

### 7.2 Applying an engine move

`e7e8q` → `{from: 'e7', to: 'e8', promotion: 'q'}` → applied to chess.js. If the
engine returns a move that chess.js rejects as illegal (a version-skew or engine
bug), the move is logged, discarded, and replaced with a legal move from chess.js.
**An illegal move is never applied to the board.**

### 7.3 Graceful degradation without an engine

If Stockfish fails to load — bad WASM path, blocked by CSP, no WebAssembly — the
app must not become a blank page. It shows a clear message, **disables only the
engine-dependent features** (computer move, hints, eval bar), and continues to
offer a fully working **two-player local board**. This is a real, useful mode, and
it is the reason the rules layer is kept completely independent of the engine.

### 7.4 Worker lifecycle

The worker is created lazily on first need (first computer move, first hint, or
first eval request) so the ~1.8MB engine is never on the critical path for first
paint. One worker per app instance, terminated on unmount. If the worker dies
mid-search, it is recreated and the request retried **once**; a second failure
surfaces an error rather than looping.

### 7.5 Undo and take-back

Covered in §6.5. The invariant worth stating: **every position in the app is
derived by replaying the move list.** No incremental position mutation, anywhere.

### 7.6 Blunder classification (deferred to sub-project B, specified here so the
analysis interface supports it)

Given the evaluation before and after one of your moves, from your perspective:

| Centipawn loss | Label |
|---|---|
| < 20 | good / best |
| 20–49 | inaccuracy |
| 50–99 | mistake |
| ≥ 100 | blunder |

Two rules that are easy to get wrong:

- **Never flag a forced move.** If it was your only legal move, the label is
  `forced`, regardless of the eval swing. Punishing a forced move is teaching
  the player to feel bad about positions they could not avoid.
- **Mate scores are not centipawns.** Losing a forced mate is a blunder whatever
  the numbers say, and is classified separately rather than by magnitude.

## 8. Visual design

- **Theme.** Light and dark, both first-class, driven by CSS custom properties.
  Defaults to `prefers-color-scheme`, with a manual override that persists.
- **Board.** CSS grid, 8×8. High contrast, generous coordinate labels.
- **Pieces.** A single consistent SVG set, vendored into the repo.
  *Licence note: the common high-quality sets (Cburnett, Merida) are CC BY-SA —
  vendoring them requires attribution and share-alike on the asset. Confirm the
  chosen set's licence before shipping; this is a real obligation, not a
  formality.*
- **Highlights.** Selected square; legal-move dots and capture rings; last-move
  from/to tint; a red radial glow on a king in check; a drag ghost; hint arrows
  drawn in an SVG overlay above the grid.
- **Promotion picker.** Small popover anchored to the destination square.
- **Layout.** Board centred, side panel (move list, captured pieces, controls,
  difficulty) beside it on wide screens, stacked below on narrow ones. The board
  scales to the viewport and stays fully visible without scrolling.
- **Accessibility.** The board is keyboard navigable with arrow keys, every
  square carries an ARIA label (`"e4, white pawn"`), focus rings are visible, and
  all animation respects `prefers-reduced-motion`.

## 9. Scope

**This sub-project (A) — in scope:** game setup, board interaction, computer
opponent with adjustable strength and think time, on-demand hints, SAN move list,
back/forward navigation, undo/take-back, eval bar, captured pieces and material,
resign and new game, settings and game persistence, theming, accessibility.

**Sub-project B — post-game review.** Engine-evaluated replay of every move,
mistakes and blunders flagged using the §7.6 thresholds, better continuation
shown. The analysis layer is already built here; B is a different UI mode over it.

**Sub-project C — puzzle mode.** A curated puzzle set with a dedicated solve
screen, streaks and difficulty ratings. **Open decision:** the data source is not
yet chosen — a small curated set embedded in the repo versus the ~3M-row Lichess
puzzle database. This decision should be made when C is specced, not now.

## 10. Error handling

| Situation | Behaviour |
|---|---|
| Stockfish fails to load or WASM is blocked | Message on the board; disable computer move, hints, eval bar; **local two-player play keeps working** (§7.3). |
| Worker dies mid-search | Recreate and retry once. Second failure surfaces an error. |
| Engine returns a move chess.js rejects | Log, discard, substitute a legal move. Never apply an illegal move (§7.2). |
| Engine returns no move | Treat as terminal; confirm with chess.js before ending the game. |
| Engine takes too long | Hard `movetime` cap; `stop` on abort. The UI can never hang. |
| Corrupt or wrong-version `localStorage` | Discard silently, start fresh. Never blocks startup (§6.10). |
| `localStorage` write fails (quota, private mode) | Degrade to a session-only game, no error dialog. |

## 11. Testing

Vitest, plus React Testing Library and Playwright for end-to-end.

**Unit**
- `uciClient`: `info` line parsing, `score cp` vs `score mate`, `multipv`,
  `bestmove` (including null), and malformed input.
- `difficulty`: preset → Skill Level mapping, think-time policy.
- `analysis`: eval delta arithmetic, the §7.6 thresholds at every boundary,
  forced-move suppression, mate handling.
- `history`/`replay`: `boardAtMove` across every cursor position.
- `persistence`: round-trip, plus corrupt/wrong-version/wrong-shape input.

**Integration**
- A scripted full game driven through the game core, asserting the exact SAN
  list and the terminal state.
- Threefold repetition and the fifty-move rule reached through real move lists.
- Engine-move round-trip: a move returned by Stockfish applies legally to
  chess.js.

**Dependency guards**
- **Perft** against published node counts for the start position
  (d1 = 20, d2 = 400, d3 = 8902) and Kiwipete (d1 = 48, d2 = 2039,
  d3 = 97862). This catches a bad or regressed `chess.js` version at CI time
  rather than in a game.

**Component**
- Board click-to-move, drag-and-drop, promotion picker, controls, move list
  navigation.

**End-to-end (Playwright)**
- Load, new game, make a move, engine replies, resign, new game.
- **The engine must be verified against a production build (`vite preview`),
  not only the dev server.** WASM resolution from inside a worker is the single
  most likely thing to work in development and break in a build; this test
  exists specifically to catch that.

## 12. Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Stockfish WASM fails to resolve from a worker in a Vite production build | The app has no opponent | Verified in the first task against `vite preview`, not dev. Fallback: serve engine assets from `public/` and use a non-bundled worker. |
| ~1.8MB engine download | Slow first hint or first reply | Lazy worker creation so it is off the first-paint path; optional download-progress channel; visible loading state. |
| A search overruns its budget | Frozen UI | Hard `movetime` cap; the worker is off the main thread regardless. |
| Feedback that is subtly wrong | Teaches bad chess — the worst outcome for this app | Stockfish eval rather than a hand-rolled one; perft guard; thresholds unit-tested at their boundaries. |
| Eval bar jitters during analysis | Reads as noise | Update only on an improved score at greater depth; ease transitions. |
| Vendored piece set licence | Legal obligation | Confirm and attribute before shipping (§8). |

## 13. Acceptance criteria

The sub-project is done when all of these hold:

1. A new game starts from the standard position with the correct side to move.
2. Click-to-move and drag-and-drop both work; illegal moves are impossible to
   perform.
3. Castling, en passant, promotion with a choice of piece, check, checkmate,
   stalemate, the fifty-move rule and threefold repetition all behave per the
   rules.
4. The computer opponent replies within the configured think time at every
   difficulty preset, and the Beginner preset is beatable by a new player.
5. Changing difficulty affects the opponent's next move.
6. Both hint modes work, render an arrow, and never play the move automatically.
7. Undo returns the game to your turn with a position identical to before.
8. The move list shows correct SAN and supports backward/forward navigation
   without altering the game.
9. The eval bar reflects the evaluation and renders mate scores correctly.
10. Reloading the page restores the current game and settings.
11. Corrupt `localStorage` does not prevent the app from starting.
12. With the engine disabled, the board still plays a complete local two-player
    game.
13. The engine loads and plays a move in a **production build**, verified in CI.
14. Perft matches published counts; the full unit, integration and component
    suites pass.
15. The board is fully keyboard navigable and honours `prefers-reduced-motion`.
