/**
 * marker.js - create or remove a marker file on home (the *-off.txt switches).
 * usage: run marker.js on <file>   |   run marker.js off <file>   |   run marker.js ls
 * ASCII-only.
 */
/** @param {NS} ns */
export async function main(ns) {
  const [mode, file] = ns.args;
  if (mode === "on" && file) ns.write(String(file), `set ${new Date().toISOString()}`, "w");
  else if (mode === "off" && file) ns.rm(String(file), "home");
  ns.tprint(`markers on home: ${ns.ls("home", ".txt").filter((f) => /-(off|mode)\.txt$/.test(f)).join(" ") || "(none)"}`);
}
