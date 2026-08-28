# The stack file

Location, template, status icons, and when to update it.

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
   - Optionally: list of test names with status
     (✅ / ⏭️ next / 🔜 required / 💭 suggested / 🔴 red)

2. ...

## Candidate frames (💭 unproven)

- 💭 <test suite> — <why it might be needed>. File: <path>
- 💭 ...
```

**Two sections, and the split is the point.** The numbered stack holds frames
something actually demands. The candidate section holds frames seeded from the
Session Setup inventory or a plan document — unnumbered and unordered, because
numbering them turns "what's next?" into "the next unticked number", which is
how work starts on a collaborator nothing calls yet.

**List every candidate up front**, not just visited ones. If the format only
tracks frames you've reached, you can't see the ones you've skipped — that's
what the candidate section is for. Promotion into the numbered stack requires
naming what demands the frame (SKILL.md, ## Promoting a candidate frame).
Delete a candidate once you've confirmed it's irrelevant; that's cheaper than
retroactively realising you skipped it.

```markdown
## Open design tensions (when relevant)

Brief notes on contracts the recursion has surfaced but not yet resolved.

## Status icons

Icons mark frames; where a frame lists its individual tests, they mark those too.

- 🔴 red — failing for the right reason
- 🟡 active — being worked
- ✅ green — sufficiently covered (SKILL.md, ## The bar for ✅)
- ⏭️ next — picked by the user
- 🔜 required, not started — something concrete demands this frame; only
  sequencing is left. Also used for a test within a frame that is required but
  not yet written.
- 💭 speculative — nothing has shown it is needed yet. As a frame: seeded from a
  plan or an inventory sweep, living in the candidate section, never in the
  numbered stack (SKILL.md, ## Promoting a candidate frame). As a test: an edge
  case suggested but not picked by the user (SKILL.md, ## Cycle, step 4).
- ⏸️ deferred (TODO at the bottom of the stack)
- ❌ deleted — refactored out, or seeded and never required. Keep the entry with
  a one-line rationale (e.g., "removed: parent-scoped query supersedes naked id
  lookup"; "never required: writes bypass this layer entirely"). Deletion is
  sometimes the right cycle outcome, especially when reviewer feedback exposes a
  correctness issue in API you just added and the cleanest fix is to remove the
  API rather than patch it.
```

Only the numbered stack is workable. A 💭 candidate is not something to start:
promote it first, or find the frame that is actually load-bearing (SKILL.md,
## Promoting a candidate frame).

## When to update

- After each red → green transition: flip the icon, note any new test that just
  became active.
- When dropping down a layer (writing the next collaborator's test): add the new
  frame to the numbered stack with 🟡.
- **When promoting a candidate**: move the bullet from the candidate section into
  the numbered stack, 💭 → 🔜, and record in one line what demanded it. If you
  can't write that line, it isn't ready to promote.
- **When introducing a new collaborator type (new repository, builder, helper):
  re-inventory and add every existing peer frame to the candidate section as
  `💭`, even before reading those files** (SKILL.md, ## Session Setup, step 2).
- When the tracer bullet bottoms out: sweep the candidate section. Anything
  nobody revisited is probably dead — delete it or mark it ❌ "never required".
- When popping back up (the inner layer is sufficiently covered): mark it ✅ and
  resume the outer frame's icon as 🟡.
- When the user changes pace mid-session: update the `## Pace:` line
  immediately, so a context reset resumes at the right pace rather than
  defaulting back to Normal.
- When resolving an open design tension: rewrite that section to describe the
  resolution rather than the question.

## What goes in vs. what doesn't

**In the numbered stack:**
- Test suites at each layer
- Their red/green status
- File paths so you can reopen the right files
- Cross-cutting deferred items

**Not in the numbered stack:**
- Frames nothing demands yet (those go in the candidate section as 💭)
- Implementation details (those live in the code)
- Per-test param values (those live in the test)
- Decisions already locked in upstream design plans (those live there)
