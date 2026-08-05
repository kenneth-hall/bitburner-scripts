---
description: Project-manager status check — audits the goal state, phase docs, BACKLOG and git against each other, then reports drift and dated commitments coming due. Read-only, manual-invoke only.
disable-model-invocation: true
---

Invoke the **project-manager** subagent via the Agent tool (`subagent_type: project-manager`),
with `run_in_background: false` so its report lands in this turn.

It runs **cold on purpose** — pass it no summary of the current session, no context about what
we have been working on, and no hints about what you expect it to find. Give it nothing but the
instruction to run its audit. Anything you tell it about the session's state defeats the point:
it exists to catch claims this session already believes.

Relay its report **verbatim** and add nothing — no interpretation, no next steps, no "this
means…". If Kenneth wants to act on a line, he will say so.
