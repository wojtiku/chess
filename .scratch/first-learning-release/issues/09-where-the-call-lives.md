# Where does the call live?

Type: grilling
Status: resolved

## Question

The app is local-first and static, with no backend, and the key is the user's own. Decide: which
provider and which model; where the key is stored and how it is removed; exactly what leaves the
device (a position is the learner's game data — how much of it is sent, and is that disclosed
before the first call); what is cached and for how long; what the app does when the key belongs to
a different provider than expected; and what the learner is told they are paying for.

A fact pack is about 1,250 tokens against 117 for a bare FEN. Whether the full pack is sent every
time, or a reduced pack for the cheap cases, is part of this.

## Comments

## Answer

The provider is swappable, and that is settled: if one provider's terms, pricing, rate limits or
audience rules become a problem, the answer is to change provider. Nothing below may treat a
provider's current terms as a constraint on the design.

**The key never leaves the browser.** It is stored locally, is removable, and is not transmitted to
the app or to the cache server. The app talks to the provider directly.

**What leaves the device is the position and the fact pack** — including positions where the learner
made a mistake. This is disclosed *before* the key field, not after, because that is the moment the
learner can still decline.

**Cost is disclosed in token counts, not dollars.** The app can measure its own usage exactly; it
cannot verify a provider's current price, so any dollar figure would be a guess that rots. A full
fact pack is ~1,250 tokens against ~117 for a bare FEN, and a Coaching call is one per request.

**The pack sent is the tiered one**, per ADR-0001: only the detectors that can answer the question
asked. A cache hit costs nothing at all, since the cache is keyed on position.

**Caching is server-side**, on the developer's PHP hosting, as a flat file keyed by position. The
server holds no keys and no learner records. See [*When does the call fail?*](08-when-the-call-fails.md)
for the retry policy and [*What exactly does the cache server do?*](18-the-cache-endpoint.md) for the
endpoint's shape. A local cache remains as the offline fallback.

**Multi-provider is out of scope.** One configured provider at a time; a key for a different provider
than expected is reported as such rather than guessed at. Revisit if the swappable-provider claim is
ever tested in anger.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
