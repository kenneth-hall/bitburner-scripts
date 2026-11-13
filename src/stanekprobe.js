/**
 * stanekprobe.js - read-only: Stanek's Gift board dimensions, the full fragment catalog,
 * the currently placed fragments, and the player's multipliers. Writes stanekprobe-<epoch>.json.
 * ASCII-only.
 */
/** @param {NS} ns */
export async function main(ns) {
  const st = ns.stanek;
  const out = {
    ts: Date.now(),
    width: st.giftWidth(),
    height: st.giftHeight(),
    active: st.activeFragments(),
    defs: st.fragmentDefinitions(),
    mults: ns.getPlayer().mults,
  };
  const file = `stanekprobe-${out.ts}.json`;
  ns.write(file, JSON.stringify(out), "w");
  ns.tprint(`gift ${out.width}x${out.height} active=${out.active.length} defs=${out.defs.length} -> ${file}`);
}
