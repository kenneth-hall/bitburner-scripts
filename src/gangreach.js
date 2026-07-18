/**
 * Phase 27 -- BN2 gang API REACHABILITY probe (pre-spec recon).
 *
 * Answers: which gang calls work BEFORE a gang exists? The API docs only state
 * that `inGang()` needs no API access; everything else is unspecified. The
 * observer's design depends on the answer, so measure it rather than assume.
 *
 * Split from gangprobe.js because Bitburner's static RAM analyzer charges for
 * every referenced fn regardless of which branch executes -- one file with a
 * mode flag would cost the sum of both.
 *
 * Read-only. Touches nothing in the Gang API's action group.
 *
 * -> logs/gangreach-<epoch>.json
 */

/** @param {NS} ns */
export async function main(ns) {
  ns.disableLog('ALL');

  const results = {};
  const check = (label, fn) => {
    try {
      results[label] = { ok: true, value: fn() };
    } catch (err) {
      results[label] = { ok: false, error: String(err && err.message ? err.message : err) };
    }
  };

  check('inGang', () => ns.gang.inGang());
  check('getGangInformation', () => ns.gang.getGangInformation());
  check('getMemberNames', () => ns.gang.getMemberNames());
  check('getAllGangInformation', () => ns.gang.getAllGangInformation());

  const epoch = Date.now();
  const fileName = `gangreach-${epoch}.json`;
  ns.write(fileName, JSON.stringify({ epoch, results }, null, 2), 'w');

  const okCount = Object.values(results).filter((r) => r.ok).length;
  ns.tprint(`INFO gangreach: ${okCount}/${Object.keys(results).length} reachable pre-gang -> ${fileName}`);
  for (const [k, r] of Object.entries(results)) {
    ns.tprint(`  ${r.ok ? 'OK  ' : 'FAIL'} ${k}${r.ok ? '' : ` -- ${r.error}`}`);
  }
}
