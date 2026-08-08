# Phase 26 features: Documents audit + archive convention (brainstorm)

**Stage:** Stage 1 (brainstorm) of the three-stage workflow in `CLAUDE.md`. No spec exists yet.
The spec stage turns this into `phase-26-audit.spec.md` and delegates a cold-context
`spec-reviewer` pass before any doc is touched.

**Status:** Scope is **decided** (Documents only — see below). The rubric shape and several design
principles are **leaned/decided**. The archive mechanics and the report-first/fix-direct policy are
**open questions** for the next session. This file is written to be resumable — pick up at "Open
questions" and the spec can be drafted once those close.

---

## Why this phase was raised

Kenneth wants a housekeeping audit of the repo's code / comments / documents — history cleaned up,
with an **archive section and a reference back to it**. Initial framing was "audit and make
everything good," which we rejected as an un-specifiable goal (see "Rejected framings").

This was raised at a natural housekeeping window: **BN1.2 cleared 2026-07-15, now clearing BN1.3**
(no active batcher pressure — a good time for low-risk cleanup, a bad time to rework hot-path code).

### Origin exemplar (the finding that proved the phase)

While scoping this, Kenneth noted the goal had changed to clearing BN1.3, and that CLAUDE.md carried
**conflicting direction**. It did: the "Current goal" block said *"BN1.2 CLEARED… Why 1.2 and stop
there (not 1.3)… next extending node is BN5."* That's a **living doc giving actively-wrong
direction** — the highest-value finding class this audit exists to catch. It was fixed on sight
(commit `771677e`: retarget goal to BN1.3, mark the BN5/1.2 reasoning `[SUPERSEDED]` + Phase-26
input). The same stale direction still lives in **`docs/bitnodes.md`** (the "next-node plan" section)
— left for this phase deliberately, since rewriting a whole plan section is audit-with-rubric work,
not an ad-hoc sweep.

**What the exemplar taught:** the audit has two severity classes, not one (see rubric). "Make
everything good" flattens them — it would spend equal energy trimming a changelog and fixing a live
contradiction. The rubric must separate them.

## Goal

Produce a **triaged findings report** over the repo's Markdown/docs, then apply the approved fixes,
under a rubric that separates *wrong* direction from mere *bloat*. Ship an **archive convention**
(where superseded material goes, how it's pointed back to, and a **retention rule** that stops
re-accretion) so this isn't repeated at Phase 40.

Explicitly **behavior-preserving for the game** — this touches no `src/` runtime code. Ship gate is
therefore **docs-only** (commit/merge freely) *except* where a finding proposes editing CLAUDE.md
(see "CLAUDE.md is handled separately").

## Scope — decided

**Documents only.** One of {code, comments, documents}, not all three.

- **Why one, not three:** three audits with different risk profiles and ship gates. Bundling couples
  the fast docs work to the slow code gate (tests + RAM + live daemon run). At a resting point
  between nodes, only the docs audit has both value-now and a fast gate.
- **Why documents specifically:** it's what Kenneth asked for (history + archive), lowest risk
  (docs-only gate, no live-game wait), and has concrete targets already in hand.
- **Code audit — deferred** to its own later phase, run when we're actively in a node and a
  regression would actually bite. (Precedent: the 2026-07-06 Fable code audit → Phase 16 cleanup.)
- **Comment audit — deferred and folded into the code audit.** Rejected as a standalone: verifying
  comment-vs-code drift requires reading the code, so it bleeds into code scope immediately.

## The rubric (leaned — refine in spec)

What Fable gets *instead of* "make everything good": categories + two severity tiers + an explicit
out-of-scope list. The deliverable of the find pass is this report, not edits.

**Finding categories:**
- **Contradiction** — a doc gives active direction that conflicts with current reality or another
  doc (the BN5-vs-1.3 case).
- **Staleness** — content that was true once and no longer is, but isn't steering anything now.
- **Orphan** — a doc in the wrong place / never graduated (loose `phase-19-contracts.features.md`
  in repo root).
- **Broken pointer** — a cross-reference (`docs/…`, `[[memory]]`, phase-doc filename) that no longer
  resolves.
