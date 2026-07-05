# CLAUDE.md refactor — handoff notes

**Goal:** shrink CLAUDE.md to standing rules only, so the per-session token tax drops.
Move encyclopedic/reference content to `docs/` (read on demand). Consolidate the
CLAUDE.md ↔ auto-memory overlap so each fact has exactly one canonical home.

Status: **design approved 2026-07-05** (Kenneth). Ready to implement the edits from this file.

---

## Decisions locked

1. **Two buckets.** Standing rules stay in CLAUDE.md; reference/how-to detail moves to `docs/`.
2. **Canonical source = docs/.** Reference tables live in `docs/` (git-tracked, readable).
   CLAUDE.md holds the *rule*; `docs/` holds the *how*; auto-memory shrinks to *pointers*
   plus genuine behavioral feedback.
3. **Keep model names** (opus / fable / sonnet) in the workflow section — operative every phase.
4. **`docs/INDEX.md` yes** — a short topic→file map, referenced by one line in CLAUDE.md.
5. **No `docs/workflow.md`** — the tightened inline workflow section is enough; don't fragment it.

---

## Bucket 1 — stays in CLAUDE.md (standing rules)

- Purpose (learning exercise, coach proactively, don't cheat off others' solutions)
- Workflow: 3 stages + model-per-stage + file-handoff principle
- Track `BACKLOG.md`
- Eng rule: Singularity out of hot paths
- Eng rule: log every purchase via `recordTransaction`
- Eng rule: test + validate against logs
- Git ownership + background-job exception
- Communication: summarize / flag deviations / verify-not-assume
- Off-limits: no source-diving, no spoiling progression, static-values carve-out
- Allowed sources (markdown/ first, GitHub OK)

## Bucket 2 — moves to docs/ (reference / how-to)

| Content (current CLAUDE.md line) | Destination |
|---|---|
| Three log-export patterns (ring-buffer / timestamped / daily-rotating), file naming, `vite.config.ts` filter, "money debugging starts here" (line 73) | `docs/logging.md` |
| Remote API auto-reconnect settings (5s, infinite retries) (69–72) | `docs/dev-server.md` |
| viteburner stale-connection restart workaround (from memory) | `docs/dev-server.md` |
| Transaction-logger call-site list (43–45) | fold to "see existing call sites" pointer |
| Singularity companion-script examples / full rationale (37–41) | compress to the rule inline |

---

## Proposed trimmed CLAUDE.md (~48 lines vs 86)

```markdown
# Purpose

Learning exercise, not a normal project: help the user **learn Claude Code** —
prompting, workflow, effective use — with **Bitburner** as the sandbox. Implement
what's asked (not hints-only). **Proactively coach** on Claude Code usage/prompting
as an ongoing relationship. Don't cheat by reading/adapting other players' Bitburner
solutions — work from game mechanics and the API.

## Development workflow
Feature work runs in three stages, each handing off a **file**, not chat:
1. **Brainstorm (opus)** → `phase-n-features.md` (decisions, rejected alternatives, open questions).
2. **Spec + review (fable)** → `phase-n-spec.md`, then a cold-context review by the
   `spec-reviewer` subagent; address blockers, log disagreements as open questions.
   Present final draft + changelog + open questions before implementing.
3. **Implement (sonnet)** on a branch/worktree, with the tests / RAM gate /
   `npm run verify:log` / live validation the spec calls for.

Conventions below apply at every stage (spec-reviewer enforces them). Commit phase
`*.md` docs alongside their code.

## Engineering conventions
- **Keep Singularity calls out of hot paths** — heavy RAM multiplier. Isolate in
  daemon-launched companion scripts `exec`'d by filename (like `purchasescripts.js`),
  never imported into `daemon.js`.
- **Log every purchase** via `recordTransaction` (`src/translog.js`) on success — see
  existing call sites. A failed spend records nothing.
- **Test + validate against logs** — vitest where practical, check exported logs, wire
  into `npm run verify:log`. For live-only behavior, do a live run and say so.
- **Prefer exported logs over pasted terminal output** (game copy/paste is lossy). If a
  result isn't logged, add an `ns.write(...)` export (+ `vite.config.ts` filter) instead
  of asking for a paste. → `docs/logging.md` for the file-naming patterns.

## Tracking work
Check `BACKLOG.md` before starting; keep it current (In Progress / Next Up / Ideas /
Done, dated on completion).

## Communication
- **Summarize after acting.**
- **Flag unplanned deviations** (extra changes, moved/deleted files, scope creep, a
  different approach) — don't fold them in silently.
- **Verify against the log files, not assumption**; if something needed isn't logged,
  ask whether to log it.

## Git
Full git ownership authorized (2026-07-04, Kenneth): branch off `master`, commit, push,
manage PRs, merge back — no need to ask in interactive sessions. **Exception:**
background/autonomous job sessions are blocked from pushing/merging to `master` by their
execution mode regardless of this file — prep the branch/PR and let Kenneth merge.

## Off-limits & sources
- Allowed sources: local game files, API docs in `markdown/` (**check first**), the
  official Bitburner GitHub repo.
- **Don't read game source to shortcut the puzzle** — docs/API fine, source-diving not.
- **Don't skip ahead or spoil progression** — help only with what's currently unlocked.
  **Carve-out:** static numbers/tables (costs, RAM, prices) are fine to look up.

## Task-specific detail
See `docs/INDEX.md` for on-demand references (logging patterns, dev-server / Remote API).
```

---

## docs/ plan

- **`docs/INDEX.md`** — topic→file map (logging, dev-server). One line in CLAUDE.md points here.
- **`docs/logging.md`** — the three export patterns:
  - ring-buffer daemon file overwritten in place (`daemon-batch-log.json`)
  - timestamped one-shot per run (`<name>-<epoch ms>.json`) so before/after runs don't clobber
  - daily-rotating (`transactions-YYYY-MM-DD.json`, from `src/translog.js`) — first stop for
    money debugging
  - `vite.config.ts` download-filter mechanics for adding a new exported file
- **`docs/dev-server.md`** — Remote API auto-reconnect (5s, infinite retries, enabled 2026-07-04);
  viteburner stale-connection pre-emptive restart workaround; `npm run dev` is Claude-owned.

## Memory consolidation (do as part of this refactor)

Once the docs exist, trim these memory files to one-line pointers so we don't keep a third copy:
- `reference_bitburner_log_export_pattern.md` → point at `docs/logging.md`
- `feedback_dev_server_restart_requires_manual_reconnect.md` → point at `docs/dev-server.md`
  (also **rename** — the filename now says the opposite of its content)
- `feedback_viteburner_stale_connection_workaround.md` → point at `docs/dev-server.md`

Behavioral-feedback memories (e.g. don't-auto-push, one-branch-at-a-time) stay as-is — they're
lessons, not reference material.

---

## Implementation checklist

- [ ] Create `docs/logging.md`, `docs/dev-server.md`, `docs/INDEX.md`
- [ ] Replace CLAUDE.md with the trimmed draft above
- [ ] Trim + rename the three memory files to pointers; update `MEMORY.md` index lines
- [ ] Sanity-check no standing rule was dropped in the process
