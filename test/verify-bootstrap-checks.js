// Pure checker logic for Phase 14's bootstrap-log.json, extracted the same
// way test/verify-log-checks.js extracted the daemon-log checks -- so it can
// be unit-tested against synthetic fixtures (test/checker-fixtures.test.js)
// independent of a real exported game log. Each function returns an array of
// violation objects (empty = clean).

export const KNOWN_BOOTSTRAP_EVENTS = new Set([
  'startup',
  'new-hosts',
  'target-switch',
  'deploy',
  'nudge',
  'handoff-blocked',
  'handoff',
]);

/** Every entry must have a known event kind and a timestamp. */
export function checkKnownEventsAndTimestamps(entries) {
  const violations = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (!KNOWN_BOOTSTRAP_EVENTS.has(e.event)) {
      violations.push({ index: i, reason: `unknown event kind: ${e.event}` });
    }
    if (typeof e.timestamp !== 'number') {
      violations.push({ index: i, reason: `entry ${i} missing a numeric timestamp` });
    }
  }
  return violations;
}

/** Timestamps must be non-decreasing across the whole log. */
export function checkTimestampsNonDecreasing(entries) {
  const violations = [];
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].timestamp < entries[i - 1].timestamp) {
      violations.push({ index: i, reason: `entry ${i} timestamp out of order` });
    }
  }
  return violations;
}

/** At most one handoff entry, and nothing may follow it (one-way ladder, S8). */
export function checkHandoffTerminal(entries) {
  const violations = [];
  const handoffIndices = entries.map((e, i) => (e.event === 'handoff' ? i : -1)).filter((i) => i !== -1);
  if (handoffIndices.length > 1) {
    violations.push({ index: handoffIndices[1], reason: `more than one handoff event (found ${handoffIndices.length})` });
  }
  if (handoffIndices.length > 0) {
    const firstHandoff = handoffIndices[0];
    if (firstHandoff < entries.length - 1) {
      violations.push({ index: firstHandoff + 1, reason: 'entries found after a handoff event -- bootstrap should have exited' });
    }
  }
  return violations;
}

/** deploy entries must carry a non-empty host list, each with a positive integer thread count. */
export function checkDeployShape(entries) {
  const violations = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.event !== 'deploy') continue;
    if (!Array.isArray(e.hosts) || e.hosts.length === 0) {
      violations.push({ index: i, reason: 'deploy entry has an empty or missing host list' });
      continue;
    }
    for (const h of e.hosts) {
      if (!Number.isInteger(h.threads) || h.threads <= 0) {
        violations.push({ index: i, reason: `deploy entry host ${h.host} has a non-positive-integer thread count: ${h.threads}` });
      }
    }
  }
  return violations;
}

/** target-switch entries must actually switch (from !== to). */
export function checkTargetSwitchDistinct(entries) {
  const violations = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    if (e.event !== 'target-switch') continue;
    if (e.from === e.to) {
      violations.push({ index: i, reason: `target-switch entry has identical from/to (${e.from})` });
    }
  }
  return violations;
}
