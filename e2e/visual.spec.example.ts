// INSTALL: <repo-root>/e2e/visual.spec.ts   (rename: drop ".example")
// Visual regression: every route listed here gets a committed baseline
// screenshot; any future pixel drift beyond the threshold is a RED test.
// This turns "the UI silently changed" from a surprise into a failing gate.
//
// Baselines: first run creates them —
//     npx playwright test e2e/visual.spec.ts --update-snapshots
// Commit the generated *-snapshots/ directory.
//
// IMPORTANT — baselines are OS-specific (font rendering differs across
// Linux/macOS). Generate and update them on ONE platform: your CI runner
// (Linux). Locally-made macOS baselines will fail in CI by a few thousand
// pixels and teach everyone to ignore the check. When a visual change is
// intentional: update snapshots, eyeball the new baseline, commit it, and say
// so in the What & Why. Updating a baseline without looking is deleting a test.

import { test, expect } from '@playwright/test';

// Extend as routes ship. Auth-gated routes: add a login step or storageState.
const routes: string[] = [
  '/',
  // '/login',
  // '/dashboard',
];

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
];

for (const route of routes) {
  for (const vp of viewports) {
    test(`visual: ${route} @ ${vp.name} @visual`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await page.goto(route, { waitUntil: 'networkidle' });

      // Kill animation/caret nondeterminism before comparing pixels.
      await page.addStyleTag({
        content: `*, *::before, *::after {
          animation: none !important;
          transition: none !important;
          caret-color: transparent !important;
        }`,
      });

      const name = `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}-${vp.name}.png`;
      await expect(page).toHaveScreenshot(name, {
        fullPage: true,
        maxDiffPixelRatio: 0.01, // 1% tolerance; tighten as the UI stabilizes
      });
    });
  }
}
