// Reusable driver: attach to the running Bitburner (Steam/Electron) over CDP and
// expose game-aware read/act helpers. Node-side dev tooling; NOT viteburner-synced.
//
// Requires the game launched with:  --remote-debugging-port=9222
// (set in Steam -> Bitburner -> Properties -> Launch Options: `%command% --remote-debugging-port=9222`)
//
// Safety: connects to a browser it did NOT launch. browser.close() on a CDP-connected
// browser only DISCONNECTS Playwright -- it does not close the game.
import { chromium } from 'playwright-core';

const CDP = process.env.BB_CDP || 'http://localhost:9222';

/** Connect, hand the live game page to fn, disconnect. */
export async function withPage(fn) {
  const browser = await chromium.connectOverCDP(CDP);
  try {
    const ctx = browser.contexts()[0];
    if (!ctx) throw new Error(`no browser context at ${CDP} -- is the game running with --remote-debugging-port=9222?`);
    const page = ctx.pages()[0];
    if (!page) throw new Error('connected, but no game page found');
    return await fn(page, browser);
  } finally {
    await browser.close();
  }
}

/** Click a left-nav / titlebar button by its accessible name (e.g. "Terminal", "Factions").
 * Clears a blocking error modal or story popup first (see dismissModal / dismissStoryPopup)
 * so a stray overlay doesn't silently eat the click and time out. */
