# What release 1 must carry, and what it must record

Research date: 27 September 2026. Scope: the licence obligations a distributed browser chess
app inherits from the engine, the puzzle data and the language-model calls inside it, and the
provenance it must carry so a qualified reviewer could sign it off later. Follows
[2026-09-26-chess-tutor-options.md](./2026-09-26-chess-tutor-options.md) and
[2026-09-27-llm-coach-probe.md](./2026-09-27-llm-coach-probe.md), and answers
[ticket 03](../../.scratch/first-learning-release/issues/03-licensing-and-provenance.md).

**This is an engineering document, not legal advice.** It records what licence texts say, what
this repository actually ships, and what a reviewer would need to find. Where the answer depends
on a legal judgement rather than a citation, it says so and says who should make the call.

## Summary

Three components, three different licence situations, and only one of them is genuinely hard.

| Component | Licence, as verified today | Must ship | Difficulty |
| --- | --- | --- | --- |
| Stockfish 19 Lite WASM engine | GPL-3.0 (npm `stockfish@19.0.0`, `license: "GPL-3.0"`) | GPLv3 text, attribution, a pointer to the Corresponding Source, and the Corresponding Source itself | The obligations are clear; assembling the Corresponding Source is work nobody has done |
| Lichess puzzle export subset | CC0 1.0, scoped by Lichess to "Database exports" only | A source identifier and a record of what was taken; attribution is optional under CC0 | Low, provided the subset retains source IDs |
| Model-written teaching text | Provider terms bind the **key holder**, not this app | A per-provider disclosure before the first call | Medium, and partly a *product* decision, not a licence one |
| The app's own code | **No licence file exists in this repository** | A licence | One decision, and it constrains everything above |

The single most important finding: **the app does not modify the engine, and that is what keeps
the rest of this tractable.** GPLv3 §5 ("Conveying Modified Source Versions") is what would force
the whole app under the GPL; only §4 and §6 apply to an unmodified binary. Keeping it unmodified
is therefore a licence decision, not just a build hygiene one.

The second most important finding: **the engine is embedded, and the NNUE network is inside it.**
Verified today by running the shipped binary: `info string NNUE evaluation using
nn-61e7af4bb97d.nnue (1MiB, (768, 1024, 32, 32, 1))`. A trained network cannot be regenerated
from source, so it is part of the Corresponding Source and must be published with it.

## What this repository actually ships today

Verified by reading the package tree and by running the engine, not inferred from documentation.

| Fact | Value | Where it comes from |
| --- | --- | --- |
| Engine package | `stockfish@19.0.0`, `buildVersion: "19"`, `license: "GPL-3.0"` | `node_modules/stockfish/package.json` |
| Flavour used | `stockfish-19-lite-single` (≈1.8 MB `.wasm`, 21 KB `.js`) | `scripts/copy-engine.mjs` |
| Engine identity at runtime | `id name Stockfish 19 Lite WASM` / `id author the Stockfish developers (see AUTHORS file)` | ran the binary today |
| Neural network | `nn-61e7af4bb97d.nnue`, 1 MiB, arch `(768, 1024, 32, 32, 1)`, **embedded in the `.wasm`** | ran the binary today; no `.nnue` file exists in `node_modules/stockfish/bin/` |
| Engine source in the repo | **None.** The npm package ships only `bin/` and `scripts/postinstall.js`; no C++, no `build.js`, no nets | `package.json` `files` field |
| GPLv3 text in the repo | `Copying.txt` exists inside `node_modules/stockfish/` but is **not** copied into `public/engine/`, and so does not ship | `scripts/copy-engine.mjs` copies exactly two files: `.js` and `.wasm` |
| Attribution already embedded | The `.js` glue opens with a banner: `Stockfish.js 19 (c) 2026, Chess.com, LLC`, `License: GPLv3`, credits Romstad/Costalba/Kiiski/Linscott, and credits `Nets by Chris Bao (sscg13)` | read from the shipped `stockfish.js` |
| App's own licence | **None.** No `LICENSE`, `COPYING` or `NOTICE` file is tracked; `README.md` §Licence notes `chess.js` is BSD-2-Clause and the engine GPL-3.0, then says to "review the GPL implications before publishing" | `git ls-files`, `README.md` |
| Other shipped code | `chess.js@1.4.0` BSD-2-Clause; `react`/`react-dom` 19.3.0 MIT | their `package.json` `license` fields |

Two things follow immediately. The GPLv3 text does not currently reach the user, and no document
tells a user where the engine's source is. Both are cheap to fix and both are prerequisites to
publishing.

One stale reference, noted because the ticket asks what must be *recorded*: `README.md` points at
`public/pieces/ATTRIBUTION.md`, which does not exist in this checkout (the piece artwork is
original, and `public/pieces/README.md` is a design document with no licence or attribution
content). The top-level README is currently the only licence-adjacent document, and it
deliberately declines to answer the question.

## 1. Stockfish: running it is not distributing it, but this app does distribute it

### The distinction the ticket asks about

GPLv3 §0 defines the two verbs precisely:

> To "propagate" a work means to do anything with it that, without permission, would make you
> directly or secondarily liable for infringement under applicable copyright law, **except
> executing it on a computer or modifying a private copy.**

> To "convey" a work means any kind of propagation that enables other parties to make or receive
> copies. Mere interaction with a user through a computer network, with no transfer of a copy, is
> not conveying.

The FSF is blunter, in response to exactly the question asked here:

> **If I only make copies of a GPL-covered program and run them, without distributing or conveying
> them to others, what does the license require of me?**
>
> **Nothing.** The GPL does not place any conditions on this activity.

So: running an engine you downloaded, on your own machine, imposes nothing. That is the whole of
the answer for private use.

### Why that exemption does not apply here

