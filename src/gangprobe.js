/**
 * Phase 27 -- BN2 gang STATIC TABLE dump (pre-spec recon).
 *
 * Dumps the task + equipment reference tables (features doc D5). Static data:
 * one run answers a large share of the strategy unknowns without needing a
 * live gang to observe.
 *
 * Deliberately lean: fresh-node home is RAM-saturated by the batcher (measured
 * 31.60/32.00GB, 2026-07-18), so this drops every call not strictly needed.
 * The API-reachability probe lives in gangreach.js -- a separate file because
 * the static RAM analyzer charges for every referenced fn regardless of branch.
 *
 * Read-only. Touches nothing in the Gang API's action group.
 *
 * -> logs/gangprobe-<epoch>.json
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');

  const out = { epoch: Date.now(), taskTable: null, equipmentTable: null, errors: [] };

  try {
    const taskNames = ns.gang.getTaskNames();
    const rows = [];
    for (const t of taskNames) {
      try {
        rows.push({ name: t, ...ns.gang.getTaskStats(t) });
      } catch (err) {
        rows.push({ name: t, error: String(err.message || err) });
      }
      await ns.sleep(0);
    }
    out.taskTable = rows;
  } catch (err) {
    out.errors.push(`getTaskNames/getTaskStats: ${String(err.message || err)}`);
  }

  try {
    const eqNames = ns.gang.getEquipmentNames();
    const rows = [];
    for (const e of eqNames) {
      try {
        rows.push({ name: e, mults: ns.gang.getEquipmentStats(e) });
      } catch (err) {
        rows.push({ name: e, error: String(err.message || err) });
      }
      await ns.sleep(0);
    }
    out.equipmentTable = rows;
  } catch (err) {
    out.errors.push(`getEquipmentNames/getEquipmentStats: ${String(err.message || err)}`);
  }

  const fileName = `gangprobe-${out.epoch}.json`;
  ns.write(fileName, JSON.stringify(out, null, 2), 'w');
  ns.tprint(
    `INFO gangprobe: tasks=${out.taskTable ? out.taskTable.length : 'FAIL'} ` +
      `equipment=${out.equipmentTable ? out.equipmentTable.length : 'FAIL'} ` +
      `errors=${out.errors.length} -> ${fileName}`,
  );
  for (const e of out.errors) ns.tprint(`  ERR ${e}`);
}
