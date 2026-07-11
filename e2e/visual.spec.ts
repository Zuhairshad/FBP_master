// Visual regression: every route below gets a committed baseline screenshot;
// any future pixel drift beyond the threshold is a RED test. Also runs an
// axe-core accessibility scan per route (Phase 13's "accessibility pass on
// primary dashboards" — keyboard nav/aria is exercised structurally by axe's
// rule set; contrast is checked directly since jsdom component tests can't
// compute real rendered contrast).
//
// Baselines: first run creates them —
//     pnpm exec playwright test e2e/visual.spec.ts --update-snapshots
// Commit the generated *-snapshots/ directory.
//
// IMPORTANT — baselines are OS-specific (font rendering differs across
// Linux/macOS). Generate and update them on ONE platform: the CI runner
// (Linux), per this file's own doctrine in TESTING.md. When a visual change
// is intentional: update snapshots, eyeball the new baseline, and say so in
// the What & Why. Updating a baseline without looking is deleting a test.

import { test, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth')

// global-setup.ts skips seeding gracefully (with a warning) when no live
// Supabase is available — every authenticated describe block below checks
// its own fixture file up front and self-skips rather than failing on a
// missing storageState. Checked at module load, not inside a test body,
// since test.use({ storageState }) resolves the file eagerly when the
// context is created, before any per-test skip logic would run.
const BRAND_STATE_PATH = path.join(AUTH_DIR, 'brand.json')
const PROVIDER_STATE_PATH = path.join(AUTH_DIR, 'provider.json')
const ADMIN_STATE_PATH = path.join(AUTH_DIR, 'admin.json')
const hasBrandFixture = existsSync(BRAND_STATE_PATH)
const hasProviderFixture = existsSync(PROVIDER_STATE_PATH)
const hasAdminFixture = existsSync(ADMIN_STATE_PATH)

const viewports = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]

function snapshotName(route: string, viewportName: string) {
  return `${route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '') || 'root'}-${viewportName}.png`
}

async function checkRoute(page: import('@playwright/test').Page, route: string) {
  for (const vp of viewports) {
    await page.setViewportSize({ width: vp.width, height: vp.height })
    await page.goto(route, { waitUntil: 'networkidle' })

    // Kill animation/caret nondeterminism before comparing pixels.
    await page.addStyleTag({
      content: `*, *::before, *::after {
        animation: none !important;
        transition: none !important;
        caret-color: transparent !important;
      }`,
    })

    await expect(page).toHaveScreenshot(snapshotName(route, vp.name), {
      fullPage: true,
      maxDiffPixelRatio: 0.01,
    })
  }

  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
  expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])
}

test.describe('unauthenticated routes', () => {
  for (const route of ['/sign-up', '/sign-in']) {
    test(`visual + a11y: ${route} @visual`, async ({ page }) => {
      await checkRoute(page, route)
    })
  }
})

test.describe('brand routes', () => {
  test.skip(!hasBrandFixture, 'e2e fixtures were not seeded, see global-setup.ts')
  test.use({ storageState: BRAND_STATE_PATH })

  const routes = [
    '/brand',
    '/brand/products',
    '/brand/bookings',
    '/brand/inventory',
    '/brand/sku-mappings',
    '/brand/shopify',
    '/brand/shopify/orders',
    '/brand/tiktok',
    '/brand/tiktok/orders',
    '/brand/amazon',
    '/brand/amazon/orders',
    '/brand/ebay',
    '/brand/ebay/orders',
    '/brand/walmart',
    '/brand/walmart/orders',
  ]

  for (const route of routes) {
    test(`visual + a11y: ${route} @visual`, async ({ page }) => {
      await checkRoute(page, route)
    })
  }
})

test.describe('provider routes', () => {
  test.skip(!hasProviderFixture, 'e2e fixtures were not seeded, see global-setup.ts')
  test.use({ storageState: PROVIDER_STATE_PATH })

  const routes = [
    '/provider',
    '/provider/warehouses',
    '/provider/bookings',
    '/provider/inventory',
    '/provider/orders',
  ]

  for (const route of routes) {
    test(`visual + a11y: ${route} @visual`, async ({ page }) => {
      await checkRoute(page, route)
    })
  }
})

// Admin has no supported self-service provisioning path (see CLAUDE.md
// Landmines) — global-setup.ts seeds one via a direct Postgres connection
// and skips gracefully if that fails, so admin visual/a11y coverage is
// best-effort rather than a hard requirement for the whole suite.
test.describe('admin routes', () => {
  test.skip(!hasAdminFixture, 'admin fixture seed was skipped, see global-setup.ts')
  test.use({ storageState: ADMIN_STATE_PATH })

  const routes = ['/admin', '/admin/users', '/admin/bookings', '/admin/orders', '/admin/sync-logs']

  for (const route of routes) {
    test(`visual + a11y: ${route} @visual`, async ({ page }) => {
      await checkRoute(page, route)
    })
  }
})