This app is not a private copy. `scripts/copy-engine.mjs` copies two files into `public/engine/`
before every build; Vite copies the whole `publicDir` into `dist/`; `dist/` is then uploaded. Every
visitor's browser downloads `stockfish.js` and `stockfish.wasm` from our origin. Their browser
receives a copy, and so do we. That is conveying, and it is squarely inside GPLv3 §6.

§6 offers five routes. The one that fits a web deployment is §6(d):

> (d) Convey the object code by offering access from a designated place (gratis or for a charge),
> and offer equivalent access to the Corresponding Source in the same way through the same place
> at no further charge. […] you must maintain clear directions next to the object code saying where
> to find the Corresponding Source. Regardless of what server hosts the Corresponding Source, you
> remain obligated to ensure that it is available for as long as needed to satisfy these
> requirements.

The Stockfish README states the same obligation in plainer words, and adds a useful simplification
the licence itself does not make:

> The only real limitation is that whenever you distribute Stockfish in some way, you MUST always
> include the license and the full source code (**or a pointer to where the source code can be
> found**) to generate the exact binary you are distributing. If you make any changes to the source
> code, these changes must also be made available under GPL v3.

Read "pointer" as shorthand for §6(d), not as a licence to omit the source. The binding text is
§6, and §6 requires the Corresponding Source to actually be *there*, not described.

### What is actually required, item by item

| Obligation | Source | Status today |
| --- | --- | --- |
| Ship a copy of the GPLv3 licence with the object code | §4: "give all recipients a copy of this License along with the Program" | **Not done.** The text sits in `node_modules` and is never copied |
| Ship appropriate copyright and licence notices for the engine | §4: "conspicuously and appropriately publish on each copy an appropriate copyright notice" | **Partly done.** The `.js` banner carries the copyright lines; the `.wasm` is 1.8 MB of binary with no notice in it |
| Ship the `AUTHORS` file | Not a §6 requirement as such; the Stockfish README lists it as part of the distribution | **Not done** |
| Make the Corresponding Source available at equivalent access, no charge | §6(d) | **Not done** |
| Say where it is, next to the binary | §6(d) "clear directions next to the object code" | **Not done** |
| Keep it available for as long as the app is offered | §6(d) | **Not done, and it is a standing obligation, not a one-off** |
| Mark the work as modified and licence the whole app under GPLv3 | §5 | **Not applicable** — see below |
| Provide "Appropriate Legal Notices" in the UI | §5(d), and only if *you* modify | **Not applicable** — see below |

So of eight items, two are inapplicable, and the other six are undone. None is expensive. The
Corresponding Source is the only real project.

### Modification is what would change the answer, and the build does not modify

This is the load-bearing distinction, and it is worth being exact about it.

GPLv3 §6 opens: "You may convey a covered work in object code form **under the terms of sections 4
and 5**, provided you also convey the machine-readable Corresponding Source." Section 5 is what
imposes the heavy obligations — "The work must carry prominent notices stating that you modified
it" and "You must license the entire work, as a whole, under this License to anyone who comes into
possession of a copy."

Those obligations trigger on **modification**, not on distribution. Today, the app copies the
npm package's files byte-for-byte. The script's own comments are unusually clear about why it
deletes the destination directory first — a stale binary from an earlier version must not ride
along into `dist/` — and the `FILES` list is described as the single source of truth so that a
name cannot be validated on one line and not acted on. That is the right instinct for a licence
question even though the script does not say so.

**Design constraint: do not patch, wrap-in-place, or replace the engine binary.** If someone
later forks Stockfish, edits the C++, or swaps in a different flavour, §5 applies to the combined
work and the app's own licence question reopens in its hardest form. The current build is in the
good position, and that position is a decision rather than an accident.

The same reasoning covers the Application Programming Interface. The app speaks UCI to the engine
over a Web Worker, with a documented text protocol it did not design. It does not link engine
object code into its own code, does not import engine symbols, and does not modify it. It is
therefore a *user* of the engine, not a derivative work of it.

### What "Corresponding Source" means for a WebAssembly build

GPLv3 §1 is the definition, and it is demanding:

> The "Corresponding Source" for a work in object code form means all the source code needed to
> generate, install, and (for an executable work) run the object code and to modify the work,
> **including scripts to control those activities.**

A native Stockfish release is a one-to-one thing: the C++ source in `src/` plus a `Makefile`
builds the binary. This is not one-to-one, and the extra pieces are the whole difficulty. For this
build, the Corresponding Source is at minimum:

1. **The Stockfish 19 C++ source at the exact revision that was compiled.** Not recorded anywhere
   in this repository. The shipped binary reports `Stockfish 19 Lite WASM` and nothing more
   specific.
2. **The emscripten build recipe.** `node_modules/stockfish` ships `bin/` and
   `scripts/postinstall.js` only; `build.js` is absent. The upstream README names the toolchain
   (`emscripten 3.1.7`) and the flags (`./build.js --single-threaded --lite`), but the script that
   produced *this* artefact is not vendored.
3. **Any patches applied on top of upstream.** The README credits "Lichess WASM Builds for their
   patches", so this build is patched. Which patches, and at which revision, is not recorded here.
4. **The NNUE network `nn-61e7af4bb97d.nnue`.** Verified today to be embedded in the binary, and
   it is a trained artefact, so it cannot be regenerated from the other parts of the Corresponding
   Source — which §1 says it need not include only where the excluded part *can* be regenerated
   automatically. It must therefore be shipped as part of the source.
5. **The licence text.**

Two pieces of good news from the FSF FAQ, which materially reduce the burden:

> **Does the GPL require me to provide source code that can be built to match the exact hash of
> the binary I am distributing?**
>
> Complete corresponding source means the source that the binaries were made from, but that does
> not imply your tools must be able to make a binary that is an exact hash of the binary you are
> distributing. In some cases it could be (nearly) impossible […] a system might put timestamps in
> binaries; or the program might have been built against a different (even unreleased) compiler
> version.

