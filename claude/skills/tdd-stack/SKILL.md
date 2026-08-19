---
name: tdd-stack
description: Outside-in TDD with an explicit stack file, in any language
---

# TDD Stack — Live Stack File for Recursive TDD

Outside-in TDD with recursion mirrors a call stack. Without a written stack:
- After a few hours or a context reset, "where am I?" gets expensive to answer.
- "Have we covered the X concern yet?" becomes a re-read of every test file.
- Open design tensions surfaced by a deeper layer get forgotten.

The stack file is just `pstack` for your TDD session — a sanity check at every
transition.

Use when doing **deep recursive outside-in TDD** across multiple layers — when a
single feature unfolds from an outer acceptance test down through the units it
exposes: a service, its collaborators, data access, domain types, whatever the
project's layering calls them. The stack file keeps the recursion legible across
long sessions and across context window resets.

Don't use it for shallow tasks (one or two layers). The ceremony costs more than
it saves.

## Roles
- User is the orchestrator/navigator: defines API shape, domain boundaries,
  naming, refactor decisions, and picks edge cases.
- Agent is the coder/driver: writes tests and implementation under the user's
  direction.

## Session Setup

Before the first test, do two things:

1. **State the role split in one line and invite override.** Don't assume the
   default. Example: *"I'll propose tests and impl; you orchestrate and approve.
   Say the word if you want to write tests yourself instead."*
2. **Inventory every existing test file that could be a peer rung in the
   recursion — and broaden beyond the feature's namespace.** Match the project's
   own test convention (`*Test.kt`, `*_test.go`, `test_*.py`, `*.spec.ts`,
   `*_spec.rb`, …) and glob for *that* pattern, not for one you assumed. Peer
   tests don't always live next to feature code: data-access tests typically
   live under a data-access directory, value-object tests under the domain-types
   directory. Scoping the inventory glob to the feature's subdirectory silently
   misses these. Instead glob broadly for the peer *types* you expect plus a
   feature-namespaced sweep. Treat the inventory as load-bearing: a missing rung
   in the stack is a missing rung in the discipline. Populate every candidate
   layer in the stack file up front with `🔜` — deletion-on-irrelevance is
   cheaper than retroactive addition.

## Re-inventory at layer drops

When the recursion drops down and introduces a *new* collaborator type (a new
repository, builder, helper), glob immediately for that peer type's existing
tests across the whole codebase before deciding what test rung to add. Don't
rely on the session-start inventory — it was scoped to what you knew about then.

Add the new peer's test rungs to the stack file the moment you introduce the
collaborator — even if you haven't read those files yet. The act of writing them
down is what enforces the recursion.

## Cycle
1. Happy path test is written (Agent proposes by default; user may also write
   it). Test defines the API contract.
2. User confirms the API looks right; test is run and confirmed failing for the
   right reason.
3. Agent implements the minimum to make it green.
4. Agent suggests edge cases — user picks which ones matter.
5. Agent writes the selected edge case tests + implementation in one batch.
6. Agent suggests refactors if warranted — user approves before any refactor is
   applied.
7. Repeat from step 1 for the next behavior. **End of cycle: in the conversation
   reply, list every test added/touched by name.** The stack file is internal
   state; the conversation is what the user reads. A terse recap costs the user
   a redundant "did you add X?" turn.

## Recursive Application

The cycle applies at **every layer**, not just the top:

1. The outermost test (integration / E2E) pins the user-facing contract and
   stays **red** until the recursion bottoms out.
2. When a test exposes a collaborator (repository, builder, helper), drop down.
   The act of writing that collaborator's test forces decisions about *what it
   needs* — the mocks chosen at one layer become the **contract** for the layer
   below.
3. Make the inner layer green in isolation against its mocks. If its tests
   surface more collaborators, recurse further.
4. The outer red test goes green only once the recursion bottoms out and real
   implementations connect.

## Rules
- Never refactor without explicit approval. Suggest only.
- Never invent new API surface in edge case tests. Stay within the contract the
  user defined.
- Never write implementation before a failing test exists.
- Keep implementation minimal — no speculative code, no premature abstractions.
- Domain naming and boundaries are the user's decisions. Never rename domain
  concepts.

