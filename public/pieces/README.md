# Piece artwork

Seven original SVG sets, authored for Chess Practice Board. Each contains all six
pieces in both colours, on a shared 45 × 45 canvas:

- **Carved Staunton** (`wP.svg`, etc.): turned bases, curved bodies and carved detailing.
- **Tournament** (`tournament/`): bold outlines and broad, familiar silhouettes.
- **Geometric** (`geometric/`): flat circles, wedges and architectural shapes.
- **Art Deco** (`deco/`): stepped plinths, faceted profiles and metallic inlays.
- **Ink** (`ink/`): irregular contours, flat fills and hand-drawn hatching.
- **Modern Studio** (`modern/`): smooth ceramic bodies, capsule bases and satin shading.
- **Storybook** (`storybook/`): rounded toy-like shapes, smiling faces and a friendly pony knight.

Edit `scripts/generate-pieces.mjs`, then run `node scripts/generate-pieces.mjs`
to regenerate the eighty-four static assets. No network requests or third-party artwork
are needed. Files are served directly; no generation step is required to build.

All artwork is neutral greyscale. The five `pieceTones` on each board theme in
`src/ui/Appearance/catalog.ts` map shadows through highlights to a shared palette.
`PiecePalette.tsx` applies that mapping to the board, captures, promotion choices
and selector previews. Switching designs changes form and shading, while the
board theme controls colour, including face details. The monochrome board keeps
every design in black and white.

The white and black versions share geometry. Opposing outlines keep their contours
visible on light and dark squares. The shaded sets use one gradient in user space
across the whole silhouette. Each silhouette is drawn with an outline and then
filled again to remove seams between overlapping shapes; internal details are
drawn last. Filenames use a lowercase side and uppercase piece letter, including
on case-sensitive hosts.

`src/ui/Board/pieces.ts` resolves the selected set for the board, captured pieces,
promotion choices and Appearance previews. Appearance is stored separately from
the game and opponent settings under `chess.appearance.v1`.
