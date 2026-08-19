---
name: tdd-stack
description: Outside-in TDD with an explicit stack file, in any language
---

# TDD Stack — Live Stack File for Recursive TDD

Outside-in TDD with recursion mirrors a call stack. Without a written stack:
- After a few hours or a context reset, "where am I?" gets expensive to answer.
- "Have we covered the X concern yet?" becomes a re-read of every test file.
- Open design tensions surfaced by a deeper layer get forgotten.

Use when doing **deep recursive outside-in TDD** across multiple layers — when a
single feature unfolds from an outer acceptance test down through the units it
exposes: a service, its collaborators, data access, domain types, whatever the
project's layering calls them. The stack file keeps the recursion legible across
long sessions and across context window resets.

Don't use it for shallow tasks (one or two layers). The ceremony costs more than
it saves.

## The stack analogy

The stack file is just `pstack` for your TDD session — a sanity check at every
transition. The vocabulary follows from that:

- **Layer** — an architectural tier: a service, its collaborators, data access,
  domain types, whatever the project's layering calls them.
- **Frame** — one test suite in the stack, normally one test file. Frames are
  what the stack file lists; layers are what they cover.
- **Peer frames** — several frames sitting at one layer (three repository test
  suites, say). A layer is not automatically one frame.
- **Drop down** — recurse inward: a test exposes a collaborator, so you push a
  new frame and write that collaborator's own test.
- **Pop back up** — return outward once a frame is sufficiently covered.

The outermost frame stays red until the recursion bottoms out. The stack file is
what makes "where am I?" answerable after a context reset.

## Roles
- User is the orchestrator/navigator: defines API shape, domain boundaries,
  naming, refactor decisions, and picks edge cases.
- Agent is the coder/driver: writes tests and implementation under the user's
  direction.

## Pace

Pace controls how often the agent stops and hands control back to the user during the
recursion — separate from the hard-gate contract-confirmation pauses (see Test Style below),
which fire at every pace, including Full.

- **Slow** — stop after every red→green transition. Even a single edge case test is its own
  checkpoint: write it, make it green, stop, recap, wait.
- **Normal** (default) — stop at layer boundaries: when dropping down to a new frame's first
  test, and when popping back up — a frame becomes sufficiently covered, or, under tracer-bullet
  ordering, the descent bottoms out and the sweep back up to pick up deferred edge cases is
  about to begin. Multiple tests within the same frame run without a stop in between.
- **Full** — keep going across multiple layers and multiple tests per turn, batching until
  there's a real reason to stop: the recursion is done, a hang or unexpected failure needs a
  decision, or a hard gate fires. This is what lets "tracer bullet by default" actually move
  fast — at Normal pace the tracer bullet would still stop at every frame it passes through.

**Setting it**: ask once at Session Setup, alongside the role-split line — default to Normal if
the user doesn't answer. Changeable anytime mid-session with a plain instruction ("full speed",
"slow down", "go careful", "back to normal"). Record the current pace on the stack file's
dedicated `## Pace:` line so a context reset picks it back up.

**What never changes with pace**: the hard-gate contract-confirmation pauses (new public method,
new parameter, new mock, new struct/DTO field or enum in a public signature) fire regardless of
pace — Full pace removes check-in stops, not design-decision stops.

## Session Setup

Before the first test, do two things:

1. **State the role split in one line, ask for a pace, and invite override on both.** Don't
   assume the default. Example: *"I'll propose tests and impl; you orchestrate and approve. Say
   the word if you want to write tests yourself instead. Pace: Normal (stop at each layer
   boundary) unless you want Slow or Full — see ## Pace."*
2. **Inventory every existing test file that could be a peer frame in the
   recursion — and broaden beyond the feature's namespace.** Match the project's
   own test convention (`*Test.kt`, `*_test.go`, `test_*.py`, `*.spec.ts`,
   `*_spec.rb`, …) and glob for *that* pattern, not for one you assumed. Peer
   tests don't always live next to feature code: data-access tests typically
   live under a data-access directory, value-object tests under the domain-types
   directory. Scoping the inventory glob to the feature's subdirectory silently
   misses these. Instead glob broadly for the peer *types* you expect plus a
   feature-namespaced sweep. Treat the inventory as load-bearing: a missing frame
   in the stack is a missing frame in the discipline. Populate every candidate
   frame in the stack file up front with `🔜` — deletion-on-irrelevance is
   cheaper than retroactive addition.
