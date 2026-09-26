# Piece artwork

How the twelve SVGs in this directory are built, and the constraints that shaped
them. Design decisions, not provenance.

## The set

High-contrast silhouettes on a shared 45×45 `viewBox`, lit from above. Every piece
stands on the same plinth, which is what makes six unrelated outlines read as one
set.

Each piece is drawn **twice**: a first `<g>` fills and strokes every shape, and a
second `<g>` fills them again with no stroke, so the interior seams of the first
pass are covered and only the outer contour is left. A single compound path cannot
be both filled and outlined without a hole, and a visible seam through the middle of
a pawn at 45px is worse than two passes.

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

## The outline is load-bearing

Measured against the board this app ships (`#e0c9a4` light, `#8f6244` dark), a black
piece's *body* is 2.71:1 against the dark square and a white piece's is about 1.1:1
against the light one — both under the 3:1 at which a shape is visible at all. So on
the worst square for each piece, the outline alone is what makes it readable.

The two outline values above are therefore a floor rather than a style choice:
`#d8c9b0` gives 3.23:1 on the dark square, and one step warmer (`#c9b89c`) drops to
2.71:1, at which point the black pieces start sinking into the squares they stand on.
`pieces.test.ts` computes these ratios, so a retune that breaks them fails the suite.

## Interior details, and why they are drawn last

There are two: the knight's eye and the bishop's mitre slit. Both are painted in the
file's own *outline* colour — the black knight's eye is the dark warm value and the
white knight's is the light one — and both are drawn **after** the fill pass rather
than inside the stroked group.

That is forced by the two-pass technique: the second group fills the shapes again
with no stroke to cover the interior seams, so anything drawn inside the first group
is painted over. A detail that has to survive the second pass has to be a separate
mark on top.

Both are there for the same reason, which is size. At 45px the difference between a
bishop and an egg is one line.

## Filenames

Lowercase colour, uppercase piece letter — `wQ`, `bK`. This is load-bearing in a way
that is invisible on macOS: a set written as `WQ.svg` works on a case-insensitive
filesystem, where a request for `wQ.svg` finds it, and 404s on every case-sensitive
host.

## What the test enforces

`pieces.test.ts` reads each `wX.svg` and `bX.svg` from this directory and holds the
set to three properties. Each is a real constraint rather than a description of
current behaviour — deleting any of them lets a specific class of mistake through.

**The two files are the same drawing, painted differently.** XML comments and *every*
hex colour are stripped, the words `White` and `Black` in the labels are normalised,
and the two remaining documents are compared. A changed viewBox, a different stroke
width, a moved path, a dropped shape or a shifted gradient stop all fail it.

Two details of that comparison are deliberate:

- **Comments are stripped.** Each side's `<defs>` carries a comment explaining the
  gradient, and the two explain themselves in different words. They are prose about
  the artwork rather than the artwork, and two files differing only in their comments
  are the same drawing — comparing them verbatim would have made the test a check on
  that prose.
- **Colours are not named in the test.** An earlier version hardcoded two hexes, and
  pinning a value made a retune with a measured reason behind it fail on something
  that was never the claim. Worse, the knight kept passing: its eye is painted in the
  other file's outline colour, so `bN.svg` still contained the retired value and the
  assertion was satisfied by the wrong pixel. The test now reads each file's outline
  and asserts the *relationship* — the two differ, and neither file uses the other's.

**The comparison cannot pass vacuously.** Each file must have an outline, the two
outlines must differ, neither file may use the other's outline colour, and the two
files must not be byte-identical. Without those, twelve colourless or twelve
identical files would satisfy the geometry comparison perfectly. All twelve drawings
are also asserted distinct from one another.

**The outlines are legible.** Both contrast ratios above, recomputed from the files on
every run.
