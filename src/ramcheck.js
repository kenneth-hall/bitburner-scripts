// One-off RAM-gate check for Phase 8: exports getScriptRam for daemon.js and
// share.js to a file instead of relying on lossy terminal copy/paste of
// `mem`. Not part of the daemon's own runtime -- run manually, once.
/** @param {NS} ns */
export async function main(ns) {
  const result = {
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    daemonRam: ns.getScriptRam("daemon.js", "home"),
    shareRam: ns.getScriptRam("share.js", "home"),
  };
  ns.tprint(`daemon.js: ${result.daemonRam} GB | share.js: ${result.shareRam} GB`);
  ns.write("ramcheck-result.json", JSON.stringify(result, null, 2), "w");
}