3. **Treat a plan document's proposed frames and API shapes as suggestions, not
   commitments.** `/tdd-stack` is often invoked against a plan that already
   proposes frames, collaborators, even signatures. Seeding the stack file from
   it is fine — that is what step 2 asks for. But a frame on the list because the
   plan mentioned it is not a frame a test has exposed, and pseudocode for a
   collaborator's shape is not the user approving that shape. Below whatever
   single contract the plan flags as open, every proposed collaborator and API
   design goes through the hard gate (see ## Test Style) before a test locks it
   in — unless the user has said not to ask for a given case (e.g. "just follow
   the plan's signatures, don't stop to confirm each one").

## Re-inventory at layer drops

When the recursion drops down and introduces a *new* collaborator type (a new
repository, builder, helper), glob immediately for that peer type's existing
tests across the whole codebase before deciding what test frame to add. Don't
rely on the session-start inventory — it was scoped to what you knew about then.

Add the new peer's test frames to the stack file the moment you introduce the
collaborator — even if you haven't read those files yet. The act of writing them
down is what enforces the recursion.

## Cycle
1. Happy path test is written (Agent proposes by default; user may also write
   it). Test defines the API contract. **If it introduces new public surface,
   the hard gate fires before the test is written** (see ## Test Style —
   "Pausing for contract confirmation is a hard gate"); that pause happens at
   every pace, Full included.
2. Test is run and confirmed failing for the right reason. Any *further*
   "does this API look right?" check-in, beyond what the hard gate already
   requires, is pace-governed (see ## Pace) — at Slow ask every time, at Full
   don't ask when the test stays inside an already-agreed contract.
3. Agent implements the minimum to make it green.
4. Agent suggests edge cases — user picks which ones matter.
5. Agent writes the selected edge case tests + implementation in one batch.
6. Agent suggests refactors if warranted — user approves before any refactor is
   applied. Name the move where a catalogued one applies (see ## Refactoring
   references).
7. Repeat from step 1 for the next behavior. **End of cycle: in the conversation
   reply, list every test added/touched by name.** The stack file is internal
   state; the conversation is what the user reads. A terse recap costs the user
   a redundant "did you add X?" turn. Whether "repeat" happens in the same turn
   or after handing back control depends on pace (see ## Pace) — at Slow,
   stop here every time; at Normal, stop only if this cycle also crossed a
   layer boundary; at Full, keep going.

## Recursive Application

The cycle applies at **every layer**, not just the top:

1. The outermost test (integration / E2E) pins the user-facing contract and
   stays **red** until the recursion bottoms out.
2. When a test exposes a collaborator (repository, builder, helper), drop down.
   The act of writing that collaborator's test forces decisions about *what it
   needs* — the mocks chosen at one layer become the **contract** for the layer
   below. **This is a layer boundary — at Normal pace, stop here** (see ## Pace):
   recap what the new frame's contract is and wait before writing its first test.
3. Make the inner layer green in isolation against its mocks. If its tests
   surface more collaborators, recurse further.
4. The outer red test goes green only once the recursion bottoms out and real
   implementations connect.

### Tracer bullet by default

Default to threading a single happy path all the way from the outer test down
through every layer to real (non-mock) implementations **before** spending a
cycle's edge-case round (Cycle steps 4–5) at any one frame. A full sweep of edge
cases at frame 2 is worth less, this early, than confirming frame 2's contract
survives contact with frame 5's real implementation — edge cases can't be
finalized with confidence until the shape below them has actually landed, and
mocked-collaborator interfaces are exactly where an early design mistake hides
until something real is behind them.

Concretely: after step 3 (minimum to make the current frame green against its
mock), prefer dropping to the next collaborator's test over running steps 4–5
at the current frame — unless there is no further collaborator to drop to, i.e.
the frame already terminates in a real implementation. Once the tracer bullet
bottoms out and the outermost test can plausibly go green end-to-end, sweep
back **up** the stack picking up each frame's deferred edge cases in the same
outer→inner order.

This ordering interacts with pace (see ## Pace): at Full pace it's what lets the descent
actually move quickly, one layer after another in the same turn. At Normal pace, the layer-drop
stop still applies at each frame the tracer bullet passes through — the *ordering* changes
(happy path before edge cases), but *pace* still governs how often control comes back to the
user. At Slow, tracer-bullet ordering barely changes anything observable, since every test
is already its own stop.

Mark a frame that was intentionally happy-path-only mid-tracer-bullet as 🟡 with
a short note (e.g. "edge cases deferred until tracer bullet lands") rather than
✅ — the bar for ✅ still applies once you return to close it out. This is a
default, not a rule: say when you're applying it, and if the user asks to fully
close a frame before recursing (e.g. because a mock's failure contract is
genuinely load-bearing for the next layer's design), do that instead.

## The bar for ✅

"Sufficiently covered" is not "the happy path passes". Before marking a frame ✅,
**read the implementation that frame's tests drove and enumerate its branches** —
guards, error handlers, status checks, early returns, absence short-circuits.
Every branch without a test is either a missing test or dead code; decide which,
out loud. Then ask the layer-crossing question: for each collaborator this layer
calls, what does this layer do when that collaborator *fails*? A frame whose
happy path is green but whose failure paths are untested is 🟡, not ✅.

This is the check that catches error handling copied from a peer, and it is
where genuine bugs hide: a partially-failed operation that leaks a resource,
or leaves a field in a state that blocks retry, will pass every happy-path test
at every layer.

A test that passes the moment you write it is **not a cycle** — it is a coverage
gap you just found in code that already shipped. Say so explicitly in the recap
("passed immediately; that branch already existed"). One is fine. A run of them
means earlier frames were marked ✅ too early, and the bar above was skipped.

## Rules
- Never refactor without explicit approval. Suggest only.
- Never invent new API surface in edge case tests. Stay within the contract the
  user defined.
- Never write implementation before a failing test exists.
- **"A failing test exists" means a test in the collaborator's own test file, not
  merely a higher layer's test that happens to require the new method to
  compile.** If a cycle needs a new method, or a new message to an existing
  method, on *any* collaborator — brand-new or already in the stack, mocked or
  driven for real — that collaborator's own dedicated test suite gets the
  driving test first. A real (non-mocked) collaborator threaded through a higher
  layer's test is the easiest place for this to slip: the higher layer goes
  green, the new method quietly exists, and the collaborator's own contract
  was never independently proven — only reconstructed afterward as a
  passes-immediately retrofit (see "the bar for ✅"). Add the collaborator's
  frame to the stack the moment its new method is introduced, same as any other
  layer drop.
- Keep implementation minimal — no speculative code, no premature abstractions.
- Domain naming and boundaries are the user's decisions. Never rename domain
  concepts.

### Anti-patterns to avoid
These slip in silently — call them out and back off:
- **Don't write a guard no test asked for.** Not a precondition check
  (`require` / `assert` / `raise ValueError` / `if err != nil { return err }` /
  `throw`) that nothing asserts on; not a defensive wrapper like
  `if isNotEmpty(set) { forward(set) }` when the receiver already no-ops on
  empty input; not the guard you already know the next edge case will need. Even
  then, write the test first, let it go red, and add the guard after.
- **Don't introduce a collaborator** (repository, helper, abstraction) the test
  didn't ask for or mock.
- **Don't batch-create scaffolding** (enums, structs/DTOs, builders, fixtures)
  before the first test runs. Add only what the test in front of you references.
- **Don't pick names in the implementation** — a property key, an id format, a
  method name — that the test didn't pin. Those names belong to the user.
- **Don't mirror a lower-layer validation onto a new factory for "consistency".**
  Existing builder/data-access validations are legacy details, not precedent for
  new methods. Parameter validation defaults to the **public entry point of the
  unit under test** unless the user directs otherwise.
- **Don't infer "this layer has no test convention" from your own inventory.**
  Inventories are bounded by their globs; absence in yours is not absence in the
  codebase. Broad-glob to confirm before implementing a collaborator without a
  peer-layer test. When in doubt, write the peer test.
- **Don't copy a peer's production pattern without its reason.** An injected
  factory (closure, lambda, supplier function, one-method interface) earns its
  place only when each call must construct a new external resource — a platform
  handle, a connection, a client. A plain domain object doesn't; construct it
  directly, following the nearest *domain*-layer precedent rather than assuming
  the nearest *service*-layer one generalizes down. Reach for the indirection
  when a concrete difficulty shows up under test, not because a plan described
  the shape or a sibling file has one.
- **Don't copy a peer test's helper shape without its reason.** A wrapper
  (`runSubjectTest { }`, a fixture or context manager, a `setUp` building five
  collaborators) usually exists because its subject needs an injected runtime
  dependency, or because it shares many stubs. If yours needs neither, the
  wrapper is indirection with no payoff. Name the problem it solves *there* and
  confirm you have it *here*. Likewise a mock referenced only inside the creation
  method is a local, not a suite-scoped field. Prefer a plain `makeSubject()`.
  (Meszaros: General Fixture and Obscure Test — see ## Refactoring references.)
- **Don't wire a production call site to a method that is still a stub.** The
  outer *test* stays red by design; production wiring must not. If the
  composition root needs `stop()`, drive `stop()` down through the recursion
  first — otherwise you ship a crash that compiles cleanly and passes every unit
  test, because nothing in the suite exercises the composition root.
- **Don't port a peer's error-handling branches along with its happy path.** The
  error return, the status branch, the failure-path logic will be needed — but
  not yet. Write only the branch the test in front of you demands and let the
  *next* test demand the rest. Copying the full shape produces implementation
  with zero coverage on its error path, found only in retrospect.

## Test Naming Style
- Use **given/when/should** structure: `given X, when Y it should Z`
- Keep names concise — drop articles (e.g., "given blank name" not "given a
  blank name")
- No commas before "it should" — e.g., `when creating account it should fail
  with argument error`
- Don't add given/when/then comments inside the test body

Examples:
- ✅ `given blank name, when creating account it should fail with argument error`
- ❌ `creates an Account with the right values` (no given/when/should)
- ❌ `given a blank name, when creating account, it should fail` (articles +
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

## Refactoring references

When suggesting a refactor (Cycle step 6), name it. A named refactor is
reviewable and reversible; "clean this up" is neither, and the user is the one
approving it.

- **Refactoring: Improving the Design of Existing Code** — Martin Fowler, with
  Kent Beck. Production-code moves: Extract Function, Inline Function, Introduce
  Parameter Object, Replace Temp with Query, Replace Conditional with
  Polymorphism.
- **xUnit Test Patterns: Refactoring Test Code** — Gerard Meszaros. Test smells
  and fixture patterns: Obscure Test, Test Code Duplication, Mystery Guest,
  Eager Test, General Fixture.

Both catalogues are vocabulary, not a mandate — naming the move doesn't approve
it (see ## Rules: never refactor without explicit approval).

## File location

`~/.claude/plans/<task-slug>-tdd-stack.md`

One file per feature/PR. Match the slug to the existing plan file if there is
one.

## Format

```markdown
# <task-slug> — TDD Stack

Live stack of the outside-in recursion. Updated each red→green transition and
each layer drop.

## Currently at: <frame>

## Pace: Slow / Normal / Full

## Stack (outer → inner)

1. 🔴 / 🟡 / ✅ / 🔜  <test suite>
   - <one-line description>
   - File: <path>
   - Optionally: list of test names with status (✅ / ⏭️ next / 🔜 future / 🔴 red)

2. ...
```

**List every candidate frame up front**, not just visited ones — seed each one
from the Session Setup inventory (see ## Session Setup) as a `🔜` frame.

If the format only tracks frames you've reached, you can't see the ones you've
skipped. Delete a frame once you've confirmed it's irrelevant; that's cheaper
than retroactively realising you skipped it.

```markdown
## Open design tensions (when relevant)

Brief notes on contracts the recursion has surfaced but not yet resolved.

## Status icons

Icons mark frames; where a frame lists its individual tests, they mark those too.

- 🔴 red — failing for the right reason
- 🟡 active — being worked
- ✅ green — sufficiently covered (see ## The bar for ✅)
- ⏭️ next — picked by the user
- 🔜 future — not yet picked (a seeded frame, or a test not yet chosen)
- ⏸️ deferred (TODO at the bottom of the stack)
- ❌ deleted — refactored out, no longer applicable. Keep the frame in the stack
  with a one-line rationale (e.g., "removed: parent-scoped query supersedes
  naked id lookup"). Deletion is sometimes the right cycle outcome, especially
  when reviewer feedback exposes a correctness issue in API you just added and
  the cleanest fix is to remove the API rather than patch it.
```

## When to update

- After each red → green transition: flip the icon, note any new test that just
  became active.
- When dropping down a layer (writing the next collaborator's test): add the new
  frame to the stack with 🟡.
- **When introducing a new collaborator type (new repository, builder, helper):
  re-inventory and add every existing peer frame with `🔜`, even before reading
  those files** (see ## Re-inventory at layer drops).
- When popping back up (the inner layer is sufficiently covered): mark it ✅ and
  resume the outer frame's icon as 🟡.
- When the user changes pace mid-session: update the `## Pace:` line immediately, so a context
  reset resumes at the right pace rather than defaulting back to Normal.
- When resolving an open design tension: rewrite that section to describe the
  resolution rather than the question.

## What goes in vs. what doesn't

**In the stack:**
- Test suites at each layer
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

## Task

$ARGUMENTS
