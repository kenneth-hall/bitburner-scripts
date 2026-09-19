// One-off recovery driver for the 2026-09-18 corrupted-save rebuild.
// Steps are separate verbs so each is verified before the next runs.
import { withPage } from './driver.mjs';

const step = process.argv[2];
const arg = process.argv[3];

await withPage(async (page) => {
  const seeState = async () => {
    const txt = (await page.evaluate(() => document.body.innerText)) || '';
    const recovery = /RECOVERY MODE ACTIVATED/i.test(txt);
    const buttons = await page.$$eval('button', (bs) =>
      bs.map((b) => b.innerText.trim()).filter(Boolean).slice(0, 25)
    );
    return { recovery, head: txt.split('\n').filter((l) => l.trim()).slice(0, 6), buttons };
  };

  if (step === 'state') {
    console.log(JSON.stringify(await seeState(), null, 2));
    return;
  }

  if (step === 'click') {
    const before = await seeState();
    const btn = page.locator(`button:has-text("${arg}")`).first();
    await btn.click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    const after = await seeState();
    console.log(JSON.stringify({ clicked: arg, beforeHead: before.head, after }, null, 2));
    return;
  }

  if (step === 'aria-click') {
    // BitVerse node markers render as a bare "O" glyph with the real name only in
    // aria-label -- same shape as the city-map markers, so text matching cannot reach them.
    const el = page.locator(`[aria-label="${arg}"]`).first();
    const n = await page.locator(`[aria-label="${arg}"]`).count();
    if (n !== 1) {
      console.log(`REFUSED - expected exactly 1 element with aria-label "${arg}", saw ${n}`);
      return;
    }
    await el.click({ timeout: 15000 });
    await page.waitForTimeout(3000);
    console.log(JSON.stringify(await seeState(), null, 2));
    return;
  }

  if (step === 'closedialog') {
    // The offline-progress summary is a real MUI dialog whose only control is an unnamed
    // close glyph, so neither dismissModal (wants a named button) nor dismissStoryPopup
    // (wants a bare button at document level) matches it. Guard: exactly one dialog
    // container holding exactly one button -- a confirm/buy dialog always has more.
    const dialogs = await page.$$('[role=dialog], .MuiDialog-root, .MuiModal-root');
    if (dialogs.length !== 1) {
      console.log(`REFUSED - expected exactly 1 dialog, saw ${dialogs.length}`);
      return;
    }
    const inner = await dialogs[0].$$('button');
    const innerText = await dialogs[0].$$eval('button', (bs) =>
      bs.map((b) => b.innerText.trim()).filter(Boolean)
    );
    if (inner.length !== 1 || innerText.length !== 0) {
      console.log(`REFUSED - dialog has ${inner.length} buttons (named: ${JSON.stringify(innerText)})`);
      return;
    }
    await inner[0].click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    const left = await page.$$('[role=dialog], .MuiDialog-root, .MuiModal-root');
    console.log(`clicked dialog close; dialogs remaining: ${left.length}`);
    console.log(JSON.stringify(await seeState(), null, 2));
    return;
  }

  if (step === 'clickfirst') {
    // The offline-progress summary renders as ONE nameless button plus narrative text --
    // the story-popup shape, but dismissStoryPopup does not match it. Same guard applies:
    // only fire when the tree really is a single unnamed button.
    const buttons = await page.$$('button');
    const named = await page.$$eval('button', (bs) => bs.map((b) => b.innerText.trim()).filter(Boolean));
    if (buttons.length !== 1 || named.length !== 0) {
      console.log(`REFUSED - expected exactly 1 nameless button, saw ${buttons.length} (named: ${JSON.stringify(named)})`);
      return;
    }
    await buttons[0].click({ timeout: 10000 });
    await page.waitForTimeout(2000);
    console.log(JSON.stringify(await seeState(), null, 2));
    return;
  }

  if (step === 'import') {
    // Bypass the native file dialog: set the <input type=file> value directly.
    const inputs = await page.$$('input[type="file"]');
    console.log(`file inputs found: ${inputs.length}`);
    if (!inputs.length) {
      console.log('NO FILE INPUT on this screen');
      return;
    }
    await inputs[0].setInputFiles(arg);
    await page.waitForTimeout(4000);
    console.log(JSON.stringify(await seeState(), null, 2));
    return;
  }

  console.log('usage: recover.mjs state | click "<button>" | import <path>');
});
