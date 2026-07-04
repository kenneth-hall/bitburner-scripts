// One-off RAM-gate check for Phase 8: exports getScriptRam for a list of
// scripts to a file instead of relying on lossy terminal copy/paste of
// `mem`. Not part of the daemon's own runtime -- run manually, once.
// args: script names to check (defaults to daemon.js and share.js).
/** @param {NS} ns */
export async function main(ns) {
  const names = ns.args.length > 0 ? ns.args.map(String) : ["daemon.js", "share.js"];
  const result = {
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    scripts: {},
  };
  for (const name of names) {
    result.scripts[name] = ns.getScriptRam(name, "home");
  }
  ns.tprint(Object.entries(result.scripts).map(([n, r]) => `${n}: ${r} GB`).join(" | "));
  ns.write("ramcheck-result.json", JSON.stringify(result, null, 2), "w");
}
