# What must release 1 carry, and what must it record?

Type: research
Status: resolved

## Question

Release 1 ships a puzzle corpus, a browser engine, and text a model wrote. What are the actual
obligations, and what must the product record so a qualified reviewer could sign it off later?

Cover: Stockfish's GPLv3 distribution and corresponding-source obligation; the licence of the
Lichess puzzle export and what it does *not* cover; provider terms on generated educational text;
and the product licence itself. Also state what provenance fields the content and the learner
record must carry so that a future review is possible at all.

## Comments

## Answer

[Full findings](../../../../docs/research/2026-09-27-licensing-and-provenance.md).

**The load-bearing result: keeping Stockfish unmodified is a licence decision, not build hygiene.**
GPLv3 §0 exempts merely *running* a program, so running it locally imposes nothing — but this app
copies the binary into `public/` and Vite serves it in `dist/`, which is *conveying* (GPLv3 §6(d)).
Six of eight obligations are currently undone: the GPLv3 text never leaves `node_modules`, no
`AUTHORS`, no Corresponding Source, no pointer to it, no standing availability commitment.

What could have forced the entire app under the GPL is §5, and §5 triggers on **modification**. The
build copies the npm files byte-for-byte, so the app is in the favourable position — and *staying
there is a deliberate constraint on the design*, not an accident of the build. Recorded in the map
as a standing constraint and flagged on the inventory ticket, because "just patch the engine" is
the shortcut a future session will otherwise reach for.

The Corresponding Source is the real work: Stockfish C++ at an exact revision (currently
unrecorded), the emscripten recipe, the patch set, and the NNUE net — verified embedded in the
shipped `.wasm` at 1 MiB, and therefore unreproducible from source and required to ship.

**The settled BYOK design is a substantial licence advantage and should be preserved for that
reason.** With the user's own key, no provider term binds this app: the user is the account
holder, and no generated text is in the bundle. Two consequences follow. Google's terms appear to
bar redistributing API-returned content, which the runtime-only design avoids entirely — so
**pre-generating and shipping lesson prose at build time would walk straight into it.** And
Google's terms prohibit under-18 audiences outright and require paid-only service in the EEA, UK
and Switzerland, which is now a hard product constraint rather than a disclosure question.

**Genuinely uncertain, needs a qualified opinion:** whether a browser app loading Stockfish in a
worker is one work with the engine or two that merely ship together. Favourable on every published
criterion (separate files, no shared address space, `postMessage` ≈ pipes, plain UCI text), but
the FSF says a court decides and none has. This gates the app's own licence, so it is settled
before a licence is chosen. Also uncertain: whether Lichess's CC0 waiver reaches the rights needed
(§4(c) disclaims clearing them, and puzzles are mined from ~600M user games), and whether a
browser app is a GPLv3 "User Product".
