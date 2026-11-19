/**
 * stanekplace.js - place the current node's Bladeburner-route layout on Stanek's Gift.
 * BN14 (5x5 board, ExtraSize -1), offline exhaustive search: the four combat-stat fragments
 * + one booster touching all four. The Bladeburner fragment (30) cannot fit alongside them on
 * 5x5; dropped deliberately for the combat-gate phase (it does nothing pre-join).
 *   . A A G G     S=Str(10) D=Def(12) X=Dex(14) G=Agi(16) A=booster 100
 *   A A G G D
 *   X A D D D
 *   X S S S .
 *   X X S . .
 * BN13's 6x5 layout (adds B=Bladeburner(30) + booster 105) is in git history (15bce5d).
 * Refuses to touch a non-empty board unless passed "force" (which clears it first and
 * loses all charge). Writes stanekplace-<epoch>.json. ASCII-only.
 */
export const LAYOUT = [
  { id: 100, x: 0, y: 0, r: 0 },
  { id: 10, x: 1, y: 3, r: 0 },
  { id: 12, x: 2, y: 1, r: 0 },
  { id: 14, x: 0, y: 2, r: 1 },
  { id: 16, x: 2, y: 0, r: 0 },
];

/** @param {NS} ns */
export async function main(ns) {
  const st = ns.stanek;
  const force = ns.args[0] === "force";
  const before = st.activeFragments().length;
  const out = { ts: Date.now(), before, force, results: [] };
  if (before > 0 && !force) {
    out.aborted = "board not empty (pass 'force' to clear and re-place; loses all charge)";
  } else {
    if (before > 0) st.clearGift();
    for (const f of LAYOUT) {
      const can = st.canPlaceFragment(f.x, f.y, f.r, f.id);
      const placed = can ? st.placeFragment(f.x, f.y, f.r, f.id) : false;
      out.results.push({ ...f, can, placed });
    }
  }
  out.after = st.activeFragments().map((a) => ({ id: a.id, x: a.x, y: a.y, rotation: a.rotation }));
  const file = `stanekplace-${out.ts}.json`;
  ns.write(file, JSON.stringify(out, null, 2), "w");
  ns.tprint(`${out.aborted ?? "placed " + out.results.filter((r) => r.placed).length + "/" + LAYOUT.length} -> ${file}`);
}
