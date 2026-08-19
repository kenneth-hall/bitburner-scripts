# Phase 42 — Field Analysis: let the engine repair its own intelligence

**Stage 1 (brainstorm). Decisions, rejected alternatives, open questions. No spec yet.**

---

## 1. Why now — the BN6 backstop is DISARMED in BN10

`Field Analysis` has been a known gap since 2026-08-13. It stayed parked because BN6 shipped a
different fix — **S-RF**, the realised-evidence floor, which lets a *proven* action ignore the
estimator. That was enough in BN6. **It is not enough here, and the reason is one constant:**

| | BN6 Tracking | BN10 Tracking |
|---|---|---|
| realised success | **100%** | **80%** |
| `REALISED_FLOOR_MIN_SUCCESS` | 0.9 | 0.9 |
| **S-RF protects it?** | ✅ yes | 🔴 **no** |

S-RF requires **≥90%** realised success (`bladeburnermanager.js:495`). At 80%, BN10's Tracking
does not qualify, so selection falls back to the raw estimator — which currently reads
**`pMin` 0.0016 against 80% realised**, wrong by ~500×.

🔴 **This is a live run-killer, not a latent one.** `pickRankAction` drops any candidate scoring
`<= 0` (`bladeburnermanager.js:460`). Tracking's current score is **4.95e-05**. When `pMin` reaches
0 — and nothing in the engine stops it decaying — **Tracking leaves the pool entirely** and the
engine is left running `Retirement` and healing. This is the exact failure BN6 projected at
"~L145.5" and dodged only because S-RF caught it.

📌 **The lesson worth stating plainly: a backstop with a quality gate protects the strong and
abandons the weak, and the weak case is the one that needs it.** S-RF was specified when the only
action anyone cared about ran at 100%.

---

## 2. What Field Analysis is (all measured, none of it new work)

From `src/fieldanalysisprobe.js` / `logs/fieldanalysisprobe-*.json`, 2026-08-13:

- Restores `pMin` at **+0.684/hour**, monotonic over 8 minutes, **zero reversals**.
- City chaos stayed **pinned at 274.8** throughout ⇒ it rebuilds the *population estimate*; it is
  **not** a chaos lever. (Do not conflate it with `Diplomacy`.)
- Decay is **0.158/day**, so steady state costs **~14 min/day (~1% of wall time)**.
- A full 0.25 → 0.89 restore takes **~1 hour**.

⚠️ **It restores PRECISION, not ACCURACY.** It raises *every* action's estimate, including
worthless ones — in the measured run `Investigation` gained *more* `pMin` than `Tracking`. It only
nets out because `Tracking`'s `rankGain` is ~50× larger. **It does not make the estimator
trustworthy**, so it is a complement to S-RF, never a replacement.

---

## 3. Decisions

### D1 — Trigger on the SPREAD, not on `pMin`. ✅ decided

`[pMin, pMax]` must be read as a **pair** (standing rule, `bn6-go-no-go.md`): a **widening** range
is an intelligence problem, a **falling `pMax`** is a real decline. Triggering on low `pMin` alone
cannot tell those apart and would fire Field Analysis at a genuinely dying action, wasting the slot
forever.

BN10 today: `pMin` **0.0016**, `pMax` **0.659** ⇒ spread **0.657** against a realised **80%** that
sits near the top of the range. Textbook lost intel.

**Rejected:** trigger on `pMin < k`. It is the number the engine already acts on, and using it as
its own repair signal is circular.

### D2 — Field Analysis is OVERHEAD, ranked below recovery, above chaos. ✅ decided

It belongs in `pickOverheadAction`, under the HP floor and stamina-recovery branches (those are
danger, this is optimisation) and **above** `Diplomacy` — because a bad estimate can remove the
best action from the pool outright, whereas chaos only degrades rolls.

**Rejected:** making it a rank action. It produces no rank; scoring it against contracts would
require a fake yield and would corrupt the crossover checkpoints.

### D3 — Budgeted, target-seeking, and it must stop on its own. ✅ decided

Same shape as the `Diplomacy` branch: run until the spread is back under target, with a hard duty
budget so it can never eat the run if it proves weaker here than in BN6. Measured steady-state cost
is ~1% of wall time; the budget exists for the case where that measurement does not transfer.

### D4 — Ship in SHADOW first. ✅ decided

Phase 40's standing lesson, twice earned: WI1's instrument and WI2's governor were both proven
broken **in production, on real data, at zero risk** by shadow mode. This phase changes action
selection on the critical path. It logs what it *would* run before it runs anything.

---

## 4. Open questions — these need Kenneth, or need the sweep

- **Q42-1 — the spread threshold and the target.** Fire above what spread, stop below what? No
  measurement supports a number yet. ⚠️ **Do not pick one by analogy to `CHAOS_TARGET`** — that is
  precisely the "tuned off a reconstructed curve" error Phase 40 died of.
- **Q42-2 — does `tracksweep.js` change the answer?** The sweep (running, ~6h) reports realised
  success per level. If success turns out to be **level-insensitive** here, the right fix may be to
  floor Tracking's level and lift it over the 90% S-RF gate — which would **make Field Analysis
  unnecessary** rather than needed. **This phase should not be specced until the sweep lands.**
- **Q42-3 — should `REALISED_FLOOR_MIN_SUCCESS` (0.9) be lowered instead?** Strictly smaller than
  this phase: one constant, and it re-arms the existing backstop for 80% actions. ⚠️ It also
  weakens the guarantee that made S-RF safe ("never promotes an unproven action"). Possibly a
  cheaper answer to the same problem — **cost it before building D1–D4.**

---

## 5. Explicitly NOT in scope

- Fixing the estimator. It is a game function; we do not get to change it.
- Anything about `Diplomacy` or chaos. Different lever, different mechanism, separately measured.
- The `objectiveMode` per-second/per-action axis. Orthogonal, and documented as not the fix.
