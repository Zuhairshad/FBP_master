import { defineConfig, devices } from '@playwright/test'

// Phase 13: real e2e/visual infra. Runs against a local Vite dev server
// pointed at a local Supabase instance (supabase start) — see
// e2e/global-setup.ts for how test sessions/data get seeded, and
// .github/workflows/ci.yml for how CI wires the local Supabase env vars
// into this dev server's process.env before it starts.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['html', { open: 'never' }], ['github']] : 'list',
  outputDir: 'test-results',
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...devices['Desktop Chrome'],
    // Optional local override for environments where Playwright's own
    // browser-version resolution doesn't match what's actually installed
    // (e.g. a pre-provisioned sandbox with a pinned Chromium build) —
    // unset in CI, which installs its own exactly-matched browser via
    // `playwright install --with-deps chromium`.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH }
      : undefined,
  },
  webServer: {
    command: 'pnpm --filter app exec vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
