// One-off probe (Phase 35 WI8, D4/D10 verification) -- logs home's current
// max RAM so the installer's pre-install home-RAM sweep claim can be checked
// against a live read instead of an in-game UI glance. Throwaway; safe to
// delete once read.
export async function main(ns) {
  const maxRam = ns.getServerMaxRam("home");
  const record = { timestamp: Date.now(), time: new Date().toLocaleString(), homeMaxRamGb: maxRam };
  ns.write(`homeramprobe-${Date.now()}.json`, JSON.stringify(record, null, 2), "w");
  ns.tprint(`home max RAM: ${maxRam} GB`);
}
