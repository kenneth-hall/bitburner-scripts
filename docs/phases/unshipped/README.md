# Unshipped phase brainstorms

Stage-1 (`.features.md`) brainstorms that **never became phases** — no spec was written, no code
shipped. They live here rather than in the repo root so the root only ever shows *active* phase
work, and rather than in `docs/phases/` proper so they are not mistaken for completed phases.

**Nothing in this folder is a commitment, a plan, or a record of shipped work.** Read them as
"someone thought about this once, and here is how far they got."

⚠️ **Their phase numbers are not authoritative.** `phase-26-audit` here collides with the *shipped*
`phase-26-ratchet-autonomy` in the parent folder — the number was claimed twice because this one
never made it to a spec. Numbers are not renumbered on the way in: doing so would burn a live phase
number on a dead document. **When starting a real phase, take the next free number from
`docs/phases/`, ignoring this folder entirely.**

| doc | raised | why it stalled |
|---|---|---|
| `phase-19-contracts.features.md` | 2026-07-09 | Mid-brainstorm capture; its own header says **"NOTHING IS DECIDED."** Coding-contract solving was never scheduled against a goal. |
| `phase-26-audit.features.md` | 2026-07-15 window | Repo-wide docs audit + archive convention. Scope was decided (Documents only); the archive mechanics and report-vs-fix policy were left open and never closed. ⚠️ Number collides — see above. |
| `phase-30-gang-territory.features.md` | 2026-07-21 | Gang territory warfare. **Overtaken by events** — its three deferral grounds were later measured wrong (see CHANGELOG's Phase 30 entries), and gangs closed out entirely with BN2 on 2026-07-23. One slice survived and shipped as `src/gangratelog.js`. |

**To revive one:** move it back to the repo root, renumber it to the next free number, and start at
stage 1 of the workflow in `CLAUDE.md` — do not spec straight off these files. Gang history lives in
[`docs/gang-engine.md`](../../gang-engine.md); read that before reviving `phase-30`.