So bit-reproducibility is not required. Naming the right upstream revision is enough.

> **Am I complying with GPLv3 if I offer binaries on an FTP server and sources by way of a link to
> a source code repository?**
>
> This is acceptable as long as the source checkout process does not become burdensome or
> otherwise restrictive. […] Users should be provided with clear and convenient instructions for
> how to get the source for the exact object code they downloaded — they may not necessarily want
> the latest development code, after all.

A repository is fine. It must be reachable by the same people who can reach the binary, and it
must be *pinned to the revision that produced the binary*, not pointed at `main`.

One practical note for whoever does this: `public/engine/` is gitignored and regenerated on every
build, so "publish our repository" is not currently a sufficient answer. The engine is not in the
repository. The Corresponding Source has to be assembled and published as its own artefact.

### Whether the app is one work with the engine, or two programs that ship together

This is the question that decides the app's licence, so it is worth answering carefully even
though the answer is not mine to give definitively.

The FSF's test is the closest thing to an authoritative statement available:

> An "aggregate" consists of a number of separate programs, distributed together on the same
> CD-ROM or other media. The GPL permits you to create and distribute an aggregate, even when the
> licenses of the other software are nonfree or GPL-incompatible.
>
> Where's the line between two separate programs, and one program with two parts? **This is a
> legal question, which ultimately judges will decide.** We believe that a proper criterion depends
> both on the mechanism of communication (exec, pipes, rpc, function calls within a shared address
> space, etc.) and the semantics of the communication (what kinds of information are interchanged).
>
> If the modules are included in the same executable file, they are definitely combined in one
> program. […] By contrast, pipes, sockets and command-line arguments are communication mechanisms
> normally used between two separate programs. So when they are used for communication, the modules
> normally are separate programs. But if the semantics of the communication are intimate enough,
> exchanging complex internal data structures, that too could be a basis to consider the two parts
> as combined into a larger program.

And, on the web specifically, the FSF distinguishes the two cases directly:

> Compare this to a situation where the web site contains or links to separate GPLed programs that
> are distributed to the user when they visit the web site (often written in JavaScript, but other
> languages are used as well). In this situation the source code for the programs being distributed
> must be released to the user under the terms of the GPL.

Measured against those criteria, this app sits on the "separate programs" side:

| Criterion | This app | Leaning |
| --- | --- | --- |
| Same executable file? | **No.** `stockfish.js` and the app's Vite bundle are separate files; the engine loads at runtime from `public/engine/` | separate |
| Shared address space? | **No.** A Web Worker is a separate realm with its own globals; the WASM module has its own linear memory. The app cannot reach into it | separate |
| Communication mechanism | `postMessage` — structured-clone messages over a queue. The browser's direct analogue of a pipe | separate |
| Semantics of that communication | UCI text lines: `position fen …`, `go depth 8`, `info depth … multipv … score cp … pv …`, `bestmove e2e4`. A documented protocol the app did not design, carrying no internal structures | separate |

Nothing in the table points the other way, and the FSF's own web answer treats a page that
*serves* a separate GPLed program as an aggregate that need only publish that program's source.

**But I am flagging this as genuinely uncertain rather than resolving it**, for two reasons. First,
the FSF says plainly that a court decides this, and no court has ruled on a WebAssembly chess
engine in a browser. Second, the FSF is the GPL's steward, not a neutral authority, and its
published positions in adjacent areas have not always been the least aggressive reading available
to a vendor. The facts here are favourable; the *law* is not settled.

The practical asymmetry is what should drive the decision, and it is large:

- If this is an **aggregate**, the app may carry a permissive licence, and its users may do
  anything GPL allows with the engine, including incorporating it into a proprietary product.
- If it is a **combined work**, then any distribution of the app must be under GPLv3 as a whole,
  and a permissive licence on the app would be a violation. The cure is to relicense the app, which
  is cheap the day before release and expensive the day someone has built on top of it.

**Recommendation: get a qualified opinion before publishing, and do not assume the favourable
reading.** Do not treat this document as the basis for shipping.

## 2. The Lichess puzzle export: what CC0 covers, and what it does not

### The scope of the grant

The claim is narrower than "Lichess content is CC0". On the open-database page, the sentence is
about exports specifically:

> Database exports are released under the Creative Commons CC0 license. Use them for research,
> commercial purpose, publication, anything you like. You can download, modify and redistribute
> them, without asking for permission.

CC0 1.0 itself, in §1 and §2, is a waiver by the *Affirmer* — Lichess — of "all of Affirmer's
Copyright and Related Rights" in "the Work". It is not a licence Lichess could grant over
material it does not own. That limit is explicit in §4:

> Affirmer disclaims responsibility for clearing rights of other persons that may apply to the Work
> or any use thereof, including without limitation any person's Copyright and Related Rights in the
> Work.

This matters more than it first appears, because the puzzle dataset is derived from other people's
games. Per the export's own spec, the puzzles were built by re-analysing positions from ~600
million Lichess games, and the `GameUrl` field on every row points back to a real user's game. The
players, not Lichess, authored those games.

**Practical reading:** CC0 covers Lichess's own rights in the derived data — the FEN, the solution
moves, the ratings, the popularity scores, the tags, the row structure. It does not, and cannot,
clear whatever rights a game player might have in the underlying game. I did not find, and did not
look for, a case on whether a bare chess position or a FEN string is a copyrightable work; on the
facts as stated in §4, the waiver simply does not reach non-Lichess rights. **This is a question
for a lawyer if the puzzle set is ever published at scale, and a much smaller one for a small
curated subset, but it is a real question and I am not going to answer it by assertion.**

