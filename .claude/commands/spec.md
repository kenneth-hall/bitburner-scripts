---
description: Run the spec + cold-review loop for a phase. Picks the latest phase features file (or one you name), drafts the spec, delegates a peer review to the spec-reviewer subagent, revises, and presents the draft for approval. Manual-invoke only.
argument-hint: "[phase-NN-slug.features.md] (optional — defaults to the highest phase)"
disable-model-invocation: true
---

Run stage 2 (Spec + review) of the Development workflow in `CLAUDE.md` for the target features
file (resolved in step 1). Do the whole loop, then stop before any implementation.

## 1. Resolve inputs

- **Features file.** If `$ARGUMENTS` is non-empty, use it as the features path (stop and ask if
  that file doesn't exist — don't guess). If `$ARGUMENTS` is empty, find every
  `phase-*.features.md` in the repo root (the active phase's docs live in root until they ship,
  then graduate to `docs/phases/`) and pick the one with the highest phase number `N` (numeric,
  so `phase-12` beats `phase-09`). State which file you picked and why before continuing. If none
  exist, stop and say so.
- **Spec file.** The chosen features path with the trailing `.features.md` replaced by `.spec.md`
  (e.g. `phase-15-homeram.features.md` → `phase-15-homeram.spec.md`). If a spec file at that path
  already exists, say so and confirm before overwriting.

## 2. Read before drafting

Read in full: the features file, and `CLAUDE.md` (engineering conventions the spec must honor).
Read the most recent existing `*-spec.md` in the repo as a structural template, and skim
`BACKLOG.md` for where this phase sits. Do not re-derive conventions the features file or
`CLAUDE.md` already settle.

## 3. Clarify or proceed

Before writing anything, decide whether you're fully aligned on the features file. If any
direction is genuinely ambiguous or you see an improvement worth raising, ask Kenneth for
clarification or suggest the improvement first. If you feel completely aligned, skip the questions
and go straight to drafting — don't manufacture questions for their own sake.

## 4. Draft the spec

Write the spec to the derived path, matching the house structure of prior specs (Context; Ground
rules; Spec-stage decisions resolved here; Design broken into work items; Acceptance criteria;
Files touched). Requirements:

- Resolve every decision the features file explicitly delegated to the spec stage, each as
  decided-with-rationale (not left open). You may decide ambiguous directions yourself; flag only
  what stays genuinely underspecified as an open question rather than inventing an answer.
- Mark each step **[code]** (the implementer does it) or **[live]** (Kenneth does it in-game); no
  **[live]** step should require editing code.
- Every acceptance criterion must be checkable by a test, `npm run verify:log`, a RAM gate, or a
  described live run. If you can't state how it's verified, it isn't an acceptance criterion.
- Honor `CLAUDE.md`'s standing conventions (Singularity RAM isolation, transaction logging for any
  spend, tests + log validation, no spoilers/community solutions, identifier hygiene). Don't
  restate them at length — the reviewer checks them — but the design must comply.

## 5. Delegate the cold review

Invoke the **spec-reviewer** subagent via the Task tool (`subagent_type: spec-reviewer`), passing
the spec file path and the features file path as its requirements. It runs cold on purpose — give
it paths, not a summary of your reasoning. It retur