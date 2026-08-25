# Mid-session feedback (user corrections or PR review)

Feedback arrives mid-recursion from two directions: the user redirecting a
decision while you are already building on it, and PR review comments landing in
batches. Both behave the same way — don't dive straight into the first item.
Stack files don't track feedback natively; they track the recursion. But feedback
often forces *new* cycles or *deletes* frames already marked ✅. Handle it
carefully:

**1. Triage cascades before executing.** For each item, label it `standalone`
(touches one file, no ripple) or `cascading` (would force changes to multiple
test suites, an existing API contract, or frames already marked ✅).  For
cascading items, present a brief cascade map *in the conversation* before
executing — and when the cascade has more than one viable shape, name the
options. Let the user pick the strategy. The cost of one round-trip is
small; the cost of a 6-file refactor in the wrong direction is large.

**2. Sequence, don't batch.** Standalone items can stack in one execution
pass. Cascading items should be sequenced — finish one cascade before opening
another. Two cascades half-applied is worse than one fully applied and one
untouched.

**3. Refactors-from-feedback can END frames in ❌, not ✅.** A feedback-driven
correctness fix sometimes deletes an API entirely (e.g., a naked `findById`
lookup gets replaced by an existing parent-scoped query). When this happens,
mark the frame ❌ with a one-line rationale and leave it in the stack —
future-you needs to see *why* that test suite no longer exists, not just that
it's gone.

**4. Don't silently re-derive contract decisions.** If the feedback contradicts
a decision already in the "open design tensions" section or in a memory, surface
the contradiction explicitly before resolving. The user may not realise their
comment is reversing an earlier choice.