### What CC0 does not cover, stated plainly

The prior research got this right and it is worth restating as a hard boundary, because the failure
mode is generalising a dataset licence to a whole service:

- **Lichess studies and their annotations.** User-authored. A study you find on lichess.org is
  under the same site-wide terms, not under the export's CC0 grant.
- **Lichess's own editorial content** — lessons, practice chapters, puzzle-theme descriptions,
  blog posts, the interactive Learn material.
- **Artwork and fonts** — piece sets, board textures, the site's visual assets. The Lichess terms
  call these out by name: "the relevant licenses applicable to the website and their component parts
  (such as fonts, designs, piece sets)."
- **Lichess's code.** Lila is AGPL-3.0-or-later, which is a different and much stronger obligation
  than anything in this document. This app's piece artwork is original, which is why it is not
  exposed to this.
- **User content**, in the sense that matters here: another user's study, another user's
  annotations, and the games the puzzles were mined from.
- **Trademarks and patents.** CC0 §4: "No trademark or patent rights held by Affirmer are waived."
  Do not use the Lichess name or logo as if the app were Lichess or endorsed by it.

The Lichess terms support reading the site as deliberately non-uniform, and they put the burden of
sorting it out on us:

> Various parts of the website and services use different licenses. Anyone intending to use or
> replicate the website and services should do their own research and due diligence into the various
> licenses used […] Lichess is not responsible for a person or legal entity failing to do their own
> due diligence.

And they reserve the right to change it: "we reserve the right to change the licensing of our
services, or the services we own that we make publicly available." A CC0 dataset can therefore
change licence between the day we download it and the day we ship. **Re-verify at release, and
record the licence statement and the date it was read.** Do not treat a licence decision made today
as permanent.

### The import detail, restated because it is a correctness bug waiting to happen

The export's `FEN` field is **before the opponent's move**:

> FEN is the position before the opponent makes their move.
> The position to present to the player is after applying the first move to that FEN.
> The second move is the beginning of the solution.

So for a row whose `FEN` is black-to-move and whose `Moves` are `e8d7 a2e6 d7d8 f7f8`, the
position the learner sees is the one *after* `e8d7`, and the solution the learner must find starts
at `a2e6`. Importing the FEN as given shows a position one move before the puzzle begins, on the
opponent's turn — which will look like a broken puzzle and, worse, might be graded against the wrong
side to move.

This is exactly the class of defect the map calls out as load-bearing: the probe's most instructive
failure was a coach that spoke as the wrong side because the turn was misread. The import is a
place where that same error can be made once, in data, and then baked into every exercise drawn
from it.

The export also states the grading rule:

> All player moves of the solution are "only moves". I.e. playing any other move would considerably
> worsen the player position. An exception is made for mates in one: there can be several. **Any
> move that checkmates should win the puzzle.**

That exception must be implemented deliberately. Accepting only the listed move will mark correct
mates wrong, and it will do so on exactly the simplest exercises in the set — the ones most likely
to be a beginner's first success.

### The fields, and which of them a curated subset must retain

The CSV schema is `PuzzleId,FEN,Moves,Rating,RatingDeviation,Popularity,NbPlays,Themes,GameUrl,OpeningTags,DailyDate`.
A curated subset must retain, per row:

| Field | Why it must be retained |
| --- | --- |
| `PuzzleId` | The only stable identity. Without it a position cannot be traced back, re-fetched, or cross-checked against a later export |
| `FEN` (as exported) | The pre-move position. The importer needs it to compute the presented FEN; keeping only the derived FEN loses the ability to detect an import bug |
| `Moves` | The solution, and the source of the mate-in-one exception |
| `Themes` | Drives selection, and is the link back to a specific tactic. Also the honest limit on what the data claims: a tag is a label, not an explanation and not evidence of a misconception |
| `Rating`, `RatingDeviation`, `Popularity`, `NbPlays` | Lichess's own difficulty calibration. Useful for ordering and for the honest description of what "rating" means here. Not a teaching signal |
| `GameUrl` | The provenance chain back to the source game, and the place a reviewer would look if a rights question ever arose |
| The export's identity | Filename, URL, and the date retrieved. The export is regenerated; row numbers are not stable |
| Licence + date read | The CC0 statement and when it was verified — see the re-licensing risk above |

Fields that are *not* the puzzle's to keep: nothing in the row is a licence to the game, a player's
annotation, or any part of the lichess.org service.

The prior research's conclusion holds and is the right instruction to give the implementer: the
puzzle bank is data, the teaching layer is ours, and the two must not be blurred. Puzzle tags can
select an exercise. They cannot explain it.

## 3. Language-model terms: whose terms they are, and what to disclose

### The structural fact that reframes this section

The map settles that the user supplies their own provider API key, it is stored locally, and the
app calls the provider directly from the browser. No backend, no key of ours.

That means **this app has no contract with any provider.** The user is the account holder. Every
provider term quoted below binds *them*, not us. The app's obligations are not contractual at all;
they are (a) not misleading, and (b) whatever we choose to promise the user. This is the single
most important thing to understand before reading any of the provider terms, and it is the reason
this section is shorter than the licence sections above.

It also means a second, sharper thing. The architecture means **no provider-generated text is in the
shipped bundle.** The model writes sentences at runtime, in the user's browser, with the user's key.
Whatever terms the provider imposes, they land on the user and on the text in their session — not on
an artefact we distribute. This is a substantial licence advantage of the BYOK design and it should
be recorded as a deliberate reason to keep it, not merely inherited.

### What the major providers say, verbatim

**Anthropic — Commercial Terms of Service, effective 17 June 2025, §B (Customer Content):**

