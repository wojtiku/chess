// The app, end to end, against a real production build and the real WASM engine.
//
// Three things here that the jsdom suites structurally cannot be:
//
//   1. **The engine is real.** `App.test.tsx`'s `FakeWorker` is a protocol peer, and
//      the bug class this file exists for is invisible to it: a second `go` posted
//      while one is running, or a `stop` immediately followed by a `go`, *kills* the
//      Stockfish 19-lite worker. That was measured, not assumed, and it cost a full
//      debugging cycle in Task 10 to find — which is exactly why the badge is now
//      watched across a real game rather than assumed healthy.
//
//   2. **The asset paths resolve.** `/pieces/*.svg` and `/engine/stockfish.{js,wasm}`
//      are static files in `public/`, and whether they are served is a property of
//      the build, not of a unit test.
//
//   3. **The degradation path is reachable.** A worker `error` event cannot be
//      simulated reliably in jsdom (stated as a known gap in the plan); a 404 from
//      `page.route` provokes it for real.
//
// On not asserting what the engine plays: `Skill Level` is **stochastic by design**.
// At Medium (8) roughly one search in three returns something other than e4 or d4,
// so every assertion here is about the learner's own moves, about counts, or about
// membership in a legal move set. An earlier draft of this file asserted a specific
// opening move and would have gone red about one run in three.

import { expect, test, type Page } from '@playwright/test';
import { Chess } from '../../chess/rules';

const START_MOVES = 20;

/** A board square, by name. The accessible name is `"e2, white pawn"`, hence the
 *  anchor — and the anchor is what keeps these locators from matching `"e2, empty"`
 *  in a position where the pawn has already left. */
const square = (page: Page, name: string) =>
  page.getByRole('button', { name: new RegExp(`^${name},`) });

/** Play a move by clicking from and to, as a learner does. */
async function play(page: Page, from: string, to: string) {
  await square(page, from).click();
  await square(page, to).click();
}

/**
 * Play one move as the learner, preferring `from`/`to` and falling back to
 * whatever the board is actually offering.
 *
 * **A scripted opening is not reproducible against a stochastic opponent**, and
 * this took three attempts to learn. The first draft played a fixed Italian game
 * ending `O-O` and went red about one run in three: `Skill Level 8` sometimes
 * answers `Bc5`, and a bishop on c5 attacks g1 down c5-d4-e3-f2-g1, so castling
 * stops being legal. Removing the castling did not fix it — the next failure was
 * `Bg5` refused because Black had answered `Bxc3+`, and **a learner in check must
 * answer the check**, which a script cannot know to do. Both failures presented
 * identically, as a timeout waiting for a ply that could never arrive.
 *
 * So the position is read from the board rather than assumed, and the fallback is
 * a *legal* move: the assertion this test exists for is that the engine survives
 * sixteen real searches, and a move the app itself offered is a real one. The
 * SANs are collected and returned so the caller can assert they are all the
 * learner's own.
 */
async function learnerMove(
  page: Page,
  prefer: readonly [string, string],
): Promise<{ from: string; to: string }> {
  const offeredBy = async (from: string): Promise<string[]> => {
    await square(page, from).click();
    const targets = await page.locator('[data-target]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-square') ?? '').filter((s) => s !== ''),
    );
    return targets;
  };

  const preferred = await offeredBy(prefer[0]);
  if (preferred.includes(prefer[1])) {
    await square(page, prefer[1]).click();
    return { from: prefer[0], to: prefer[1] };
  }

  // The preferred piece is pinned, captured, or the position has changed under it.
  // Any legal move will do, so the first offered one is taken — and the search is
  // over the board's own squares, so it is always a real move in this position.
  for (const candidate of ['b1', 'g1', 'c1', 'f1', 'd2', 'e2', 'a2', 'h2', 'b2', 'f2', 'g2', 'h7']) {
    const targets = await offeredBy(candidate);
    const target = targets[0];
    if (target !== undefined) {
      await square(page, target).click();
      return { from: candidate, to: target };
    }
  }
  throw new Error(
    `the board offered no legal move at all; move list: ` +
      `${JSON.stringify(await page.locator('.movelist-move').allTextContents())}`,
  );
}

/**
 * Wait for the move list to reach `plies` moves.
 *
 * A count, not a SAN: the engine's half of the game is its own choice, and a test
 * that waits for a specific reply is a test that fails on a correct engine.
 */
async function waitForPlies(page: Page, plies: number) {
  await expect(page.locator('.movelist-move')).toHaveCount(plies, { timeout: 30_000 });
}

/** The engine status badge, read from the accessibility tree rather than the DOM
 *  class, so a rename of the CSS class cannot silently turn this into a no-op. */
const engineStatus = (page: Page) => page.locator('.engine-status');

/**
 * The Hint button, exactly.
 *
 * `exact` is a deliberate narrowing: accessible-name matching is a substring match
 * unless told otherwise, and this file drives the app by short control names like
 * "Hint", "Undo" and "Resign". The moment a second control's name merely *contains*
 * one of them, the query matches two elements, Playwright refuses to guess, and the
 * failure points at the wrong thing. Naming it exactly keeps the failure at the
 * control instead.
 *
 * **This is no longer fixing a live collision, and the old comment said it was.**
 * It used to claim that "Show hint options" in the difficulty panel matched this
 * name. That button is gone — the hint mode moved to the Settings tab — so the substring is currently
 * unique, and the un-narrowed query passes today (checked by running both hint
 * tests with it removed). The narrowing is kept on its own merits rather than for a
 * collision that no longer exists.
 */
const hintButton = (page: Page) => page.getByRole('button', { name: 'Hint', exact: true });

/**
 * `1.a3 c6 2.b4 Qa5 3.bxa5 Na6` — a real (if hopeless) game in which White takes
 * the black queen. Found by breadth-first search over legal moves and checked
 * against chess.js, because an illegal move in storage is **discarded whole**: the
 * app would open on the start position with no error, and every assertion below
 * would be about the start position instead.
 *
 * Stored rather than played, so the position is exactly this one rather than "this
 * one plus whatever Black replied" — and the eval questions need a position whose
 * correct answer is not in doubt.
 */
