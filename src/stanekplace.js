/**
 * stanekplace.js - place the BN13 Bladeburner-route layout on Stanek's Gift (6x5 board).
 * Layout found by an offline exhaustive search (full 30-cell tiling, 5 stat fragments +
 * 2 boosters):
 *   B S S S G G     S=Str(10) D=Def(12) X=Dex(14) G=Agi(16) B=Bladeburner(30)
 *   B B S G G F     A=booster 100, F=booster 105
 *   X B A A F F
 *   X A A F F D
 *   X X A D D D
 * Refuses to touch a non-empty board unless passed "force" (which clears it first and
 * loses all charge). Writes stanekplace-<epoch>.json. ASCII-only.
 */
export const LAYOUT = [
  { id: 30, x: 0, y: 0, r: 1 },
  { id: 10, x: 1, y: 0, r: 0 },
  { id: 16, x: 3, y: 0, r: 0 },
  { id: 14, x: 0, y: 2, r: 1 },
  { id: 12, x: 3, y: 3, r: 0 },
  { id: 105, x: 3, y: 1, r: 0 },
  { id: 100, x: 1, y: 2, r: 0 },
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