> As between the parties and to the extent permitted by applicable law, Anthropic agrees that
> Customer (a) retains all rights to its Inputs, and (b) **owns its Outputs**. Anthropic disclaims
> any rights it receives to the Customer Content under these Terms. […] **Anthropic may not train
> models on Customer Content from Services.**

And §D.3 places the accuracy burden on the customer, with an explicit instruction to tell end
users:

> It is Customer's responsibility to evaluate whether Outputs are appropriate for Customer's use
> case, including where human review is appropriate, before using or sharing Outputs. **Customer
> acknowledges, and must notify its Users, that factual assertions in Outputs should not be relied
> upon without independently checking their accuracy**, as they may be false, incomplete,
> misleading or not reflective of recent events or information.

**OpenAI — Services Agreement, effective 1 January 2026, §4.1:**

> As between Customer and OpenAI, to the extent permitted by applicable law, Customer: (a) retains
> all ownership rights in Input; and (b) **owns all Output**. OpenAI hereby assigns to Customer all
> OpenAI's right, title, and interest, if any, in and to Output.

§4.2: "OpenAI will not use Customer Content to develop or improve the Services, unless Customer
explicitly agrees to such use." §4.3: "Customer is solely responsible for all use of the Outputs and
for evaluating the accuracy and appropriateness of Output." The consumer [Terms of Use, effective
1 January 2026](https://openai.com/policies/row-terms-of-use/) say the same in plainer words — "you
own the Output" — and add a prohibition that matters here: **"Represent that Output was human-
generated when it was not."** They also warn that "output may not be unique and other users may
receive similar output."

**Google — Gemini API Additional Terms of Service, effective 23 March 2026, "Use of Generated
Content":**

> Some of our Services allow you to generate original content. **Google won't claim ownership over
> that content.** You acknowledge that Google may generate the same or similar content for others
> and that we reserve all rights to do so. […] **You're responsible for your use of generated
> content**, and for the use of that content by anyone you share it with.

Two Google clauses constrain the product more than any ownership clause does:

> You must be 18 years of age or older to use the APIs. You also will not use the Services as part of
> a website, application, or other service […] that is directed towards or is likely to be accessed
> by individuals under the age of 18.

> You may only access the Services (or make API Clients available to users) within an available
> region. **You may use only Paid Services when making API Clients available to users in the
> European Economic Area, Switzerland, or the United Kingdom.**

And on data handling, the distinction that a free-tier key changes everything:

| Tier | What the provider says it does with the prompt and the reply |
| --- | --- |
| Gemini **Unpaid** (free quota) | "Google uses the content you submit […] and any generated responses to provide, improve, and develop Google products and services and machine learning technologies […] **human reviewers may read, annotate, and process your API input and output** […] Do not submit sensitive, confidential, or personal information to the Unpaid Services." |
| Gemini **Paid** | "Google doesn't use your prompts […] or responses to improve our products" |
| Anthropic (commercial) | "Anthropic may not train models on Customer Content from Services" |
| OpenAI (business) | "OpenAI will not use Customer Content to develop or improve the Services, unless Customer explicitly agrees" |

The map already records that "free-tier provider keys gave 3–8 successful calls, then HTTP 429,
repeatedly." A beginner will therefore start on a free tier, which for Gemini means their positions
and the generated coaching text may be read by a human reviewer at Google. That is a disclosure the
app owes the user before the first call, and it is not currently written anywhere.

### What to tell the user before the first call

The user is the one who needs this, because the user is the one bound by the terms. The app should
state, in plain language, before the key is used:

1. **Whose key it is, and who the contract is with.** The call is between the user and the named
   provider. The app has no account with them and cannot see the key.
2. **What leaves the device.** Concretely: the position, the computed facts, the lesson text, and
   whatever the learner typed. Not a vague "some data" — the user should be able to see exactly what
   is sent, which is also what makes the app's own honesty claim auditable.
3. **Whether the key is paid or free, and what changes.** If it is a free-tier key, say so, and say
   that on some providers the prompts and replies may be used to improve the provider's products
   and read by human reviewers. This is the clause most likely to surprise a user, and it is the one
   a "no key means no learning mode" design makes unavoidable rather than optional.
4. **That the output is the user's to keep** — the provider does not claim ownership — and that
   other users may receive similar text.
5. **That the text can be wrong**, which the providers all require be communicated, and which the
   app should state more strongly than they do: the chess facts come from the engine and are
   checked; the *wording* is machine-written and unverified.
6. **The age restriction**, because the Gemini terms forbid under-18 audiences outright and
   OpenAI requires guardian consent. The map still lists "reading level and audience" as open. This
   is a concrete product constraint that has to be resolved before the key screen exists.
7. **The regional restriction**, if the app will be used in the EEA/UK/Switzerland, where Google
   permits only Paid Services for an API Client.
8. **The cost.** The user pays their provider, and the map's own probe says the free tier
   rate-limits within a handful of calls.

### Distinguishing the provider's terms from this app's licence

These are three different things and conflating them is the most likely error in this whole
document:

- **The provider's terms** govern the user's use of that provider's model. They say nothing about
  what licence the app may carry, and nothing about whether the app may be proprietary.
- **This app's own licence** is a separate decision about the app's own code, and is constrained by
  the engine (§4 below), not by any provider.
- **Whether the generated text is "ours"** is a third question the provider terms answer for the
  *user*: the user owns the output. The app is not a party to that arrangement. If this project
  ever wanted to *pre-generate* lesson text with its own key and ship it in the bundle — a very
  different act from generating text in the user's browser — the analysis would change, because
  the app would then be the Customer, the provider's terms would bind the app directly, and
  Anthropic's §D.3 notice obligation and OpenAI's output-similarity warning would become the app's
  own liabilities. **The runtime-only design is what keeps that from being true. Keep it.**

The specific thing the app must not do: represent model-written text as written by a named human.
OpenAI's consumer terms prohibit it explicitly, and it would also be a direct violation of the map's
hard rule that no learner-facing sentence asserts anything the code has not established — the
provenance of a sentence is part of its truth, not decoration.

## 4. The app's own licence: the decision, not the answer

**No licence file exists in this repository.** `git ls-files` returns no `LICENSE`, `COPYING` or
`NOTICE`. The only licence-adjacent text is the README's own deferral:

> `chess.js` is BSD-2-Clause. The Stockfish engine is **GPL-3.0** — see `node_modules/stockfish`.
> This project is a local, self-hosted app; review the GPL implications before publishing it as a
> hosted or closed-source product.

The FSF is unambiguous about what the absence means, and it is not a neutral omission:

> Just putting a copy of the GNU GPL in a file in your repository does not explicitly state that the
> code in the same repository may be used under the GNU GPL. Without such a statement, it's not
> entirely clear that the permissions in the license really apply to any particular source file.

No licence means the app's own code is **all rights reserved**: nobody, including the author, has
been granted permission to use it, and it is not open source. That is a coherent position for a
private project, and it is the position the project is in today. It is not a coherent position for
a public distribution, because distributing the bundle conveys the app's code to users with no
licence attached.

**I am not choosing a licence here, and this section deliberately stops short of recommending
one.** Choosing is a decision for the author informed by a qualified opinion. What follows is the
decision that has to be made and the constraints that bear on it.

### The decision

> **Will release 1 be published, and if so under what licence — and does the browser engine make
> that a question about GPLv3 rather than about preference?**

Two sub-questions, in order of importance:

1. Is the app an **aggregate** of a separately-distributed GPL program, or a **combined work** that
   must be GPLv3 as a whole? (Analysed above; favourable but not settled.)
2. Independently of that answer, what licence does the author *want* for the app's own code, and is
   it compatible with the answer to (1)?

### What constrains the answer

- **The engine, if it is a combined work, forces GPLv3 for the whole app.** §5(c): "You must
  license the entire work, as a whole, under this License to anyone who comes into possession of a
  copy." A permissive app licence and a bundled GPL engine in a single work are incompatible
  choices, not a negotiation.
- **The engine, if it is an aggregate, does not constrain the app at all** — but the app may not
  distribute the aggregate under terms that restrict what the engine's own licence grants. A
  permissive app licence is compatible; a proprietary one that forbids redistribution of the
  engine would not be.
- **The other bundled dependencies are permissive** — `chess.js` BSD-2-Clause, React and React-DOM
  MIT — and constrain nothing.
- **The piece artwork is original**, which is why the Cburnett/Merida share-alive question does not
  arise. It is worth keeping it that way: swapping in a GPL-licensed or CC-BY-SA piece set would add
  a second copyleft question, and the README already notes this.
- **The puzzle corpus is CC0**, which places no condition on the app and no attribution obligation.
  Retaining source IDs is a good practice, not a legal requirement.
- **The model terms constrain nothing about the app's licence**, because under BYOK the app is not a
  party to them.
- **A reviewer's ability to inspect the app at all** is a practical constraint. If the app is
  published closed and the engine turns out to be a combined work, there is no compliance path that
  does not involve relicensing. If the app is published permissively *and* the engine is an
  aggregate, a reviewer is free to replace the engine with a stronger one, fork the app, and
  redistribute — which is what a GPL project's users would expect anyway.

The recommendation, offered as sequencing rather than as a licence choice: **settle (1) with a
qualified opinion before settling (2).** (2) is a preference; (1) is a constraint, and a preference
formed without knowing the constraint is not a decision.

## 5. Provenance as a design input: the checklist

This is the implementable part. The goal is a stated, narrow one: **a qualified third party should
be able to open one bundle, months later, and reach a defensible conclusion about what release 1
taught, on what evidence, and how much of it rests on an unverified judgement.** Nobody who can
adjudicate chess is available to this project today, so the record has to be legible to a stranger.

The design input, stated once: **provenance is a field, not a document.** If it is prose in a README
it will drift from the artefact on the next build. It belongs in the data, is checked by the build,
and is rendered from.

### 5a. Per shipped third-party component

One machine-readable manifest, one human-readable notices file, both emitted by the build and both
committed so a diff shows a change.

| Field | Example / note | Required? |
| --- | --- | --- |
| `component` | `stockfish` | yes |
| `version` | `19.0.0`; also `buildVersion: "19"` | yes |
| `flavour` | `lite-single` — the *choice* of flavour is part of provenance | yes |
| `upstream` | project + URL, and the specific revision or release, not `main` | yes |
| `licence` | `GPL-3.0` | yes |
| `licenceTextPath` | a file that is actually shipped | yes |
| `sourceUrl` | where the Corresponding Source is published | for GPL components |
| `retrievedOn` | date | yes |
| `artifacts[]` | each shipped file, with `sha256` and `bytes` | yes |
| `modifications` | `[]`, plus where a patch would live. The empty array is the load-bearing value | yes |
| `buildRecipe` | toolchain and the command that produced this flavour | for generated artefacts |
| `embeddedData` | `nn-61e7af4bb97d.nnue` — the NNUE net is inside the binary and is not a separate file | for the engine |

The notices file is what a user actually sees, so it goes at the deployed site root and is reachable
without a click. It should name Stockfish (GPL-3.0), the Stockfish.js WASM build and its authors,
the NNUE net, `chess.js` (BSD-2-Clause), and React/React-DOM (MIT) if bundled — with the full GPLv3
text as a **file**, not a link. The FSF's reason for the file is worth repeating to whoever is
tempted to use a URL: "you cannot be sure that the URL will still be valid, five years or ten years
from now."

### 5b. Per content item

Applies to every puzzle, lesson, exercise, hint rung and coach template. One shape, used
uniformly, so a reviewer learns it once.

| Field | Note |
| --- | --- |
| `id`, `kind`, `revision` | stable identity and a version; content changes over time and the record must show when |
| `source` | dataset + record id (`lichess` + `PuzzleId`), or `original`, or a reference work with edition and ISBN |
| `sourceLicence` | `CC0-1.0` for the export; the specific permission for anything else. "Free to read" is not a licence |
| `licence` | the licence of *this item*, which for authored teaching text is the app's own — and is therefore blocked on §4 |
| `generator` | human author, or `runtime:<provider>:<model-id>` with the prompt-template id, or `commit` if committed text |
| `position` | the FEN **as presented to the learner**, plus the `FEN` as exported when the source is Lichess, so the first-move application is checkable after the fact |
| `engineCheck` | engine build, net id, depth or knodes, and the verdict that was stored |
| `review` | `unreviewed` \| `engine-checked` \| `chess-reviewed` + reviewer + date. Do not invent a fourth value |
| `revisedOn` | date, because a stale explanation is worse than none |

**One rule on `review`, and it is the rule the map's hard constraint implies: release 1 must not
display a value implying human review, because no such reviewer exists.** A learner who sees
"verified" must be able to establish what verified it and when. If a label can be shown without a
named method, it is decoration.

**On `generator`:** the honest value for a runtime sentence names the model and the prompt
template. The probe's finding was that every model wrote fluent, confident, wrong teaching when the
fact layer was wrong — so the interesting provenance question is not "was this sentence checked" but
"which fact pack was it written from, and was that pack correct". That argues for recording the
fact pack with the sentence, in the learner record below, not just the generator here.

### 5c. Per learner record

The artefact a reviewer signs off on. It has to survive the app being rewritten, so it is versioned
separately from the code and carries the identity of the build that wrote it.

| Field | Why it is needed |
| --- | --- |
| `recordSchemaVersion` | so a reviewer can read a record written by a later or earlier app |
| `appBuild` | the commit or release tag, and the content-set id, so the record names the exact thing that produced it |
| `engine` | stockfish version, flavour, **net id**, analysis settings: time or depth, `MultiPV`, `Skill Level`, `UCI_LimitStrength` |
| `exposition` | every Attempt: exercise id **and content revision**, the presented FEN, side to move, the moves actually played, the highest **hint stage** reached, `independent` \| `assisted`, whether it was correct, elapsed time |
| `gradingBasis` | the engine verdict the attempt was graded against — score, pv, depth. Without this a wrong grade cannot be distinguished from a changed engine |
| `coaching` | for each coach turn: provider, model id, prompt-template version, **the fact pack as sent**, the raw reply, and the validator's verdict |
| `confusionLog` | the learner's own notes, written as the moments happen, per the map's pilot plan |
| `knownDefects` | append-only. A corrected explanation gets a new revision; it does not overwrite the old one |

Two of these deserve a note.

`hintStage` and `independent`/`assisted` are the app's main measure — the glossary is explicit that
an assisted success is "assisted practice, never independent success" and that this "must not be
blurred for convenience." Provenance is where that blurring would happen, because a record that
omits the hint stage makes an assisted success indistinguishable from an independent one. **Store
the highest hint stage reached on every Attempt, not only on failures.**

The **fact pack is the record.** The probe's central finding is that detectors fail silently and
models do not notice — a wrong `attacked`/`isAttacked` call made every model confidently wrong.
Without the fact pack in the record, a reviewer looking at a bad explanation has no way to tell
whether the model invented something or was handed something false. With it, the failure is
attributable. This is the single highest-value field in the whole schema.

### 5d. The review bundle

What a qualified third party is given. One artefact, self-describing, and honest about its own
limits:

1. A content manifest (§5a and §5b) for the exact release.
2. A learner-record export (§5c), or the empty schema with a note that the pilot has not run.
3. The build identity: commit, build command, and the environment that produced the shipped engine.
4. The **engine verification** that supports the chess claims — `npm run perft:full`, plus whatever
   position-validation the content pipeline runs at build time. The map requires build-time
   validation of every position and line; the review bundle should carry the *result* of that run,
   because a claim that validation happens is not the same artefact as a record that it did.
5. A **defect and uncertainty ledger**, listing what is unverified, what the learner reported
   being misled by, and what the author knows is weak — with the open questions from this document
   reproduced in it.
6. A statement of what the bundle does *not* establish. A reviewer who cannot see the gaps will
   assume they are not there.

**The one test to apply before release:** could a competent stranger, with no access to the author,
determine (a) whether every chess claim the app made was engine-backed, (b) which explanations were
human-checked and which were not, and (c) exactly which engine and data produced any given exercise?
If any of the three requires asking the author, the record is not finished.

## What I verified today, and what I could not

Being explicit about this, because the person commissioning this work cannot play chess and is
relying on the accuracy of the licence reasoning rather than on their ability to check it.

### Verified, first-hand, today

| Claim | How |
| --- | --- |
| The engine package is `stockfish@19.0.0`, `buildVersion: "19"`, `license: "GPL-3.0"` | read `node_modules/stockfish/package.json` |
| The shipped binary identifies as `Stockfish 19 Lite WASM`, author "the Stockfish developers" | ran it |
| The NNUE net `nn-61e7af4bb97d.nnue` is **embedded in the `.wasm`**, 1 MiB, arch `(768, 1024, 32, 32, 1)` | ran it; no `.nnue` file exists in the package's `bin/` |
| The engine runs with no network access | ran it offline and got `bestmove e2e4 ponder e7e5` |
| The build copies **only** `.js` and `.wasm`; the GPLv3 text in `node_modules` never reaches `dist/` | read `scripts/copy-engine.mjs`, listed `public/engine/` |
| The shipped `stockfish.js` carries a GPL-3.0 banner and attribution | read the first lines of the file |
| No licence file is tracked in this repository | `git ls-files` |
| `chess.js` BSD-2-Clause; React/React-DOM MIT | their `package.json` `license` fields |
| The `README.md` reference to `public/pieces/ATTRIBUTION.md` is stale — the file does not exist here | read `README.md`, listed `public/pieces/` |
| GPLv3 §0, §1, §4, §5, §6 text; the FSF answers on running-without-distributing, on exact-hash rebuilds, on repository links, and on aggregate vs. combined work | read the primary texts |

### Read from primary sources, quoted in this document

Stockfish's README ("Terms of use"; the note that binary distributions embed the `.nnue`; the
credit to Leela Chess Zero's ODbL-licensed training data). The Lichess open-database page (the CC0
grant scoped to exports; the CSV schema; the FEN-before-the-opponent's-move rule; the mate-in-one
exception). The Lichess Terms of Service, last modified 1 August 2026 (licences differ per service,
due diligence is the user's, Lila is AGPL-3.0, fonts/piece sets called out, the right to
re-licence). CC0 1.0 §§1–4. Anthropic's Commercial Terms (effective 17 June 2025). OpenAI's Services
Agreement (effective 1 January 2026) and the consumer Terms of Use (effective 1 January 2026). The
Gemini API Additional Terms (effective 23 March 2026) and the Google APIs Terms of Service (last
modified 9 November 2021).