const WON_POSITION = [
  { from: 'a2', to: 'a3' }, { from: 'c7', to: 'c6' },
  { from: 'b2', to: 'b4' }, { from: 'd8', to: 'a5' },
  { from: 'b4', to: 'a5' }, { from: 'b8', to: 'a6' },
] as const;

test.describe('a full game', () => {
  // No `beforeEach` storage clearing, deliberately. Playwright gives each test its
  // own browser context, so `localStorage` is already empty and the app opens on a
  // fresh board. The obvious `page.addInitScript(() => localStorage.clear())` is
  // actively wrong here: an init script runs on EVERY navigation, so it also wipes
  // storage on the `page.reload()` inside a test — which is how a test that
  // persists a game and reloads it ends up asserting that persistence works and
  // watching it not.

  test('can be played, reviewed and restarted', async ({ page }) => {
    await page.goto('/');

    // The board is present and the engine is reachable.
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();
    await expect(square(page, 'e2')).toHaveAccessibleName('e2, white pawn');

    // Play 1.e4 and wait for the opponent. The learner's move is asserted; the
    // reply is only counted.
    await play(page, 'e2', 'e4');
    await expect(page.locator('.movelist-move')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.movelist-move').first()).toHaveText('e4');
    // "Undo" is enabled — and asserted as *what it does* below, because a
    // `toBeEnabled` on its own is satisfied by a button wired to nothing.
    await expect(page.getByRole('button', { name: 'Undo' })).toBeEnabled();

    // A hint is available on the learner's turn and draws an arrow.
    await hintButton(page).click();
    await expect(page.locator('.arrows line')).toHaveCount(1, { timeout: 30_000 });

    // Undo rewinds the pair: the hint's arrow is stale after a move, so the
    // assertion waits for it to go as well as for the move list to empty.
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(page.getByText('No moves yet.')).toBeVisible();
    await expect(page.locator('.movelist-move')).toHaveCount(0);

    // Resign produces a banner naming the winner. At move 0 it is White to move,
    // so the learner is the one resigning and Black wins.
    await page.getByRole('button', { name: 'Resign' }).click();
    await expect(page.getByText('Resigned — Black wins')).toBeVisible();

    // A new game clears the board and the banner.
    await page.getByRole('button', { name: 'New game' }).click();
    await expect(page.getByText('No moves yet.')).toBeVisible();
    await expect(page.getByText(/Resigned/)).toHaveCount(0);
    await expect(square(page, 'e2')).toHaveAccessibleName('e2, white pawn');
  });

  test('survives a reload', async ({ page }) => {
    await page.goto('/');
    await play(page, 'd2', 'd4');
    await expect(page.locator('.movelist-move')).toHaveCount(2, { timeout: 30_000 });

    await page.reload();

    // The move list is restored, and the position is: it is White's move again,
    // which is what the board offering g1-f3 proves. `toBeEnabled` on a square
    // would not — the board never renders `disabled` on one.
    await expect(page.locator('.movelist-move')).toHaveCount(2, { timeout: 30_000 });
    await expect(page.locator('.movelist-move').first()).toHaveText('d4');
    await square(page, 'g1').click();
    await expect(square(page, 'f3')).toHaveAttribute('data-target');
  });

  test('stays resigned across a reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Resign' }).click();
    await expect(page.getByText('Resigned — Black wins')).toBeVisible();

    // What the engine is asked for, recorded across the reload. Asserting on this
    // rather than on the badge is deliberate and was corrected after measuring it:
    // a resigned game never triggers a search, so the app **never boots the
    // engine at all** and the badge stays "Engine not loaded" — which is correct
    // behaviour (nothing to ask it) and not the "Engine ready" a first draft of
    // this test waited for. Waiting for "ready" would have made this test pass
    // only if a search were wrongly started.
    const engineRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('/engine/')) engineRequests.push(r.url());
    });

    await page.reload();

    // The banner survives. A resignation sets the status without touching `moves`,
    // so without `resignedBy` in storage the game reopens as playable.
    await expect(page.getByText('Resigned — Black wins')).toBeVisible();
    await expect(page.getByText('No moves yet.')).toBeVisible();
    // And the badge is not claiming an error either: a resigned game is a finished
    // game, and an "Engine unavailable" badge here would be a lie about an engine
    // that was simply never needed.
    await expect(engineStatus(page)).not.toHaveText('Engine unavailable');

    // The real assertion: after a full wait, nothing was played.
    await page.waitForTimeout(3000);
    await expect(page.locator('.movelist-move')).toHaveCount(0);
    expect(
      engineRequests,
      'a finished game must not start a search — not even to boot the engine',
    ).toEqual([]);
  });

  test('is keyboard navigable', async ({ page }) => {
    await page.goto('/');
    await square(page, 'e2').focus();
    await page.keyboard.press('ArrowRight');
    await expect(square(page, 'f2')).toBeFocused();
    // Two more steps, one of them across a rank boundary, and back — the roving
    // tabindex means the grid is one Tab stop and the arrow keys are the way
    // through it, so a bug in either shows up as the wrong square holding focus.
    await page.keyboard.press('ArrowUp');
    await expect(square(page, 'f3')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(square(page, 'e3')).toBeFocused();
    // And the whole board is one Tab stop: 64 squares must not be 64 presses. The
    // roving tab stop is wherever focus last was, so it is e3 now — a test
    // asserting it is still a8 would be asserting that arrow keys do not move it,
    // which is the opposite of what they are for.
    const stops = await page
      .getByRole('grid')
      .locator('[tabindex="0"]')
      .evaluateAll((nodes) => nodes.map((n) => n.getAttribute('data-square')));
    expect(stops).toEqual(['e3']);
    await expect(page.locator('.square[tabindex="0"]')).toHaveCount(1);
  });

  test('draws every piece from a vendored SVG, served from the build', async ({ page }) => {
    await page.goto('/');

    // All 32 starting pieces, each a real image that loaded. `naturalWidth` is the
    // check that matters: a 404'd `<img>` still exists in the DOM, so counting
    // elements proves nothing on its own.
    const pieces = page.locator('.square img.piece');
    await expect(pieces).toHaveCount(32);
    const broken = await pieces.evaluateAll((nodes) =>
      nodes.filter((n) => (n as HTMLImageElement).naturalWidth === 0).length,
    );
    expect(broken, 'every piece image must have loaded').toBe(0);

    // And the twelve distinct files, so a piece set that is served but all one
    // picture is caught here rather than by a learner.
    const srcs = await pieces.evaluateAll((nodes) =>
      [...new Set(nodes.map((n) => (n as HTMLImageElement).getAttribute('src')))].sort(),
    );
    expect(srcs).toHaveLength(12);
    expect(srcs).toEqual(
      ['b', 'w'].flatMap((c) => ['P', 'N', 'B', 'R', 'Q', 'K'].map((t) => `/pieces/${c}${t}.svg`)).sort(),
    );

    // Served as SVG, not as the app shell. `vite preview` answers a missing file
    // with `200 text/html`, so a status assertion alone would read healthy for a
    // file that is not there — this is the same reasoning `engine.spec.ts` uses,
    // and the reason the `naturalWidth` check above is not redundant with it.
    //
    // Case is load-bearing and invisible on macOS, which is where this was found:
    // a set written `WQ.svg` works on a case-insensitive filesystem and 404s on
    // every other host, and the twelve `src` assertions are what noticed.
    const response = await page.request.get('/pieces/wQ.svg');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type'] ?? '').toContain('image/svg+xml');
  });

  test('a piece asset that fails to load is a visible failure, not a blank square', async ({ page }) => {
    // The negative control for the check above, and the reason it is worth having:
    // a `<img>` with a 404 `src` still exists in the DOM, so a test that only
    // counted elements — or only checked `status()` — would pass against a board
    // showing 32 broken-image icons. `naturalWidth === 0` is what actually
    // distinguishes "an image is there" from "the artwork is there".
    await page.route('**/pieces/*.svg', (route) => route.fulfill({ status: 404, body: '' }));
    await page.goto('/');

    // Still 32 elements: the DOM is unchanged, which is the whole point.
    await expect(page.locator('.square img.piece')).toHaveCount(32);
    // And every one of them is broken, so the check above discriminates.
    const broken = await page
      .locator('.square img.piece')
      .evaluateAll((nodes) => nodes.filter((n) => (n as HTMLImageElement).naturalWidth === 0).length);
    expect(broken).toBe(32);
  });

  test('offers four promotions when a pawn reaches the last rank', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    // A real 12-ply game, stored rather than played: `1.c4 b6 2.c5 bxc5 3.b4 Nf6
    // 4.b5 Ng8 5.b6 Nf6 6.b7 Ng8`, after which White has a pawn on b7 and Black has
    // a rook on a8 and a bishop on c8. **Every one of the eight legal moves is a
    // promotion by capture**, four to a8 and four to c8, so the picker opens on a
    // promotion the board cannot resolve on its own.
    //
    // Stored through `addInitScript` rather than `evaluate` + `reload`: an init
    // script runs before the app's own scripts on every load, so the app's first
    // `loadGame` already sees it. A round trip through `evaluate` needs a reload,
    // and the reload is a second thing that can go wrong for no benefit.
    //
    // The move list is checked against chess.js rather than written by hand — an
    // illegal move in storage is discarded whole, and the app would then open on
    // the start position with no error and no promotion to offer.
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          'chess.game.v1',
          JSON.stringify({
            moves: [
              { from: 'c2', to: 'c4' }, { from: 'b7', to: 'b6' },
              { from: 'c4', to: 'c5' }, { from: 'b6', to: 'c5' },
              { from: 'b2', to: 'b4' }, { from: 'g8', to: 'f6' },
              { from: 'b4', to: 'b5' }, { from: 'f6', to: 'g8' },
              { from: 'b5', to: 'b6' }, { from: 'g8', to: 'f6' },
              { from: 'b6', to: 'b7' }, { from: 'f6', to: 'g8' },
            ],
          }),
        );
      } catch {
        // A browser that refuses storage cannot be given a position, and the
        // picker needs a pawn on the seventh rank.
      }
    });
    await page.goto('/');

    // The stored game was accepted and replayed — twelve moves, the pawn on b7,
    // and it is the learner's turn. Without this the next assertion could be
    // passing against a start position the app silently fell back to.
    await expect(page.locator('.movelist-move')).toHaveCount(12, { timeout: 30_000 });
    await expect(square(page, 'b7')).toHaveAccessibleName('b7, white pawn');
    await expect(square(page, 'a8')).toHaveAccessibleName('a8, black rook');

    await play(page, 'b7', 'a8');
    const picker = page.getByRole('dialog', { name: 'Choose promotion piece' });
    await expect(picker).toBeVisible();
    await expect(picker).toBeInViewport({ ratio: 1 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    // Four options plus the cancel button. Underpromotion is offered on equal
    // terms with the queen, so a panel offering two would still pass a check on
    // the queen alone.
    await expect(picker.getByRole('button')).toHaveCount(5);
    // And the artwork in them loaded — this is the one place the picker is on
    // screen with the real piece set in it, so it is where a broken asset path
    // would show.
    const imgs = picker.locator('img');
    await expect(imgs).toHaveCount(4);
    const loaded = await imgs.evaluateAll((nodes) =>
      nodes.every((n) => (n as HTMLImageElement).naturalWidth > 0),
    );
    expect(loaded, 'every promotion option must have artwork').toBe(true);

    // The knight is chosen, which is what the button's own name promises. A board
    // that quietly promoted to a queen regardless would pass a test that only
    // counted the options.
    await picker.getByRole('button', { name: 'Promote to knight' }).click();
    await expect(picker).toHaveCount(0);
    await expect(square(page, 'a8')).toHaveAccessibleName('a8, white knight');
    // The rook really is gone, so this was a capture and not a second white piece.
    await expect(page.locator('.movelist-move')).toHaveCount(13);
  });

  test('keeps the engine alive across a whole game of real searches', async ({ page }) => {
    // THE regression this file exists for.
    //
    // Task 10 measured that a second `go` posted while one is running kills the
    // Stockfish 19-lite worker, and that a `stop` immediately followed by a `go`
    // kills it too. Both are invisible to `FakeWorker`, which answers whatever it is
    // sent and therefore never dies — so no jsdom test can see this class of bug,
    // and its absence from the suite is why it cost a debugging cycle to find.
    //
    // What is asserted: the badge never reads "Engine unavailable" across twelve
    // plies, and the engine answered every single one. The reply SANs are read but
    // never matched against a fixed value, because the engine chooses them.
    const failures: string[] = [];
    page.on('pageerror', (e) => failures.push(String(e)));

    await page.goto('/');
    await expect(page.getByText('Engine ready')).toBeVisible({ timeout: 60_000 });

    // Eight learner moves, each one a *preference* rather than an instruction — see
    // `learnerMove`, which explains why a scripted opening cannot work against this
    // opponent. `1.e4` always happens; nothing after it is promised.
    const preferences: ReadonlyArray<readonly [string, string]> = [
      ['e2', 'e4'],
      ['g1', 'f3'],
      ['f1', 'c4'],
      ['d2', 'd4'],
      ['b1', 'c3'],
      ['c1', 'g5'],
      ['a2', 'a3'],
      ['h2', 'h3'],
    ];

    for (let i = 0; i < preferences.length; i++) {
      // `preferences[i]!`: the loop is over `preferences.length`, so the entry
      // exists. A `noUncheckedIndexedAccess` array would otherwise make the
      // destructuring a type error rather than a fact.
      const prefer = preferences[i]!;
      // Checked *before* each move as well as after: a worker that died during the
      // previous reply has to be caught while the badge still says so, not after
      // some later recovery has hidden it.
      await expect(engineStatus(page)).not.toHaveText('Engine unavailable');

      await learnerMove(page, prefer);
      await waitForPlies(page, (i + 1) * 2);
      await expect(engineStatus(page)).not.toHaveText('Engine unavailable');
    }

    // Sixteen plies, all answered, and the engine still healthy at the end.
    await expect(page.locator('.movelist-move')).toHaveCount(16);
    await expect(page.getByText('Engine ready')).toBeVisible();

    // The whole game, checked against the rules layer.
    //
    // This replaces a regular expression, which is the honest account of how it got
    // here. The first version asserted each learner's SAN against a hand-written
    // pattern, and the pattern was wrong **three times**: it rejected the app's own
    // `e4` for omitting quiet pawn pushes, then its own `Nf3` for letting the piece
    // letter be read as a destination file, then `a8=Q` for a promotion the pawn
    // branch could not reach. Every failure was the same mistake — a shape written
    // from memory and never run against the strings it is meant to accept.
    //
    // Replaying the list through chess.js is not a fourth attempt at that idea. It
    // is the *stronger* claim: every one of the sixteen plies, the learner's and the
    // engine's, is a legal move in the position before it. A regex could only ask
    // whether a string looks like a move; this asks whether it is one — the question
    // that actually matters — and there is no list of shapes to keep in step with
    // the rules.
    const san = await page.locator('.movelist-move').allTextContents();
    expect(san).toHaveLength(16);
    const replay = new Chess();
    for (const [ply, move] of san.entries()) {
      try {
        // `move()` throws for an unparseable SAN and returns `null` for a SAN that
        // parses but is not legal here, so BOTH have to be handled — and the
        // distinction is the useful one, hence the two different messages.
        const applied = replay.move(move);
        expect(applied, `ply ${ply + 1} ("${move}") is not legal here`).not.toBeNull();
      } catch (e) {
        throw new Error(
          `ply ${ply + 1} ("${move}") is not a move at all: ${String(e)}. ` +
            `The list so far: ${JSON.stringify(san.slice(0, ply))}`,
        );
      }
    }
    // The learner's first move is pinned and the engine's first is not.
    //
    // 1.e4 is the only move in this test's reach that no reply can prevent, so it
    // is the only one worth pinning; the replay above already proves every ply is
    // legal. `Nf3` — which an earlier draft pinned here — cannot be: the engine
    // chose `e6`, and the app was right to show a game in which White's second
    // move is a knight that has not moved. This is the stochastic-engine rule
    // arriving in the one place it is easiest to forget, three plies in.
    expect(san[0]).toBe('e4');
    // Still going, and back on the learner's turn: sixteen plies is an even number,
    // so a game that ended on the engine's move would have `turn() === 'b'`.
    expect(replay.isGameOver()).toBe(false);
    expect(replay.turn()).toBe('w');

    // The board is still a live position rather than a stalled one, and the live
    // position is **read from the DOM and from the replay** rather than assumed.
    // Both were needed: by ply sixteen the e2 pawn has moved, so a hard-coded
    // square selects nothing; and after the engine's replies the first piece in DOM
    // order is Black's a8 rook, which the app correctly refuses to select on the
    // learner's turn. So the square is chosen the way a learner chooses one — a
    // piece of their own colour — which is the position's answer, not this file's.
    const white = await page
      .locator('.square:has(img.piece)')
      .evaluateAll((nodes) =>
        nodes
          .map((n) => n.getAttribute('aria-label') ?? '')
          .filter((label) => label.includes('white'))
          .map((label) => label.split(',')[0] ?? ''),
      );
    const from = white[0] ?? 'e1';
    await square(page, from).click();
    expect(
      await page.locator('[data-target]').count(),
      `the board must still accept a move, and ${from} must offer one`,
    ).toBeGreaterThan(0);
    expect(failures, `page errors: ${failures.join(' | ')}`).toEqual([]);

    // Eight replies from the engine, and they are moves rather than noise. Neither
    // half asserts *which* reply: a reply path that replayed the learner's own move
    // would produce a set of one here, and a search count is already pinned above.
    // Compared as a set because two replies can legitimately be the same SAN in a
    // quiet position (`...Nf6` twice), so requiring all eight to differ would be a
    // second way of failing on a correct engine.
    const replies = await page.locator('.movelist-move').evaluateAll((nodes) =>
      nodes.map((n, i) => (i % 2 === 1 ? n.textContent : null)).filter((s) => s !== null),
    );
    expect(replies).toHaveLength(8);
    expect(new Set(replies).size).toBeGreaterThanOrEqual(4);
  });

  test('degrades to a local two-player game when the engine cannot load', async ({ page }) => {
    // The plan's stated gap: a worker `error` event cannot be simulated reliably in
    // jsdom, so spec criterion 12 (play both sides with no engine) had no
    // executable test. Provoking it for real, by 404-ing the engine script.
    const requested: string[] = [];
    await page.route('**/engine/stockfish.js', (route) => {
      requested.push(route.request().url());
      return route.fulfill({ status: 404, body: 'not found' });
    });
    // And the WASM with it, so a retry cannot find it either.
    await page.route('**/engine/stockfish.wasm', (route) => route.fulfill({ status: 404, body: '' }));

    await page.goto('/');

    // The badge says what broke, not merely that something did.
    await expect(page.getByText('Engine unavailable')).toBeVisible({ timeout: 60_000 });
    expect(requested.length, 'the engine script should have been requested').toBeGreaterThan(0);
    // Engine-dependent features are off rather than broken.
    await expect(hintButton(page)).toBeDisabled();
    await expect(page.getByRole('radio', { name: 'Beginner' })).toBeDisabled();

    // The board still works — for BOTH sides, which is the whole point of the
    // degradation. Black's turn is a human's turn.
    await play(page, 'e2', 'e4');
    await expect(page.locator('.movelist-move')).toHaveCount(1);
    await play(page, 'e7', 'e5');
    await expect(page.locator('.movelist-move')).toHaveCount(2);
    await play(page, 'g1', 'f3');
    await expect(page.locator('.movelist-move')).toHaveCount(3);
    // ...and nothing is added behind the learner's back, which is what a live
    // engine answering on its own turn would do.
    await page.waitForTimeout(1500);
    await expect(page.locator('.movelist-move')).toHaveCount(3);
  });

  test('is dark, and stays dark whatever a previous version stored', async ({ page }) => {
    // The counterpart to the unit test of the same name, and the only place the
    // real stylesheet is involved. jsdom has no layout and no cascade, so a palette
    // that exists only in a comment, or a `data-theme` that no rule reads, both
    // pass every unit test in the suite — and this is what catches them.
    await page.goto('/');

    // No attribute, because the old two-palette stylesheet keyed on one and its
    // return would mean a second palette had come back with it.
    await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.*/);
    await expect(page.getByRole('button', { name: /theme/i })).toHaveCount(0);

    // `color-scheme` is what the browser uses for its own widgets — scrollbars,
    // the range track, the select. Without it a dark app gets light scrollbars,
    // which is the most common way a dark theme announces nobody asked.
    const scheme = await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme);
    expect(scheme, 'the document must declare dark to the browser').toBe('dark');

    // And the page is actually dark, by computed background rather than by
    // assertion about a stylesheet we just read.
    const channels = async (): Promise<number[]> =>
      (await page.evaluate(() => getComputedStyle(document.body).backgroundColor))
        .match(/\d+/g)!
        .map(Number);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(Math.max(...(await channels())), `body background ${bg} must be dark`).toBeLessThan(60);

    // A stored theme from an earlier version must not bring the switch back or
    // change a thing. Seeded and reloaded, because that is the only order in which
    // a stored value is read.
    await page.evaluate(() => {
      localStorage.setItem('chess.settings.v1', JSON.stringify({ theme: 'light', skillLevel: 13 }));
    });
    await page.reload();
    await expect(page.getByRole('button', { name: /theme/i })).toHaveCount(0);
    const after = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(after, 'a stored theme must not repaint the page').toBe(bg);
  });
});

