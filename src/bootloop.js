// Phase 14: self-contained remote bootstrap worker. Import-free by design,
// same reason as hack.js/grow.js/weaken.js -- this gets scp'd to hosts where
// imports don't follow. Retargeting is a 0GB file read, not exec args: each
// iteration re-reads bootstrap-control.json (bootstrap.js re-scp's it every
// poll), so a target switch takes effect within one iteration with no
// kill/redeploy. ns.args are ignored -- bootstrap.js's exec uniqueness arg
// (Date.now()) exists only so a top-up exec doesn't collide with the
// previous poll's already-running instance of this same script.
//
// Identifier hygiene (Phase 9's lesson): chooseBootAction returns "weaken"/
// "grow"/"hack" as STRING VALUES only, never as object keys or identifiers --
// the dispatch below is a plain if/else over real ns.weaken/grow/hack calls.

const CONTROL_FILE = "bootstrap-control.json";
const RETRY_SLEEP_MS = 5000;

/**
 * Pure. Parses bootstrap-control.json's raw content. A well-formed control
 * file has all five fields present, a non-empty string target, and finite
 * numbers for the rest. Missing file (ns.read returns ""), garbage JSON, and
 * wrong-shape JSON all land in the same { ok: false } retry path.
 */
export function parseBootControl(raw) {
  if (!raw) return { ok: false };

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false };
  }

  if (parsed === null || typeof parsed !== "object") return { ok: false };
  const { target, minSecurityLevel, maxMoney, securityEpsilon, moneyFraction } = parsed;

  if (typeof target !== "string" || target.length === 0) return { ok: false };
  for (const n of [minSecurityLevel, maxMoney, securityEpsilon, moneyFraction]) {
    if (typeof n !== "number" || !Number.isFinite(n)) return { ok: false };
  }

  return { ok: true, config: { target, minSecurityLevel, maxMoney, securityEpsilon, moneyFraction } };
}

/**
 * Pure. Same boundary semantics as the daemon's drift checks (scheduler.js's
 * isPrepped): weaken above the security epsilon (strict >), else grow below
 * the money fraction (strict <), else hack.
 */
export function chooseBootAction({ currentSecurity, minSecurityLevel, currentMoney, maxMoney, securityEpsilon, moneyFraction }) {
  if (currentSecurity > minSecurityLevel + securityEpsilon) return "weaken";
  if (currentMoney < maxMoney * moneyFraction) return "grow";
  return "hack";
}

/** @param {NS} ns */
export async function main(ns) {
  while (true) {
    const parsed = parseBootControl(ns.read(CONTROL_FILE));
    if (!parsed.ok) {
      await ns.sleep(RETRY_SLEEP_MS);
      continue;
    }

    const { target, minSecurityLevel, maxMoney, securityEpsilon, moneyFraction } = parsed.config;
    const currentSecurity = ns.getServerSecurityLevel(target);
    const currentMoney = ns.getServerMoneyAvailable(target);
    const action = chooseBootAction({ currentSecurity, minSecurityLevel, currentMoney, maxMoney, securityEpsilon, moneyFraction });

    if (action === "weaken") {
      await ns.weaken(target);
    } else if (action === "grow") {
      await ns.grow(target);
    } else {
      await ns.hack(target);
    }
  }
}
