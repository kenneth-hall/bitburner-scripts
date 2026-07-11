# Augmentation catalog (known factions)

Static reference data for the aug/faction install-order planner (see BACKLOG "Static
aug/faction install-order planner"). Machine-readable copy:
[`aug-catalog-known-factions.json`](./aug-catalog-known-factions.json).

## What it is

Every augmentation sold by the factions Kenneth has unlocked/knows about, with price, rep
requirement, prereqs, and full multiplier block. Scoped deliberately — unreached factions are
left out to respect the anti-spoiler rule (widen the scope only as factions are unlocked).

**Factions in scope (11):** CyberSec, NiteSec, The Black Hand, BitRunners, Tian Di Hui,
Netburners, Church of the Machine God, Ishima, Chongqing, New Tokyo, **Daedalus** (joined
2026-07-11).

## Source / provenance

Parsed directly from the official Bitburner source (an allowed source; aug prices/rep/stats are
the static-numbers carve-out in `CLAUDE.md`) — **not** hand-transcribed:

- `bitburner-official/bitburner-src` → `src/Augmentation/Augmentations.ts` (the `metadata` object),
  with display names from `src/Augmentation/Enums.ts` and `src/Faction/Enums.ts`.
- Extraction: a scratchpad parser evaluates the `metadata` literal and filters to the in-scope
  factions. **To refresh** (e.g. after a game update, or to widen scope): re-fetch those three
  files and re-run the parser with the faction list updated. The generator was kept in scratchpad,
  not the repo — productionize it if/when the planner is actually built.

## Per-aug fields

`name`, `factions` (of the in-scope set that sell it), `moneyCost`, `repCost`, `hackMults` (the six
`hacking*` mults), `otherMults`, `prereqs`, `hackRelevant` (has any hacking mult).

For the current BN1 goal the KPI columns are **`hacking`** (level-mult) and **`hacking_exp`**
(exp-mult) — the two levers `auginfo.js` / the Daedalus-2500 plan track. Money is non-binding.

## Non-obvious mechanics the planner must encode

- **Rep is a THRESHOLD, not a currency.** Buying an aug doesn't spend rep. To buy *N* augs from one
  faction you need rep ≥ the single most expensive one, **not** the sum. (E.g. all of Daedalus =
  2.5M rep for The Red Pill, which also clears everything cheaper it sells.)
- **The Red Pill** (Daedalus, 2.5M rep, $0, no mults) is the **BitNode exit aug** — install it, then
  backdoor `w0r1d_d43m0n` (needs hacking ≈ `WorldDaemonDifficulty`) to finish the node.
- **Prereq chains span factions.** Embedded Netburner Core V3 (Daedalus) needs the Core V2 → Core
  Implant → ENM chain, which is BitRunners. The planner's prereq DAG is cross-faction.
- **Exclude Church of the Machine God / Stanek's Gift augs** from an install-cycle plan — that
  faction only accepts aug-free players (see `[[stanek-gift-fresh-bitnode]]`), incompatible with
  accumulating augs; its "Genesis" aug is even a 0.9 penalty.
