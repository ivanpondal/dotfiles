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
   - Optionally: list of test names with status (✅ / ⏭️ next / 🔜 future / 🔴 red)

2. ...
```

**List every candidate frame up front**, not just visited ones — seed each one
from the Session Setup inventory (SKILL.md, ## Session Setup) as a `🔜` frame.

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
- ✅ green — sufficiently covered (SKILL.md, ## The bar for ✅)
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
  those files** (SKILL.md, ## Session Setup, step 2).
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
