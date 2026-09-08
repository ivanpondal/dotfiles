# Writing a kickoff plan

For when planning and implementing are separate sessions — frequently separate
models, with the plan file the only thing that crosses the boundary. The session
that executes it starts cold: it has none of the planning conversation, and it
reads the plan's prose as the operative instruction, because that prose is the
concrete task-shaped text in front of it while the skill is background.

That asymmetry sets the whole contract:

> **The plan carries what is expensive to rediscover. It never carries what is
> expensive to earn.**

Reconnaissance — what exists, where it lives, what already failed — is expensive
to rediscover, so write it down. Implementation is earned one red test at a
time, so leave it out. A plan that hands over a finished method body has spent
the executor's discipline to save it ten minutes of typing.

## What belongs in it

- **Context**: what the change is, what already exists, what is stubbed, and the
  outermost acceptance test that proves the whole thing.
- **Frames, outer → inner**, each naming the contract it drives and its tests.
- **Open contracts**, in their own section: the decisions the plan deliberately
  refuses to settle, with candidate shapes and what each one costs.
- **A reuse inventory**: the fixtures, helpers, builders and shared constants
  that already exist, so the executor extends them instead of hand-rolling
  siblings.
- **Verification**: how to run each suite, how to check for new warnings, and
  what continuous integration does *not* cover.
- **Deviations the codebase forces**: an established test-naming convention, a
  fixture shape, a house rule that overrides one of this skill's defaults. Say
  so once, so it is not re-litigated every cycle.

## What must stay out

- **A narration of a finished implementation.** This is the failure mode the
  whole document exists to prevent, and the attribution rule below is the test
  for it.
- **"Mirrors the existing X" as a blanket instruction.** Peer-mirroring is the
  highest-risk path in the codebase — it is how error branches, guards and
  defensive wrappers arrive with no coverage. Name the half that transfers.
- **Pre-committed API shapes for frames below the first.** See *Open contracts*.
- **Pace and roles.** The executor establishes those with the user at Session
  Setup; a plan that fixes them removes the user's choice.

## The attribution rule

> Every branch the plan mentions must be attributed to a test in that frame's
> list. A branch you cannot attribute does not belong in the plan.

A guard, an error path, a status check or an early return named in prose but
absent from the test list reads as "write this now", and it will be written now
— before anything demands it, and green from the moment it lands. So instead of:

> *Mirrors the existing write block: validate both inputs and fail on a bad one,
> run the work, forward any error to the caller.*

write:

> *Mirrors the write block's **happy path** only. Its two input guards belong to
> tests 3–4 and its error forwarding to test 2 — leave all three out until those
> tests are red.*

The second version transfers the same reconnaissance and costs the executor
nothing in discipline.

## Shape of a frame section

Attribution becomes structural if every frame is written to one shape:

```
### Frame N — <test file>

Drives: <the contract this frame pins>

Tests:
  - <happy path name> — <what it asserts>
  - <edge case name>  — drives <the specific branch>

Fixture work: <which existing fixture gains which parameter>
Watch: <known traps at this frame>
```

If an edge case's line cannot finish the phrase "drives …", either the branch is
not needed or the test is not yet understood. Both are worth catching at plan
time rather than three frames deep.

## Which frames start numbered

Only the outermost. Something concrete already demands it — the failing
acceptance test, the stub that crashes, the caller that has nowhere to go.
Everything deeper is a **candidate** (`💭`), and the plan should say so, because
a numbered list of frames is read as a work queue and turns "what's next?" into
"the next unticked number". Frames deeper down enter the numbered stack when the
recursion drops into them, which is the demand that promotes them.

## Open contracts

A design decision belonging to a frame several layers down should be left open,
not settled at plan time. Being asked to write the plan is not the signal that
every design question in it has converged; the decision belongs at the hard
gate, in the implementing session, with the failing test in front of you.

Because the plan is read cold, an open question only survives if it is written
as one. Give it its own section and include:

- **What is undecided**, in one sentence.
- **The candidate shapes**, each with what it costs and what it forces elsewhere
  — which error type grows a case, which layer ends up owning the failure.
- **Which frame owns the decision**, and an explicit instruction to stop there,
  propose, ask, and wait.
- **What must not be pre-committed** in the meantime: the error case, the mock's
  closure signature, the field on the data type. Naming these is the point of
  the section — pre-committing in an earlier frame is exactly what it prevents.

## Finishing

Stop at the plan file. Do not begin the implementation, and do not lean on
anything established only in the planning conversation: quote the signatures and
constraints that matter, name exact paths, and state which decisions are locked
and which are deliberately open. Then report that the plan is written.
