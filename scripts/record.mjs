/**
 * Records the short tour the README leads with.
 *
 *   npm start          in one terminal, with DESKHELP_DEMO=true
 *   node scripts/record.mjs
 *
 * Then `scripts/togif.sh` turns it into the GIF, because a GIF plays
 * everywhere a README is read and a video tag does not.
 *
 * Scripted rather than screen-captured by hand: no cursor jitter, no
 * notification sliding in from the corner, and the same timing every time it
 * is regenerated.
 */

import { chromium } from 'playwright';
import { mkdir, rename, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const BASE = process.env.DESKHELP_URL ?? 'http://127.0.0.1:4321';
const OUT = 'assets/screens';
const TMP = '.local/recording';

const DEMO = { email: 'demo@deskhelp.ai', password: 'demo-northline-2026' };

async function main() {
  await mkdir(OUT, { recursive: true });
  await mkdir(TMP, { recursive: true });

  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    // A GIF at twice the pixels would be enormous, and a README image is read
    // at about 900 wide anyway.
    deviceScaleFactor: 1,
    recordVideo: { dir: TMP, size: { width: 1280, height: 800 } },
  });
  const page = await context.newPage();

  // Sign in off camera. Nobody needs to watch a password being typed.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.evaluate(async (demo) => {
    await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(demo),
    });
  }, DEMO);

  // Two changes to the motion, in opposite directions.
  //
  // The page's background drifts continuously. On screen that is pleasant; in
  // a GIF it changes every pixel of every frame and the file triples in size
  // for motion nobody is looking at. It goes.
  //
  // The reception scene stays, but it has to be wound forward. Its cycle runs
  // 7.8 seconds and the first 4.4 of those are deliberately still: that is the
  // gap between one ring and the next. A recorder that waits a few seconds on
  // the dashboard lands inside that gap every time and films a photograph.
  // Winding each animation on by 4.4 seconds, and keeping the offsets between
  // them, starts the tour on the ring itself.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      body { animation: none !important; }
      .logo.lg { animation: none !important; }

      .scene-handset,
      .scene-phone     { animation-delay: -4.4s !important; }
      .scene-ripple    { animation-delay:  0.2s !important; }
      .scene-ripple.d1 { animation-delay:  0.6s !important; }
      .scene-ripple.d2 { animation-delay:  1.0s !important; }
      .scene-card      { animation-delay:  0.8s !important; }
      .scene-card.d1   { animation-delay:  1.5s !important; }
    `;
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  });

  // --- the tour ------------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Long enough for the banner, the tiles, the phone to ring and the calls to
  // leave the desk and travel most of the way across.
  await page.waitForTimeout(5600);

  await page.getByRole('button', { name: /^Workflows/ }).click();
  await page.waitForTimeout(1800);

  await page.getByRole('button', { name: 'Dry run' }).first().click();
  await page.waitForSelector('.modal', { timeout: 30_000 });
  await page.waitForTimeout(1700);

  await page.locator('.modal-body').evaluate((el) => {
    const heading = [...el.querySelectorAll('h3')].find((h) =>
      h.textContent.includes('Exactly what'),
    );
    if (heading) heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
  await page.waitForTimeout(2200);

  await page.getByRole('button', { name: 'Close' }).click();
  await page.waitForTimeout(600);

  // The call log, opened on a real call. This is the part of the tour worth
  // the most: everything else is a conclusion, and this is the conversation
  // those conclusions came from.
  await page.getByRole('button', { name: /^Calls/ }).click();
  await page.waitForTimeout(1400);

  const call = page.locator('.card', { hasText: '13 Sept, 12:07' }).first();
  if (await call.count()) {
    await call.locator('.card-head button').last().click();
    await page.waitForTimeout(2600);
  }

  await page.getByRole('button', { name: /^Review queue/ }).click();
  await page.waitForTimeout(1800);

  await context.close();
  await browser.close();

  const [file] = (await readdir(TMP)).filter((name) => name.endsWith('.webm'));
  if (!file) throw new Error('playwright wrote no video');
  await rename(join(TMP, file), join(TMP, 'tour.webm'));

  console.log(`\n  recorded  ${join(TMP, 'tour.webm')}`);
  console.log('  next      bash scripts/togif.sh\n');
}

await main();
