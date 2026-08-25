# Anti-patterns to avoid

Read before letting a frame go green — these slip in silently. Call them out
and back off.

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
  (Meszaros: General Fixture and Obscure Test — see `refactoring.md`.)
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
