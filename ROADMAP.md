# ROADMAP — FBP rebuild

Living project plan. One phase at a time, in order — a phase doesn't start until the
previous one is floor-green, tested, and committed. Each phase gets its own **Recon
Report → Plan → Build Loop → Verify → Review → Commit → What & Why** pass per
WORKFLOW.md; this file is the map, not a replacement for that loop.

Status legend: `[ ]` not started · `[~]` in progress · `[x]` done · `(blocked: ...)` waiting
on something outside this repo (client credential, decision, etc).

---

## Phase 0 — Foundations `[x]`

pnpm workspace scaffold (`app/` Vite+React+TS+Tailwind, `worker/` Cloudflare Worker,
`supabase/` local config), engineering-os workflow installed, CI ship-gate wired,
`CLAUDE.md` filled from evidence. Done — see commits `ba21c5d`, `c99ef48`, `9dc894b`.

---

## Phase 1 — Auth & Roles Foundation `[x]`

**Goal:** a user can sign up/sign in via Supabase Auth, lands with exactly one role
(brand / provider / admin), and RLS enforces that from the very first table onward.

Merged to `main` via PR #3.

- [x] Decide + document: `profiles` table (id → `auth.users.id`, `role` enum, display
      name, company name) + Postgres trigger to auto-create a profile row on signup
- [x] Migration: `role` enum (`brand`, `provider`, `admin`), `profiles` table, trigger
- [x] RLS policies: anon → none; authenticated user → read/update own profile only;
      no cross-user access (admin read-all deferred until Phase 12 unless trivial now)
- [x] RLS tests: anon denied, user A full access to own row, user B denied on A's row —
      written, **not yet executed against a live Postgres** (see Landmines in `CLAUDE.md`)
- [x] Frontend: sign-up form (role picker: brand or provider — admin is seeded, not
      self-serve), sign-in, sign-out, session hook (`useAuth` or equivalent)
- [x] Route guard: unauthenticated → sign-in; authenticated → role-based landing
      (`/brand`, `/provider`, `/admin` placeholder dashboards, empty shells for now)
- [x] `pnpm db:types` — hand-authored interim types committed; **live regeneration still
      pending**, same DB blocker
- [x] Floor + RLS policy tests + component tests for auth forms + build
- [x] Eyes: sign-up/sign-in pages, desktop + mobile

---

## Phase 2 — Core Data Model `[x]`

**Goal:** provider can set up a warehouse profile with services/storage spaces; brand
can create product listings with a Master SKU. No cross-tenant leakage.

Merged to `main` via PR #4.

- [x] Migration: `warehouses`, `warehouse_services`, `storage_spaces` (provider-owned)
- [x] Migration: `products` (brand-owned: `master_sku`, name, description, etc.)
- [x] RLS: provider manages only own warehouse rows; brand manages only own products
      (plus a role check on insert — see `CLAUDE.md`)
- [x] RLS tests per table (anon / owner / other-tenant negative case) — written, **not yet
      executed against a live Postgres** (this sandbox has no DB access; deferred per plan)
- [x] Frontend: provider "Warehouse Setup" page; brand "Products" CRUD page
- [x] Component tests for both CRUD flows (mocked Supabase client)
- [x] Floor + Foundation-rung full suite (this is shared/foundation schema) + build — all green
- [x] Eyes: unauthenticated redirect confirmed clean on both routes; **full visual check of the
      authenticated forms is UNVERIFIED** (needs a live session, same DB blocker)

---

## Phase 3 — Booking Flow (Brand ↔ Provider) `[ ]`

**Goal:** brand finds a provider and requests a booking; provider approves/rejects;
on approval, the brand's inventory becomes visible in that provider's dashboard —
mirrors the original system's core workflow and its brand-isolation guarantee.

- [ ] Migration: `booking_requests` (brand_id, provider_id, storage_space_id, status
      enum: pending/approved/rejected, timestamps)
- [ ] Migration: `inventory` (product_id, warehouse_id, quantity)
- [ ] RLS: only the two parties on a booking can see/update it; inventory visible to
      the owning brand always, to a provider only via an approved booking
