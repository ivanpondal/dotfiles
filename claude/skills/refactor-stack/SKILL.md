---
name: refactor-stack
description: >-
  Incremental refactoring tracked in a live stack file that survives context
  resets. Steps are pushed when something blocks the current one, never merged
  into it, so a large restructuring lands as a sequence of small verified
  changes. Use when the user says "refactor", "restructure", "collapse these
  types", "extract this", "move this", or asks to resume a refactor session.
  Not for a rename or a one-file edit — the ceremony costs more than it saves.
---

# Refactor Stack — Live Stack File for Incremental Refactoring

A refactor that tries to do everything at once has no safe place to stop. Every
intermediate state is broken, the diff is unreviewable, and when something goes
wrong the only move is to throw the whole thing away.

The alternative is a sequence of small steps, each of which leaves the code
working. That is not a matter of willpower: it needs a written stack, because
the steps are discovered as you go. You start to collapse a hierarchy, find a
switch in the way, start to change the switch, find it needs a getter that does
not exist yet — and three levels down, "what was I doing?" is expensive to
answer and easy to answer wrongly by finishing everything in one edit.

Detail needed at only one point lives in `references/` alongside this file —
read each when the section below says to.

## The stack analogy

- **Step** — one change that moves the code toward the goal and leaves it
  working. Steps are what the stack file lists.
- **Push** — the current step is blocked by something that must happen first.
  Name that prerequisite, push it, and work it instead.
- **Pop** — the step is done and verified. Report it, and resume the one beneath.

**The central rule: a blocker pushes a new step. It never widens the current
one.** "While I'm here I'll also…" is the failure this skill exists to prevent.
If the current step cannot land without another change, that change is its own
step, with its own verification.

## Roles

- **User** is the orchestrator: defines the goal, decides API shape, naming and
  domain boundaries, chooses between surviving options, and owns version
  control.
- **Agent** is the driver: proposes the step order, makes the edits, runs the
  verification, reports.

## Version control belongs to the user

**Never commit, never revert, never stash.** The user decides when a checkpoint
becomes a commit.

What the agent owes in exchange is a clear signal: when a step is done and
verified, **say so plainly** — that is the user's cue to commit if they want
one. Silence lets checkpoints drift apart, and then a proposed rollback throws
away three steps that were fine.

If a step should be abandoned, propose the revert and name what it would undo.
Do not run it.

## Pace

- **Normal** (default) — stop after every verified step. Report what changed,
  what the verification said, and what is next.
- **Full** — keep working down the stack without stopping, until the stack is
  empty, verification fails, or a decision is needed.

Ask once at Session Setup and record it on the stack file's `## Pace:` line so a
context reset resumes correctly. Full removes check-in stops, never design
decisions or the motivation gate.

## Session Setup

### 1. The motivation gate

**Do not open the stack until you can state what the change is for.** Ask, and
wait for an answer.

The user's opening description is a sketch, not a specification. "Collapse these
two types" says what, not why, and the why is what every later step is judged
against — which order is safe, which trade-offs are acceptable, which parts can
be deferred. A refactor optimised against a guessed motivation optimises the
wrong axis, and the mistake is invisible until late.

Ask plainly: *what problem does this solve, and how will we know it worked?*
Record the answer at the top of the stack file. When a step later looks
optional, that line is what decides it.

Expect the goal's **shape** to change as the work proceeds — that is normal and
not a failure. The motivation is the stable thing. Never argue that a new
direction "isn't the goal you stated"; the stated goal was a first draft.

### 2. Inventory the consumers

List every call site of the API being refactored, and note which are production
and which are tests. This set is the blast radius, and the step order is
designed around it.

Record it on the stack file. Re-inventory whenever a step reveals a consumer the
first sweep missed.

### 3. Treat the API as published

Work as if the consumers belonged to an external client who must be asked to
migrate. This is the constraint that generates the step order:

- Judge every candidate step by **what it forces on consumers, and how loudly
  they are told**. A change that breaks them at compile time is far better than
  one that keeps compiling and changes behaviour.
- The discipline holds even when every consumer is in this repo and the whole
  thing could be changed in one commit. The consumers you are protecting include
  the ones that do not exist yet.

## The cycle

For each step:

1. **Name the step and its reason.** Not just what changes — why it must happen
   now, and what it unblocks. Write both to the stack file.
2. **Name the refactoring.** See ## Named mechanics below. If it has a name,
   look up its mechanics and follow the step order they prescribe.
3. **Make the change**, and nothing else. No opportunistic cleanup, no
   reformatting, no adjacent fix. Those are steps of their own.
