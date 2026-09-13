/**
 * Takes the screenshots the README uses.
 *
 *   npm start          in one terminal, with DESKHELP_DEMO=true
 *   node scripts/screenshots.mjs
 *
 * Driven rather than taken by hand so every shot has the same window, the same
 * scale and the same seeded data. A README where one picture is a laptop and
 * the next is a 4K monitor reads as carelessness before anybody has read a
 * word.
 */

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.env.DESKHELP_URL ?? 'http://127.0.0.1:4321';
const OUT = 'assets/screens';

const DEMO = { email: 'demo@deskhelp.ai', password: 'demo-northline-2026' };

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    // Twice the pixels, so the images stay sharp on the displays most people
    // read GitHub on.
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  const shot = async (name, options = {}) => {
    await page.screenshot({ path: `${OUT}/${name}.png`, ...options });
    console.log(`  ${name}.png`);
  };

  console.log('\nwriting to', OUT);

  // --- the landing page ----------------------------------------------------
  await page.goto(BASE, { waitUntil: 'networkidle' });
  // Long enough for the entrance animations to settle, so nothing is caught
  // mid-fade.
  await page.waitForTimeout(1200);
  await shot('landing');

  // --- signing in ----------------------------------------------------------
  await page.getByRole('button', { name: 'Get started' }).first().click();
  await page.waitForTimeout(900);
  await shot('sign-in');

  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.waitForTimeout(1600);

  // --- the dashboard -------------------------------------------------------
  await shot('dashboard');

  // --- workflows -----------------------------------------------------------
  await page.getByRole('button', { name: /^Workflows/ }).click();
  await page.waitForTimeout(900);
  await shot('workflows');

  // --- a dry run, in its modal --------------------------------------------
  await page.getByRole('button', { name: 'Dry run' }).first().click();
  await page.waitForSelector('.modal', { timeout: 30_000 });
  await page.waitForTimeout(1200);
  await shot('dry-run');

  // The words the caller would use sit below the outcome summary, and they
  // are the reason to open a dry run at all, so they get their own shot.
  await page.locator('.modal-body').evaluate((el) => {
    const heading = [...el.querySelectorAll('h3')].find((h) =>
      h.textContent.includes('Exactly what'),
    );
    if (heading) heading.scrollIntoView({ block: 'start' });
  });
  await page.waitForTimeout(700);
  await shot('dry-run-words');

  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(400);

  // --- the review queue ----------------------------------------------------
  // The Calls page, opened on a real call. Which one matters: speech to text
  // will occasionally render a stumbled "hello" as something unrepeatable,
  // and this image ends up in a public README. Check the call before shipping
  // the screenshot, and prefer one that reads cleanly end to end.
  await page.getByRole('button', { name: /^Calls/ }).click();
  await page.waitForTimeout(900);
  await shot('calls');

  // Find a call that actually has words in it, rather than trusting the
  // order on the page: most rows are seeded outcomes with no transcript, and
  // a real call that never connected has none either. Open each in turn and
  // keep the first one that renders turns.
  // Find a call that actually has words in it, rather than trusting the order
  // on the page: most rows are seeded outcomes with no transcript, and a real
  // call that never connected has none either. The toggle is matched by its
  // place in the card rather than its label, because the label changes to
  // Hide the moment it is pressed.
  // DESKHELP_SHOT_CALL narrows it to one call when the first one with words in
  // it is not the one to publish. Speech to text renders a stumbled greeting
  // as something unrepeatable often enough to matter, and a transcript is a
  // record of what was said, so the fix is to choose a different call rather
  // than to edit one.
  const only = process.env.DESKHELP_SHOT_CALL;
  const cards = only ? page.locator('.card', { hasText: only }) : page.locator('.card');
  const total = await cards.count();
  for (let index = 0; index < total; index += 1) {
    const card = cards.nth(index);
    const toggle = card.locator('.card-head button').last();
    if ((await toggle.count()) === 0) continue;

    await toggle.click();
    await page.waitForTimeout(700);

    if ((await card.locator('.transcript .turn').count()) > 0) {
      await card.scrollIntoViewIfNeeded();
      await page.waitForTimeout(400);
      await shot('transcript');
      break;
    }

    await toggle.click();
    await page.waitForTimeout(200);
  }

  await page.getByRole('button', { name: /^Review queue/ }).click();
  await page.waitForTimeout(900);
  await shot('queue');

  // --- contacts ------------------------------------------------------------
  await page.getByRole('button', { name: /^Contacts/ }).click();
  await page.waitForTimeout(900);
  await shot('contacts');

  await browser.close();
  console.log('\ndone\n');
}

await main();
