# What does Lichess guarantee about puzzle reuse, import semantics, and alternative answers?

Labels: wayfinder:research
Type: research
Status: open
Blocked by: 03

## Question

Using current primary sources, establish the Lichess puzzle source contract for the agreed preset-exercise module:

- What reuse/redistribution license applies to the export, and what source/version metadata should we retain?
- What do the exported FEN, first setup move, subsequent learner/opponent moves, themes, and quality/difficulty fields mean? How is the correct learner position reconstructed?
- What does Lichess actually guarantee about unique solver moves, alternate mates, multiple valid continuations, and completeness of exported replies? Which agreed answer-checking requirements are not covered by the dataset alone?
- How does the documentation distinguish source line completion from an instructional objective such as winning material or completing mate? Do not assume an exported line always reaches our chosen endpoint.

Consult the research skill. Capture dated links, distinguish documented guarantees from inference, and recommend a narrow import/validation contract without downloading a full corpus or building an importer. Record findings as a linked research asset, not pasted source documentation. Research branches are throwaway and never merged; follow Wayfinder's research workflow when this ticket is claimed.
