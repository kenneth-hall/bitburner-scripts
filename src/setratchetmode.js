/**
 * setratchetmode.js - one-off: read or set `ratchet-mode.txt`, the single switch that
 * decides whether the aug ratchet may install.
 *
 * Semantics live in augfarmer.js (its header comment): the file containing exactly
 * "auto" enables install + spend-down; ANYTHING ELSE, including the file being absent,
 * is **observe mode -- no install, no spend-down, ever**. installer.js independently
 * re-checks the same file and refuses to act unless it reads exactly "auto", so this is
 * a two-place guard, not a single point of failure.
 *
 * Why this exists (2026-08-06): the file was previously only ever set by hand in-game via
 * `nano`, which opens a blocking editor modal that CDP automation cannot drive (see
 * CLAUDE.md's note on `cat` for the same class of problem). Under Bladeburner-primary the
 * install cadence became a thing worth toggling deliberately -- installs cost a measured
 * 5.4% of Bladeburner wall-time in post-install recovery (combat stats reset -> the engine
 * must rest) to buy a hacking multiplier the win path no longer depends on -- so the
 * switch needed to be scriptable in BOTH directions, not just off.
 *
 *   run setratchetmode.js            # report current mode, change nothing
 *   run setratchetmode.js observe    # stop installing
 *   run setratchetmode.js auto       # resume installing
 *
 * 🔴 THIS SCRIPT ALONE IS NOT ENOUGH -- IT WILL SILENTLY REVERT. Learned the hard way
 * 2026-08-06: `src/ratchet-mode.txt` exists in the working tree and `vite.config.ts`
 * watches `src/**\/*.{script,txt}`, so viteburner PUSHES the repo copy into the game. An
 * in-game write here is overwritten by the next push -- and a push happens on any working-
 * tree change OR a dev-server restart. Concretely: this script set "observe" at 07:08 and
 * verified the read-back; a dev-server restart at 19:33 (done for an unrelated log-filter
 * change) re-pushed the repo's "auto"; install #43 fired at 19:40 and killed a running
 * probe. augfarmer had been logging "would install now (mode: observe)" as late as 19:29,
 * which is what pins the revert to the restart.
 *
 * ⚠️ Compounding the trap: commit 6a0dc63 UNTRACKED `src/ratchet-mode.txt` from git ("a
 * runtime marker, not source"), so it is gitignored yet still pushed. `git status` will
 * never show it drifting.
 *
 * **To change the mode durably, edit `src/ratchet-mode.txt` in the repo** (that is the
 * real switch; the push carries it into the game within seconds). Use this script to
 * VERIFY what the game actually reads afterwards -- which is the only thing that counts.
 *
 * @param {NS} ns
 */
const MODE_FILE = "ratchet-mode.txt";

export async function main(ns) {
  const requested = ns.args[0] === undefined ? null : String(ns.args[0]).trim();

  const priorRaw = ns.fileExists(MODE_FILE, "home") ? ns.read(MODE_FILE) : null;
  const priorMode = priorRaw?.trim() === "auto" ? "auto" : "observe";

  if (requested === null) {
    ns.tprint(`ratchet mode: ${priorMode}  (file ${priorRaw === null ? "absent" : `= ${JSON.stringify(priorRaw.trim())}`})`);
    ns.tprint(priorMode === "auto" ? "  -> installs ENABLED" : "  -> installs DISABLED (no install, no spend-down)");
    return;
  }

  if (requested !== "auto" && requested !== "observe") {
    ns.tprint(`ERROR: usage: run setratchetmode.js [auto|observe]  (got ${JSON.stringify(requested)})`);
    return;
  }

  ns.write(MODE_FILE, requested, "w");

  // Verify by re-reading rather than trusting the write -- the same "verify, don't trust
  // the return value" rule the CDP tooling is held to.
  const afterRaw = ns.read(MODE_FILE);
  const afterMode = afterRaw?.trim() === "auto" ? "auto" : "observe";

  ns.tprint(`ratchet mode: ${priorMode} -> ${afterMode}  (wrote ${JSON.stringify(requested)}, file now ${JSON.stringify(afterRaw)})`);
  if (afterMode !== requested) {
    ns.tprint("ERROR: verification FAILED -- file does not read back as requested.");
    return;
  }
  ns.tprint(afterMode === "auto"
    ? "  -> installs ENABLED: augfarmer may run spend-down and exec installer.js"
    : "  -> installs DISABLED: augfarmer logs 'would install now' only; installer.js refuses to act");
}