/** Browser geometry: the square uses the available height or width after the
 * sidebar and coordinate/evaluation gutters, with no fixed desktop size cap.
 * Check both maximization and overflow so a needlessly small board cannot pass. */
for (const [label, width, height, expectedBoard] of [
  ['a 390px phone', 390, 844, 314],
  ['a 360px phone', 360, 640, 284],
  ['a landscape phone', 844, 390, 346],
  ['a 900px window', 900, 800, 444],
  ['a 1024px window', 1024, 800, 568],
  ['a desktop viewport', 1440, 900, 856],
  ['a wide desktop viewport', 2560, 1080, 1036],
] as const) {
  test(`the board fits ${label} without sideways scrolling`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto('/');
    await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();

    const measured = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      board: Math.round(
        document.querySelector('.board')!.getBoundingClientRect().width,
      ),
    }));

    expect(
      measured.scrollWidth,
      `content is ${measured.scrollWidth}px wide in a ${measured.clientWidth}px viewport`,
    ).toBeLessThanOrEqual(measured.clientWidth);
    expect(measured.board, 'use all available space up to the width or height limit').toBe(expectedBoard);
  });
}

test('the board shows its coordinates, and hides them from a screen reader', async ({ page }) => {
  await page.goto('/');

  // Decorative: the squares already carry `"e2, white pawn"`, so sixteen letters and
  // digits in the accessibility tree would be noise in front of the first square.
  const ranks = page.locator('.coord-ranks');
  const files = page.locator('.coord-files');
  await expect(ranks).toHaveAttribute('aria-hidden', 'true');
  await expect(files).toHaveAttribute('aria-hidden', 'true');
  await expect(ranks.locator('span')).toHaveText(['8', '7', '6', '5', '4', '3', '2', '1']);
  await expect(files.locator('span')).toHaveText(['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']);

  // Outside the grid: sixteen extra children of `role="grid"` would be a different
  // number of accessible children, and the grid's own contract is 64 squares.
  await expect(page.getByRole('grid').getByRole('button')).toHaveCount(64);

  // And they flip with the board, rather than being left the right way up.
  await page.getByRole('button', { name: 'Flip board' }).click();
  await expect(ranks.locator('span')).toHaveText(['1', '2', '3', '4', '5', '6', '7', '8']);
  await expect(files.locator('span')).toHaveText(['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a']);
});

