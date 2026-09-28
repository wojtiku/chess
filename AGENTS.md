# AGENTS.md

Guidance for AI agents working in this repository.

## Project

`chess-practice-board` — a browser chess practice board: play White against a
computer opponent and review your games. React 19 + Vite + TypeScript, with
`chess.js` for rules and Stockfish for the engine.

## Commands

| Task                | Command                |
| ------------------- | ---------------------- |
| Install deps        | `npm install`          |
| Dev server          | `npm run dev`          |
| Typecheck + build   | `npm run build`        |
| Unit tests          | `npm test`             |
| End-to-end tests    | `npm run e2e`          |
| Engine perft suite  | `npm run perft:full`   |

`predev` and `prebuild` copy the Stockfish engine into `public/engine/`, so run
them through `npm run` rather than invoking Vite directly.

## Agent skills

### Issue tracker

Issues live as markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

Five canonical roles: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the repo root plus `docs/adr/`. See `docs/agents/domain.md`.
