// One-shot worker: grows a target once and exits. daemon.js's scheduler decides
// thread count and additionalMsec (the timing offset that makes this land at
// a precise moment relative to the batch's other three jobs) -- no decision
// logic belongs in here, and no imports beyond ns itself (keeps RAM cost
// minimal).
/** @param {NS} ns */
export async function main(ns) {
  const target = ns.args[0];
  const additionalMsec = Number(ns.args[1]) || 0;

  await ns.grow(target, { additionalMsec });
}
