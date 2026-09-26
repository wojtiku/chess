# Piece artwork

The twelve SVGs in this directory — `wP wN wB wR wQ wK bP bN bB bR bQ bK` — are
**original work, drawn for this project. There is no third-party licence attached
to them and no attribution to anyone else is owed or claimed.**

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

Flat, high-contrast silhouettes on a shared 45×45 `viewBox`. Each piece is drawn
twice: a first `<g>` fills and strokes every shape, and a second `<g>` fills them
again with no stroke, so the interior seams of the first pass are covered and only
the outer contour is left. A single compound path cannot be both filled and
outlined without a hole, and a visible seam through the middle of a pawn at 45px
is worse than two passes. Every piece stands on the same plinth, which is what
makes six unrelated outlines read as one set.

| | fill | outline |
|---|---|---|
| White | `#f6f5f1` | `#1d1f24` |
| Black | `#1d1f24` | `#f6f5f1` |

The outline is not decoration: a white piece on a light square and a black piece
on a dark square are both low-contrast without one, and a board square is 45px.
The knight's eye is the only interior detail in the set, and it is there because
at 45px the difference between "horse" and "lump with a spike on it" is one dot.

The white and black versions of each piece are the same geometry with the two
colours swapped, which is checked rather than assumed.

**Filenames are lowercase colour, uppercase piece letter** — `wQ`, `bK`. This is
load-bearing in a way that is invisible on macOS: a set written as `WQ.svg` works
on a case-insensitive filesystem, where a request for `wQ.svg` finds it, and 404s
on every case-sensitive host.