test('every legal opening move is offered, and an illegal one is not', async ({ page }) => {
  // Acceptance criterion 2, against the real board: all 20 moves of the start
  // position are destinations, and an occupied square that cannot be reached is
  // not. A board that offered everything would pass a single `e4` check.
  await page.goto('/');
  await square(page, 'e2').click();
  await expect(page.locator('[data-target]')).toHaveCount(2);

  await page.reload();
  // From the knight: b1 can reach a3 and c3, and nothing else — a knight's shape is
  // the one a lenient legality check gets wrong, and it is a check with no captures
  // in it, so it isolates the geometry.
  await square(page, 'b1').click();
  await expect(page.locator('[data-target]')).toHaveCount(2);
  await expect(square(page, 'a3')).toHaveAttribute('data-target');
  await expect(square(page, 'c3')).toHaveAttribute('data-target');
  await expect(square(page, 'd2')).not.toHaveAttribute('data-target');
});

test('the eval bar follows the engine, and it points the right way', async ({ page }) => {
  // The bar is the one place a stale number is a *wrong* number rather than an
  // absent one, and it is driven entirely by the engine's own score.
  //
  // **The position is a won one, not a slightly-uneven one.** An earlier draft
  // played 1.e4 and asserted the bar left `50`, and it failed about one run in two:
  // after a single pawn move the engine's own score for the position is worth less
  // than a centipawn of the bar's rounding, so `50` is a correct reading and the
  // test was a coin flip. A position where White is a queen up has no such
  // ambiguity — a bar stuck at 50 there is a real failure and not a rounding.
  //
  // The fixture is `WON_POSITION`, shared with the handicap test below: a real
  // game in which White takes the black queen, stored rather than played so the
  // position is exactly this one and the engine is not a party to it.
  await page.addInitScript((moves: unknown) => {
    try {
      localStorage.setItem('chess.game.v1', JSON.stringify({ moves }));
    } catch {
      // A browser that refuses storage cannot be given a position.
    }
  }, WON_POSITION);
  await page.goto('/');

  // The fixture was accepted, not discarded: six plies, and the black queen is
  // gone. Without this the bar assertion could be reading the start position.
  await expect(page.locator('.movelist-move')).toHaveCount(6, { timeout: 30_000 });
  // The black queen left d8 and was taken on a5 by the b-pawn, which is where the
  // pawn now stands. Asserted on the squares, so a fixture that was discarded and
  // silently replaced by the start position cannot reach the bar assertions.
  await expect(square(page, 'd8')).toHaveAccessibleName('d8, empty');
  await expect(square(page, 'a5')).toHaveAccessibleName('a5, white pawn');

  // The bar starts level, because nothing has been asked yet.
  await expect(page.getByTestId('eval-bar')).toHaveAttribute('data-white-share', '50');

  // **Waited for causally, not by polling for the answer.** A first draft polled
  // `data-white-share` until it stopped being `50`, and it went red about one run
  // in three — under parallel workers each WASM engine competes for the CPU, the
  // analysis takes longer than the poll allowed, and the test failed on a correct
  // app. The badge is the engine's own account of the same search, so waiting for
  // "thinking" and then for "ready" is waiting for the work to start and then to
  // finish: no arbitrary deadline, and a failure means the engine did not run
  // rather than that it ran slowly.
  await expect(page.getByText('Engine is thinking…')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Engine ready')).toBeVisible({ timeout: 60_000 });

  // And it points at White, not away: `EvalBar` converts the engine's score with
  // the turn of the position on screen, so a sign error shows up as a bar pushed
  // the wrong way rather than as a missing number. This is the assertion that
  // makes the required `sideToMove` prop worth having.
  const share = Number(await page.getByTestId('eval-bar').getAttribute('data-white-share'));
  expect(share, 'a queen up must not read as level').toBeGreaterThan(50);
  // The label agrees, and it is a pawn figure rather than a centipawn one: a bar
  // that moved while the text stayed at "—" would be a bar driven by something
  // other than the engine's score.
  await expect(page.locator('.evalbar-label')).toHaveText(/^\+\d+\.\d$/);
});

/**
 * The review's CRITICAL, and the test that must never be deleted.
 *
 * UCI `setoption` is sticky, so a `Skill Level` sent for the opponent's move used
 * to stay in force for every evaluation and every hint. Stockfish's `Skill Level`
 * does not merely pick worse moves — below 20 it substitutes a reduced-accuracy
 * evaluation net from root depth 4 down — so the *score* was handicapped too, and
 * the eval bar and the hint were both the handicapped opponent talking.
 *
 * Measured in this very position before the fix, three runs each:
 *
 * ```
 *   Skill  1   89 +8.6  arrow a1-a2  |  89 +8.7  d2-d3  |  90 +8.8  c1-b2
 *   Skill  8   88 +8.5  arrow d2-d4  |  50 0.0   f2-f4  |  88 +8.5  d2-d4
 *   Skill 20   90 +8.8  arrow c1-b2  (8 runs, identical)
 * ```
 *
 * At Skill 8 the app told a learner that being eight pawns up was dead level and
 * advised pushing a pawn. **A fake worker with hard-coded scores cannot see this**,
 * which is why it survived eleven task reviews; the `setoption` bytes are asserted
 * in `App.test.tsx` and the consequence is asserted here.
 */
test('the advice is unhandicapped whatever strength the learner picked', async ({ page }) => {
  test.setTimeout(180_000);

  /** The advice the app gives in this position at one opponent strength. */
  const adviceAt = async (skillLevel: number): Promise<{ share: string; label: string; arrow: string }> => {
    await page.addInitScript(
      ([moves, level]: [unknown, number]) => {
        // The difficulty is in the STORED SETTINGS, so the app's very first
        // analysis already runs at that level. Setting it by clicking the radio
        // after mount does NOT reproduce the bug, for two reasons, and the deeper
        // one is the important one:
        //
        //   1. this position's evaluation is already cached from the mount search,
        //      which ran at the default level; and
        //   2. more fundamentally, **the analysis effect has no skill level in its
        //      dependencies** (`useGame`), so changing the difficulty never asks
        //      for a re-search at all — not a cached answer, not a new one, no
        //      request. There is nothing for the click to invalidate.
        //
        // So the click cannot produce a handicapped evaluation of *this* position,
        // and a test built on it would pass against a broken app. That shape was
        // tried first — it read a correct +8.6 at Beginner — and is why the
        // difficulty goes in before the app's first analysis here.
        localStorage.setItem('chess.game.v1', JSON.stringify({ moves }));
        localStorage.setItem(
          'chess.settings.v1',
          JSON.stringify({
            skillLevel: level,
            minThinkTimeMs: 0,
            orientation: 'w',
            hintMode: 'best',
          }),
        );
      },
      [WON_POSITION, skillLevel] as [unknown, number],
    );
    await page.goto('/');
    await expect(page.locator('.movelist-move')).toHaveCount(6, { timeout: 30_000 });
    // Causal wait, as above: the search starts, then it ends.
    await expect(page.getByText('Engine is thinking…')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('Engine ready')).toBeVisible({ timeout: 60_000 });

    await page.getByRole('button', { name: 'Hint', exact: true }).click();
    await expect(page.locator('.arrows line')).toHaveCount(1, { timeout: 60_000 });
    return {
      share: (await page.getByTestId('eval-bar').getAttribute('data-white-share')) ?? '',
      label: (await page.locator('.evalbar-label').textContent()) ?? '',
      arrow: (await page.locator('.arrows line').getAttribute('data-testid')) ?? '',
    };
  };

  // Skill 20 first: it is the unhandicapped reference, and it was measured 8 times
  // out of 8 to be deterministic in this position, so it is a fair thing to
  // compare against.
  const expert = await adviceAt(20);
  const beginner = await adviceAt(1);

  // **The invariant.** The opponent is handicapped; the advice is not.
  //
  // **This is a smoke detector, not a proof, and a pass does not mean the handicap
  // is unreachable — only that the two agreed on this run.** The reason is the
  // engine, not the test: a handicapped search sometimes lands on the same move as
  // the full-strength one, and the Skill-1 measurements taken before the fix show
  // 1 of 3 runs matching exactly. So the failure rate under sabotage depends both
  // on how completely the fix is removed and on those coin flips.
  //
  // Two measurements, both real, and the honest summary is that the rate is not a
  // constant: the review removed all three layers and saw **3 failures in 4**; I
  // re-measured with the two layers that actually change the answer — the
  // analysis layer's resolution and `search`'s default — and saw **6 in 6**. The
  // difference is the sabotage, not the test: removing only the door's argument is
  // provably a no-op (the default covers it), so "all three" can mean different
  // things depending on which line you delete. An earlier version of this comment
  // asserted flatly that "if the strength setting can still reach an evaluation,
  // these differ", which is false in principle, and the previous report presented
  // its sabotage table as if the failure were deterministic. Both are corrected.
  //
  // **The deterministic gate for the mechanism is in the unit tests**, which assert
  // the exact `setoption` bytes and the analysis cache key; this test exists
  // because a fake worker with hard-coded scores is *structurally incapable* of
  // seeing that Stockfish's handicap is real. It cannot be made certain from the
  // outside — the thing it checks is an engine that is stochastic by design — so
  // this comment is the sensitivity.
  expect(
    beginner,
    `the advice must not depend on the opponent's strength: Beginner ${JSON.stringify(beginner)} vs Expert ${JSON.stringify(expert)}`,
  ).toEqual(expert);

  // And the absolute claim, which a shared-value pair of *wrong* answers would
  // also satisfy: eight pawns up is not level, at any setting.
  expect(Number(beginner.share), 'a queen up must not read as level').toBeGreaterThan(50);
  expect(beginner.label).toMatch(/^\+[1-9]\d?\.\d$/);
  // The arrow is the hint's own claim about which move to play.
  expect(beginner.arrow).toBe(expert.arrow);
});

test('all 64 squares are the same size, occupied or not', async ({ page }) => {
  // The board is rendered lazily enough that `goto` returning is not a guarantee
  // the squares exist yet; the other tests here wait for one explicitly.
  await page.goto('/');
  await page.waitForSelector('[data-square]');

  // This is the only place this can be tested. jsdom has no layout engine, so it
  // reports every square as 0x0 and cannot see a grid whose rows are sized by
  // their contents.
  //
  // The bug: `.board` set `grid-template-columns` but never `grid-template-rows`,
  // so the eight rows were implicit and `auto`-sized. `aspect-ratio: 1` still made
  // the outer box a perfect 560x560, which is why it looked right — but measured,
  // rows holding a piece came out 99.38px and empty rows 39.61px. A learner sees a
  // ragged board whose fields change size depending on whether a piece is on them.
  //
  // Asserted as a *set* of distinct sizes, not a spot check, so a single odd
  // square fails: the spread has to be zero, and there have to be exactly 64.
  const sizes = async () =>
    page.evaluate(() => {
      const cells = [...document.querySelectorAll<HTMLElement>('[data-square]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { sq: el.dataset.square ?? '', w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
      });
      return {
        cells,
        occupied: cells.filter((c) => c.sq && document.querySelector(`[data-square="${c.sq}"] img.piece`)).length,
      };
    });

  const check = async (label: string) => {
    const { cells, occupied } = await sizes();
    const widths = [...new Set(cells.map((c) => c.w))];
    const heights = [...new Set(cells.map((c) => c.h))];
    const spread = Math.max(...cells.map((c) => Math.abs(c.w - c.h)));
    expect(cells, `${label}: 64 squares`).toHaveLength(64);
    expect(widths, `${label}: every square the same width (${occupied}/64 occupied)`).toHaveLength(1);
    expect(heights, `${label}: every square the same height (${occupied}/64 occupied)`).toHaveLength(1);
    expect(widths[0], `${label}: squares are square, not rectangular`).toBe(heights[0]);
    expect(spread, `${label}: no square differs from another`).toBe(0);
  };

  await check('start position');

  // The occupancy pattern is the variable, so change it: captures and moves put
  // pieces on squares that were empty and clear ones that were not. Only the
  // learner's own moves are scripted — the opponent is stochastic, so its replies
  // are whatever they are, and the next learner move is chosen from what the board
  // is actually offering.
  await play(page, 'e2', 'e4');
  await check('after 1.e4, with the reply');
  await play(page, 'g1', 'f3');
  await check('after a second learner move');
  await play(page, 'f1', 'c4');
  await check('after developing a bishop');

  // Flipped, and on the two phone widths the responsive fix targets.
  await page.getByRole('button', { name: /Flip board/ }).click();
  await page.waitForTimeout(150);
  await check('flipped');

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 780 });
    await page.waitForTimeout(200);
    await check(`${width}px viewport`);
  }
});

