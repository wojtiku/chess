# Piece artwork

Ten of the twelve SVGs in this directory — `wP wB wR wQ wK` and their black twins —
are **original work, drawn for this project. No third-party licence is attached to
them and no attribution to anyone else is owed or claimed.**

**The two knights are not.** `wN.svg` and `bN.svg` carry an outline **supplied by
the designer**, converted from an icon to a path with VTracer. Ten pieces here are
original; two are the designer's, and the file says so rather than letting the
original-work claim cover all twelve by default.

**That icon's licence has not been confirmed and needs to be.** Most chess icon sets
are published under CC BY-SA, which would attach real obligations — naming the
author, stating the licence, giving a source URL, and licensing any derivative of
the artwork under the same share-alike terms. If the icon was the designer's own, one
line recording that settles it. If it came from a set, this section has to name that
set before the project ships, and the share-alike term may be a blocker for shipping
this under a different licence.

## Why this file says that

It exists because the project's own design spec (§8) requires the piece set's
licence to be confirmed and recorded before shipping, and because the obvious
choice for anyone picking up this project up is to swap in a well-known set:

- **Cburnett** (the set lichess and most clients use),
- **Merida**,
- the Wikipedia and other Wikimedia chess sets.

Those sets are published under **CC BY-SA 3.0** (or CC BY-SA 4.0), which is a
genuine obligation: vendoring them means naming the author, stating the licence,
giving a source URL, and — the part that actually costs something — licensing
your own derivative of the artwork under the same share-alike terms. That is a
real constraint on a project you may want to publish under a different licence,
and it is not a formality.

This set was written from scratch instead, so none of those obligations exist and
none are being evaded by omission. If you ever **replace** these files with a
third-party set, this file must be rewritten: name the set, the author, the
licence and the source URL, and check what share-alike does to the rest of the
project. A stale `ATTRIBUTION.md` describing artwork no longer in the directory is
worse than no file, because it is a false licence claim.

## What the set is

High-contrast silhouettes on a shared 45×45 `viewBox`, lit from above. Each piece
is drawn twice: a first `<g>` fills and strokes every shape, and a second `<g>`
fills them again with no stroke, so the interior seams of the first pass are
covered and only the outer contour is left. A single compound path cannot be both
filled and outlined without a hole, and a visible seam through the middle of a pawn
at 45px is worse than two passes. Every piece stands on the same plinth, which is
what makes six unrelated outlines read as one set.

The fill is a three-stop vertical gradient, so each piece has a lit top and a shaded
base and reads as a turned object rather than a flat cut-out. It is declared
`gradientUnits="userSpaceOnUse"` on purpose: the default, `objectBoundingBox`, gives
every *shape* in the group a gradient relative to that shape's own box, so a rook's
crenellations and its base are each fully shaded and the piece bands into two
unrelated objects stacked on a plinth. In user space one gradient spans the whole
45×45 viewBox and the light falls across the entire silhouette at once.

| | body | outline |
|---|---|---|
| White | `#fffdf7` → `#f4ecdb` → `#d9cbae` | `#2b241d` |
| Black | `#6b6357` → `#2e2a24` → `#100e0c` | `#d8c9b0` |

**The outline is load-bearing, and the numbers are why.** Measured against the board
this app ships (`#e0c9a4` light, `#8f6244` dark), a black piece's *body* is 2.71:1
against the dark square and a white piece's is about 1.1:1 against the light one —
both under the 3:1 at which a shape is visible at all. So on the worst square for
each piece, the outline alone is what makes it readable, and the two outline values
above are a floor rather than a style choice: `#d8c9b0` gives 3.23:1 on the dark
square, and one step warmer (`#c9b89c`) drops to 2.71:1, at which point the black
pieces start sinking into the squares they stand on. `pieces.test.ts` computes these
ratios, so a retune that breaks them fails the suite.

**The interior details, and why they are drawn last.** There are two: the knight's
eye, and the bishop's mitre slit. Both are painted in the file's own *outline*
colour — the black knight's eye is the dark warm value and the white knight's is the
light one — and both are drawn **after** the fill pass rather than inside the
stroked group. That is forced by the two-pass technique: the second group fills the
shapes again with no stroke to cover the interior seams, so anything drawn inside
the first group is painted over. A detail that has to survive the second pass has to
be a separate mark on top.

Both are there for the same reason, which is size: at 45px the difference between a
bishop and an egg is one line. The knight's eye is a detail on an outline that
already reads; the bishop's slit is the feature that makes that piece identifiable
at all.

The white and black versions of each piece are the same drawing, lit over the same
range, painted differently. **What the check does**, precisely: `pieces.test.ts`
reads each `wX.svg` and `bX.svg` from this directory, strips XML comments and
*every* hex colour, normalises the words `White` and `Black` in the labels, and
asserts the two remaining documents are equal. So the drawings must match everywhere
except colour and the side named in the text — a changed viewBox, a different stroke
width, a moved path, a dropped shape or a shifted gradient stop all fail it. Three
further assertions keep it from being vacuous: each file must have an outline and the
two outlines must differ, neither file may use the other's outline colour, and the
two files must not be byte-identical. All twelve drawings are also asserted distinct
from one another.

**The comments are stripped, and that is deliberate.** Each side's `<defs>` carries a
comment explaining the gradient, and the two explain themselves in different words.
They are prose about the artwork rather than the artwork, and two files differing
only in their comments are the same drawing — comparing them verbatim would have made
the test a check on that prose.

**The colours are not named in the test.** An earlier version did, and pinning the hex
meant a retune with a measured reason behind it failed on a value that was never the
thing being claimed. Worse, the knight kept passing: its eye is painted in the other
file's outline colour, so `bN.svg` still contained the retired value and the
assertion was satisfied by the wrong pixel. The test now reads each file's outline
colour and asserts the *relationship* — the two differ, and neither file uses the
other's — which is the actual claim, and survives any future retune.

**Filenames are lowercase colour, uppercase piece letter** — `wQ`, `bK`. This is
load-bearing in a way that is invisible on macOS: a set written as `WQ.svg` works
on a case-insensitive filesystem, where a request for `wQ.svg` finds it, and 404s
on every case-sensitive host.
