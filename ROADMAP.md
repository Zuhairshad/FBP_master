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

## Phase 3 — Booking Flow (Brand ↔ Provider) `[x]`

**Goal:** brand finds a provider and requests a booking; provider approves/rejects;
on approval, the brand's inventory becomes visible in that provider's dashboard —
mirrors the original system's core workflow and its brand-isolation guarantee.

Merged to `main` via PR #5.

- [x] Migration: `booking_requests` (brand_id, provider_id, storage_space_id, status
      enum: pending/approved/rejected, timestamps) — `provider_id` is trigger-derived,
      never client-supplied (see `CLAUDE.md`)
- [x] Migration: `inventory` (product_id, warehouse_id, quantity)
- [x] Migration: directory-visibility policies on `profiles`/`warehouses`/
      `warehouse_services`/`storage_spaces` — needed so a brand can browse providers
      *before* any booking relationship exists (see `CLAUDE.md` for the rationale and
      the resulting update to Phase 1/2's RLS test assertions)
- [x] RLS: only the two parties on a booking can see/update it; inventory visible to
      the owning brand always, to a provider only via an approved booking
- [x] RLS tests: booking C (uninvolved brand/provider) cannot see booking A↔B — written
      (`booking_requests_rls.test.sql`), **not yet executed against a live Postgres**
      (same sandbox DB blocker as every phase so far)
- [x] Frontend: provider directory/search for brand (`BookingsPage`); request UI (same
      page); provider approve/reject UI (`ProviderBookingsPage`); inventory view scoped
      correctly on both sides (`InventoryPage` brand-side, `ProviderInventoryPage`
      provider-side, read-only)
- [x] Integration test: approve flow actually flips inventory visibility — written as a
      pgTAP test (`inventory_rls.test.sql`, asserts provider visibility before and after
      the booking's status flips to `approved`), **not yet executed**, same DB blocker
- [x] Component tests for all four new pages (mocked Supabase client)
- [x] Floor + Foundation-rung full suite (new shared tables) + build — all green
- [x] Eyes: unauthenticated redirect confirmed clean on all four new routes; **full
      visual check of the authenticated flows is UNVERIFIED** (needs a live session,
      same DB blocker as every phase so far)

---

## Phase 4 — SKU Mapping System `[x]`

**Goal:** every marketplace-assigned SKU resolves back to the warehouse Master SKU —
the piece the original system left at "backend 50%, UI 0%." Must exist before any
marketplace order-sync work lands, since sync depends on this resolution.

Merged to `main` via PR #6.

- [x] Migration: `sku_mappings` (product_id, platform enum, platform_sku, unique per
      platform+brand — enforced via a trigger-derived `brand_id` column, since a unique
      constraint can't span a join; see `CLAUDE.md`)
- [x] RLS: brand manages only its own mappings — the `brand_id` derivation trigger
      doubles as the authorization check (see `CLAUDE.md`), so no separate role check
      was needed unlike `products`/`warehouses`
- [x] RLS tests + uniqueness-constraint test (duplicate platform_sku per brand rejected) —
      written (`sku_mappings_rls.test.sql`), **not yet executed against a live Postgres**
      (same sandbox DB blocker as every phase so far)
- [~] Frontend: SKU Mapping UI (`SkuMappingsPage`) — form to map a Master SKU + platform
      + platform SKU, list of existing mappings with delete. **Scope note:** this phase's
      goal line calls for "bulk entry"; what's built is single-row entry (matching
      `ProductsPage`/`InventoryPage`'s existing form pattern) — a brand with many SKUs to
      map will be doing it one at a time. Flagging rather than silently dropping it;
      revisit with a CSV/paste-in bulk form if that friction turns out to matter.
- [x] Component tests for the mapping page (mocked Supabase client)
- [x] Floor + Foundation-rung full suite (new shared table) + build — all green
- [x] Eyes: unauthenticated redirect confirmed clean on `/brand/sku-mappings`; **full
      visual check of the authenticated form is UNVERIFIED** (needs a live session,
      same DB blocker as every phase so far)

---

## Phase 5 — Marketplace Integration: Shopify `[~]`

**Goal:** brand connects a Shopify store, orders sync into a unified `platform_orders`
table, resolved through Phase 4's SKU mapping, visible to the booked provider only.
Going first because it was the cleanest, fully-working integration in the original
system — lowest-risk template for Phases 6–9 to copy.

**Blocked on (live-credential testing only, not build/mock-test work):** a Shopify dev
store + API credentials.

- [x] Migration: `platform_orders` (brand_id, platform, platform_order_id unique per
      platform, raw_data jsonb, resolved master_sku, status), `shopify_tokens`
      (service-role access only; RLS locked down as defense-in-depth — zero policies at
      all, not just owner-only, since the Worker's service-role key is the only writer;
      see `CLAUDE.md`)
- [x] Worker: OAuth install/callback (signed-state CSRF binding + Shopify callback HMAC
      verification), order fetch + SKU-resolved upsert (`sync.ts`), per-brand webhook
      receiver route (HMAC-verified), manual "sync now" endpoint, `/shopify/status`
      (frontend's only way to read connection state, since `shopify_tokens` has zero
      RLS policies — see `CLAUDE.md`)
- [x] Worker tests: **deviated from MSW** — every Supabase/Shopify call takes an
      injected `fetchImpl` (defaulting to global `fetch`), forwarded into supabase-js's
      own `global.fetch` option for admin-client calls; tests inject a fake `fetch`
      directly instead of intercepting at the Node network layer. Verified empirically
      in this sandbox (not assumed) — MSW's compatibility with
      `@cloudflare/vitest-pool-workers`' workerd runtime was the flagged risk going in;
      dependency-injection sidesteps it entirely and needed no new dependency. 64 worker
      tests, all in the Workers runtime.
- [x] Frontend: brand "Connect Shopify" page (`ShopifyConnectPage` — connect form +
      status + manual sync), brand order list (`ShopifyOrdersPage`), provider read-only
      order list (`ProviderOrdersPage`, booking-gated). **Scope note:** no separate
      order-detail route — detail is inline in the list row (resolved SKU or
      unmapped/pending badge), matching every other list page in this repo (none of
      which have a detail route either). Revisit if orders grow enough fields to need one.
- [x] RLS tests on `platform_orders` (anon/owner/other-tenant/approved-booking-provider)
      / `shopify_tokens` (zero-policy: anon and even the owning brand get nothing) —
      written (`platform_orders_rls.test.sql`, `shopify_tokens_rls.test.sql`), **not yet
      executed against a live Postgres** (same sandbox DB blocker as every phase so far)
- [ ] e2e `@smoke`: connect → orders visible → provider sees them (booking-gated) — **not
      built.** `e2e/visual.spec.example.ts` has been an unwired template since Phase 1;
      no phase has been first to wire real e2e yet despite having real pages each time.
      This is a carried-forward, repo-wide gap (Phase 13 is where `ROADMAP.md` already
      commits to closing it), not something Phase 5 introduces — flagging rather than
      silently building a one-off e2e spec that breaks the pattern every other phase set.
- [x] Floor + Foundation rung (new shared `platform_orders`/`shopify_tokens` shape,
      first real Worker service layer) + build — all green
- [x] Eyes: unauthenticated redirect confirmed clean on `/brand/shopify`,
      `/brand/shopify/orders`, `/provider/orders` (desktop + mobile, no console errors);
      **full visual check of the authenticated flows is UNVERIFIED** (needs a live
      session, same DB blocker as every phase so far). OAuth round-trip against a real
      Shopify store is UNVERIFIED end-to-end (needs live credentials, per the blocker
      above) — every HMAC/state/token-exchange code path is unit-tested against
      Shopify's documented wire format instead.

---

## Phase 6 — Marketplace Integration: TikTok Shop `[~]`

Same shape as Phase 5. TikTok-specifics: HMAC-SHA256 request signing, auth-code →
token exchange (`auth.tiktok-shops.com` / `open-api.tiktokglobalshop.com`).

**Blocked on (live-credential testing only, not build/mock-test work):** a TikTok Shop
Partner Center app + test seller account. Additionally, TikTok's own API docs
(`partner.tiktokshop.com`) returned HTTP 403 from this sandbox's network policy when
fetched directly — the request-signing algorithm, OAuth flow, and order/webhook shapes
below are built from secondary sources describing the same published spec, not a
first-party doc fetch (see `CLAUDE.md` Landmines). Everything is unit-tested against
this documented format; live wire-format verification is a superset of the credential
blocker above.

- [x] Migration: `tiktok_tokens` (mirrors `shopify_tokens` exactly — zero RLS policies,
      service-role only; `platform_orders` needed no schema change, its `platform`
      column already accepts `'tiktok'`)
- [x] Worker: `worker/src/tiktok/` — HMAC-SHA256 request signing (`signRequest`:
      secret-wrapped, sorted-params string, hex uppercase), auth-code → token exchange,
      an "authorized shops" resolution call (TikTok's callback carries no shop id,
      unlike Shopify's), order fetch + SKU-resolved upsert, webhook receiver,
      manual sync endpoint, `/tiktok/status`. **Deviated from the "`TiktokApiService`"
      single-class naming** — kept Phase 5's file-per-concern module shape
      (`client.ts`/`supabaseAdmin.ts`/`sync.ts`/`handlers.ts`) instead, since that's what
      Phase 5 actually built (this line's naming predates that decision)
- [x] **Deviated from MSW**, same as Phase 5: every network-calling function takes an
      injected `fetchImpl`. 49 new worker tests (113 total), all in the Workers runtime
- [x] Extracted `worker/src/shared/hmac.ts` + `oauthState.ts` out of `shopify/` (both were
      already fully generic, no Shopify-specific logic) rather than duplicating them a
      third time for TikTok — Phases 7-9 reuse the same shared module
- [x] RLS tests: `tiktok_tokens_rls.test.sql` (zero-policy shape, mirrors
      `shopify_tokens_rls.test.sql`) — written, **not yet executed against a live
      Postgres** (same sandbox DB blocker as every phase so far). `platform_orders`'
      existing RLS tests already cover multi-platform visibility generically, no new
      test needed there
- [x] Frontend: `TiktokConnectPage` (no shop-domain input needed — TikTok's authorize
      URL takes no shop parameter, unlike Shopify's), `TiktokOrdersPage`
- [x] **Bug found and fixed during this phase, not introduced by it**: `ShopifyOrdersPage`
      queried `platform_orders` with no `platform` filter — harmless with only one
      platform connected (Phase 5), a real cross-platform leak once a second platform's
      orders share the same table. Added `.eq('platform', 'shopify')` /
      `.eq('platform', 'tiktok')` to both pages' queries, with test coverage asserting
      the filter
- [ ] e2e `@smoke`: same carried-forward, repo-wide gap as Phase 5 (Phase 13 closes it)
- [x] Floor + Foundation rung (touched shared Worker structure: extracted `shared/`,
      widened the `Env` type) + build + `wrangler deploy --dry-run` — all green
- [x] Eyes: unauthenticated redirect confirmed clean on `/brand/tiktok` and
      `/brand/tiktok/orders` (desktop + mobile, no console errors); **full visual check
      of the authenticated flows is UNVERIFIED** (needs a live session, same DB blocker
      as every phase so far). OAuth/signing round-trip against a real TikTok Shop app is
      UNVERIFIED end-to-end (needs live credentials + first-party doc access, per the
      blocker above)

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
