/**
 * The card people see when the link is pasted into a chat, a form or a
 * timeline.
 *
 * It is the landing hero at twice the pixels, which is what the `og:image`
 * meta tags in `ui/index.html` declare: 2880 by 1800. Chat clients crop the
 * bottom of a card aggressively, so the shot stops above the fold rather than
 * scrolling: the badge, the headline and the first line under it are the part
 * that has to survive.
 *
 * Run it whenever the hero copy changes, or the card goes on saying something
 * the page no longer says.
 */

import { chromium } from 'playwright';

const BASE = process.env.DESKHELP_URL ?? 'http://127.0.0.1:4321';
const OUT = 'ui/public/og.png';

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 2,
});

await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
// The hero animates in on a stagger. Let it finish, or the card catches the
// headline halfway through its rise.
await page.waitForTimeout(1500);
await page.screenshot({ path: OUT });

await browser.close();
console.log(`  ${OUT}  2880x1800`);
