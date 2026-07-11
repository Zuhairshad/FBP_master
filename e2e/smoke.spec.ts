import { test, expect, type Browser } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import path from 'node:path'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth')

// global-setup.ts skips all seeding (with a warning) when SUPABASE_URL/
// SUPABASE_SERVICE_ROLE_KEY aren't set (e.g. no Docker available, as in
// this repo's own sandbox — see CLAUDE.md Landmines) rather than crashing,
// so this spec self-skips too instead of failing on a missing fixture.
const hasFixtures = existsSync(path.join(AUTH_DIR, 'brand.json')) && existsSync(path.join(AUTH_DIR, 'provider.json'))

async function contextFor(browser: Browser, role: 'brand' | 'provider') {
  return browser.newContext({ storageState: path.join(AUTH_DIR, `${role}.json`) })
}

// The core booking -> order -> fulfillment journey per ROADMAP.md Phase 13.
// Auth itself is covered by global-setup.ts driving the real sign-up form
// (this spec starts from already-authenticated storageState so the journey
// below stays focused on the booking/order/fulfillment path, not re-proving
// sign-up on every run).
//
// test.skip must live at the describe level, not inside the test body: this
// test declares the `browser` fixture, and Playwright creates fixtures
// before running the test callback — a skip check after that point is too
// late to prevent the (failing, since there'd be nothing to test against)
// browser launch.
test.describe('booking -> order -> fulfillment journey', () => {
  test.skip(!hasFixtures, 'e2e fixtures were not seeded, see global-setup.ts')

  test('booking -> order -> fulfillment journey @smoke', async ({ browser }) => {
    const brandContext = await contextFor(browser, 'brand')
    const providerContext = await contextFor(browser, 'provider')
    const brandPage = await brandContext.newPage()
    const providerPage = await providerContext.newPage()

    await test.step('brand requests a booking with the seeded provider', async () => {
      await brandPage.goto('/brand/bookings')
      await expect(brandPage.getByText('E2E Warehouse')).toBeVisible()

      // Phase 13 accessibility pass: this is the primary brand-facing form
      // page in the core journey, scanned for WCAG A/AA violations.
      const results = await new AxeBuilder({ page: brandPage }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(results.violations, JSON.stringify(results.violations, null, 2)).toEqual([])

      await brandPage.getByRole('button', { name: 'Request booking' }).click()
      await expect(brandPage.getByText('pending')).toBeVisible()
    })

    await test.step('provider approves the booking', async () => {
      await providerPage.goto('/provider/bookings')
      await expect(providerPage.getByText('E2E Brand Co')).toBeVisible()
      await providerPage.getByRole('button', { name: 'Approve' }).click()
      await expect(providerPage.getByText('approved')).toBeVisible()
    })

    await test.step('the seeded order becomes visible to the provider via the approved booking', async () => {
      await providerPage.goto('/provider/orders')
      await expect(providerPage.getByText('E2E Brand Co')).toBeVisible()
      await expect(providerPage.getByText(/shopify #e2e-order-1001/i)).toBeVisible()
    })

    await test.step('provider marks the order shipped with a tracking number', async () => {
      await providerPage.getByLabel('Fulfillment status').selectOption('shipped')
      await providerPage.getByLabel('Tracking number').fill('E2E-TRACK-123')
      await providerPage.getByRole('button', { name: 'Save' }).click()
      await expect(providerPage.getByText('shipped')).toBeVisible()
    })

    await test.step('brand sees the fulfillment status reflected back, read-only', async () => {
      await brandPage.goto('/brand/shopify/orders')
      await expect(brandPage.getByText('shipped')).toBeVisible()
      await expect(brandPage.getByText('E2E-TRACK-123')).toBeVisible()
    })

    await brandContext.close()
    await providerContext.close()
  })
})
