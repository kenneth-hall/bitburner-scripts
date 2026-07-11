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

/** Click a left-nav / titlebar button by its accessible name (e.g. "Terminal", "Factions"). */
export async function goto(page, section) {
  await page.getByRole('button', { name: section, exact: true }).click();
  await page.waitForTimeout(300);
}

/** Click the first element containing `text` (substring match) -- for things that aren't
 * role="button", like the clickable location markers on the ASCII city map. */
export async function clickText(page, text) {
  await page.getByText(text, { exact: false }).first().click();
  await page.waitForTimeout(300);
}

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

/** Run a terminal command and return ONLY the lines it produced (prompt echo + output). */
export async function runCommand(page, cmd) {
  await dismissModal(page); // clear a prior command's error modal so the nav click isn't blocked
  await goto(page, 'Terminal');
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
 * tailmanager.js re-docks/re-titles the fresh window. */
export async function restartScript(page, script) {
  await runCommand(page, `home; kill ${script}`);
  const closed = await closeTail(page, script);
  await runCommand(page, `run ${script}`);
  return { script, closedOrphanTail: closed };
}
