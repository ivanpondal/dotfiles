# Anti-patterns

Check a step against this list before calling it done. Each of these was
observed, not invented.

## Widening the current step instead of pushing

The step needs one more thing to land, and that thing gets done inline "since
it's right there". Now the step has two reasons, two ways to fail, and no clean
place to stop.

Push it. The prerequisite gets its own entry, its own verification, and its own
moment where the user could commit.

## Suppressing a check to make a step land

A `default:` branch, a catch-all case, a lint ignore, a cast, a nullable that
absorbs a missing value. Each converts an error that is scoped and loud into one
that is unscoped and silent, and each outlives the refactor by years.

The error is telling you a prerequisite step has not happened. Find it.

**The one legitimate exception** is a diagnostic whose suggested fix the language
forbids — a lint that tells you to write something that does not compile. Even
then, say why in the code, and prefer a restructuring that satisfies the rule
honestly if one exists at reasonable cost.

## Trading a guarantee away without noticing

An exhaustive `switch`/`when` becomes an `if`/`else`. A typed key becomes a
string. A required parameter becomes optional with a default. A compile-time
check becomes a runtime throw.

None of these are forbidden. All of them must be *noticed*, named, and confined
to a step of their own. The characteristic failure is that they ride along
inside a step about something else, where nobody reviewing the diff sees them.

## Reformatting inside a semantic step

A formatter run reflows a file during a meaningful change, and the change is
then invisible — fifteen semantic lines inside a hundred and five changed ones.
The commit you would most want to read later becomes the hardest one to read.

Formatting is its own step, before or after, never during. This matters most on
exactly the steps where it is most tempting: the large cross-cutting ones.

## Writing tests against scaffolding

A test written mid-refactor targets the temporary construct — the subclass about
to be deleted, the shim about to be removed — and needs editing one step later.

Write new tests against the API that will *survive*. If you cannot tell which
that is, the step order is not clear enough yet.

## Leaving scaffolding behind

The temporary overload, the duplicated field, the compatibility shim, the
subclass kept only to preserve a signature. Each was correct when written. Each
is dead weight once the thing it protected stops existing.

The trigger for removal is the justification disappearing, not a final cleanup
pass — which does not happen, because by then the refactor looks finished.

## Breaking consumers silently

A change that keeps every consumer compiling but alters what they do. This is
strictly worse than one that breaks the build, and it is easy to prefer by
mistake because it *looks* less disruptive.

Check each consumer for whether it would keep compiling, and whether it would
keep being correct. A candidate that breaks some consumers loudly and others
silently is the worst of the options, not a compromise.

## Declaring a step verified beyond what was run

A green suite in one language says nothing about the others. A passing unit test
says nothing about generated code that was never regenerated, or a native build
CI does not run.

State what was run and what it covered. When a step crosses a boundary the
automated checks cannot see, say the step is unverified there rather than
letting a green run stand in for it.

## Optimising against a guessed motivation

Starting work before the motivation gate is answered, on the assumption that the
obvious reading is right. The mistake surfaces several steps in, when the real
driver appears and the trade-offs that were made turn out to be the wrong ones.

Ask. It costs one exchange.

## Holding the user to their opening description

Their first framing of the refactor was a sketch. When they move toward
something different, that is discovery, not drift. Arguing that a direction
"isn't the goal you stated" defends a first draft against the thinking that came
after it.

The motivation is stable; the shape is not.