- **Duplication across docs** — the same fact maintained in two places that can drift apart.

**Severity tiers (the key output of the origin exemplar):**
- **High — contradiction / wrong live direction.** Actively misleads the next session. Fix on sight.
- **Low — staleness / bloat / orphan.** Archive or tidy; no urgency, no risk.

**Out of scope (explicit — Fable must not touch):**
- Any `src/` runtime code, comments in code, tests.
- CLAUDE.md bulk edits (proposal-only — see below).
- `docs/phases/CHANGELOG.md` *history* entries — a changelog is a dated record; "we planned BN5 back
  then" being in history is **correct**, not stale. (Its *length* is not a defect.)
- `docs/metareference/` PDFs (external learning material, not our prose).

## Seed findings (already in hand — Fable starts here, not from zero)

- **[High]** `docs/bitnodes.md` "Our next-node plan (mature batcher)" contradicts clearing BN1.3.
- **[Low/Orphan]** `phase-19-contracts.features.md` loose in repo root — never graduated to
  `docs/phases/` (a mid-brainstorm capture from 2026-07-09, self-marked "NOTHING IS DECIDED").
- **[Low/Bloat]** CLAUDE.md historical asides embedded in living instructions (dated "Historical
  note…" fragments) — archive candidates, but CLAUDE.md is proposal-only.
- **(Search seed, not yet triaged)** grep for the same stale direction found 3 files:
  CLAUDE.md (fixed), `docs/bitnodes.md` (high, above), CHANGELOG.md (out of scope — history).

## Design decisions — leaned

- **Report-first, then fix.** The find pass produces the triaged report; Kenneth triages; a fix pass
  applies only approved items. Keeps every diff reviewable against an agreed list. (Precedent: the
  2026-07-06 audit parked findings in BACKLOG's "Fable discoveries," Phase 16 applied them.)
- **CLAUDE.md is handled separately.** It's the instruction file — trimming the wrong line silently
  changes Claude's behavior. Findings *about* CLAUDE.md are a line-by-line **proposal list Kenneth
  approves**, never a bulk sweep, even for low-severity bloat.
- **This features doc's own graduation** is a live test of the archive convention: on ship it moves
  to `docs/phases/` with the others.

## Open questions (resume here)

1. **Archive mechanics — the core unresolved design.**
   - *Where does superseded material go?* Candidates: `docs/phases/archive/` dir · a dated
     "Archive" section appended to the relevant living doc · a single `docs/ARCHIVE.md`.
   - *What does the pointer back look like?* (Kenneth's "reference to there.") A one-line stub where
     the content used to be? An index entry?
   - *The retention rule* — the part that stops re-accretion. E.g. "living docs carry no dated
     historical note older than N; on supersession it moves to the archive with a stub." Without
     this the phase is cosmetic and recurs.

2. **Report-first vs. fix-direct granularity.** Lean: fix-direct for Low severity, report-first for
   High + anything touching CLAUDE.md. Confirm, or make it uniformly report-first?

3. **Is the fix pass in *this* phase or a Phase 27?** (Phase 16 split find/fix across phases; here
   the doc corpus is small enough that one phase may hold both.)

4. **Reusable rubric vs. one-shot sweep?** A re-runnable audit prompt/checklist is more valuable
   (and a nicer Claude Code lesson) than a one-time pass, but costs more to author. Worth it?

5. **Corpus boundary.** Just `docs/**` + root `*.md` + BACKLOG.md? Include `markdown/` (the API
   reference — likely out of scope, it's upstream-generated) and `tools/bb/README.md`?

## Rejected framings

- **"Audit and make everything good"** — no definition of done (neither Fable nor the cold reviewer
  can tell when it's complete or whether a change was in scope); conflates *finding* with *fixing*
  into one unbounded, unreviewable diff. Replaced by rubric + report-first.
- **All three audits (code + comments + documents) in one phase** — couples the fast docs work to the
  slow code ship gate; wrong moment for code rework (parked between nodes). Split.
- **Standalone comment audit** — can't verify comment drift without reading code; folds into the code
  audit.
