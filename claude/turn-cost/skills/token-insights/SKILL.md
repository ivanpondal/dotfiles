---
name: token-insights
description: >-
  Explains where a past Claude Code session's tokens and cost went, from the
  ledger the turn-cost plugin saved for it: the same views as /tokens, read
  back outside the session, then a ranked list of findings with the change
  that would have saved each. Use when the user asks why a session was
  expensive, for token or cost insights on a session, or names a session id
  alongside tokens, cost, cache or context. Not for the current session's
  live numbers: /tokens shows those.
---

# Token insights for a saved session

The turn-cost plugin saves each session's ledger (every request's tokens, and
what entered the window with it) to its store, keeping the last 10. `/tokens`
prints it only to the person's screen, never to the model; the CLI beside this
skill prints the same views from the store, so you can read them.

The CLI is `../../scripts/tokens.ts` from this skill's base directory. Run it
with `npx -y tsx <that path> …`. Its first line says whether thinking is exact.
The plugin saves exact thinking once a turn completes, read from the
session's transcript; for older ledgers the CLI reads the transcript itself
when one is left.

| Command | Prints |
|---|---|
| `--list` | saved sessions, newest first: id, prompts, steps, first prompt |
| `<id prefix>` | the token map: window, every prompt, hotspots, what fills the window, files, heaviest items, tools, subagents |
| `<id prefix> <#>` | one prompt: a map of its steps, then each step with what it brought in, labels in full |
| `<id prefix> files` | every file read, each read's size and range, what changed it after |
| `<id prefix> --json` | the raw ledger, for questions the views don't answer |

## Steps

1. **Pick the session.** Run `--list`. Match what the user named: an id
   prefix, a first prompt, "the last one". If two fit, ask; don't guess.
2. **Read the map** (`<id prefix>`) in full before concluding anything.
3. **Expand the prompts that matter** (`<id prefix> <#>`): the largest by
   input, any with re-cached tokens, any whose thinking share stands out.
4. **Read the files view** (`<id prefix> files`) when Read results are among
   the heaviest items.
5. **Check timing in the transcript** before blaming a cache miss on a pause
   (see below).
6. **Report** as described at the end.

## What to look for

Weigh tokens by price, not count. As multiples of the input price: cache
reads 0.1×, cache writes 1.25× with the 5-minute cache or 2× with the 1-hour
cache. Output's multiple depends on the model; look it up (the `claude-api`
skill has pricing) rather than assume it. Work out each bucket's share of the
cost, and rank the findings by that share.

- **Reading the window back.** Cached input is usually the largest bucket,
  and it grows with the window × the number of requests. A long run of short
  prompts on a large window (follow-ups, "yes", polling a background job)
  points to where a `/clear` with a handoff, or a fresh session, would have
  paid off. Name the prompt where the work changed character.
- **Cache misses** (`re-cached`). The whole window was written again. Check
  whether a pause longer than the cache's lifetime came first; other causes
  are a model or settings change, or a resumed session.
- **One item carried for long** ("heaviest over the session": tokens × steps).
  A large file or plan read early and carried to the end. Ask whether a part
  of it would have done (a range, a summary section, a subagent that reads it
  and reports back).
- **Superseded and repeated reads** (files view). A read followed by a Write
  of the same file is out of date but still carried. A file read many times
  may mean the first read was too narrow.
- **The model's own replies.** Replies enter the next request at their full
  output size, thinking included. Check the share of carried tokens that are
  replies, and the prompts with the highest thinking share.
- **Fixed overhead** (`fixed ~…`) × the number of requests: system prompt,
  tools, memory files. It matters when there are many requests.
- **Subagents** ("kept out of main"): what delegating saved the main window,
  and whether a heavy exploration in the main loop could have been delegated.
- **Prompts with no requests recorded**: interrupted or errored; mention them
  if they line up with a miss or a restart.

## The transcript, for timing and exact figures

`ls ~/.claude/projects/*/<session id>.jsonl` finds it. Each row has a
`timestamp`; assistant rows have `message.usage`, including
`cache_creation.ephemeral_1h_input_tokens` vs `ephemeral_5m_input_tokens`
(which cache price applies). One API response spans several rows with the
same `message.id`, so de-duplicate by it before summing usage; a subagent's
transcript (`<id>/subagents/agent-<agent id>.jsonl`) keeps streamed partials,
so take the last row of each id.

To check a miss: find the user row of the prompt that missed, and the gap
since the row before it. Report the gap next to the cache lifetime.

## Report

Findings ranked by share of cost. For each:

- **What happened**, in one sentence, with the figures from the views
  (prompt numbers, tokens, the share of cost).
- **The evidence**: the view or transcript rows it comes from.
- **The change** that would have saved it, concrete enough to act on next
  time ("`/clear` with a handoff after #9, when the work moved to device
  testing", not "manage context better").

Close with what is estimated: per-item tokens split each request's new tokens
by characters, and thinking, when the CLI's first line says it is, is output
less visible text.