- [ ] RLS tests: booking C (uninvolved brand/provider) cannot see booking A↔B
- [ ] Frontend: provider directory/search for brand; request UI; provider
      approve/reject UI; inventory view scoped correctly on both sides
- [ ] Integration test: approve flow actually flips inventory visibility
- [ ] Floor + integration tests for the changed path + build
- [ ] Eyes on directory, request, and inventory pages

---

## Phase 4 — SKU Mapping System `[ ]`

**Goal:** every marketplace-assigned SKU resolves back to the warehouse Master SKU —
the piece the original system left at "backend 50%, UI 0%." Must exist before any
marketplace order-sync work lands, since sync depends on this resolution.

- [ ] Migration: `sku_mappings` (product_id, platform enum, platform_sku, unique per
      platform+brand)
- [ ] RLS: brand manages only its own mappings
- [ ] RLS tests + uniqueness-constraint test (duplicate platform_sku per brand rejected)
- [ ] Frontend: SKU Mapping UI — table of platform SKUs linked to Master SKU, bulk entry
- [ ] Floor + integration tests + build
- [ ] Eyes on the mapping UI

---

## Phase 5 — Marketplace Integration: Shopify `[ ]`

**Goal:** brand connects a Shopify store, orders sync into a unified `platform_orders`
table, resolved through Phase 4's SKU mapping, visible to the booked provider only.
Going first because it was the cleanest, fully-working integration in the original
system — lowest-risk template for Phases 6–9 to copy.

**Blocked on (live-credential testing only, not build/mock-test work):** a Shopify dev
store + API credentials.

- [ ] Migration: `platform_orders` (brand_id, platform, platform_order_id unique per
      platform, raw_data jsonb, resolved master_sku, status), `shopify_tokens`
      (service-role access only; RLS locked down as defense-in-depth even though the
      Worker uses the service key)
- [ ] Worker: `ShopifyApiService` (auth, fetch orders), token CRUD, per-brand webhook
      receiver route, manual "sync now" endpoint
- [ ] Worker tests: MSW-mocked Shopify API, in the Workers runtime
      (`@cloudflare/vitest-pool-workers`)
- [ ] Frontend: brand "Connect Shopify" page, order list + detail pages, manual sync
      button
- [ ] RLS tests on `platform_orders` / `shopify_tokens`
- [ ] e2e `@smoke`: connect → orders visible → provider sees them (booking-gated)
- [ ] Floor + Foundation rung (new shared `platform_orders` shape) + build + smoke
- [ ] Eyes on connect + order pages

---

## Phase 6 — Marketplace Integration: TikTok Shop `[ ]`

Same shape as Phase 5. TikTok-specifics: HMAC-SHA256 request signing, auth-code →
token exchange (`auth.tiktok-shops.com` / `open-api.tiktokglobalshop.com`).

- [ ] `TiktokApiService` + `tiktok_tokens` + webhook route + sync endpoint
- [ ] Worker tests (MSW), RLS tests, connect + order UI, e2e `@smoke`
- [ ] Floor + tests + build + smoke; Eyes

---

## Phase 7 — Marketplace Integration: Amazon SP-API `[ ]`

**Blocked on (live testing):** client's production Seller refresh token — build and
test against the SP-API **sandbox** regardless.

- [ ] `AmazonSpApiService` (LWA token refresh, `getOrders`/`getOrderItems`) +
      `amazon_tokens` + webhook/sync route
- [ ] Worker tests (MSW against sandbox shapes), RLS tests, connect + order UI, `@smoke`
- [ ] Floor + tests + build + smoke; Eyes

---

## Phase 8 — Marketplace Integration: eBay `[ ]`

**Blocked on (live testing):** client must re-register at developer.ebay.com (prior
account rejected) — build and test against eBay sandbox/mocks regardless.

- [ ] `EbayApiService` (OAuth token management) + `ebay_tokens` + webhook/sync route
- [ ] Worker tests (MSW), RLS tests, connect + order UI, `@smoke`
- [ ] Floor + tests + build + smoke; Eyes

