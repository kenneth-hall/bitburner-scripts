// RAM-gate check, exports getScriptRam for a list of scripts to a file
// instead of relying on lossy terminal copy/paste of `mem`. Not part of the
// daemon's own runtime -- run manually. args: script names to check
// (defaults to daemon.js and share.js).
//
// Also records each script's in-game source length (`ns.read`, 0GB) so every
// reading carries its own staleness proof: a Phase 13 gate run silently
// measured a stale pre-merge `hosts.js` for three consecutive "identical"
// readings after a `git checkout` under the live viteburner watcher pushed
// reverted files mid-session (see docs/phases/phase-13-consolidation.closeout.md).
// Compare `bytes[name]` against the corresponding file's size in `dist/src/`
// (viteburner's `dumpFiles` mirror of what it last actually pushed) -- equal
// length means the game held fresh code when this ran; a mismatch means the
// reading is void, no matter how plausible the GB number looks.
/** @param {NS} ns */
export async function main(ns) {
  const names = ns.args.length > 0 ? ns.args.map(String) : ["daemon.js", "share.js"];
  const result = {
    time: new Date().toLocaleTimeString(),
    timestamp: Date.now(),
    scripts: {},
    bytes: {},
  };
  for (const name of names) {
    result.scripts[name] = ns.getScriptRam(name, "home");
    result.bytes[name] = ns.read(name).length;
  }
  ns.tprint(Object.entries(result.scripts).map(([n, r]) => `${n}: ${r} GB`).join(" | "));
  ns.write("ramcheck-result.json", JSON.stringify(result, null, 2), "w");
}
