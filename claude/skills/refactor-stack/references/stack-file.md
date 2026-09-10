# The stack file

Location, template, status icons, and when to update it.

## File location

`~/.claude/plans/<task-slug>-refactor-stack.md`

One file per refactor. Match the slug to the existing plan file if there is one.

## Format

```markdown
# <task-slug> — Refactor Stack

Live stack of the refactor. Updated when a step is pushed, verified or popped.

## Goal: <what this change is for>

One or two sentences, from the motivation gate. Not the shape of the solution —
the problem it solves and how we will know it worked. Every step is judged
against this line.

## Pace: Normal / Full

## Consumers

The blast radius, from the Session Setup inventory. Mark production vs test.

| Call site | Kind |
| --- | --- |
| `path/to/file.ext:NN` | production / test |

## Stack (current step last)

1. ✅ <step> — <why it had to happen, and what it unblocked>
2. ✅ <step> — <reason>
3. 🟡 <step> — <reason>
   - Blocked by: <what pushed the next entry>
4. 🟡 <step> — <reason>   ← current

## Deferred

Decided, not scheduled. Enough reasoning to pick up cold.

- ⏸️ <decision> — <what was settled, why it is not now, what would trigger it>

## Surrendered guarantees

- <what was given up, where, and why the target design cannot keep it>

## Open questions

Design tensions the work has surfaced but not resolved.
```

**The Stack and Deferred sections are different in kind, and the split is the
point.** The stack holds work in progress: everything on it is either done or
being worked. Deferred holds decisions that are *finished* — argued out,
concluded, and not scheduled. Mixing them makes settled thinking look like a
backlog, and makes the next step ambiguous.

**The current step is the last entry, not the first.** The stack grows downward
as blockers are pushed, so the deepest entry is the one being worked. Reading it
bottom-up recovers the chain of reasons that led there.

## Status icons

- 🟡 active — being worked
- ✅ done and verified
- ⏸️ deferred — decided, not scheduled (Deferred section only)
- ❌ backed out — attempted and abandoned. Keep the entry with a one-line reason;
  a step that failed is information about the order.

## Every entry carries its reason

Not just what changes — **why it has to happen now, and what it unblocks.**

This is the field that makes the file worth keeping. A stack of imperatives
("remove the subclasses", "change the switch") tells a cold reader nothing about
whether the order still makes sense; a stack of reasons lets them resume, and
lets them notice when a reason has expired.

An entry whose reason cannot be written is not ready to be worked.

## When to update

- **On push**: add the entry with its reason and what blocked the step above it.
  Push happens the moment a blocker is identified, before any editing.
- **On verification**: flip to ✅ and note what was run and what it covered — in
  particular what it did *not* cover, when the step crossed a boundary the
  automated checks cannot see.
- **On pop**: resume the entry above as 🟡.
- **When a guarantee is surrendered**: record it in its own section, at the step
  where it happened. This is the section most likely to be skipped and most
  likely to matter at review.
- **When something is deferred**: write the decision, not the topic. "Give
  characteristics their own identity — settled: service constructs them so the
  invariant holds by construction; waiting on X" is resumable. "Look at
  characteristic identity" is not.
- **When the goal's shape changes**: rewrite the affected entries' reasons.
  Leaving stale reasons in place is worse than having none, because they justify
  an order that no longer applies.
- **When scaffolding becomes unnecessary**: push its removal as a step
  immediately, while the reason is still known.

## What goes in vs. what doesn't

**In:**

- Steps, their status, and their reasons
- The consumer inventory
- Guarantees given up, and where
- Decisions that are finished but unscheduled

**Not in:**

- Implementation detail (that lives in the code)
- Anything the project's `AGENTS.md` already documents
- Verification commands (look them up each time; they change)
- Adjacent improvements nobody has decided about — those are noise until they
  are either a step or a deferred decision
