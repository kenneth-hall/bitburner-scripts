// Throwaway E-matrix probe (Phase 13, work item 8): confirms whether
// object-literal keys that exactly match an ns API function name
// (WORKER_SCRIPTS' hack/grow/weaken) get phantom-charged the way a
// standalone identifier collision does (Phase 9/11's confirmed mechanism).
// Delete this file (repo + in-game) before/after the phase's RAM gate --
// it's not part of the shipped codebase.

import { WORKER_SCRIPTS } from "./scheduler.js";

/** @param {NS} ns */
export async function main(ns) {
  ns.print(Object.values(WORKER_SCRIPTS).join(","));
}
