import { chromium, type FullConfig } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { Client as PgClient } from 'pg'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const AUTH_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '.auth')
const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
// Supabase CLI's fixed local-dev Postgres superuser — never used against a
// hosted project, only the ephemeral local instance `supabase start` spins
// up in CI. See supabase/config.toml's [db] port (54322).
const LOCAL_DB_URL = process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

const BRAND = { email: 'e2e-brand@example.com', password: 'e2e-password-1', displayName: 'E2E Brand', companyName: 'E2E Brand Co' }
const PROVIDER = { email: 'e2e-provider@example.com', password: 'e2e-password-1', displayName: 'E2E Provider' }

async function signUpViaUi(
  baseURL: string,
  role: 'brand' | 'provider',
  user: { email: string; password: string; displayName: string; companyName?: string },
  storageStatePath: string,
) {
  const browser = await chromium.launch()
  const page = await browser.newPage()

  await page.goto(`${baseURL}/sign-up`)
  await page.getByRole('radio', { name: role === 'brand' ? 'Brand' : 'Fulfillment Provider' }).check()
  await page.getByLabel('Name').fill(user.displayName)
  if (user.companyName) {
    await page.getByLabel('Company name (optional)').fill(user.companyName)
  }
  await page.getByLabel('Email').fill(user.email)
  await page.getByLabel('Password').fill(user.password)
  await page.getByRole('button', { name: 'Create account' }).click()

  // RoleRedirect lands on /brand or /provider once the profile row exists.
  await page.waitForURL(`${baseURL}/${role}`, { timeout: 15_000 })

  await page.context().storageState({ path: storageStatePath })
  await browser.close()
}

async function findProfileId(admin: SupabaseClient, email: string): Promise<string> {
  const { data, error } = await admin.auth.admin.listUsers()
  if (error) throw new Error(`Failed to list users while seeding: ${error.message}`)
  const user = data.users.find((u) => u.email === email)
  if (!user) throw new Error(`Seeded user ${email} not found after signUp`)
  return user.id
}

/** Seeds a warehouse+storage space for the provider and a product+platform_orders
 * row for the brand, via the service-role key — the same "bypass RLS, mirror
 * production's service-role writer" pattern every pgTAP fixture in this repo
 * already uses. The booking itself is deliberately NOT pre-seeded — creating
 * and approving it is what e2e/smoke.spec.ts's journey actually exercises. */
async function seedFixtureData(admin: SupabaseClient, brandId: string, providerId: string) {
  const { data: warehouse, error: warehouseError } = await admin
    .from('warehouses')
    .insert({
      provider_id: providerId,
      name: 'E2E Warehouse',
      address_line1: '1 Dock Rd',
      city: 'Columbus',
      postal_code: '43215',
      country: 'US',
    })
    .select()
    .single()
  if (warehouseError) throw new Error(`Failed to seed warehouse: ${warehouseError.message}`)

  const { error: spaceError } = await admin.from('storage_spaces').insert({
    warehouse_id: warehouse.id,
    name: 'E2E Pallet Rack',
    unit_type: 'pallet',
    capacity_units: 50,
  })
  if (spaceError) throw new Error(`Failed to seed storage space: ${spaceError.message}`)

  const { error: productError } = await admin.from('products').insert({
    brand_id: brandId,
    master_sku: 'E2E-SKU-001',
    name: 'E2E Widget',
  })
  if (productError) throw new Error(`Failed to seed product: ${productError.message}`)

  const { error: orderError } = await admin.from('platform_orders').insert({
    brand_id: brandId,
    platform: 'shopify',
    platform_order_id: 'e2e-order-1001',
    raw_data: { id: 1001 },
    resolved_master_sku: 'E2E-SKU-001',
    status: 'resolved',
  })
  if (orderError) throw new Error(`Failed to seed platform_orders: ${orderError.message}`)
}

/** Admin accounts have no supported self-service or REST-API provisioning
 * path in this schema (see CLAUDE.md Landmines) — the only way to seed one
 * is the same trigger-disable-for-one-UPDATE technique the pgTAP RLS tests
 * use, done here via a direct Postgres connection since the REST API (even
 * with the service-role key) still goes through the profiles_role_immutable
 * trigger. Best-effort: if this fails (e.g. DB connection details differ
 * from the assumed local default), admin coverage is skipped rather than
 * failing the whole e2e run — see visual.spec.ts's use of this file. */
async function seedAdminAccount(): Promise<string | null> {
  const client = new PgClient({ connectionString: LOCAL_DB_URL })
  try {
    await client.connect()
    const { rows } = await client.query(
      `insert into auth.users (id, email, raw_user_meta_data)
       values (gen_random_uuid(), 'e2e-admin@example.com', '{"role": "brand", "display_name": "E2E Admin"}'::jsonb)
       returning id`,
    )
    const adminId = rows[0].id as string
    await client.query('alter table public.profiles disable trigger profiles_role_immutable')
    await client.query('update public.profiles set role = $1 where id = $2', ['admin', adminId])
    await client.query('alter table public.profiles enable trigger profiles_role_immutable')
    return adminId
  } catch (err) {
    console.warn(`[global-setup] Skipping admin seed — could not connect/seed via ${LOCAL_DB_URL}:`, err)
    return null
  } finally {
    await client.end().catch(() => undefined)
  }
}

export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true })

  // No live Supabase to seed against (e.g. this repo's own sandbox has no
  // Docker — see CLAUDE.md Landmines). Every spec file checks for its own
  // storageState fixture and self-skips if absent, so the whole e2e suite
  // degrades to "0 ran" here rather than crashing — the same graceful
  // pattern already used for the admin fixture below.
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    console.warn(
      '[global-setup] SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY not set — skipping all e2e fixture seeding. ' +
        'See .github/workflows/ci.yml for how CI provides these against a local Supabase instance.',
    )
    return
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)
  const baseURL = config.projects[0]?.use?.baseURL ?? 'http://localhost:5173'

  await signUpViaUi(baseURL, 'brand', BRAND, path.join(AUTH_DIR, 'brand.json'))
  await signUpViaUi(baseURL, 'provider', PROVIDER, path.join(AUTH_DIR, 'provider.json'))

  const brandId = await findProfileId(admin, BRAND.email)
  const providerId = await findProfileId(admin, PROVIDER.email)
  await seedFixtureData(admin, brandId, providerId)

  const adminId = await seedAdminAccount()
  if (adminId) {
    // Admin has no sign-up form (never self-service) — sign in via the
    // Supabase Auth admin API isn't a browser session, so instead we
    // authenticate through the real SignInPage using a password we set here.
    const { error: passwordError } = await admin.auth.admin.updateUserById(adminId, { password: 'e2e-password-1' })
    if (!passwordError) {
      const browser = await chromium.launch()
      const page = await browser.newPage()
      await page.goto(`${baseURL}/sign-in`)
      await page.getByLabel('Email').fill('e2e-admin@example.com')
      await page.getByLabel('Password').fill('e2e-password-1')
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL(`${baseURL}/admin`, { timeout: 15_000 }).catch(() => undefined)
      await page.context().storageState({ path: path.join(AUTH_DIR, 'admin.json') })
      await browser.close()
    }
  }
}
