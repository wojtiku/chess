# Can an LLM coach a chess beginner? A measured probe

Research date: 26 September 2026. Follows [2026-09-26-chess-tutor-options.md](./2026-09-26-chess-tutor-options.md), which recommended an optional LLM as the *presentation* layer of a five-layer coaching architecture. This note tests that recommendation rather than assuming it, because the person commissioning the work cannot play chess and cannot adjudicate chess content.

Method, prompts, validators and reproduction script: [`coach-probe/coach-probe.mjs`](./coach-probe/coach-probe.mjs).

## Question

If the app computes the facts itself — real Stockfish evaluations, real board detection — and hands them to a language model with a constrained system prompt, does the model produce coaching that is true to the board and safe for a total beginner to learn from?

## What was tested

Five positions, chosen to stress different ways a coach goes wrong:

| id | position | what it stresses |
| --- | --- | --- |
| P1 | learner just played a loose move and lost a piece | explaining a mistake that happened *before* this position |
| P2 | a real tactic exists, but it is the opponent to move | whose turn it is; also tactics described in a continuation |
| P3 | mate in one available | recognising mate, and the temptation to congratulate |
| P4 | three plans within 50 centipawns | "a good plan" versus "the plan" |
| P5 | the learner asks about a knight that is **not attacked** | refusing a false premise |

Three conditions per position:

1. **Constrained** — engine verdict plus machine-detected board facts, with a system prompt of eight rules (every claim must be supported by the pack; claim check or mate only if the pack says so; no invented combinations; gloss every term; at most four sentences).
2. **Fact pack, no rules** — the same pack, an ordinary "you are a chess coach" prompt.
3. **Naive** — the FEN and the learner's question, nothing else. This is the shape most people assume is enough.

The fact pack is the interesting artifact. It contains: the FEN, the board, material, whose turn it is, castling rights, per-piece flags for *attacked by opponent*, *defended by you*, *hangs*, *undeveloped*, the captures available to each side, and the engine's top three candidate lines with evaluations. Negative facts are included deliberately — "not attacked" has to be assertable, or a model asked about a threatened piece will invent the threat.

## Results

Models: `gemini-3.8-flash` and `qwen3.8-27b`. Both mid-tier; frontier models were unavailable (no credit, exhausted quota, or provider data-policy blocks). That makes the result conservative, because none of the failures below are knowledge failures.

| position | constrained | pack, no rules | naive (FEN only) |
| --- | --- | --- | --- |
| P1 | correct, honest, four sentences | 400-word markdown lecture | correct, minor invention |
| P2 | called a real tactic "a very strong plan"; spoke as the opponent | found the tactic in seven sentences with headers | invented an illegal move for the learner |
| P3 | correct (`Qxf7#`) | correct | correct |
| P4 | named all three equal options | ten sentences, two invented continuations | generic advice; missed the engine's choice |
| P5 | refused the false premise | refused it, then rambled | refused it, then invented a pin that does not exist |

Selected constrained outputs, verbatim:

> **P5** — Your knight on c3 is actually not under attack right now, and none of your pieces are in danger of being taken for free. There is no forced tactic—meaning no immediate trick or capture you must respond to. The engine recommends the good move Na4, which steps the knight toward the black bishop on c5.

> **P4** — There is no forced tactic or immediate attack here, so a good plan is to activate your pieces that are still on their starting squares. A strong move is bringing your queen to d3 (Qd3) […] Another good option is developing your bishop from c1 to e3 (Be3) […] You can also play the pawn move to a3.

Selected naive output, same position, showing the failure mode:

> Since it is safe, you can make an active move like **Bg5** to pin their knight. […] This move also develops your last bishop!

There is no bishop left to develop; both were developed three moves earlier.

## Findings

**1. The fact pack is the product. The system prompt is not.** Naive was right three times out of five, and its errors were the confident-plausible kind: an invented pin, an invented threat, a move that does not exist. The rules prompt fixed style, length and hedging. It did not fix chess.

**2. Detectors fail silently, and the model does not notice.** The first version of the fact layer used chess.js's `attacked(square, verbose)` where it meant `isAttacked(square, colour)`, so every "your piece is defended" fact was false. Every model still wrote fluent, confident, wrong teaching. A teaching system cannot be audited by reading its prose; it has to be audited by testing its detectors, and the detector tests are the real tests.

**3. The dominant failure is perspective, not chess.** In P2 it was Black to move and the model told the White learner "capture with *your* knight on d5". Every condition did this. It is invisible to a reader who does not play chess, which is exactly the reader who would be harmed by it. The mitigation is structural: name pieces by owner ("White's knight on d5") rather than by relation to the reader, and test for it.

**4. Numbers.** About 1,250 prompt tokens per coaching call with a full fact pack, against 117 for a bare FEN. Latency 1.7s–15s, median ~5s. Too slow to be the default interaction during a move; fine behind an explicit request.

## Limits of this probe

- Mid-tier models only. A frontier model would probably reduce the P2 defect and the style violations, and would not change findings 1–3, which are architectural.
- Five positions, one per failure mode, one run each. This is not a quality rate. The "four of five clean" figure is illustrative, not a measurement worth quoting as a reliability number.
- The validator caught two of the three constrained-mode defects and missed the perspective one, which is the most important. The validator had four bugs of its own during this exercise, three of which produced false findings and one of which silently disabled a check. Its test suite is a prerequisite, not a follow-up.
- Free-tier API keys rate-limited hard: three to eight successful calls, then HTTP 429, repeatedly and at inconvenient moments.
- Thinking models must have `thinkingBudget` pinned to zero. Left alone, thinking tokens consumed the entire output budget and truncated coach messages mid-sentence, which initially looked like a model failure.

## What this settles, and what it does not

It supports using a language model as the **presentation** layer, with the fact pack and a validation gate beneath it. It does not support a model deciding anything about chess, and it does not show that the resulting explanations are *pedagogically* sound.

That last limit cannot be engineered away. An explanation can be perfectly true to the board and still mislead: calling a tactic a "plan", presenting the best move as the only move, naming a threat that will not matter for three moves. No validator catches "misleading". It follows that the pedagogy has to live in the shape of the interaction — attempt before reveal, graduated help, accepted alternatives, delayed return — rather than in the wording, and that release 1 should lean on the former.

It also leaves one asymmetry worth stating plainly: the architecture is sound, but the person who commissioned it cannot check its chess. The evidence layer is therefore not a component of the tutor. It is the tutor.
