# What exactly does the cache server do?

Type: grilling
Status: resolved

## Question

*When does the call fail?* settled that there is a position-keyed prose cache on existing PHP
hosting, with the key staying in the browser and the server holding no keys and no learner records.
This ticket decides the rest, and it exists mostly because the answer to "will this be safe on my
hosting" is not obvious.

Decide: how a position is reduced to a cache key, and whether that reduction is collision-safe;
what is stored per entry, and how the fact pack travels with the coach sentence as the licensing
research requires; what is never cached and why (a fatal 400 must not outlive a fixed key); how the
cache is bounded and what happens at the bound; and what the endpoint authenticates, given that an
unauthenticated write endpoint keyed on user-supplied data is a path-traversal and disk-fill target
on shared hosting, and an open one is a free LLM proxy for whoever finds it.

Also decide the deployment line: release 1 is the author on their own host, which is a very different
risk from being pointed at publicly, and there should be a stated condition under which the endpoint
is disabled rather than merely undocumented.

## Answer

A position-keyed prose cache on existing PHP hosting, and nothing more. It holds **no API keys and
no learner records**, and it is not a key broker.

**The key is the position itself**, hashed. Positions are canonicalised before hashing so that two
transpositions of the same position do not collide, and the key is a hash precisely because a
position is *not* trusted input.

**Each entry stores the fact pack alongside the coach sentence.** This is the highest-value field in
the whole schema: without it, a reader looking at a bad explanation cannot tell whether the model
invented something or was handed something false.

**A fatal error is never cached.** A cached 400 for an invalid key would outlive the fix — the learner
corrects their key and the app keeps reporting the old failure. Transient failures may be cached
briefly to protect the provider; the distinction is the whole point.

**The cache is bounded**, with a documented cap and a stated eviction order, because unbounded growth
on shared hosting is a denial of service. Bounded by entry count, not by bytes, for the same reason
as the learner record: available space is not measurable portably.

**The endpoint authenticates, or is unlisted.** An unauthenticated write endpoint keyed on
user-supplied data is a path-traversal and disk-fill target, and an open one is a free LLM proxy for
whoever finds it — at the host's expense. Treat position hashes as untrusted input throughout.

**The stated deployment condition.** Release 1 is the author on the author's own host. If the app is
ever pointed at by anyone else, the aggregate-versus-combined-work question in
[*What must release 1 carry?*](03-licensing-and-provenance.md) must be settled with a qualified
opinion first, and the cache's position on generated content with it. The endpoint should be
disabled rather than merely undocumented when that condition is met.


> **Status: proposed, not examined.** This ticket was never put to the developer in a
> grilling round. The proposal below was written in one pass so that building could start, and is
> recorded as *proposed* rather than decided. Revisit it when the build disagrees with it.
