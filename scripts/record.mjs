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

  // The page's background drifts continuously. On screen that is pleasant; in
  // a GIF it changes every pixel of every frame and the file triples in size
  // for motion nobody is looking at. The tour's own movement stays.
  await page.addInitScript(() => {
    const style = document.createElement('style');
    style.textContent = `
      body { animation: none !important; }
      .logo.lg { animation: none !important; }
    `;
    document.addEventListener('DOMContentLoaded', () => document.head.append(style));
  });

  // --- the tour ------------------------------------------------------------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  // Long enough for the banner, the tiles and the ringing phone to play.
  await page.waitForTimeout(3200);

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
