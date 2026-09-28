# What happens when the call fails?

Type: grilling
Status: resolved

## Question

There is no template fallback, so a failed call has no floor beneath it. Measured constraints:
free-tier keys gave 3–8 successful calls before HTTP 429, repeatedly; a dead key fails
immediately; latency runs 1.7s–15s.

Decide: what the learner sees on a failed call; whether anything is retried or queued; whether
results are cached per position so a repeat question is free; whether the coach is disabled for
the rest of the session or retried on the next turn; and what the app says about keys, cost and
rate limits before the first call, not after.

This ticket also decides the standing question of whether learning behind a key is the right
shape at all. If the honest answer is that the first release needs a no-key path, that is a
scoping change to the map, not a detail here.

## Comments

## Answer

**This reverses a settled decision. "No key, no learning" is withdrawn: the apparatus is keyless,
and the key buys phrasing.** The reversal is explicit and deliberate, on measured grounds — a
free-tier key gave 3–8 successful calls followed by intermittent 429s, so a design that gates
learning on a key is unreliable *with* one and absent without one. Under
[ADR-0001](../../../docs/adr/0001-the-coach-phrases-it-does-not-decide.md) the key buys only
Presentation; detectors, engine, exercises, grading, the attempt record and the review queue never
needed it.

**The error taxonomy, measured, not assumed.** Four distinguishable classes, and the distinction
that matters is transient versus fatal:

| condition | status | distinguishable | response |
| --- | --- | --- | --- |
| invalid key | 400 `API_KEY_INVALID` | yes | fatal, never retried; tell the user to fix the key |
| no key | 403 `PERMISSION_DENIED` | yes | fatal, never retried |
| provider at capacity | 503 `UNAVAILABLE` | yes | transient, retry |
| out of quota | 429 | yes | transient, retry — and **no `Retry-After` header**, so backoff is blind |

**A 429 is not a session-ending condition.** Measured directly: of eight consecutive calls, #6 and #8
returned 429 while #7 returned 200. Quota recovers within roughly a minute. The intuitive design —
disable the coach for the rest of the session on any failure — would lock a learner out of coaching
for an entire session because of a one-second hiccup. It is wrong, and the measurement is why we
know it.

**Retry policy.** Transient failures (429, 503, network) retry with blind backoff: 3 attempts, a few
seconds apart, bounded by the recovery window actually observed. Fatal failures (400, 403) are never
retried. **Timeout is 20s, not 10s** — a 10s cutoff discards roughly half the calls that would have
succeeded, and disproportionately the slow ones that were working. Latency to hide: measured 1.7s
median ~5s, worst 15s. The learner must see progress from ~300ms and hold a cancel, because nobody
should sit in front of a spinner for twenty seconds.

**On failure, show the Facts anyway.** This is the load-bearing half of the failure design. A learner
who asked "why did I lose that piece?" and received "you're out of quota" has learned nothing about
the piece. The Facts are already computed, so rendering them costs nothing and the learning survives
the failure. Messages distinguish the three cases a learner can act on — key is wrong, provider is
busy, out of quota — because they are distinguishable.

**Disclosure happens at first launch, before the key field**, not in the dialog and not after. What
leaves the device is the position, including positions where the learner hung a piece; the key is
theirs and is stored locally. **Disclose in token counts, not dollars** — the app can measure its own
usage exactly and cannot verify a provider's current price, so any dollar figure it shows is a guess
that will rot.

**Caching: server-side, on existing PHP hosting, flat files, keyed by position.** The key stays in
the browser and the app stays local-first; the server caches and nothing else. It is deliberately
not a key broker and holds no learner records. Three rules, from the licensing research and from
this ticket's measurements: a **fatal** error is never cached (a cached 400 for a bad key would
outlive the fix); the cache is bounded; and it doubles as the provenance record that
[*What must release 1 carry?*](03-licensing-and-provenance.md) requires, storing the fact pack
alongside each coach sentence so a qualified third party could review the app's teaching months
later. A local cache remains as the offline fallback. A server as a key broker, and accounts, stay
out of scope.

**Pre-prepared opening positions, 3–5 moves in, so the first moves work with no key.** This is the
concrete answer to "the keyless path is the default path for everyone without a key, including
free-tier users hitting 429s" — a much larger audience than release 1's one learner. Scope: a
small set of common opening positions, hand-written by us, shipped in the bundle. Licence-clean,
which is the whole reason it is hand-written; see the note below.

**AI may draft that prose; we write the shipped text.** Recorded from an ambiguous instruction and
worth confirming: the reading taken is *AI-assisted, human-owned, we ship what we wrote*, not
build-time bulk generation. That reading is what keeps the bundle's contents outside the
redistribution question. **A residual licence question is flagged, not closed:** whether text a model
drafted and a human then rewrote is still "content returned from the APIs" under Google's §5(e) is
one of the items the licensing research already routed to a qualified opinion. It is recorded here
so the assumption is visible rather than buried.

**Keyless is functional and complete as a learning path, and is not a degraded mode.** Stated
without the word "complete", deliberately: we have not tested whether a beginner can learn from bare
Facts alone, and promising otherwise would be an unmeasured claim. That question belongs to
[*What would show the first release teaches?*](14-what-evidence-would-show-it-works.md).

**Three security constraints on the cache endpoint**, binding on the eventual implementation and
not open questions: it must be authenticated or unlisted, because an open write endpoint keyed on
user input is a disk-fill and path-traversal target; it must bound the cache directory, because
unbounded growth from strangers is a denial of service on shared hosting; and it must treat position
hashes as untrusted input. If the endpoint is unauthenticated, it is also a free LLM proxy for
whoever finds it, at the host's expense.

**Out of scope, named for later rather than forgotten:** multi-user deployment. If this app is ever
distributed to users other than the author, the aggregate-versus-combined-work question in
[*What must release 1 carry?*](03-licensing-and-provenance.md) must be settled with a qualified
opinion first, and the cache's licence position with it. A personal deployment on the author's own
hosting carries essentially no exposure. That asymmetry is the reason a server is acceptable here
and a key broker is not.