### Anti-patterns to avoid
These slip in silently — call them out and back off:
- Adding a precondition guard (`require` / `assert` / `raise ValueError` /
  `if err != nil { return err }` / `throw`) that no test asserts on. If no test
  asks for "rejects blank name", don't write the guard.
- Introducing a collaborator (repository, helper, abstraction) the test didn't
  ask for or mock.
- Batch-creating scaffolding (enums, structs/DTOs, builders, fixtures) before
  the first test runs. Add only what the test in front of you actually
  references.
- Picking names (a property key, an id format, a method name) inside the impl
  when the test didn't pin them — those names belong to the user.
- Speculative defensive guards: `if isNotEmpty(set) { forward(set) }` when the
  receiver already no-ops on empty input. Pass through unconditionally; the
  guard is noise.
- Mirroring an existing lower-layer validation onto a new factory because
  "consistency". Existing builder/data-access validations are legacy details,
  not precedent for new methods. For a new method, parameter validation defaults
  to the **public entry point of the unit under test** unless the user directs
  otherwise.
- Adding the guard on the first impl pass before any test demands it. Even when
  you know the edge case is coming, write the test first; let it go red; then
  add the guard.
- Inferring "this layer has no test convention" from absence in your initial
  inventory. Inventories are bounded by their globs; absence in your inventory
  is not absence in the codebase. Before implementing a new collaborator without
  a peer-layer test, broad-glob to confirm the convention is genuinely "no tests
  here". When in doubt, write the peer test.
- Copying a peer *test's* helper shape without its reason. A peer's test-harness
  wrapper (`runSubjectTest { }`, a fixture or context manager, a `setUp` that
  builds five collaborators) may exist because its subject needs an injected
  runtime dependency the test has to build and hand in (an execution context, a
  clock), or because it shares five stubs across every test. If your subject
  needs no such dependency and two stubs, the wrapper is indirection with no
  payoff — an unused parameter and a subject that arrives as a callback argument
  instead of being visibly constructed. Before adopting a peer's fixture or
  helper structure, name the specific problem it solves *there* and confirm you
  have that problem *here*. Same for mocks held as suite-scoped fields: a mock
  referenced only inside the creation method is a local, not a field. Prefer the
  smallest helper that removes the duplication you actually have — usually a
  plain `makeSubject()` factory.
- Wiring a production call site to a method that is still a stub. The outer
  *test* stays red by design; production wiring must not. If the composition root
  needs to call `stop()`, drive `stop()` down through the recursion first.
  Otherwise you ship a crash that compiles cleanly and passes every unit test,
  because nothing in the suite exercises the composition root.
- Porting a peer file's error-handling branches along with its happy path. When
  mirroring an existing implementation for the current test's shape, it's
  tempting to copy the whole method — the error return, the status branch, the
  failure-path logic — because "the peer has it, it'll obviously be needed." It
  will be needed, but not yet: write only the branch the test in front of you
  demands, and let the *next* test (the failure case) demand the rest. Copying
  the full shape produces implementation with zero coverage on its error path,
  discoverable only in retrospect — e.g. a domain method's failure path and a
  callback handler's status branch both get written from a peer in one pass,
  and only their happy paths ever get a driving test.