### Genuinely uncertain — needs a qualified opinion, not a guess

1. **Aggregate or combined work.** Decided by a court, per the FSF's own statement. The facts favour
   "aggregate" on every published criterion I could apply, and I would not bet against it, but I
   cannot call it. **This gates the app's own licence choice.**
2. **Whether Lichess's CC0 waiver reaches the rights it needs to.** §4(c) disclaims any obligation
   to clear other people's rights, and the puzzles are mined from ~600 million user games. Whether a
   bare chess position is protectable at all is a question I did not research and am not going to
   answer by assertion.
3. **The "User Product" question in §6.** A browser app is probably not a "User Product", and
   therefore probably triggers no "Installation Information" obligation — but the definition is
   broad ("anything designed or sold for incorporation into a dwelling") and the consequence of
   getting it wrong is real. I read the definition and judged it inapplicable; I did not find
   authority applying it to web applications.
4. **Whether Google's API Terms §5(e) restricts redistributing generated content in a bundle.**
   §5(e) prohibits "Copy, translate, modify, create a derivative work of, sell, lease, lend,
   convey, distribute, publicly display, or sublicense to any third party" content returned from the
   APIs. The Gemini Additional Terms say "Google won't claim ownership" and that "[a]s required by
   the API Terms, you'll comply with applicable law in using generated content" — which is a
   statement about *law*, not about the API Terms' own §5(e) prohibition, and reads as narrower
   than §5(e). **The runtime-only BYOK design keeps generated text out of the bundle and so likely
   avoids this entirely; pre-generating and shipping text would walk straight into it.**