---

## Phase 9 — Marketplace Integration: Walmart `[ ]`

**Blocked on (live testing):** client needs a new US-based Walmart seller account
(prior one terminated) — build and test against mocks regardless.

- [ ] `WalmartApiService` (client-credentials flow) + `walmart_tokens` + webhook/sync route
- [ ] Worker tests (MSW), RLS tests, connect + order UI, `@smoke`
- [ ] Floor + tests + build + smoke; Eyes

---

## Phase 10 — Order Sync Automation `[ ]`

**Goal:** replace "manual sync button only" with real background sync across all
connected platforms.

- [ ] `wrangler.toml` `[triggers] crons` + scheduled handler in the Worker
- [ ] Per-platform sync orchestration, idempotent upsert (no duplicate orders on rerun)
- [ ] `sync_logs` table (run started/finished, per-platform success/failure counts)
- [ ] Worker tests for the scheduled handler (`@cloudflare/vitest-pool-workers` covers
      `scheduled()`, not just `fetch()`)
- [ ] Floor + Foundation rung (touches the shared sync path for every platform) + build

---

## Phase 11 — Provider Fulfillment Dashboard `[ ]`

**Goal:** provider picks/packs/ships an order and updates status + tracking; brand
sees status changes reflected back.

- [ ] `order_status` enum + tracking fields on `platform_orders` (or a child table)
- [ ] Provider UI: status transitions, tracking number entry
- [ ] Brand UI: read-only status/tracking view
- [ ] RLS: status mutation restricted to the fulfilling provider only
- [ ] Integration tests for status transitions; RLS negative test (other provider
      cannot mutate)
- [ ] Floor + integration tests + build; Eyes

---

## Phase 12 — Admin Panel `[ ]`

**Goal:** admin oversight — view all brands/providers/orders, basic moderation.

- [ ] Decide access pattern: admin-only RLS policies vs. service-role-backed Worker
      endpoints for admin reads (**ask-trigger — this is an authz-model decision,
      surface it before building**)
- [ ] Admin UI: user list, booking oversight, order oversight
- [ ] RLS/authz tests proving non-admin roles are refused on every admin endpoint
- [ ] Floor + tests + build; Eyes

---

## Phase 13 — Testing & Hardening Pass `[ ]`

**Goal:** close whatever gaps accumulated across Phases 1–12 before calling this
production-ready.

- [ ] Full RLS test audit — every table has anon/owner/other-tenant coverage
- [ ] e2e `@smoke` covers auth, the core booking→order→fulfillment journey
- [ ] `e2e/visual.spec.example.ts` → real `visual.spec.ts` with every route, Linux
      baselines generated in CI (not locally on macOS)
- [ ] Full ship-gate: full suite + build + full e2e, everything green
- [ ] Accessibility pass on primary dashboards (keyboard nav, contrast, aria labels)

---

## Phase 14 — Deployment `[ ]`

**Blocked on:** domain DNS pointed at wherever we host (client-owned decision —
Cloudflare Pages makes this simpler than the original VPS/certbot setup: Cloudflare
issues SSL automatically once DNS is proxied through it, no manual certbot dance).

- [ ] Cloudflare Pages deploy for `app/`, Workers deploy for `worker/`
- [ ] Production secrets via `wrangler secret put` (never in `wrangler.toml`)
- [ ] Supabase: promote/point to production project, confirm RLS is on for every table
      in prod (not just local)
- [ ] Domain + SSL via Cloudflare once DNS is pointed
- [ ] Basic monitoring: Worker error/latency visibility, Supabase logs reviewed

---

## Open decisions to confirm before Phase 1 starts

1. Supabase project URL + anon key — or develop Phase 1–4 entirely against local
   `supabase start` and connect the hosted project starting Phase 5 (first real
   external integration)?
2. `supabase link` now, or later?
3. Sign-up flow: does a brand/provider pick their role at signup, or is that assigned
   by an admin/invite afterward? (Original system: implicit in seeded test accounts,
   not really specified — this needs a real decision.)