## Test Naming Style
- Use **given/when/should** structure: `given X, when Y it should Z`
- Keep names concise — drop articles (e.g., "given blank name" not "given a
  blank name")
- No commas before "it should" — e.g., `when creating account it should fail
  with argument error`
- Don't add given/when/then comments inside the test body

Examples:
- ✅ `given blank name, when creating account it should throw ArgumentError`
- ❌ `creates an Account with the right values` (no given/when/should)
- ❌ `given a blank name, when creating account, it should throw` (articles +
  extra comma)

If the codebase already has an established test-naming convention (RSpec
`describe`/`it` nesting, Go table-driven subtest names, `test_` prefixes),
match it rather than importing this one — consistency inside a suite beats
consistency across projects. Note the deviation once in the stack file so it
isn't re-litigated each cycle.

## Test Style

- **Assert on the error's message or payload**, not just its type. The type
  alone tells you nothing about which validation fired — two different guards
  in the same method raise the same class.
- **Inline the subject-under-test's call directly in each test.** Don't extract
  a `recordRun()` / `act()` helper that hides the call. Hoist repeated parameter
  values to suite-scoped constants so the call stays visible but params don't
  repeat.
- **A plan's proposed stack rungs and API shapes are suggestions, not commitments.**
  `/tdd-stack` is sometimes invoked against a plan document that already proposes
  rungs, collaborators, even signatures. Seeding the stack file from that is fine —
  pre-listing rungs to follow established patterns is useful, and it's still what
  Session Setup asks for. But a rung on the list because the plan mentioned it is
  not the same as a rung a test has actually exposed, and a plan showing pseudocode
  for a collaborator's shape is not the user approving that shape. Below whatever
  single contract the plan explicitly flags as open (if any), treat every other
  proposed collaborator and API design the same way as one the agent invented on
  the spot: it still goes through the hard gate below before a test locks it in —
  unless the user has explicitly said not to ask for a given case (e.g. "just
  follow the plan's signatures, don't stop to confirm each one").

- **Pausing for contract confirmation is a hard gate, not a suggestion.** Before
  writing any test that introduces:
  - A new method on a public type
  - A new parameter on an existing public method
  - A new mock for a collaborator that didn't have one
  - A new struct/DTO field or enum type that appears in a public signature

  → STOP. Use `AskUserQuestion` (or a direct text question requiring explicit
  confirmation) before writing the test. The mocks you write *are* the design —
  they freeze the next layer's API.

  **What does NOT count as a pause:**
  - "I'll propose X; redirect if you want different" — this prefigures
    rejection; it is not approval.
  - "Proposing this in chat" without waiting for an answer.
  - Treating absence of objection as approval.

  **What DOES count:**
  - `AskUserQuestion` with concrete options, followed by waiting.
  - A direct text question ("Service param shape: optional `state` vs separate
    method? Pausing before I write the test.") followed by waiting for an
    answer.

- **Auto mode does not override this gate.** Auto-mode's "minimize
  interruptions" applies to routine implementation work (writing a test that
  matches an already-agreed contract, running tests, fixing compile errors). It
  does NOT apply to contract design. When a new public API surface is being
  introduced, pause regardless of Auto mode.

- **"Let the test drive shape" applies to internal shape, not API surface.** The
  user feedback to avoid pre-deciding struct fields or internal naming is *about
  discovering the right shape for things the test legitimately needs to
  construct*. It is NOT permission to silently introduce new public method
  signatures, parameters, or collaborators without confirmation. Internal shape
  = let the test drive. Public API surface = pause and confirm.

- **In async/concurrent code, a broken test hangs instead of failing.** Cycle
  step 2 ("confirmed failing for the right reason") silently degrades into
  "still running", and a stalled run looks exactly like a slow one. Bound it
  with whatever per-test timeout the runner offers, so a hang is reported as a
  named failure. Treat a hang as a red test, not as flakiness to re-run — and
  once fixed, confirm by repeating the run, since a timing bug that passes once
  has not been shown to be gone.

## Design Philosophy
- DDD: entities, value objects, aggregates matter. Respect bounded contexts.
  Where the codebase already models its domain differently, follow the codebase
  — never rename or re-partition existing domain concepts to fit this
  vocabulary.
- API design (how code is used) matters more than implementation details.
- YAGNI: only build what tests require.

## File location

`~/.claude/plans/<task-slug>-tdd-stack.md`

One file per feature/PR. Match the slug to the existing plan file if there is
one.

## Format

```markdown
# <task-slug> — TDD Stack

Live stack of the outside-in recursion. Updated each red→green transition and
each layer drop.

## Currently at: <layer name>

## Stack (outer → inner)

1. 🔴 / 🟡 / ✅ / 🔜  <test suite / file>
   - <one-line description>
   - File: <path>
   - Optionally: list of test names with status (✅ / ⏭️ next / 🔜 future / 🔴 red)

2. ...
```

**List every candidate layer up front**, not just visited ones. At session
setup, inventory every existing test file that could be a peer rung — using the
project's own test-file convention — and seed each one as a `🔜` rung.

Don't scope the inventory glob to the feature subdirectory — peer tests live
across many packages. Pattern-scoped globs catch them; feature-namespace globs
miss them.

A missing rung in the stack is a missing rung in the recursion — if the format
only tracks layers you've reached, you can't see the ones you've skipped. Delete
a rung once you've confirmed it's irrelevant; that's cheaper than retroactively
realising you skipped it.

```markdown
## Open design tensions (when relevant)

Brief notes on contracts the recursion has surfaced but not yet resolved.

## Status icons

- 🔴 red — failing for the right reason
- 🟡 active layer being worked
- ✅ green — sufficiently covered (see the bar below)
- ⏭️ next test the user picked
- 🔜 future test, not yet picked
- ⏸️ deferred (TODO at the bottom of the stack)
- ❌ deleted — refactored out, no longer applicable. Keep the rung in the stack
  with a one-line rationale (e.g., "removed: parent-scoped query supersedes
  naked id lookup"). Deletion is sometimes the right cycle outcome, especially
  when reviewer feedback exposes a correctness issue in API you just added and
  the cleanest fix is to remove the API rather than patch it.

### The bar for ✅

"Sufficiently covered" is not "the happy path passes". Before marking a rung ✅,
**read the implementation that rung produced and enumerate its branches** —
guards, error handlers, status checks, early returns, absence short-circuits.
Every branch without a test is either a missing test or dead code; decide which,
out loud. Then ask the layer-crossing question: for each collaborator this layer
calls, what does this layer do when that collaborator *fails*? A rung whose
happy path is green but whose failure paths are untested is 🟡, not ✅.

This is the check that catches error handling copied from a peer, and it is
where genuine bugs hide: a partially-failed operation that leaks a resource,
or leaves a field in a state that blocks retry, will pass every happy-path test
at every layer.

A test that passes the moment you write it is **not a cycle** — it is a coverage
gap you just found in code that already shipped. Say so explicitly in the recap
("passed immediately; that branch already existed"). One is fine. A run of them
means earlier rungs were marked ✅ too early, and the bar above was skipped.

## When to update

- After each red → green transition: flip the icon, note any new test that just
  became active.
- When dropping down a layer (writing the next collaborator's test): add the new
  layer to the stack with 🟡.
- **When introducing a new collaborator type (new repository, builder, helper):
  immediately glob for peer-type tests across the codebase and add every
  existing peer rung to the stack with `🔜`, even before reading those files.**
  The session-start inventory was scoped to what you knew then; new
  collaborators bring new rungs. Don't infer "no tests at this layer" from
  absence in your existing stack — broad-glob first.
- When popping back up (the inner layer is sufficiently covered): mark it ✅ and
  resume the outer layer's icon as 🟡.
- When resolving an open design tension: rewrite that section to describe the
  resolution rather than the question.

## What goes in vs. what doesn't

**In the stack:**
- Test suites / files at each layer
- Their red/green status
- File paths so you can reopen the right files
- Cross-cutting deferred items

**Not in the stack:**
- Implementation details (those live in the code)
- Per-test param values (those live in the test)
- Decisions already locked in upstream design plans (those live there)

## Mid-session feedback (user corrections or PR review)

Feedback arrives mid-recursion from two directions: the user redirecting a
decision while you are already building on it, and PR review comments landing in
batches. Both behave the same way — don't dive straight into the first item.
Stack files don't track feedback natively; they track the recursion. But feedback
often forces *new* cycles or *deletes* rungs already marked ✅. Handle it
carefully:

**1. Triage cascades before executing.** For each item, label it `standalone`
(touches one file, no ripple) or `cascading` (would force changes to multiple
test suites, an existing API contract, or rungs already marked ✅).  For
cascading items, present a brief cascade map *in the conversation* before
executing — and when the cascade has more than one viable shape, name the
options. Let the user pick the strategy. The cost of one round-trip is
small; the cost of a 6-file refactor in the wrong direction is large.

**2. Sequence, don't batch.** Standalone items can stack in one execution
pass. Cascading items should be sequenced — finish one cascade before opening
another. Two cascades half-applied is worse than one fully applied and one
untouched.

**3. Refactors-from-feedback can END rungs in ❌, not ✅.** A feedback-driven
correctness fix sometimes deletes an API entirely (e.g., a naked `findById`
lookup gets replaced by an existing parent-scoped query). When this happens,
mark the rung ❌ with a one-line rationale and leave it in the stack —
future-you needs to see *why* that test suite no longer exists, not just that
it's gone.

**4. Don't silently re-derive contract decisions.** If the feedback contradicts
a decision already in the "open design tensions" section or in a memory, surface
the contradiction explicitly before resolving. The user may not realise their
comment is reversing an earlier choice.

$ARGUMENTS
