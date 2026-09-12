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
