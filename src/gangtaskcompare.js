/**
 * gangtaskcompare.js -- read-only recon. `getTaskNames()` returns only the tasks OUR gang type
 * can run, so it can't answer "was a hacking gang the right engine?". `getTaskStats(name)`
 * takes an arbitrary name, so we can pull the combat-gang task table too and compare base
 * yields directly.
 *
 * Names come from the in-game Gang documentation's task list, not from game source.
 *
 * @param {NS} ns
 */
const COMBAT_TASKS = [
  "Mug People",
  "Deal Drugs",
  "Strongarm Civilians",
  "Run a Con",
  "Armed Robbery",
  "Traffick Illegal Arms",
  "Threaten & Blackmail",
  "Human Trafficking",
  "Terrorism",
];

export async function main(ns) {
  const out = { ts: Date.now(), ours: [], combat: [], errors: [] };

  for (const name of ns.gang.getTaskNames()) {
    try {
      out.ours.push(ns.gang.getTaskStats(name));
    } catch (e) {
      out.errors.push({ name, scope: "ours", error: String(e) });
    }
  }

  for (const name of COMBAT_TASKS) {
    try {
      out.combat.push(ns.gang.getTaskStats(name));
    } catch (e) {
      out.errors.push({ name, scope: "combat", error: String(e) });
    }
  }

  const path = `gangtaskcompare-${out.ts}.json`;
  ns.write(path, JSON.stringify(out, null, 2), "w");

  const line = (t) =>
    `${String(t.name).padEnd(24)} resp ${String(t.baseRespect).padEnd(9)} money ${String(t.baseMoney).padEnd(7)} wanted ${String(t.baseWanted).padEnd(7)} diff ${t.difficulty}`;

  ns.tprint("=== OUR (hacking) tasks, by base respect ===");
  out.ours.slice().sort((a, b) => b.baseRespect - a.baseRespect).slice(0, 5).forEach((t) => ns.tprint("  " + line(t)));
  ns.tprint("=== COMBAT tasks, by base respect ===");
  out.combat.slice().sort((a, b) => b.baseRespect - a.baseRespect).forEach((t) => ns.tprint("  " + line(t)));
  for (const e of out.errors) ns.tprint(`ERROR ${e.scope}/${e.name}: ${e.error}`);
  ns.tprint(`-> ${path}`);
}