export async function goto(page, section) {
  await dismissModal(page);
  await dismissStoryPopup(page);
  // Nav buttons carry a notification-badge count in their accessible name when something is
  // pending -- "Factions" becomes "1 Factions" the moment an invite lands. exact:true then fails
  // on precisely the screens you most need (confirmed 2026-07-19 on the NiteSec invite). Match
  // the name with an optional leading count instead.
  const named = new RegExp(`^(\\d+\\s+)?${section.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
  await page.getByRole('button', { name: named }).first().click();
  await page.waitForTimeout(300);
}

/** Click the first element containing `text` (substring match) -- for things that aren't
 * role="button". Note: city-map markers are NOT reachable this way (their visible text is a
 * decorative glyph/[label]); use clickLocation for those. */
export async function clickText(page, text) {
  await page.getByText(text, { exact: false }).first().click();
  await page.waitForTimeout(300);
}

/** Accept a pending faction invitation BY NAME, from the Factions screen.
 *
 * Why this exists rather than `click "Join!"`: every pending invitation renders an identical
 * unnamed-by-faction `Join!` button, and clickText takes the FIRST match -- so a naive click joins
 * whichever invite happens to be top of the list. That is a genuinely costly misfire, since the six
 * city factions are mutually exclusive: accepting Sector-12 by accident permanently forecloses
 * Aevum/Chongqing/Ishima/New Tokyo/Volhaven for the node.
 *
 * The DOM orders each button BEFORE its faction heading (confirmed 2026-07-19), so we locate the
 * heading and take the Join! button immediately preceding it. Throws if the faction has no pending
 * invite, rather than clicking something else.
 */
export async function joinFaction(page, faction) {
  await dismissModal(page);
  await dismissStoryPopup(page);
  // Read-only pass: which Join! button (by index) belongs to this faction? Each invitation is a
  // [button "Join!"][heading "<Faction>"] pair in DOM order, so the Nth Join! button pairs with
  // the Nth invitation heading. We only COMPUTE here -- clicking from inside evaluate() fires an
  // untrusted event that MUI ignores (observed 2026-07-19: reported success, nothing happened).
  const index = await page.evaluate((name) => {
    const nodes = [...document.querySelectorAll('button,h1,h2,h3,h4,h5,h6')];
    let n = -1;
    for (let i = 0; i < nodes.length; i++) {
      const el = nodes[i];
      if (el.tagName === 'BUTTON' && /^join!?$/i.test(el.textContent.trim())) n++;
      else if (/^H[1-6]$/.test(el.tagName) && el.textContent.trim() === name && n >= 0) return n;
    }
    return -1;
  }, faction);
  if (index < 0) throw new Error(`no pending "Join!" invitation found for faction "${faction}"`);
  await page.getByRole('button', { name: /^Join!?$/ }).nth(index).click();
  await page.waitForTimeout(500);
  return `joined ${faction}`;
}

/** Click a City-map location by its full name and open its page (e.g. "Central Intelligence
 * Agency", "Sector-12 City Hall", "Powerhouse Gym"). The map markers render as bare glyphs
 * (G/?/$) with no role and no visible name, but each carries an `aria-label` with the real
 * location name -- so an attribute selector on aria-label is the stable handle (resolution-
 * independent, unlike clicking by screenshot coordinates). Assumes the City screen is open.
 * Returns the heading of the page it landed on, or null if the label didn't match. */
export async function clickLocation(page, name) {
  const marker = page.locator(`[aria-label="${name}"]`);
  if ((await marker.count()) === 0) return null;
  await marker.first().click();
  await page.waitForTimeout(400);
  return page.evaluate(() => document.querySelector('h1,h2,h3,h4')?.innerText.trim() ?? null);
}

/** Names of every clickable location on the currently-open City map (from marker aria-labels).
 * Handy for discovering exact spellings to feed clickLocation. */
export const listLocations = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll('[class*="-location"]')] // emotion keeps the "-location" label suffix stable across its hash
      .map((el) => el.getAttribute('aria-label'))
      .filter(Boolean),
  );

/** Full terminal scrollback text (exact). */
export const readTerminal = (page) =>
  page.evaluate(() => document.getElementById('terminal')?.innerText ?? '');

/** Dismiss an open Bitburner error/dialog modal (clicks its "Close" button).
 * A script runtime error pops a modal that OVERLAYS the UI and intercepts clicks,
 * so goto/click time out ("waiting for getByRole button ...") until it's cleared.
 * Returns true if a modal was closed. Reads (read-terminal/body/shot) work through it. */
export async function dismissModal(page) {
  const btn = page.getByRole('button', { name: 'Close', exact: true });
  if ((await btn.count()) > 0 && (await btn.first().isVisible())) {
    await btn.first().click();
    await page.waitForTimeout(200);
    return true;
  }
  return false;
}

/** Dismiss a full-screen story/message popup (faction-recruit text, "Message received"
 * toasts, narrative interludes) that overlays the whole UI and swallows every click until
 * cleared -- these carry no "Close"-named button so dismissModal doesn't catch them.
 * Guard: only fires when the ENTIRE accessible tree is exactly one NAMELESS button plus
 * narrative text and nothing else. A real confirm/buy/install dialog always exposes
 * multiple/named controls (e.g. "Confirm", "Cancel", an item name) and a normal game
 * screen always has named nav buttons -- neither ever collapses to this shape, so the
 * guard can't misfire onto a consequential action. Confirmed live 2026-07-12: clicking
 * the bare button is exactly the "click anywhere on it" dismissal a human would do.
 * Returns true if a popup was found and dismissed, false (nothing clicked) otherwise. */
export async function dismissStoryPopup(page) {
  const snapshot = await ariaSnapshot(page);
  const lines = snapshot.split('\n').map((l) => l.trim()).filter(Boolean);
  const isBareStoryPopup = lines[0] === '- button' && lines.slice(1).every((l) => l.startsWith('- text:'));
  if (!isBareStoryPopup) return false;
  await page.getByRole('button').first().click();
  await page.waitForTimeout(300);
  return true;
}

/** Run a terminal command and return ONLY the lines it produced (prompt echo + output). */
export async function runCommand(page, cmd) {
  await goto(page, 'Terminal'); // clears a prior error modal / story popup, then navigates
  const before = await page.evaluate(() => document.getElementById('terminal')?.children.length ?? 0);
  const input = page.locator('#terminal-input');
  await input.click();
  await page.keyboard.type(cmd, { delay: 15 });
  await page.keyboard.press('Enter');
  await page.waitForTimeout(700);
  return page.evaluate((n) => {
    const el = document.getElementById('terminal');
    return el ? [...el.children].slice(n).map((c) => c.innerText).join('\n') : '';
  }, before);
}

/** Character-overview stats, parsed from the sidebar overview table (present on any screen).
 * (The overview-*-hook ids are empty plugin mount-points, not value holders.) */
export const getStats = (page) =>
  page.evaluate(() => {
    const WANT = ['HP', 'Money', 'Hack', 'Str', 'Def', 'Dex', 'Agi', 'Cha'];
    const stats = {};
    for (const tr of document.querySelectorAll('table tr')) {
      const cells = [...tr.querySelectorAll('th,td')].map((c) => c.innerText.trim()).filter(Boolean);
      if (cells.length >= 2 && WANT.includes(cells[0])) stats[cells[0]] = cells[1];
    }
    return stats;
  });

/** Text of a tail/log window whose title matches `name` (e.g. "daemon", "cloud manager"). */
export const readTail = (page, name) =>
  page.evaluate((wanted) => {
    const h = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
      .find((e) => e.innerText.trim().toLowerCase() === wanted.toLowerCase());
    if (!h) return null;
    const win = h.closest('.react-draggable') || h.parentElement;
    return win?.innerText ?? null;
  }, name);

/** Structured, named outline of the current screen -- best for "what can I click". */
export const ariaSnapshot = (page) => page.locator('body').ariaSnapshot();

/** Raw visible text of the whole page. */
export const bodyText = (page) => page.evaluate(() => document.body.innerText);

/** Save a PNG screenshot of the current screen. */
export async function screenshot(page, path) {
  await page.screenshot({ path });
  return path;
}

/** Close the tail/log window whose title matches `title` (clicks its Close button).
 * Returns true if a window was found and closed. Killing a script orphans its tail
 * window (Bitburner leaves it open, reverting the title to the script filename), so
 * this is how a restart tidies up before relaunching. */
export async function closeTail(page, title) {
  const win = page
    .locator('.react-draggable')
    .filter({ has: page.getByRole('heading', { name: title, exact: true }) });
  const btn = win.getByRole('button', { name: 'Close window' });
  if ((await btn.count()) > 0) {
    await btn.first().click();
    return true;
  }
  return false;
}

/** Restart a companion script cleanly: kill it, close its orphaned tail, relaunch.
 * Phase 24: every companion is headless (nothing to re-dock/re-title) except
 * dashboard.js, which self-closes its own tail via ns.atExit -- `restart
 * daemon.js` remains the core-loop restart path. */
export async function restartScript(page, script) {
  await runCommand(page, `home; kill ${script}`);
  const closed = await closeTail(page, script);
  await runCommand(page, `run ${script}`);
  return { script, closedOrphanTail: closed };
}
