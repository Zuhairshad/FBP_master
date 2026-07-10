#!/usr/bin/env node
// INSTALL: <repo-root>/scripts/eyes.mjs
// USAGE:   node scripts/eyes.mjs http://localhost:3000 http://localhost:3000/checkout
//
// Gives the agent (and you) literal eyes on the running UI:
//   1. Screenshots every URL at desktop (1440x900) and mobile (390x844) -> .eyes/
//   2. Captures console errors, page crashes, and failed requests
//   3. EXITS 1 if any page threw or logged errors — a page that renders but
//      throws is red, whatever the screenshot looks like.
//
// Doctrine (SKILLS.md -> Eyes): after any UI change the agent runs this against
// the affected routes, then OPENS AND READS each screenshot before claiming the
// UI is done. Passing tests prove behavior; only looking proves layout.
//
// Uses the same Chromium that Playwright already installed (npx playwright
// install chromium) — one browser stack for e2e, visual regression, and eyes.

import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const urls = process.argv.slice(2);
if (urls.length === 0) {
  console.error('usage: node scripts/eyes.mjs <url> [url...]');
  process.exit(1);
}

const OUT = '.eyes';
mkdirSync(OUT, { recursive: true });

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

const slug = (u) => {
  const p = new URL(u);
  return (p.host + p.pathname).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root';
};

// This environment pre-installs Chromium at a fixed path/build rather than
// whatever build the installed @playwright/test version expects — pin it
// explicitly instead of letting Playwright resolve (and fail on) its own
// expected bundled version.
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
let red = false;

for (const url of urls) {
  for (const vp of viewports) {
    const problems = [];
    const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });

    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('requestfailed', (r) => {
      if (!r.url().includes('favicon')) problems.push(`request failed: ${r.url()} (${r.failure()?.errorText})`);
    });

    try {
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 });
      const file = `${OUT}/${slug(url)}.${vp.name}.png`;
      await page.screenshot({ path: file, fullPage: true });
      const status = problems.length ? 'RED' : 'ok';
      console.log(`[${status}] ${url} @ ${vp.name} -> ${file}`);
    } catch (e) {
      problems.push(`navigation failed: ${e.message}`);
      console.log(`[RED] ${url} @ ${vp.name} -> did not render`);
    }

    for (const p of problems) console.log(`       ${p}`);
    if (problems.length) red = true;
    await page.close();
  }
}

await browser.close();

if (red) {
  console.error('\nEYES: RED — errors above are blocking. Fix, rerun, then look at the screenshots.');
  process.exit(1);
}
console.log('\nEYES: clean. Now actually open the .eyes/ screenshots and look at them.');