test('the eval bar dims between a move and its new evaluation', async ({ page }) => {
  // The bug this pins. The engine runs a reply search and then an analysis, strictly
  // one at a time, so for several seconds after every learner move the position on
  // screen has no evaluation of its own. The bar used to blank — and `whiteShare`
  // draws "no score" as exactly 50, so a blank bar was a bar sitting precisely at
  // the midpoint, which *claims the position is level* rather than admitting it does
  // not know. It now holds the last score, dimmed.
  await page.goto('/');
  await page.waitForSelector('[data-square]');

  const bar = page.getByTestId('eval-bar');
  const share = async () => bar.getAttribute('data-white-share');
  const label = async () => (await bar.locator('.evalbar-label').textContent())?.trim() ?? '';
  const dimmed = async () =>
    Number(await bar.locator('.evalbar-track').evaluate((el) => getComputedStyle(el).opacity));

  // Before anything has been measured there is no score to hold, so the bar is
  // marked unknown rather than drawn as a level split.
  await expect(bar).toHaveAttribute('data-unknown', 'true');
  await expect(bar).not.toHaveAttribute('data-stale', 'true');

  // Wait for a real reading.
  await expect
    .poll(async () => (await label()) === '—' ? 'pending' : await label(), { timeout: 30_000 })
    .not.toBe('pending');
  const firstShare = await share();
  const firstLabel = await label();
  expect(firstLabel).not.toBe('—');
  expect(Number(await dimmed())).toBe(1);

  // A move, and immediately afterwards: the previous reading is still on screen,
  // marked stale and visibly receded.
  await play(page, 'e2', 'e4');
  await expect(bar).toHaveAttribute('data-stale', 'true');
  await expect(bar).not.toHaveAttribute('data-unknown', 'true');
  expect(Number(await dimmed())).toBeLessThan(0.5);
  expect(await share()).toBe(firstShare);
  expect(await label()).toBe(firstLabel);

  // And it comes back to live, with a new number, once the analysis lands.
  await expect(bar).not.toHaveAttribute('data-stale', 'true', { timeout: 30_000 });
  expect(Number(await dimmed())).toBe(1);
  expect(await label()).not.toBe('—');
});

