> **⚠️ ARCHIVED 2026-07-22 — superseded by [`docs/gang-engine.md`](../gang-engine.md) (§4,
> "Economics — the money arithmetic", and §2's decision log). Kept here verbatim for history.**

# BN2.1 gang-type analysis: hacking vs combat (cold-context, 2026-07-21)

## Determination

**Keep the hacking gang. Do not restart for a combat gang.** Confidence ~85%.

**Strongest objection to this call:** combat-gang task economics are unreadable in this fork
without creating one (`getTaskNames()` only returns your own gang type's menu), so the claim
"combat money wouldn't be transformative" rests on scaling our measured numbers, not on a direct
read. If combat base-task money (Human Trafficking / Terrorism) were, say, 50× Money Laundering
rather than the ~1–3× I assume, a mature combat gang at high territory could compress the one
genuinely expensive purchase (QLink, $25t) from weeks to days. I judge this unlikely (the
measured ~20× territory multiplier is the mechanism the combat case is built on, and it applies
to a money stream we've measured at $0.4–1m/s scale), but it is the load-bearing unknown.

---

## The finding that dissolves the A-vs-B contest

Both framings were built on a **stale, pre-gang measurement**. The catalog sweep re-run
**after** `createGang()` (`logs/gangaugs-1784565947624.json`, ts 2026-07-20T16:45Z — gang
created 2026-07-19) shows:

| Faction | augs | hacking mult | note |
|---|---|---|---|
| **NiteSec (our gang faction)** | **98** | **×22.892** | was 11 augs / ×1.515 pre-gang |
| The Black Hand (rival gang) | 11 | ×1.511 | unchanged — expansion is *your* gang's faction only |
| pure-criminal factions | 7–18 | ×1.010–1.061 | unchanged |

Creating the gang expanded NiteSec's shop to essentially the entire game catalog
(union across all 17 non-gang factions = ×23.121; NiteSec alone now carries ×22.892 of it),
**including The Red Pill (rep 2.5m, price $0)**. The vanilla "your gang faction sells nearly
everything" mechanic is live in this fork. CLAUDE.md's "the catalog was never going to reach
~25 from gang factions" and "its value is the money/rep engine, not the augs it sells" were
both derived from the pre-gang ×1.515 reading and are **obsolete**.

**Resolution of the crux:**
- **Framing A (gang faction augs) was understated ~15×, and is now the dominant truth** — the
  gang faction *is* the aug vendor for the whole node, megacorp tier included. But this is
  **gang-type-independent**: a combat gang's faction would get the same expansion. So A, correctly
  measured, doesn't discriminate between gang types either.
- **Framing B (money/rep engine) had the role right but the topology wrong.** There is no
  "$25t across 17 factions with 17 rep grinds" problem. There is ONE faction, ONE rep track —
  and that rep track is **already saturated**: max rep requirement in the entire 98-aug catalog
  is 2.5m (The Red Pill and QLink at 1.88m are the peaks), while the gang holds 18.3m banked
  respect with faction rep accruing off a respectGainRate that overshot the Phase 29 goal ~425×.
  Rep — the thing BN2's 50%-work-rep / 0%-passive-rep nerfs attack — is a solved problem.
- **What remains is money, and only money.** The gang-type question reduces to: does a combat
  gang's territory-multiplied income shorten the money timeline enough to pay for a full restart?

## The money arithmetic (the whole remaining game)

From the same sweep, the catalog splits into three tiers:

| Purchase | price | hacking mult | verdict |
|---|---|---|---|
| 96 discrete augs (everything except QLink & Hydroflame) | **$149b** | **×13.08** | trivially affordable NOW-ish ($16b held day 3; augfarmer already reserving $49b for one aug) |
| Hydroflame Left Arm | $2.5t | ×1.00 (no hacking) | skip — irrelevant to the gate |
| QLink | **$25t** | ×1.75 | the only expensive decision, and it's optional |

Target: M ≈ 30–35 (`docs/bitnodes.md`, gate 15,000 at realistic XP budgets).

- **No-QLink path:** ×13.08 discrete × SF1.3 (×1.28) ≈ **16.7**, needing an NFG tail of
  ×1.8–2.1 ≈ **~50–65 NFG levels**. BN1 demonstrated NFG 67 in its final cycle; BN2's 8%
  economy makes the escalating NFG ladder the real cost here — order $1t-ish cumulative,
  paid late when income is highest. Also note the catalog carries **hacking_exp ×15.47**,
  which the M≈30–35 table already prices in as "realistic XP budget."
- **QLink path:** ×22.89 × 1.28 ≈ **29.3**, needing only ~5–15 NFG levels. Costs $25t.

Either way the node is cleared by: batcher + gang money → $149b core catalog (days) →
compounding install cycles via the existing aug-ratchet → then EITHER a deep NFG grind OR
QLink, funded by an economy where M has already climbed to ~17. The choice between those two
tails is made **weeks from now at peak income**, and does not depend on gang type.

## The combat-gang case, taken seriously and rejected

Steel-manned: territory multiplies gang respect AND money ~20× (measured,
`logs/gangreward-*.json`: 0.06× at 0% → 19.9× at 100%); power is 80% combat-weighted, so only
a combat build can win territory; a fresh restart resets all seven gangs to even footing
(no 9,442-power Black Hand wall); we're 3 days into the node with 0 augs installed this cycle,
and CLAUDE.md itself prices restarts as cheap when the node holds no progress.

Why it still loses:

1. **The 20× lands on the wrong axis.** Respect ×20 is worthless — rep is 425× over-saturated
   already, and the entire catalog tops out at 2.5m rep. Money ×20 applies to a gang stream
   measured at **$425k/s** (live `gang-state.json`; peaked ~$1m/s). Twenty times our own
   stream is ~$8.5m/s. Even granting combat base tasks 2–3× better money at equal member
   development, that's $10–25m/s — the same order as what the batcher already produces and
   **below** it per Phase 30's own verdict ("×20 ≈ $20m/s… below the batcher"). Against the
   only expensive item ($25t QLink), $20m/s of *marginal* income saves order-of-weeks at best —
   and QLink is skippable.
2. **The restart isn't free — it forfeits a rep-complete gang.** Current state: 12 members,
   hack 20–34k, ascension mults to 3.2×, 18.3m respect, all rep requirements met including
   The Red Pill's. A combat gang rebuilds from 3 members at stat 1, must earn 2.5m+ rep-worth
   of respect again, must *additionally* run the territory war (power building with the engine
   partially offline, members dying in clashes with no API-readable death probability, six
   rivals contesting from even footing — even footing means everyone starts climbing, not that
   we win), before its 20× exists at all. Weeks of build to reach the state where the marginal
   income even starts. Meanwhile the current path spends those same weeks compounding installs.
3. **The catalog gain is exactly zero.** The expansion is type-independent; both gang types
   deliver the same 98 augs and the same free Red Pill. Nothing about the *win condition*
   improves.
4. **The batcher compounds; gang income is the sideshow either way.** Money for the tail
   arrives after the $149b core catalog installs (M ≈ 17, hack money ×40.8 and exp ×15.5
   catalog mults available). BN1's batcher at M≈6.5 funded $1.5t+ per cycle; BN2's 8% economy
   cuts ~12× but the mult stack more than recovers it late. The honest statement is: **gang
   type is close to immaterial for money** — the batcher dominates the money curve in both
   worlds; the gang's irreplaceable contributions (catalog expansion + nerf-proof rep + free
   Red Pill) are delivered identically by both types.

## Rough timelines

- **Stay (hacking gang):** $149b core catalog affordable within ~days at current income;
  ratchet installs compound M toward ~17; NFG tail or QLink funded over the following weeks at
  peak income. **Order 3–6 weeks to M≈30+**, mostly unattended (consistent with the standing
  "plausible, 4–10 weeks" verdict, now at the fast end because rep and catalog-access risks
  are retired).
- **Restart (combat gang):** ~2–4 days re-bootstrap (fleet, hacking 409, gang re-creation,
  batcher) + ~2–4 weeks combat build/ascension + territory war to high territory + the same
  $149b core catalog + the same QLink/NFG tail decision, with marginal gang income perhaps
  $10–25m/s higher at maturity. **Order 5–9 weeks**, with new death-risk and war-management
  surface. Slower in expectation, strictly more variance.

## Cost of being wrong

- **If staying is wrong** (combat money is secretly enormous): we discover it when the QLink
  decision arrives with income stalling — at which point a restart is still available, just
  more expensive than today. Bounded loss: the weeks until that signal.
- **If restarting is wrong** (combat money is ordinary, or the war grinds): we burned a
  rep-complete gang, $16b, hacking 409, 7 queued augs, and weeks of compounding for an income
  stream the batcher matches — and re-face identical catalog economics. Loss is larger and
  certain-ish.
Asymmetry favors staying.

## What would change the answer

1. **Direct evidence combat task money is ≥10× hacking task money in this fork** at equal
   development (only obtainable by creating one — i.e., only via the restart itself, or from
   authoritative fork docs). This is the sole path back to combat.
2. **The rep-tracks-rate mechanic failing to deliver 2.5m NiteSec faction rep** (verify with a
   one-line faction-rep read; if rep were somehow capped below 2.5m, the whole picture reopens).
3. **The 15,000 gate inference being wrong upward** (read
   `getServerRequiredHackingLevel("w0r1d_d43m0n")` the moment Red Pill installs — standing
   checkpoint). A 30,000-class gate would force QLink AND deep NFG, re-weighting money enough
   to re-hear the combat case.
4. **The batcher failing to scale in the 8% economy** after the core catalog installs — if
   post-catalog income plateaus below ~$5m/s, gang money stops being a sideshow.

## Immediate implications (no action taken; read-only analysis)

- The BACKLOG/CLAUDE.md framing "gang = money engine for a $25t 17-faction catalog" should be
  corrected: **gang = sole aug vendor + saturated rep source; money is the only open resource,
  and the bar is $149b + an optional $25t.**
- The aug-ratchet/augfarmer should be pointed at NiteSec's 98-aug catalog (rep is met; the
  $149b tier is buyable in escalation-aware order starting now).
- Tier 4 territory remains correctly deferred (Phase 30 verdict stands — and this analysis
  removes its last "but the 20× money" temptation: the 20× multiplies the wrong stream).
