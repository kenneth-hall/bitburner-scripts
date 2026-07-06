# Session handoff — cold review, context bias & doc cleanup

**Date:** 2026-07-05
**Branch:** `master` (all work committed and pushed; tree clean)
**Nature:** documentation + learning-artifact work only — no game/script code touched, nothing to validate in-game.

This session was a Claude-Code *learning* session (per CLAUDE.md's purpose), not Bitburner
feature work. It produced one durable teaching artifact and did two small doc-hygiene fixes.
Everything below is already merged into `master`.

---

## What changed

### 1. Removed a stale planning doc — `claudemd-refactor-notes.md`
- **Commit:** `ebbcb11` *Remove stale claudemd-refactor-notes.md*
- **What:** deleted the "CLAUDE.md refactor — handoff notes" file from the repo root.
- **Why:** it was completed-and-superseded. Every checklist item in it had already shipped
  (`docs/INDEX.md`, `docs/logging.md`, `docs/dev-server.md`, the memory-file trim, and the
  CLAUDE.md trim itself). Worse, the CLAUDE.md *draft embedded inside it* was older than the
  live CLAUDE.md — it used the pre-convention `phase-n-features.md` naming and lacked both the
  ship-gate and the docs-layout section. Keeping it around invited someone to "resume" a plan
  that was done, from a stale copy. Rationale is preserved in git history; no information lost.
- **Method note:** verified all its targets existed *before* deleting — "look at the target
  before you delete it," not delete-on-description.

### 2. Left `phase-13-consolidation.features.md` in the repo root (deliberately *not* moved)
- **Commit:** none — this is a *non-change*, recorded here so it doesn't look like an oversight.
- **What happened:** I was asked to move it into `docs/phases/` alongside the others. I flagged
  that this conflicts with the convention `docs/phases/README.md` states: **`docs/phases/` is for
  SHIPPED phases only; active/unshipped phase docs stay in the repo root.** Phase 13
  (consistency consolidation → `src/common.js`) is still a brainstorm, unshipped.
- **Resolution:** user agreed — "keep it where it is." It graduates to `docs/phases/` when it ships.
- **Why this is in the handoff:** so the next session doesn't "tidy" it into `docs/phases/` and
  silently break the shipped-only invariant.

### 3. Added a two-part teaching artifact on cold review & context bias
- **Commits:** `134baa0` (original) and `2be3f50` (fable rewrite).
- **Files:**
  - `docs/metareference/cold-review-context-bias.pdf` — my original one-pager (opus, written
    **in-session**). **Contains a known error** (see below). Kept on purpose.
  - `docs/metareference/cold-review-context-bias-fable.pdf` — a corrected rewrite by a fresh
    **fable** subagent with cold context. One page, black-and-white.
- **Why keep both:** the pair *is* the lesson. It's a before/after of the exact workflow the
  document describes:
  1. I drafted it warm, inside the long session.
  2. A cold `general-purpose` subagent critiqued it and caught a **load-bearing factual error** —
     my claim that bias is "near-zero on anything verifiable." It isn't: sycophancy corrupts
     checkable work too (SycEval, ~14.7% regressive; BrokenMath). Bias is near-zero only where
     an automated oracle *actually runs on the output*, not merely where ground truth exists.
  3. A fresh **fable** agent (different model, cold context) rewrote it — fixing my error and
     even sharpening the critic's framing.
  The warm author (me) shipped a confident error; the cold, differently-weighted reviewers caught
  it. That's the thesis demonstrating itself. The original is retained as the "before" — do not
  delete it to "fix" the error; the error is the exhibit.

---

## Source files (scratchpad, not committed)
The HTML sources and the Edge headless PDF pipeline live in the session scratchpad
(`scratchpad/cold-review.html`, `scratchpad/cold-review-fable.html`). Only the rendered PDFs
were committed. Render command (Git Bash):
```
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" --headless=new --disable-gpu \
  --no-pdf-header-footer --user-data-dir="$SRC/edge-profile" \
  --print-to-pdf="$OUT/<name>.pdf" "$SRC/<name>.html"
```
Page-count check: `python -c "import re; print(len(re.findall(rb'/Type\s*/Page[^s]', open(PATH,'rb').read())))"`.
`.gitattributes` marks `*.pdf binary` so autocrlf doesn't corrupt them.

## Resumable agents (if the thread is picked back up)
- Cold critic (`general-purpose`): `ac4bf068aca152f0a`
- Fable author (`aec71f19d42bef4bf`)

## State at handoff
- `master` in sync with origin, working tree clean.
- No Bitburner code changed → nothing in `npm test` / RAM gate / `verify:log` is affected.
- **Next actual dev step, when chosen:** `/spec` on phase 13 (consolidation). Not started, not
  requested yet — do not begin without explicit instruction.
