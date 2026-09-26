# Chess Practice Board

Play White against a Stockfish opponent of adjustable strength, with on-demand
hints, a SAN move list, back/forward navigation, undo, an evaluation bar, and
your game saved across reloads.

## Running it

```sh
npm install
npm run dev
```

The engine (~1.8MB of WASM) is copied into `public/engine/` automatically before
the dev server and before every production build. That directory is a build
output and is cleared and rewritten on every build — put nothing in it by hand.

## Testing

```sh
npm test              # unit, integration and component tests (jsdom)
npm run perft:full    # exhaustive perft against published node counts
npx playwright install chromium
npm run e2e           # end-to-end against a real production build
```

`npm run e2e` builds the app, serves `dist/` with `vite preview`, and drives it
with a **real** Stockfish worker. That is the point of it: WASM resolution from
inside a worker is the single thing most likely to work in development and break
in a build, and nothing in jsdom can see it.

## How it works

- `chess.js` owns the position. The engine only ever receives a FEN string and
  returns a move plus a score, so engine state can never drift from game state.
- Every position is derived by replaying the move list (`gameAt`). Undo and
  review are replays, not reversals, which keeps repetition counters correct.
- The engine runs in a Web Worker loaded from `public/`, so the bundler never
  touches the WASM.
- One search is in flight at a time. Stockfish 19-lite **dies** if a second `go`
  is posted while one is running, and a `stop` immediately followed by a `go`
  kills it too — both measured against the real engine, and both invisible to a
  fake worker. The queue in `src/engine/searchQueue.ts` is what prevents them.
- If the engine fails to load, engine features disable and the board keeps
  working as a local two-player game: Black's turn becomes a human's turn.

## Accessibility

The board is one Tab stop with a roving focus ring, and the arrow keys move
between squares. Every square carries its own name — `"e2, white pawn"` — which
is the whole of how the board is usable without sight of it; the piece artwork is
an image with an empty `alt` and is hidden from the accessibility tree, because
the square already says what is on it.

The files and ranks are printed around the edge and are decorative, so they are
`aria-hidden`. A screen-reader user gets `"e2, white pawn"` and a list of sixteen
letters would be noise in front of it.

## Licence

`chess.js` is BSD-2-Clause. The Stockfish engine is **GPL-3.0** — see
`node_modules/stockfish`. This project is a local, self-hosted app; review the
GPL implications before publishing it as a hosted or closed-source product.

The pieces in `public/pieces/` are **original artwork written for this project**,
with no third-party licence attached — see `public/pieces/ATTRIBUTION.md`, which
also explains why the obvious alternative (Cburnett, Merida, Wikimedia) carries a
real share-alike obligation and what to do if you ever swap the set.
