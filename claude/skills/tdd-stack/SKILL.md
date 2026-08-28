---
name: tdd-stack
description: >-
  Outside-in TDD across multiple layers, tracked in a live stack file that
  survives context resets. Use when a feature recurses from an outer
  acceptance test down through services, collaborators and data access, or
  when the user says "TDD", "test first", "outside-in", "red-green", or asks
  to resume a TDD session. Not for one- or two-layer tasks — the ceremony
  costs more than it saves.
---

# TDD Stack — Live Stack File for Recursive TDD

Outside-in TDD with recursion mirrors a call stack. Without a written stack:
- After a few hours or a context reset, "where am I?" gets expensive to answer.
- "Have we covered the X concern yet?" becomes a re-read of every test file.
- Open design tensions surfaced by a deeper layer get forgotten.

Use when doing **deep recursive outside-in TDD** across multiple layers — when a
single feature unfolds from an outer acceptance test down through the units it
exposes. Not for shallow tasks (one or two layers); the ceremony costs more than
it saves.

Detail that is only needed at one point in the loop lives in `references/`
alongside this file — read each when the section below says to.

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

Pace controls how often the agent stops and hands control back to the user
during the recursion. It is separate from the hard gate (see ## Test Style),
which fires at every pace, Full included.

- **Slow** — stop after every red→green transition. Even a single edge case test
  is its own checkpoint: write it, make it green, stop, recap, wait.
- **Normal** (default) — stop at layer boundaries: dropping down to a new frame's
  first test, and popping back up (a frame becomes sufficiently covered, or the
  tracer bullet bottoms out and the sweep back up begins). Multiple tests within
  one frame run without a stop in between.
- **Full** — keep going across layers and tests in one turn, until there's a real
  reason to stop: the recursion is done, a hang or unexpected failure needs a
  decision, or the hard gate fires. This is what lets tracer-bullet ordering
  actually move fast.

**Setting it**: ask once at Session Setup, alongside the role-split line —
default to Normal if the user doesn't answer. Changeable anytime with a plain
instruction ("full speed", "slow down", "back to normal"). Record it on the
stack file's `## Pace:` line so a context reset picks it back up.

**What never changes with pace**: Full removes check-in stops, not design
decisions. The hard gate fires at every pace.

## Session Setup

Before the first test, do three things:

1. **State the role split in one line, ask for a pace, and invite override on
   both.** Don't assume the default. Example: *"I'll propose tests and impl; you
   orchestrate and approve. Say the word if you want to write tests yourself
   instead. Pace: Normal (stop at each layer boundary) unless you want Slow or
   Full — see ## Pace."*
2. **Inventory every existing test file that could be a peer frame — and broaden
   beyond the feature's namespace.** Match the project's own test convention
   (`*Test.kt`, `*_test.go`, `test_*.py`, `*.spec.ts`, `*_spec.rb`, …) and glob
   for *that* pattern, not one you assumed. Peer tests don't always sit next to
   feature code: data-access tests live under a data-access directory,
   value-object tests under the domain-types directory, and scoping the glob to
   the feature's subdirectory silently misses them. Glob broadly for the peer
   *types* you expect, plus a feature-namespaced sweep, plus the layer's
   fixtures, builders and shared test constants — a bare mock where a fixture
   hierarchy already exists, or an inline literal where a shared constant does,
   is the usual cost of skipping that last one. Seed every candidate frame into
   the stack file's **`## Candidate frames (💭 unproven)`** section — *not* the
   numbered stack: a missing frame in the stack is a missing frame in the
   discipline, and deletion-on-irrelevance is cheaper than retroactive addition.
   Seeded frames are unnumbered and unordered on purpose (see ## Promoting a
   candidate frame, and `references/stack-file.md`).

   **Re-inventory at every layer drop.** The session-start inventory was scoped
   to what you knew then. When the recursion introduces a *new* collaborator
   type (repository, builder, helper), glob again for that peer type across the
   whole codebase, and add its frames to the candidate section the moment you
   introduce the collaborator — even before reading those files. Writing them
   down is what enforces the recursion.
3. **Treat a plan document's proposed frames and API shapes as suggestions, not
   commitments.** A frame on the list because the plan mentioned it is not a
   frame a test has exposed, and pseudocode for a collaborator's shape is not
   the user approving that shape. Seeding the stack file from a plan is fine —
   that is what step 2 asks for — but a plan-derived frame enters as `💭` and
   stays there until something demands it (see ## Promoting a candidate frame).
   Below whatever single contract the plan flags as open, every proposed
   collaborator and API design goes through the hard gate (see ## Test Style)
   before a test locks it in, unless the user has said not to ask (e.g. "just
   follow the plan's signatures").

## Promoting a candidate frame

Seeded frames record what *might* be needed. They are not a work queue, and the
stack file keeps them unnumbered and outside the numbered stack so they cannot
be read as one.

**Promote a frame from `💭` to `🔜` only when you can name the concrete caller,
data path or failing test that requires it.** "The plan lists it next" and "it
is the next unticked number" are not such reasons. Say the reason out loud when
you promote, and move the bullet into the numbered stack — promotion is a
deliberate act, not a default.

If you cannot name one, the next frame is somewhere else. Ask instead: what does
the data already flowing through the code reach next, and what does it currently
do when it gets there? That question finds the frame that is actually load-
bearing, which is frequently *not* the one the plan put next — often it is new
tests on a file the plan never listed, because the existing code silently drops
what the previous frame started sending it.

Working a frame nothing demands is how speculative abstractions get built: an
interface to break a dependency cycle that does not exist, an adapter for a
caller that never materialises. Both cost a rollback, and the rollback is the
cheap outcome — the expensive one is the abstraction surviving into the merge.

A candidate that never materialises is deleted, or marked `❌` with "never
required" and a one-line reason. Sweep the candidate section when the tracer
bullet bottoms out; frames nobody revisited are the ones most likely to be dead.

## Cycle
1. Happy path test is written (Agent proposes by default; user may also write
   it). Test defines the API contract. **If it introduces new public surface,
   the hard gate fires before the test is written** (see ## Test Style).
2. Test is run and confirmed failing for the right reason. Any *further* "does
   this API look right?" check-in, beyond what the gate already requires, is
   pace-governed (see ## Pace).
3. Agent implements the minimum to make it green.
4. Agent suggests edge cases — user picks which ones matter.
5. Agent writes the selected edge case tests + implementation in one batch.
6. Agent suggests refactors if warranted — user approves before any refactor is
   applied. Name the move (see ## Refactoring references).
7. Repeat from step 1 for the next behavior. **End of cycle: in the conversation
   reply, list every test added/touched by name.** The stack file is internal
   state; the conversation is what the user reads. Whether "repeat" happens in
   the same turn or after handing back control is pace-governed (see ## Pace).

### Stubbing to make a red test compile

Where a test can't run until the name it calls exists, add that method as a
**throwing stub** — the language's "not implemented" error — before writing the
test. That isn't implementation; it's the minimum that lets the test fail.

The stub must **throw, never return a plausible default**. Returning false, null
or an empty collection makes the test fail on an assertion — a weak signal that
reads like a logic bug — or, worse, pass vacuously. A "not implemented" error in
the failure output is positive evidence the test reached the seam you meant.

Add one stub at a time, and **track outstanding stubs in the stack file**: note
each on the frame that will replace it, clear the note when that frame goes
green. Otherwise a stub ships if the session ends mid-recursion (see
`references/anti-patterns.md`: "Don't wire a production call site to a method
that is still a stub").

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
survives contact with frame 5's real implementation — a mocked-collaborator
interface is exactly where an early design mistake hides until something real is
behind it.

Concretely: after step 3 (minimum to make the current frame green against its
mock), prefer dropping to the next collaborator's test over running steps 4–5
at the current frame — unless there is no further collaborator to drop to, i.e.
the frame already terminates in a real implementation. Once the tracer bullet
bottoms out and the outermost test can plausibly go green end-to-end, sweep
back **up** the stack picking up each frame's deferred edge cases in the same
outer→inner order.

"The next collaborator's test" means one that something already demands — not
the next number in the file. **Never start a frame that is still `💭`** — promote
it or find the real one (see ## Promoting a candidate frame). A frame the
recursion drops into needs no promotion: it goes straight into the numbered
stack as 🟡, because the drop itself is the demand.

Ordering and pace are independent: this changes *what* you do next (happy path
before edge cases), pace still governs how often control comes back to the user
(see ## Pace).

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
- Never write implementation before a failing test exists. A throwing stub is
  the one exception — see ## Cycle, "Stubbing to make a red test compile".
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
  frame to the numbered stack the moment its new method is introduced, same as
  any other layer drop.
- Keep implementation minimal — no speculative code, no premature abstractions.
- Domain naming and boundaries are the user's decisions. Never rename domain
  concepts.

### Anti-patterns to avoid

Before letting a frame go green, check the diff against
`references/anti-patterns.md` — guards no test asked for, uninvited
collaborators, batch-created scaffolding, names the test didn't pin, peer
patterns copied without their reason, production wiring onto a stub.

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

  → STOP. Use `AskUserQuestion` (or a direct text question) and **wait** before
  writing the test. The mocks you write *are* the design — they freeze the next
  layer's API. A pause is a question followed by waiting for an answer; "I'll
  propose X, redirect if you want different", proposing in chat without waiting,
  and absence of objection are all not pauses.

  The gate fires at every pace, and **Auto mode does not override it** —
  auto-mode's "minimize interruptions" covers routine implementation (a test
  matching an already-agreed contract, running tests, fixing compile errors),
  not contract design. Nor does "let the test drive shape", which is about
  internal shape — struct fields, internal naming, things the test legitimately
  constructs — and never about public signatures, parameters or collaborators.

  **A confirmed decision governs every mirrored layer.** Where one feature is
  implemented across several platforms, a decision confirmed at one layer
  governs **every mirrored layer**, not just the one you asked about. Check each
  mirror against the stated principle before writing its test; when the plan's
  frame list contradicts that principle, the plan is wrong. A frame list is
  never pre-approval for a mirrored layer's API shape.

- **A setup helper constructs and returns its fixture.** Prefer building and
  returning over mutating suite-scoped state, and pass every collaborator it
  stubs as an **explicit parameter** rather than closing over suite-scoped
  fields. A returning helper composes when called twice (two devices, two
  sessions); a mutating one clobbers its own earlier setup. (Meszaros: General
  Fixture, Obscure Test.)

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

When suggesting a refactor (Cycle step 6), **name the move** — a named refactor
is reviewable and reversible, "clean this up" is neither, and the user is the
one approving it. Catalogue and vocabulary: `references/refactoring.md`.

## The stack file

Location, template, status icons, and when to update it live in
`references/stack-file.md`. Read it at Session Setup and keep it open — the
file is updated at every red→green transition and every layer drop.

## Mid-session feedback (user corrections or PR review)

When a user correction or a batch of PR review comments lands mid-recursion,
read `references/mid-session-feedback.md` before touching the first item.
Feedback triages into standalone vs cascading, and a cascading fix can end a
frame in ❌ rather than ✅.

## Task

$ARGUMENTS