5. **Which provider terms bind an individual hobbyist.** OpenAI's Services Agreement says it does
   not apply to services "used by consumers or individuals," while the consumer Terms of Use say
   business terms govern "our APIs." An individual using an API key is in an overlap. The ownership
   language is materially the same in both, so the practical answer is stable; the precise contract
   is not.

### Not checked, and out of scope for release 1

The prior research's notes on **ChessKid** (free for schools, commercial redistribution explicitly
disallowed) and **New In Chess** (material marked rights reserved) are carried forward from
[2026-09-26-chess-tutor-options.md](./2026-09-26-chess-tutor-options.md) and I did not re-verify
them today. Both point the same way — use them as curriculum references, import nothing — and neither
affects a release that ships original teaching text. They become urgent only if a digitised book or
course is ever contemplated, which is not this release.

## Open questions this document does not close

- **The app's licence is undecided**, and cannot be decided until (1) above is answered.
- **No third-party notices file exists**, and the GPLv3 text does not reach the user. This is
  independent of the licence decision and can be fixed now.
- **The Corresponding Source has never been assembled.** It needs the Stockfish revision, the
  emscripten build recipe, the patch set, and the NNUE net. None of the four is currently recorded
  anywhere in this repository.
- **The engine is not in the repository at all** — `public/engine/` is gitignored — so "publish our
  repository" cannot currently satisfy §6. The source has to be published as a separate, pinned
  artefact, and kept available for as long as the app is offered.
