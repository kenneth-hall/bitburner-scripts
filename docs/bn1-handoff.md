# BN1 handoff — finishing BitNode 1

**Start here to resume the endgame.** Consolidates the live state, the verified mechanics, and
the locked sequence. Full click-by-click is [endgame-runbook.md](endgame-runbook.md); mechanics +
numbers are [reputation-favor.md](reputation-favor.md); reasoning trail is `BACKLOG.md`.

## Status — 2026-07-11 (mid-sequence)

**Install #1 is DONE; rebuilding money for the donation.** The 2500 gate is long cleared; Daedalus
is joined; install #1 (the 2 queued minor-exp augs) banked ~160 favor → **donation permanently
unlocked**. That install reset hacking + money + fleet (expected).

Live snapshot at handoff:
- **Hacking ~1,840** — re-climbing from the install-#1 reset; *will be reset again by install #2*, so
  this climb is just a side effect of the batcher earning money. Not the final climb.
- **Money ~$51b and rising** — rebuilding toward the **~$1t** we need (donation + 3 ENM augs + NFG).
  This is the current critical-path wait (~1–3 h of batcher time).
- **Daedalus: rep 0, favor ~160** (donation unlocked). *Visually confirm the Donate section on the
  Daedalus → Details page — CDP nav was timing out at handoff, so this rests on the math, not a read.*
- **Fleet rebuilding** (~28% util). Share is running but `sharePower` reads 1 (no faction work active →
  no boost; harmless, uses idle RAM).

## The goal

Finish BN1: get Daedalus to **2.5m rep → buy The Red Pill → install → re-climb hacking to 3000 →
manual `backdoor` of `w0r1d_d43m0n`**. No Singularity (0 Source-Files) — every faction/donate/buy/
install/backdoor action is **manual UI**; the daemon only earns money + XP and runs `ns.share()`.

## Verified facts — do NOT re-derive or re-assume

- **Money RESETS on install (~$1k)** — along with hacking + fleet. The accumulated pile is NOT
  donatable; donation is funded by money earned *after* the favor-unlocking install. (This corrected a
  mid-session planning error — see [[reference_install_resets_money]].)
- **Donation unlocks at 150 favor** — VERIFIED live on the Daedalus page ("Unlock donations at
  150.000 favor"). Favor persists across installs; only money is transient.
- **`w0r1d_d43m0n` needs hacking 3000** (standard BN1 = 3000×WorldDaemonDifficulty; not queryable until
  Red Pill spawns it, so live-unconfirmable until then).
- **All unowned augs are in Daedalus** — every other faction (joined or joinable) reads "No
  Augmentations left." Daedalus's 7: 3 Embedded Netburner Module hacking-mult upgrades (Analyze Engine
  625k rep, DMA 1.0m, Core V3 1.75m; ~$74b total), 3 combat/defense augs (skip — irrelevant), and The
  Red Pill (2.5m rep, $0). Plus repeatable NeuroFlux.
- **Raising mult is essential; raw XP can't finish** — re-climbing 2,627→3000 at mult 4.72 needs ~218B
  exp (infeasible). Mult ~7 → ~330M exp (~30–60 min).
- **NFG is MONEY-capped, not rep-capped** — ~1.9×/aug price escalation caps it at ~17–18 levels/install
  even with a huge bankroll; realistic post-install mult **~6–7**, re-climb ~30 min–few hours.
- **Grafting is out** — not available in this build's BN1, and wouldn't help anyway
  ([grafting.md](grafting.md)).

## The locked sequence (▶ = current position)

1. ✅ Grind Daedalus ≥462.5k rep (150-favor floor). *Done — overshot to 619.9k.*
2. ✅ Install #1 (2 queued augs) → banked ~160 favor, donation unlocked.
3. ▶ **Rebuild fleet + earn ~$1t** (batcher running now; ~$51b so far). ← we are here
4. **Donate → 2.5m+ rep** (cost ~$0.5–1.5t; favor discounts it — read the Donate UI).
5. **Buy**, most-expensive-base first: 3 ENM augs → NeuroFlux to the money cap → Red Pill ($0).
6. **Install #2** → applies the stack (hacking + money reset again; mult now ~6–7).
7. **Restart bootstrap/daemon** ([reset-protocol.md](reset-protocol.md)), rebuild fleet, **re-climb to
   3000**. Turn share OFF here (`share-off.txt` on home) — no faction work, no boost.
8. **`backdoor` `w0r1d_d43m0n`** — walk the network to it (not connected to home), run the terminal
   `backdoor` command. Completes BN1.

## Open risks / where it could stretch

- **Re-climb duration is mult-dependent and stock-assumed.** If NFG/ENM per-level effects are weaker
  here, the re-climb is longer. **Sideline:** if install #2's mult lands < ~5.5–6, reaching 3000 is
  impractical this cycle — NFG-across-multiple-installs is the only lever left (all other augs
  exhausted). Recoverable, just multi-cycle. Read `mults.hacking` via `run auginfo.js` right after
  install #2 to know which case you're in.
- **Completion mechanic assumed standard** (Red Pill spawns the server; hacking-3000 manual backdoor
  finishes BN1). Unconfirmed until there; `destroyw0r1dd43m0n` exists in the API docs, so the concept
  is real.
- **Donation cost is estimated, not read** — confirm the actual rate in the Donate UI before committing
  a number.
- **CDP nav flaky while the batcher is busy** — `stats`/`body`/`read-terminal` reads work; `goto`/
  `click` time out. Retry when fleet activity settles, or drive the UI by hand.

## Pointers

- [endgame-runbook.md](endgame-runbook.md) — click-by-click for steps 4–8.
- [reputation-favor.md](reputation-favor.md) — rep/favor/donation mechanics + measured numbers.
- [grafting.md](grafting.md) — why grafting is ruled out.
- `BACKLOG.md` ("Grind 2.5m Daedalus rep" item) — full reasoning trail incl. the corrections.
- Memories: [[reference_install_resets_money]], [[project_daedalus_donation_shortcut]],
  [[reference_share_boost_needs_faction_work]].

## Honesty note

Mid-session I asserted "money isn't a constraint" and built the plan around donating the accumulated
pile — wrong; money resets on install. The plan survived (favor unlock is permanent; donation is just
funded by post-install earnings), but it added the money-rebuild wait now in progress. Flagging so the
next session trusts the corrected mechanics above, not any older "donate your $1.7q" framing.
