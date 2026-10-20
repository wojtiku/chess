# Board-first layout

Status: implemented

## Intent

Give the chess board as much of the browser content area as possible, with the
rest of the interface in a sidebar. Preserve the wood board, pieces, warm dark
palette, and existing functionality.

## Confirmed decisions

Confirmed by the learner on 2026-10-20:

- Size the board as the largest square that fits the available width and height,
  accounting for coordinates, the evaluation bar, small outer margins, and a
  readable sidebar. Remove the fixed 560px board size cap.
- Move the application title and subtitle into the sidebar.
- On side-by-side layouts, keep the board fully visible while sidebar content
  scrolls independently. Keep the sidebar title and mode tabs visible.
- When the board and sidebar no longer fit usefully side by side, put the sidebar
  below the board and use normal page scrolling. Fit the board to both the
  available width and height.
- Improve layout, spacing, and hierarchy while retaining the existing visual
  theme and functionality.
- Keep the sidebar at a readable width of roughly 360px on wide displays. Once
  height limits the board, center the board and sidebar together and leave spare
  horizontal space outside the workspace.
- Retain the side-by-side layout whenever both columns fit usefully, including
  short landscape windows. Choose the responsive transition based on the space
  the two columns need rather than retaining the old 980px breakpoint.
- Let Hint, move navigation, Undo, New game, difficulty, and settings scroll with
  panel content. Only the sidebar title and mode tabs remain fixed.
- Remove the large blank reservation for empty move history.
- Center the board assembly vertically alongside the sidebar when width limits
  its size and it does not use the available height. Stacked layouts keep the
  board above the sidebar.

The learner confirmed the complete design and requested implementation on
2026-10-20.

## Implementation and verification

- Move the application header into the shared sidebar in `BoardWorkspace`, used
  by Play, Learn, Coach, and Review.
- Give the shared workspace ownership of responsive board sizing. Fit the whole
  board assembly, including its frame, coordinates, and evaluation gutter, into
  the available viewport dimensions with small outer margins.
- Keep the board square, preserve the evaluation gutter in Learn, and keep board
  sizing consistent across mode changes.
- Constrain the desktop sidebar to the available viewport height, with a fixed
  title and navigation above a single scrollable content area. Game controls
  remain in the normal content flow.
- On stacked layouts, place the sidebar below the board and use document
  scrolling instead of a height-constrained sidebar.
- Revisit fixed empty move-list and capture spacing so empty content does not
  consume the sidebar.
- Update relevant browser assertions for viewport-based sizing and the responsive
  transition. Verify large desktop, ordinary laptop, short landscape, and narrow
  portrait layouts, plus mode switching, long content, expanded settings, equal
  squares, visible coordinates, and no horizontal document overflow.
- Run the typecheck/build and the relevant existing component and browser tests.

The implemented workspace has 12px outer margins, a 20px column gap, and a 360px
sidebar. Two columns fit from 776px wide, leaving at least 320px for the square
board. Below that width, the sidebar moves below the board. All modes retain the
same board budget, and selecting a mode opens its content at the top.

The promotion picker is constrained inside the board because the board now sits
near the viewport's top edge. Empty capture and move-history reservations are
removed; populated move history shares the sidebar's single scroll area.

Validation: production build/typecheck, relevant component tests, and 24 Chromium
checks covering responsive sizes, mode consistency, independent scrolling,
resizing, a 100-ply history, keyboard navigation, game actions, promotion on a
phone, coordinates, and equal square sizes. Desktop, portrait phone, and landscape
phone screenshots were visually inspected.

## Original implementation constraints

- `src/App.css` capped the application width at 1080px, placed the title above the
  workspace, and stacked the workspace at 980px.
- `src/ui/Board/Board.css` capped the board at 560px.
- The Play panel reserved 250px for move history even when empty and space for
  empty captured-piece rows; this competes with useful controls in short panels.
- All four modes share `BoardWorkspace`; Learn reserves the evaluation gutter so
  changing mode does not shift the board sideways.
- Browser tests asserted the old board size and breakpoint. Those expectations
  were updated while preserving equal squares, mode consistency, and no
  horizontal document overflow.

These are reversible presentation choices; they do not introduce domain terms or
require an architectural decision record.