- **Multi-provider support is undecided** (the map lists it under *Not yet specified*). The
  pre-first-call disclosure in §3 cannot be written once for several providers; Google alone carries
  an 18+ age floor, an under-18 audience prohibition, and a paid-only rule in the EEA/UK/Switzerland.
  The age question therefore constrains the product, not just the disclosure text.
- **The learner record does not exist yet.** The map notes that
  [persistence](../../src/game/persistence.ts) "stores the current game and settings, not learning
  evidence." §5c is the schema that has to exist before release 1, not after.

## The short version

Ship the GPLv3 text, an attribution, and a pointer to a real, pinned, maintained Corresponding
Source that includes the NNUE net — that is the engine's entire obligation, and today none of the
four exists. Keep the puzzle subset's `PuzzleId` and export date, apply the first move at import,
accept any mate in mate-in-one, and write all explanations yourself. Generate text at runtime with
the user's key so no provider term binds this app, and tell the user before the first call whose key
it is, what leaves the device, that a free tier may mean human review, and that the wording is
machine-written. Give the app a licence, but get the aggregate-or-combined-work question answered
first. And record, on every exercise and every attempt, who or what wrote it, what engine and
network produced it, what verified it, and — above all — the fact pack the sentence was written from,
because that is the only thing that makes a wrong explanation attributable instead of mysterious.