4. **Verify.** Run what the project's `AGENTS.md`/`CLAUDE.md` prescribes for the
   layers you touched. Never name commands this skill invented, and never treat
   one language's suite as evidence for another's — see ## Verification.
5. **Check what the step made unnecessary.** See ## Scaffolding.
6. **Report and pop.** Say what changed, what verification ran and what it said,
   and that the step is done. At Normal pace, stop here.

## Named mechanics

Refactorings have names, and the names come with **step orders that are already
correct**. Use them.

- When a step is identified, say which catalogued refactoring it is — *Pull Up
  Field*, *Move Function*, *Replace Subclass with Fields*, *Extract Function*,
  *Replace Conditional with Polymorphism*, *Introduce Parameter Object*. Fowler's
  *Refactoring* is the reference vocabulary; use its names and its mechanics.
- A named move is reviewable and reversible. "Clean this up" is neither, and the
  user is the one approving it.
- **The mechanics tell you where a step belongs in the sequence.** Most of them
  end with "remove the old thing" — so if removing the old thing is where you
  started, you have inverted the order.

### A compiler error is an ordering signal

When a step will not compile, the first question is not "how do I silence this?"
It is **"which step did I skip?"**

An exhaustiveness error on removing a type, a missing member after a move, a
broken constructor after a field migrates — these are the toolchain reporting
that a prerequisite has not happened yet. Push that prerequisite and the error
disappears on its own.

**Never suppress a check to make a step land.** A `default:` branch, a catch-all
case, a lint ignore, a cast — each converts a scoped, loud error into an
unscoped, silent one that outlives the refactor.

### Surrendering a guarantee

Sometimes a target design genuinely cannot keep a guarantee the current one has
— exhaustiveness usually. That is allowed, but it is **its own decision**:

- Say out loud that the guarantee is being given up, and why the target design
  cannot keep it.
- Give it up at **one named site, in its own step**. Never as a side effect of a
  step about something else.
- Before finishing any step, ask whether it quietly traded a guarantee away —
  an exhaustive `switch`/`when` becoming an `if`, a typed key becoming a string,
  a required parameter becoming optional. Silent surrender is the common case
  and it is not noticed at review.

## Scaffolding

Intermediate constructs — a temporary overload, a duplicated field, a
compatibility shim, a subclass kept only to preserve a signature — are correct
when written and become dead weight the moment the thing they protected stops
existing.

**After every step, ask: does anything still need what the previous steps put in
place?** Scaffolding is removed when its justification disappears, not on a
schedule and not in a final cleanup pass that never happens. Its removal is its
own step.

## Settling design questions

Discussion narrows the options; it rarely picks between the last two. When a
question is about how the code will *read* or *be used*, stop arguing and write
the consuming side — the call site decides.

Say when you are doing this, and accept the outcome even when it contradicts
what the discussion had settled on. Preferring what reads better once written is
the method working, not a lapse.

## Naming

Name things for **role and direction, in the domain's own words**.

When a name crosses a boundary, ask what the other side calls it. A concept the
platform, protocol or spec already has a word for should use that word — then
the code on both sides reads as one thing being translated rather than two
things being invented.

Watch for a name that already means something else in the same codebase pointed
the other way: if `write` is what a client does to a remote object, the server's
inbound handler is not `write`.

Renaming domain concepts is the user's call. Propose, never assume.

## Deferring

A refactor surfaces adjacent improvements constantly. Most of them are real and
almost none of them belong in the current step.

- A decision can be **finished** without being **scheduled**. Record it on the
  stack file's **Deferred** section, with enough reasoning that it can be picked
  up cold.
- Deferred items are not pending work and must never sit in the numbered stack,
  where they read as the next thing to do.
- Before finishing a session, review the Deferred section with the user: what is
  worth doing now, what waits for a change that has not happened yet, and what
  was overtaken.

## Verification

Run what the project documents — `AGENTS.md`, `CLAUDE.md`, the README. This
skill never names commands.

**Know what your verification does not cover.** A multi-language project's CI
frequently runs one language's suite only; a green run there is evidence about
that language and nothing else. When a step crosses a boundary the automated
checks cannot see, say so explicitly in the report rather than calling the step
verified.

When a step touches generated code, the **schema is the seam**, not the
generated output. Generated files feel atomic because they cannot be hand-edited,
but the authored schema supports parallel change — adding the new shape
alongside the old, migrating consumers one at a time, then removing the old —
whenever that is worth the regeneration cycles.

## Anti-patterns

Before finishing any step, check it against `references/anti-patterns.md`.

## The stack file

Location, template, status icons, and when to update it live in
`references/stack-file.md`. Read it at Session Setup and keep it open.

## Task

$ARGUMENTS