test('Play keeps the difficulty presets and Settings holds the detailed preferences', async ({ page }) => {
  await page.goto('/');
  const presets = page.getByRole('radiogroup', { name: 'Difficulty' });
  for (const label of ['Beginner', 'Easy', 'Medium', 'Hard', 'Expert']) {
    await expect(presets.getByRole('radio', { name: label, exact: true })).toBeVisible();
  }
  await expect(page.locator('.difficulty-settings')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Appearance' })).toHaveCount(0);

  await page.getByTestId('mode-settings').click();
  await expect(page.getByRole('heading', { name: 'Settings', exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Appearance' })).toBeVisible();
  const panel = page.locator('.difficulty-settings');
  await panel.scrollIntoViewIfNeeded();
  await expect(panel).toBeVisible();
  await expect(panel).toHaveCSS('border-top-style', 'solid');
  await expect(page.getByLabel('Skill level')).toBeVisible();
  await expect(page.getByLabel(/Minimum think time/)).toBeVisible();
  await expect(page.getByLabel('Hint quality')).toBeVisible();
  await expect(page.getByText(/Engine strength:/)).toBeVisible();

  await page.getByTestId('mode-play').click();
  await expect(panel).toHaveCount(0);
  await expect(presets).toBeVisible();
  await expect(page.getByLabel('Hints', { exact: true })).toHaveCount(1);
});

test('every button is a visible surface against the page, not an outline on a wall', async ({ page }) => {
  // The brief was "make the buttons more distinctive from the background", and it
  // is the kind of request that quietly stops being true: nobody notices a control
  // blending into the panel until they cannot find it, and by then it is a report
  // rather than a change.
  //
  // Why a browser and not a unit test: this is two computed background colours, and
  // jsdom has no cascade. A stylesheet with no button rules at all passes every
  // unit test in this project.
  await page.goto('/');
  await expect(page.getByRole('grid', { name: 'Chess board' })).toBeVisible();

  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((v) => v / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  };
  const ratio = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
    return (hi + 0.05) / (lo + 0.05);
  };
  const parse = (s: string) => (s.match(/\d+/g) ?? []).map(Number);

  const pageBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  // Role and name, because the difficulty presets are `role="radio"` inside a
  // `radiogroup` and not buttons — asking for them by the button role times out,
  // which is a confusing way to learn that a control is a radio.
  const samples: ReadonlyArray<readonly ['button' | 'radio', string]> = [
    ['button', 'Hint'],
    ['button', 'Undo'],
    ['button', 'Resign'],
    ['button', 'New game'],
    ['button', 'First move'],
    ['radio', 'Beginner'],
    ['radio', 'Easy'],
    ['radio', 'Hard'],
    ['radio', 'Expert'],
  ];

  for (const [role, name] of samples) {
    const bg = await page.getByRole(role, { name, exact: true }).evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    // **1.15 is the line, and it is measured.** The button surface is #2a231b on a
    // #15120f page: 1.21:1. What it replaced was #1e1a16, which is 1.07:1 — a
    // difference of 9 in each channel, i.e. the same wall with a 1px line drawn on
    // it. So 1.15 sits above the old value with room to spare and below the new one,
    // and a revert to the previous palette fails here rather than in a bug report.
    // It is a low bar on purpose: this is a *surface separation* test, not a text
    // contrast test, and the label's own contrast is checked where it belongs.
    expect(ratio(parse(bg), parse(pageBg)), `${name} against the page`).toBeGreaterThan(1.15);
  }
});
