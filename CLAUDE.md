<!-- INSTALL: <repo-root>/CLAUDE.md  (commit it — this is shared team knowledge) -->

# CLAUDE.md — FBP (Fulfillment By People) — rebuild

This file holds **facts about this repo**. Discipline (evidence, recon, verification ladder,
teaching) comes from the global contract and applies here in full.

The imports below are the loading mechanism: Claude Code inlines each file into
context at session launch, and re-reads them from disk after `/compact`. They are
binding, not reference material. (Sanity-check once per machine with `/memory`.)

@WORKFLOW.md
@TESTING.md
@SKILLS.md
@DESIGN.md

## What this is

FBP (Fulfillment By People) is a multi-platform fulfillment management SaaS: it connects
Brands (sellers) with Fulfillment Providers (warehouse owners) and syncs orders from
marketplaces (Amazon, TikTok, eBay, Walmart, Shopify) into the provider's dashboard. This
repo is a **from-scratch rebuild** of an existing PHP/Laravel + React version on a new stack
(React/Vite SPA + Supabase + Cloudflare Workers) — see `Overrides` for why. **Current state:**
auth + role model built (Phase 1 of `ROADMAP.md`) — sign-up/sign-in, brand/provider/admin roles,
RLS on `profiles`. Phase 2 built on top: provider warehouse setup (`warehouses` +
`warehouse_services` + `storage_spaces`) and brand product listings (`products`, Master SKU),
both owner-only RLS with a role check on insert. Phase 3 built on top of that: a directory
so brands can browse providers/warehouses, a brand↔provider booking request flow
(`booking_requests`, pending/approved/rejected), and brand-owned `inventory` that becomes
visible to a provider once a booking is approved. Phase 4 built on top of that: `sku_mappings`
resolves a marketplace SKU back to a brand's Master SKU, brand-owned via a trigger-derived
`brand_id`. Phase 5 built on top of that: the first real marketplace integration — a brand
connects a Shopify store via OAuth, orders sync (manually or via webhook) into a unified
`platform_orders` table resolved through Phase 4's SKU mapping, and the Worker (`worker/`)
went from an empty scaffold to a real service layer for the first time. Phase 6 built on
top of that: the second marketplace integration — TikTok Shop, same shape as Shopify,
sharing `platform_orders` with no schema change. Phase 7 built on top of that: the third
marketplace integration — Amazon SP-API, structurally different from Shopify/TikTok
(no OAuth redirect flow, no request signing, no webhook — see its write-up below for
why each of those is a deliberate deviation, not a shortcut). Phase 8 built on top of
that: the fourth marketplace integration — eBay, back to the OAuth-redirect shape
(like Shopify/TikTok, not Amazon's self-authorization), plus a mandatory
Marketplace Account Deletion notification endpoint eBay requires independent of any
order webhook. Phase 9 built on top of that: the fifth and final marketplace
integration — Walmart, a third distinct auth model (OAuth client-credentials grant,
brand-submitted Client ID + Client Secret, no browser redirect and no long-lived
refresh_token at all) — completing all three auth-model shapes this repo has
encountered across five marketplaces. Phase 10 built on top of that: **Order Sync
Automation** — every platform's manual-sync-only model gets a real `scheduled()` cron
handler (`worker/src/scheduledSync.ts`) that syncs every connected brand on all five
platforms on a timer, with a `sync_logs` row per platform per run. Phase 11 built on
top of that: **Provider Fulfillment Dashboard** — a provider now picks/packs/ships an
order (`fulfillment_status` + `tracking_number` on `platform_orders`, mutable only by
a provider with an approved booking to that order's brand) and a brand sees the
status reflected back read-only. Phase 12 built on top of Phase 10 in parallel with
Phase 11 (developed on a different branch, merged second): an **Admin Panel** —
admin-only RLS oversight of every brand/provider/booking/order/sync run, plus two
moderation actions (booking cancel/reject, and account deactivation — the one action
needing the Worker's service-role key, since RLS alone can't touch `auth.users`). No
real users, no real money.

## Commands (verified — if one fails, fix the script or this doc, never work around silently)

| Task | Command |
|---|---|
| Dev server (app) | `pnpm dev:app` |
| Dev server (worker) | `pnpm dev:worker` |
| Typecheck (all) | `pnpm typecheck` |
| Lint (all) | `pnpm lint` |
| Unit/integration tests (all) | `pnpm test` |
| Single test file | `pnpm --filter app exec vitest run <path>` (or `--filter worker`) |
| E2E | not yet wired — `e2e/visual.spec.example.ts` is still a template. Playwright itself IS installed (root devDependency) so `scripts/eyes.mjs` can run. |
| Build (all) | `pnpm build` |
| DB: new migration | `pnpm db:new <name>` |
| DB: apply locally | `pnpm db:reset` (requires Docker + `supabase start`) |
| DB: regen types | `pnpm db:types` (writes `app/src/types/database.ts`) |
| Worker: local | `pnpm dev:worker` |
| Worker: validate deploy | `pnpm --filter worker deploy:dry-run` |

## Repo map

- `app/` — React 19 + Vite + TypeScript SPA. Tailwind v4 via `@tailwindcss/vite`. `react-router`
  for client-side routing. `src/lib/supabase.ts` is the **browser** Supabase client (publishable
  key only, RLS-enforced). `src/hooks/` (auth context/provider/hook), `src/components/`
  (route guards, shared UI). Routed pages live in top-level, role-scoped directories —
  `src/brand/`, `src/provider/`, `src/admin/` — plus `src/products/` (product catalog
  management, a brand-only feature but kept as its own top-level concern rather than folded
  into `brand/`). `src/pages/` is now reserved for the three role-agnostic pages that run
  *before* a role is known — `SignInPage`, `SignUpPage`, `RoleRedirect` — not a general pages
  directory. `src/types/database.ts` (Supabase types — regenerate with `pnpm db:types`, never
  hand-edit once real).
- `worker/` — Cloudflare Worker (TypeScript). `src/index.ts` is the fetch handler — this is
  where all privileged logic will live: marketplace webhooks, OAuth token refresh, order
  sync, anything holding the Supabase service-role key or marketplace secrets.
- `supabase/` — local Supabase config (`config.toml`), `migrations/` (the only legitimate way
  schema changes happen), and `tests/` (pgTAP RLS policy tests, run via `supabase test db`).
- `.claude/` — engineering-os hooks (`floor.sh`, `commit-gate.sh`, `remind.sh`) and the `/task`
  command.
- `e2e/` — Playwright specs (built, Phase 13): `global-setup.ts` (seeds brand/provider via a
  real headless sign-up, admin via a direct Postgres trigger-bypass, plus fixture data via the
  service-role key), `smoke.spec.ts` (`@smoke`-tagged core booking→order→fulfillment journey),
  `visual.spec.ts` (`@visual`-tagged, every real route, baseline screenshots + axe-core
  accessibility scan per route). `.auth/` (gitignored) holds the storageState files
  global-setup produces. `playwright.config.ts` lives at the **repo root**, not inside `e2e/`
  or `app/` — see Phase 13 write-up for why.
- `scripts/eyes.mjs` — dev-loop UI screenshot + console-error check (desktop + mobile).

## Architecture facts

Browser (`app/`) talks to Supabase directly with the anon key for reads/writes authorized by
Postgres RLS — no custom API layer for simple CRUD. Anything privileged — calling
Amazon SP-API / eBay / Walmart / Shopify / TikTok APIs, refreshing OAuth tokens, receiving
per-brand marketplace webhooks, running scheduled order sync — goes through the Cloudflare
Worker (`worker/`), which holds the service-role key and per-marketplace secrets via
`wrangler secret put` (`.dev.vars` locally, gitignored).

**Auth model (built, Phase 1):** Supabase Auth handles credentials; `public.profiles` (one row
per `auth.users` row, `role` enum: `brand`/`provider`/`admin`) is populated by the
`handle_new_user` trigger from sign-up metadata. **Brand and provider are self-service** (picked
at sign-up); **admin is never self-service** — the trigger silently forces any self-service
signup requesting `admin` down to `brand`, and a `prevent_role_change` trigger blocks changing
`role` after creation even via an otherwise-permitted `UPDATE`. RLS on `profiles`: anon has no
access; mutation (`UPDATE`) is owner-only; **read is directory-open to any authenticated user**
as of Phase 3 (see below) — see `supabase/tests/profiles_rls.test.sql`.
`ProtectedRoute` (unauthenticated → `/sign-in`) and `RequireRole` (wrong role → own dashboard)
are the client-side route guards; real authorization is still RLS, not the route guard.

**Core data model (built, Phase 2):** `warehouses` (provider-owned, `provider_id` →
`profiles.id`) with child tables `warehouse_services` and `storage_spaces` (ownership derived
via the parent warehouse — no `provider_id` column on the children, RLS policies join up to
`warehouses`); `products` (brand-owned, `brand_id` → `profiles.id`, unique per-brand
`master_sku` — the anchor Phase 4's `sku_mappings` will resolve marketplace SKUs back to).
RLS on all four: owner-only, **plus a role check in the `INSERT` policy's `WITH CHECK`**
(`profiles.role = 'provider'`/`'brand'`) — ownership alone (`auth.uid() = provider_id`) would
let a brand account insert a row into `warehouses` under its own id, since nothing else stops
it; the role check closes that. See `supabase/tests/warehouses_rls.test.sql` and
`products_rls.test.sql`. Frontend: `/provider/warehouses` (`WarehousesPage`) and
`/brand/products` (`ProductsPage`) query Supabase directly (no Worker involved — plain
RLS-authorized CRUD, per the Architecture facts rule above).

**Booking flow + inventory visibility (built, Phase 3):** three new migrations on top of
Phase 2's schema —
1. **Directory visibility** (`20260710133050_extend_directory_visibility.sql`): adds a
   permissive `to authenticated using (true)` SELECT policy to `profiles`, `warehouses`,
   `warehouse_services`, and `storage_spaces`, layered on top of (not replacing) their
   existing owner-only policies — Postgres ORs multiple permissive policies together, so
   mutation stays owner-only while read becomes directory-open. This is a deliberate,
   **reversible** widening of Phase 1/2's security model: a brand must be able to see a
   provider's identity and available storage space *before* any relationship exists between
   them, which owner-only RLS categorically can't support. No secret or email lives in any
   of these tables, so the exposure is low. Updated `profiles_rls.test.sql` and
   `warehouses_rls.test.sql` accordingly (their old "other user sees nothing" assertions are
   now "other user can read, but still can't mutate").
2. **`booking_requests`** (`20260710133104_create_booking_requests.sql`): a brand requests
   one of a provider's `storage_spaces`; the provider approves or rejects. `provider_id` is
   never client-supplied — a `SECURITY DEFINER` `BEFORE INSERT` trigger
   (`set_booking_request_provider_id`) derives it from the storage space's owning warehouse,
   so a brand can't misdirect a request. RLS: only the two parties (`brand_id`/`provider_id`
   matching `auth.uid()`) can `SELECT`; only a `brand`-role account can `INSERT` (same
   role-check pattern as Phase 2); only the provider can `UPDATE` (approve/reject) — brand
   has no update policy at all, so a request is immutable to its creator once submitted. A
   second trigger (`protect_booking_request_updates`) blocks changing
   `brand_id`/`provider_id`/`storage_space_id` via that same permitted `UPDATE` and bumps
   `updated_at`.
3. **`inventory`** (`20260710133106_create_inventory.sql`): brand-owned stock levels per
   warehouse (`product_id`, `warehouse_id`, `quantity`, unique per product+warehouse).
   Visible to the owning brand always; visible to a provider **only** through an existing
   `booking_requests` row with `status = 'approved'` connecting that brand to a storage space
   in the same warehouse — no direct ownership column, so visibility is derived entirely by
   joining through the booking relationship. This migration also extends `products`' RLS
   (owner-only since Phase 2) with the same approved-booking predicate
   (`products_select_via_approved_booking`), since a provider viewing visible inventory needs
   to resolve the product's name/SKU too, not just an opaque `product_id`.

Frontend: `/brand/bookings` (`BookingsPage` — browse + request), `/brand/inventory`
(`InventoryPage` — set stock levels), `/provider/bookings` (`ProviderBookingsPage` —
approve/reject), `/provider/inventory` (`ProviderInventoryPage` — read-only), all plain
RLS-authorized CRUD against Supabase directly, same pattern as Phase 2.

**SKU mapping (built, Phase 4):** `sku_mappings` (`20260710135941_create_sku_mappings.sql`)
resolves a marketplace-assigned `platform_sku` back to a brand's `products` row
(`product_id`), so Phase 5+'s order sync has something to resolve incoming SKUs against.
`platform` is a new enum (`amazon`/`tiktok`/`ebay`/`walmart`/`shopify`). Uniqueness is
"one brand can't map the same `platform_sku` twice per platform" — `(brand_id, platform,
platform_sku)` — but a unique constraint can't span the join to `products.brand_id`, so
`brand_id` is denormalized onto `sku_mappings` itself, set by a `BEFORE INSERT`
`SECURITY DEFINER` trigger (`set_sku_mapping_brand_id`, same shape as `booking_requests`'
`provider_id` derivation) that resolves it from `product_id`. This derivation does double
duty as the authorization check: unlike `products`/`warehouses` (self-referential ownership,
needed an explicit role check in `INSERT`'s `WITH CHECK`), here `brand_id` always resolves
to the product's *actual* owner regardless of who's inserting, so a brand attempting to map
a SKU onto another brand's `product_id` gets its own id overwritten by the trigger and then
rejected by `WITH CHECK` for not matching — no separate role check needed, since `products`'
own insert policy already gates who could own a product in the first place. RLS: owner-only
select/insert/delete, **no update policy** — a wrong mapping is deleted and recreated, not
edited in place (ASSUMPTION: simplest option given no UI need for it yet). Frontend:
`/brand/sku-mappings` (`SkuMappingsPage`) — form to add one mapping at a time + list with
delete; the roadmap's Phase 4 goal specifies "bulk entry", which this does **not** yet do
(see `ROADMAP.md` scope note) — single-row entry only, matching `ProductsPage`/
`InventoryPage`'s existing form pattern.

**Shopify integration (built, Phase 5):** first real marketplace integration, and the first
time `worker/` holds actual logic instead of a `/health` stub.
1. **Schema** (`20260710161735_create_shopify_tables.sql`): `shopify_tokens` (brand-owned
   OAuth token, one per brand — unique on `brand_id`) and `platform_orders` (unified order
   table every future marketplace writes into: `brand_id`, `platform`, `platform_order_id`
   unique per platform, `raw_data` jsonb, `resolved_master_sku`, `status`). Both tables are
   written **only** by the Worker via the service-role key — no authenticated client ever
   inserts a row directly, so unlike `sku_mappings`/`booking_requests`, `platform_orders.brand_id`
   is a plain column, not trigger-derived (there's no client-supplied value to protect against
   when RLS is bypassed entirely for every write). `shopify_tokens` has RLS enabled with
   **zero policies at all** — stricter than every other table's owner-only pattern — because
   nothing in it (access_token especially) should ever be readable through the Data API, even
   by its own owning brand; only `service_role` bypasses RLS. `platform_orders` has real SELECT
   policies: brand owns its own rows, and a provider sees a brand's orders via an approved
   `booking_requests` row connecting them (same predicate shape as
   `inventory_select_via_approved_booking` from Phase 3) — not warehouse-scoped the way
   inventory is, since an order isn't tied to a specific storage space (ASSUMPTION, revisit if
   Phase 11's fulfillment workflow needs finer granularity). `platform_orders.status` reflects
   only SKU-resolution outcome (`pending`/`resolved`/`unmapped`), not fulfillment — that's
   Phase 11.
2. **Worker service layer** (`worker/src/shopify/`): `client.ts` (Shopify OAuth URL-building,
   code exchange, order fetch, both HMAC verifications), `supabaseAdmin.ts`
   (service-role client + all DB reads/writes), `sync.ts` (fetch → resolve first line item's
   SKU via Phase 4's `sku_mappings` → upsert `platform_orders`), `handlers.ts` (the five HTTP
   entry points, see below), `env.ts`/`types.ts`. Every function that makes a network call
   takes an injected `fetchImpl: typeof fetch = fetch` — see the Testing landmine below for why.
   Two originally-Shopify-local files — `hmac.ts` (HMAC-SHA256 + constant-time-compare
   primitive: webhook signatures are base64, OAuth callback signatures are hex, same
   underlying operation) and `oauthState.ts` (the OAuth `state` param as a self-signed,
   HMAC'd CSRF token carrying `brandId + expiry` — the Worker has no KV/session store, so
   this is how a callback knows which brand an OAuth redirect belongs to without trusting an
   unauthenticated GET's query params directly) — moved to `worker/src/shared/` in Phase 6:
   both were already fully generic (no Shopify-specific logic), and TikTok needed the exact
   same primitives rather than a third duplicate copy. See the Cloudflare Workers stack rule
   below and the Phase 6 write-up.
3. **Routes** (dispatched from `worker/src/index.ts`): `GET /shopify/status` (brand's only way
   to read connection state, since `shopify_tokens` has zero RLS policies — returns
   `shop_domain`/`last_synced_at` only, never `access_token`), `POST /shopify/install`
   (bearer-token-authenticated; returns a signed-state authorize URL for the browser to
   navigate to), `GET /shopify/callback` (Shopify's OAuth redirect — authenticated by the
   signed state plus Shopify's own callback HMAC, not a bearer token, since a browser redirect
   can't carry one), `POST /shopify/sync` (bearer-token-authenticated manual sync), `POST
   /webhooks/shopify/orders` (Shopify's order webhook — authenticated by the body HMAC only).
4. **Frontend:** `/brand/shopify` (`ShopifyConnectPage` — connect form when disconnected,
   status + "Sync now" when connected), `/brand/shopify/orders` (`ShopifyOrdersPage`),
   `/provider/orders` (`ProviderOrdersPage`, booking-gated read-only). `app/src/lib/worker.ts`
   is the one place the browser calls the Worker via `fetch` with the Supabase session's
   `access_token` as a bearer token — everything else in `app/` still talks to Supabase
   directly per the Architecture facts rule. **Scope note:** no separate order-detail route;
   detail is inline in the list row, matching every other list page in this repo.

**TikTok Shop integration (built, Phase 6):** second marketplace integration, same shape
as Shopify — this is the pair that proves the Phase 5 template generalizes.
1. **Schema** (`20260710172204_create_tiktok_tokens.sql`): `tiktok_tokens` mirrors
   `shopify_tokens` exactly (zero RLS policies, service-role only) but adds
   `refresh_token`/`access_token_expires_at` — TikTok access tokens expire (Shopify's
   don't) — and stores `shop_id` instead of a shop domain. `platform_orders` needed **no**
   schema change: its `platform` enum already accepted `'tiktok'` (added in Phase 4 for
   `sku_mappings`, ahead of any platform actually using it) and its RLS policies are
   platform-agnostic.
2. **Worker service layer** (`worker/src/tiktok/`): same file shape as `shopify/`
   (`client.ts`/`supabaseAdmin.ts`/`sync.ts`/`handlers.ts`/`env.ts`/`types.ts`), importing
   the shared `hmac.ts`/`oauthState.ts` primitives described above. Differences from
   Shopify, each an explicit design choice: (a) TikTok's request signing
   (`client.ts`'s `signRequest`) is a different, TikTok-specific algorithm — secret-wrapped,
   sorted-query-param string, HMAC-SHA256, hex, **uppercase** (Shopify's hex helper is
   lowercase; TikTok's documented convention is upper) — used for both outbound API calls
   and (by the same primitive, reused) webhook verification; (b) TikTok's OAuth callback
   carries only `code`/`state`, no shop identifier and no extra callback-signature query
   param the way Shopify's `hmac` param exists — so `handleCallback` makes a follow-up
   signed `getAuthorizedShops` call after token exchange to learn which shop was
   authorized, and relies on the signed `state` alone for callback authenticity (there's no
   third-party shop identity to also verify, unlike Shopify's embeddable-app model); (c)
   `/tiktok/install` takes no request body — TikTok's authorize URL has no shop-domain
   parameter for the caller to supply, unlike Shopify's `/shopify/install`.
   **UNVERIFIED / ASSUMPTION-heavy area:** TikTok's own API docs
   (`partner.tiktokshop.com`) returned HTTP 403 when fetched directly from this sandbox's
   network policy (see Landmines) — the exact signing algorithm, OAuth endpoints, order/
   webhook JSON shapes, and the webhook signature header name are all built from
   secondary sources describing the same published spec, not a first-party doc fetch.
   Every code path is unit-tested against this documented format (same posture Phase 5
   used for Shopify before its own live verification — the difference is Shopify's docs
   *were* fetchable here). Flagged in-code at each ASSUMPTION site (`client.ts`,
   `types.ts`) — resolve against TikTok's real docs (or a test-mode app) before any live
   credential is wired up.
3. **Routes**: `GET /tiktok/status`, `POST /tiktok/install`, `GET /tiktok/callback`,
   `POST /tiktok/sync`, `POST /webhooks/tiktok/orders` — same five-route shape as Shopify,
   dispatched from the same `worker/src/index.ts`, whose `Env` type now extends both
   `ShopifyWorkerEnv` and `TiktokWorkerEnv`.
4. **Frontend:** `/brand/tiktok` (`TiktokConnectPage` — no shop-domain form, just a
   connect button, per the install-endpoint difference above), `/brand/tiktok/orders`
   (`TiktokOrdersPage`). `ProviderOrdersPage` needed **no** change — it already queries
   `platform_orders` with no platform filter, so TikTok orders surface there
   automatically once synced, same as Shopify's.
5. **Bug found and fixed during this phase** (see Landmines): `ShopifyOrdersPage`'s
   query had no `platform` filter — harmless with one platform connected, a real
   cross-platform leak with two. Fixed on both `ShopifyOrdersPage` and the new
   `TiktokOrdersPage`, with test coverage asserting the filter.

**Amazon SP-API integration (built, Phase 7):** third marketplace integration —
structurally the most different from Shopify/TikTok of the three, driven entirely by
how Amazon's own SP-API actually works, not by choice.
1. **Schema** (`20260710191910_create_amazon_tokens.sql`): `amazon_tokens` mirrors
   `shopify_tokens`/`tiktok_tokens`' zero-RLS shape, but `refresh_token` is
   **brand-submitted** rather than Worker-obtained via an OAuth callback (see below) —
   still written only via the service-role key, still never readable back out through
   the Data API. Adds `marketplace_id` (every SP-API order call is scoped to a specific
   Amazon marketplace, e.g. `ATVPDKIKX0DER` for the US) and a cached
   `access_token`/`access_token_expires_at` pair (the 1-hour-lived LWA token minted from
   `refresh_token`). `platform_orders` needed no schema change — its `platform` enum
   already accepted `'amazon'`.
2. **No OAuth install/callback flow.** Amazon's SP-API for a private/internal app uses
   "self-authorization": the seller generates a long-lived refresh token directly in
   Seller Central and hands it to the brand out of band, rather than our Worker hosting
   a redirect the seller clicks through (unlike Shopify/TikTok, where our Worker builds
   and owns that flow end to end). So `POST /amazon/connect` just accepts a
   brand-submitted `{ refreshToken, marketplaceId }` body (bearer-authenticated like
   every other brand-facing endpoint) and stores it — there is no `/amazon/install` or
   `/amazon/callback`, and no `oauthState.ts` CSRF-binding usage at all for this
   platform, since there's no redirect to bind. `AmazonConnectPage` is a paste-in
   credentials form rather than a "Connect" button that navigates away, an accepted
   trust-boundary consequence of Amazon's own documented flow (the seller is shown this
   token specifically to hand to third-party apps), not a shortcut we introduced.
3. **No SigV4 request signing.** SP-API required AWS IAM + Signature Version 4 on every
   request historically; Amazon deprecated that requirement in Oct 2023 (confirmed via
   multiple independent sources, including Amazon's own SP-API changelog) — requests now
   need only the LWA access token in an `x-amz-access-token` header. Simpler than
   TikTok's HMAC-SHA256 request signing, not a corner cut.
4. **Worker service layer** (`worker/src/amazon/`): `client.ts` (`refreshAccessToken` —
   LWA `grant_type=refresh_token`; `fetchOrders`/`fetchOrderItems` — Amazon's
   `getOrderItems` is a **separate call per order**, unlike Shopify/TikTok where each
   order's line items arrive inline, since an Amazon order object carries no line-item
   array of its own), `supabaseAdmin.ts`, `sync.ts` (`ensureAccessToken` caches the
   minted access token with a 60-second expiry skew so a sync run doesn't re-mint on
   every call; `syncAmazonOrders` fans out one `getOrderItems` call per order to resolve
   each order's first item's `SellerSKU`), `handlers.ts` (`handleStatus`/
   `handleConnect`/`handleSync` — three routes, not five, since there's no
   install/callback pair), `env.ts`/`types.ts` (field names verified against Amazon's own
   `selling-partner-api-models` GitHub repo — see the ASSUMPTION note below). Same
   `fetchImpl`-injection testing pattern as Shopify/TikTok — 37 more tests (185 total
   across app+worker).
5. **No webhook route.** Amazon's real near-real-time mechanism is the Notifications API
   over SQS — a fundamentally different integration shape than a simple inbound HTTP
   POST (would need an SQS queue + subscription, not a Worker route) — so this is
   deferred to Phase 10 ("Order Sync Automation"), which already owns turning every
   platform's manual-sync-only into real background sync. Not a gap unique to Amazon:
   Shopify and TikTok are also manual-sync-only as of their own phases.
6. **Routes**: `GET /amazon/status`, `POST /amazon/connect`, `POST /amazon/sync` —
   dispatched from the same `worker/src/index.ts`, whose `Env` type now extends
   `ShopifyWorkerEnv`, `TiktokWorkerEnv`, and `AmazonWorkerEnv`.
7. **Frontend:** `/brand/amazon` (`AmazonConnectPage` — refresh-token + marketplace-id
   form, per the self-authorization difference above), `/brand/amazon/orders`
   (`AmazonOrdersPage`, built with the `.eq('platform', 'amazon')` filter from the start
   — Phase 6's bug already taught this lesson). `ProviderOrdersPage` needed **no**
   change, same as Phase 6.
8. **ASSUMPTION / confidence note, better-grounded than TikTok's:** Amazon's docs portal
   (`developer-docs.amazon.com`) also returned HTTP 403 from this sandbox (see
   Landmines), but the `getOrders`/`getOrderItems` field names (`AmazonOrderId`,
   `SellerSKU`, etc.) were verified against Amazon's own `selling-partner-api-models`
   GitHub repo — a first-party, machine-readable schema source, not a secondary
   description — and the LWA refresh flow + the SigV4 deprecation were each confirmed via
   multiple independent sources. Still UNVERIFIED end-to-end against a live seller
   account (needs the client's production refresh token), but on firmer footing than
   Phase 6's TikTok ASSUMPTIONs.

**eBay integration (built, Phase 8):** fourth marketplace integration — back to the
OAuth-redirect shape (Phase 5/6's template), not Amazon's self-authorization, plus one
mandatory piece none of the first three platforms needed.
1. **Schema** (`20260710200057_create_ebay_tokens.sql`): `ebay_tokens` mirrors
   `shopify_tokens`/`tiktok_tokens`/`amazon_tokens`' zero-RLS shape. Stores both
   `refresh_token`/`refresh_token_expires_at` (eBay documents ~18 months) and a cached
   `access_token`/`access_token_expires_at` pair (2-hour lifetime) — same caching
   need as Amazon's LWA token, different OAuth model to get there.
   `platform_orders` needed no schema change — its `platform` enum already accepted
   `'ebay'` since Phase 4.
2. **eBay's OAuth is the authorization-code-grant redirect flow**, same shape as
   Shopify/TikTok's install/callback pair — but with one eBay-specific quirk: the
   `redirect_uri` parameter passed to `/oauth2/authorize` and to the token-exchange
   call must be a "RuName", an identifier eBay assigns per registered app in the
   Developer Portal (which itself maps to accept/decline URLs configured there), not
   a literal callback URL the way Shopify's `WORKER_URL`-based redirect_uri is. See
   `worker/src/ebay/env.ts`'s `EBAY_RU_NAME` and `client.ts`'s `buildAuthorizeUrl`.
3. **Worker service layer** (`worker/src/ebay/`): same file shape as every prior
   platform (`client.ts`/`supabaseAdmin.ts`/`sync.ts`/`handlers.ts`/`env.ts`/
   `types.ts`), importing the shared `hmac.ts`/`oauthState.ts` primitives. `sync.ts`'s
   `ensureAccessToken` reuses Amazon's 60-second-skew caching pattern verbatim (both
   tokens are short-lived enough to need it, unlike Shopify's non-expiring token).
   eBay's Fulfillment API returns line items inline on the order object (like
   Shopify/TikTok, unlike Amazon), so no per-order fan-out call is needed here.
4. **Mandatory Marketplace Account Deletion notification endpoint** — a genuinely new
   requirement, not present in any prior platform. eBay requires every app that
   stores eBay user data to subscribe to and correctly answer a challenge/
   verification handshake before the subscription is accepted (`GET` with a
   `challenge_code` query param → respond `{"challengeResponse":
   sha256hex(challengeCode + verificationToken + endpoint)}`), and to acknowledge
   every subsequent notification with 200 — non-compliance risks Developer Program
   access termination, independent of whether the app has an order webhook at all.
   Built as `GET`/`POST /webhooks/ebay/account-deletion`
   (`handleDeletionChallenge`/`handleDeletionNotification` in
   `worker/src/ebay/handlers.ts`), using `crypto.subtle.digest` (Web Crypto, native
   in the Workers runtime) for the SHA-256 hash — no HMAC involved, distinct from
   every other signature primitive in this repo. **Scope note / ASSUMPTION:** this
   app has no column correlating an eBay userId/username (the identifiers in the
   notification payload) back to a `brand_id` — `ebay_tokens` is keyed by our own
   `brand_id`, not eBay's user identity — so `handleDeletionNotification`
   acknowledges every notification but does not yet perform per-brand token
   revocation from the payload alone. Revisit if this becomes a real compliance gap
   (would need capturing the eBay username at connect-time to make the correlation
   possible).
5. **No order webhook** (distinct from the deletion-notification endpoint above,
   which is mandatory regardless) — deferred to Phase 10 same as every platform
   before it; manual `/ebay/sync` only for now.
6. **Deviated from MSW**, same as every marketplace phase before this one: every
   network-calling function takes an injected `fetchImpl`. 44 new worker tests (192
   total in the worker, 234 across app+worker).
7. **Routes**: `GET /ebay/status`, `POST /ebay/install`, `GET /ebay/callback`,
   `POST /ebay/sync`, `GET`/`POST /webhooks/ebay/account-deletion` — dispatched from
   the same `worker/src/index.ts`, whose `Env` type now extends `ShopifyWorkerEnv`,
   `TiktokWorkerEnv`, `AmazonWorkerEnv`, and `EbayWorkerEnv`.
8. **Frontend:** `/brand/ebay` (`EbayConnectPage` — redirect-flow connect button, no
   shop-identifier form, same shape as `TiktokConnectPage` since eBay's authorize URL
   has no shop-domain parameter either), `/brand/ebay/orders` (`EbayOrdersPage`,
   built with the `.eq('platform', 'ebay')` filter from the start, same discipline as
   Phase 7's Amazon page).
9. **ASSUMPTION / confidence note:** eBay's own docs portal (`developer.ebay.com`)
   also returned HTTP 403 from this sandbox when fetched directly via `WebFetch` —
   same class of block as TikTok's and Amazon's docs sites (see Landmines). Unlike
   TikTok's purely-secondary-source posture, though, `WebSearch`'s result synthesis
   here quoted `developer.ebay.com`'s own page content directly (the exact
   request/response field names, the RuName mechanic, the account-deletion
   challenge-hash algorithm) rather than paraphrasing a third-party description of
   the same spec — a first-party *source*, though still not a first-party *fetch*.
   Every code path is unit-tested against this documented format; UNVERIFIED
   end-to-end against a live eBay sandbox/production app (needs the client's
   re-registered developer.ebay.com account, per ROADMAP.md's blocker note).

**Walmart integration (built, Phase 9):** fifth and final marketplace integration
for this repo's initial scope — a third, genuinely distinct auth model, not a
reuse of Phase 5/6/8's OAuth-redirect shape or Phase 7's refresh-token
self-authorization shape.
1. **Schema** (`20260710201726_create_walmart_tokens.sql`): `walmart_tokens`
   mirrors `shopify_tokens`/`tiktok_tokens`/`amazon_tokens`/`ebay_tokens`'
   zero-RLS shape, but stores `client_id`/`client_secret` (brand-submitted,
   both durable — see below) rather than a `refresh_token`, plus a cached
   `access_token`/`access_token_expires_at` pair (15-minute lifetime — the
   shortest of any platform here). `platform_orders` needed no schema
   change — its `platform` enum already accepted `'walmart'` since Phase 4.
2. **Walmart's Marketplace API is an OAuth client-credentials grant** — no
   browser redirect (like Amazon's self-authorization), but unlike Amazon
   there is no long-lived `refresh_token` at all. A Walmart seller generates
   their own per-account Client ID + Client Secret directly in Walmart Seller
   Center and hands both to the brand, who submits them through
   `WalmartConnectPage` — same self-authorization trust model as Amazon's
   brand-submitted refresh token, but the credential shape and the mint
   mechanism (a fresh access token straight from client_id+client_secret
   every time, no refresh step) are both different.
3. **The Worker holds zero app-level Walmart secret** — a first in this
   repo. Every platform before this one needed at least one shared app-level
   credential in the Worker's own env (Shopify/TikTok/eBay's OAuth client
   id+secret used to sign state/verify callbacks, Amazon's LWA client
   id+secret used to refresh a token) *in addition to* whatever the brand
   submitted. Walmart's client-credentials grant needs only the
   brand-submitted `client_id`/`client_secret` — `WalmartWorkerEnv` is just
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, nothing platform-specific at
   all (see `worker/src/walmart/env.ts`).
4. **Worker service layer** (`worker/src/walmart/`): same file shape as
   every prior platform (`client.ts`/`supabaseAdmin.ts`/`sync.ts`/
   `handlers.ts`/`env.ts`/`types.ts`). `sync.ts`'s `ensureAccessToken` reuses
   the same 60-second-skew caching pattern Amazon introduced and eBay
   reused — more valuable here than anywhere else, since Walmart's
   15-minute token is the shortest-lived of any platform in this repo.
   Walmart's Orders API returns order lines inline on the order object
   (like Shopify/TikTok/eBay, unlike Amazon), so no per-order fan-out call
   is needed.
5. **No install/callback pair** (no OAuth redirect flow exists for this
   auth model, same as Amazon) **and no order webhook** (Walmart's real
   notification/webhook system needs a separate subscription setup —
   deferred to Phase 10 same as every platform before it) — three routes
   total (`GET /walmart/status`, `POST /walmart/connect`,
   `POST /walmart/sync`), same count as Amazon's.
6. **Deviated from MSW**, same as every marketplace phase before this one:
   every network-calling function takes an injected `fetchImpl`. 34 new
   worker tests (226 total in the worker, 273 across app+worker), all in
   the Workers runtime.
7. **Frontend:** `/brand/walmart` (`WalmartConnectPage` — Client ID +
   Client Secret paste-in form, same shape as `AmazonConnectPage`'s
   refresh-token+marketplace-id form), `/brand/walmart/orders`
   (`WalmartOrdersPage`, built with the `.eq('platform', 'walmart')` filter
   from the start, same discipline as Phase 7/8's pages).
8. **ASSUMPTION / confidence note:** Walmart's own docs portal
   (`developer.walmart.com`) also returned HTTP 403 from this sandbox when
   fetched directly via `WebFetch` — same class of block as every other
   marketplace platform's docs site (see Landmines). `WebSearch`'s result
   synthesis quoted `developer.walmart.com`'s own page content directly
   (the token endpoint URL, the client-credentials grant shape, the
   required `WM_*` headers, the 15-minute token lifetime, the orders
   response's nested `list.elements.order` shape) — same
   first-party-source-not-fetch posture as Phase 8's eBay integration.
   Every code path is unit-tested against this documented format;
   UNVERIFIED end-to-end against a live Walmart seller account (needs the
   client's new US-based Walmart seller account, per ROADMAP.md's blocker
   note).

**All five marketplace integrations for this repo's initial scope are now
built** (Shopify, TikTok, Amazon, eBay, Walmart — Phases 5-9), covering all
three auth-model shapes encountered: OAuth-redirect (Shopify/TikTok/eBay),
refresh-token self-authorization (Amazon), and client-credentials
self-authorization (Walmart).

**Order Sync Automation (built, Phase 10):** replaces "manual sync button only" with
real background sync across every connected platform — the first time this repo's
Worker exports a `scheduled()` handler, not just `fetch()`.
1. **Schema** (`20260710221040_create_sync_logs.sql`): `sync_logs` records one row per
   platform per scheduled run (`platform`, `started_at`, `finished_at`,
   `success_count`, `failure_count`, `error_message`) — created when a platform's run
   starts, updated when it finishes. RLS enabled with **zero policies**, same
   defense-in-depth default as every `*_tokens` table — an explicit **ASSUMPTION**,
   since unlike the tokens tables nothing in `sync_logs` is actually secret; kept
   zero-policy for consistency with every other Worker-written table rather than
   inventing a new access shape ahead of Phase 12's "admin oversight" decision, which is
   where this table's real read path belongs. `error_message` holds only the *last*
   error hit during a platform's run, not a full per-brand audit trail (ASSUMPTION,
   simplest option given no UI consumes this yet).
2. **`worker/src/shared/syncLogs.ts`**: `startSyncLog`/`finishSyncLog` — genuinely
   platform-agnostic (a plain table write), so it lives in `shared/` per the Phase 6
   convention rather than being duplicated five times.
3. **Per-platform additions** (`shopify`/`tiktok`/`amazon`/`ebay`/`walmart`): each
   `supabaseAdmin.ts` gained `listXTokens()` (every connected brand, no owner filter —
   service-role bypasses RLS) and each `sync.ts` gained `syncAllXBrands()` — loops every
   connected brand through that platform's existing per-brand `syncXOrders`/
   `ensureAccessToken` (the exact same recipe `handleSync` already used for one bearer-
   authenticated brand), catching each brand's failure individually rather than letting
   one broken brand (revoked token, expired refresh token) abort the rest of that
   platform's run. This is the same shape across all five platforms specifically
   *because* Phase 6-9 already converged on identical per-brand sync signatures — Phase
   10 needed no new per-platform abstraction, just a loop over what already existed.
4. **`worker/src/scheduledSync.ts`**: `runScheduledSync(env, fetchImpl)` — the
   orchestration entry point, kept as its own module rather than inlined in
   `index.ts` so it stays testable via the repo's established injected-`fetchImpl`
   convention (index.ts's own `scheduled()` export is a one-line dispatch, mirroring
   how `fetch()` dispatches to each platform's `handlers.ts` rather than containing
   logic itself). Runs all five platforms **concurrently** (`Promise.all`), each
   independently wrapped in its own `startSyncLog`/`finishSyncLog` pair — a whole
   platform crashing outright (e.g. `listXTokens` itself throwing on a DB outage) still
   gets its own finished `sync_logs` row (`error_message` set, 0/0 counts) and does not
   prevent the other four platforms from running or logging.
5. **Idempotency** (ROADMAP's explicit ask) was already satisfied by Phase 5's own
   design, not something Phase 10 had to add: every `upsertPlatformOrder` across all
   five platforms already upserts on `(platform, platform_order_id)`, so a rerun (cron
   firing again, or a brand's manual sync overlapping a scheduled one) never creates a
   duplicate `platform_orders` row.
6. **`wrangler.toml`**: `[triggers] crons = ["*/15 * * * *"]` — every 15 minutes.
   **ASSUMPTION:** a reasonable default given no stated SLA on sync freshness anywhere
   in ROADMAP.md; trivial to tighten or loosen later, and every platform currently
   shares this one cadence (no per-platform schedule).
7. **Worker tests:** `scheduledSync.test.ts` covers the orchestration logic directly
   (injected `fetchImpl`, same convention as every platform) — all-platforms-succeed,
   and one-platform-crashes-entirely-so-the-other-four-still-log. `index.test.ts`
   additionally exercises the *real* exported `scheduled()` handler through the
   Workers runtime via `createScheduledController`/`createExecutionContext`/
   `waitOnExecutionContext` (`@cloudflare/vitest-pool-workers` covers `scheduled()`
   test dispatch as a separate mechanism from `SELF.fetch()`) — since `scheduled()`'s
   signature is fixed by `ExportedHandler` and takes no injectable `fetchImpl` param,
   this one test stubs `globalThis.fetch` instead (restored in `afterEach`), the only
   place in the Worker's test suite that does so rather than using the fetchImpl
   convention, and only because the runtime entry point itself leaves no other seam.
   34 new worker tests (263 total).
8. **No frontend change.** Phase 10 is purely a background-sync mechanism; every
   existing Connect/Orders page already reflects `last_synced_at`/order rows
   regardless of whether a sync was triggered manually or by the cron, so nothing in
   `app/` needed to change.

**Provider Fulfillment Dashboard (built, Phase 11):** a provider picks/packs/ships an
order and updates status + tracking; the brand sees it reflected back, read-only.
1. **Schema** (`20260711120000_add_fulfillment_to_platform_orders.sql`): adds
   `fulfillment_status` (new enum `order_fulfillment_status`:
   `pending`/`processing`/`shipped`/`delivered`, default `pending`), `tracking_number`
   (nullable text), and `updated_at` to `platform_orders`. This is layered on top of,
   not a repurposing of, the existing `status` column — that column is Phase 4/5's
   SKU-resolution outcome (`pending`/`resolved`/`unmapped`), a completely different
   axis; its own header comment already flagged fulfillment as "Phase 11's job."
2. **RLS — deliberately no new "assigned provider" column.** `platform_orders` had
   zero insert/update/delete policies before this phase (Worker/service-role only,
   see Phase 5's write-up); Phase 11 adds exactly one UPDATE policy
   (`platform_orders_update_fulfillment`), scoped to **the same predicate** as the
   existing `platform_orders_select_via_approved_booking` SELECT policy — a provider
   with an approved `booking_requests` row connecting them to the order's brand.
   **ASSUMPTION:** ROADMAP.md's "restricted to the fulfilling provider only" is read
   as "restricted to a provider who can already see this order" (i.e. the same set
   the SELECT policy already grants), not as a new per-order provider-assignment/
   claim concept — nothing elsewhere in this repo's data model designates one single
   provider as "the" fulfiller of a given order (a brand's approved bookings can span
   multiple providers/warehouses), and ROADMAP's own checklist for this phase lists
   only "`order_status` enum + tracking fields," not a new assignment column. A
   provider without an approved booking to that brand gets zero rows affected on
   update, same "silently matches zero rows under RLS" behavior documented in the
   Landmines section for `booking_requests`. Brand gets no update policy at all —
   read-only, per ROADMAP's explicit ask.
3. **Protect-trigger, same shape as Phase 3's `protect_booking_request_updates`:**
   `protect_platform_order_fulfillment_updates` (`BEFORE UPDATE`) raises if anything
   other than `fulfillment_status`/`tracking_number` changes — otherwise a provider
   permitted to update the row at all could also rewrite `brand_id`, `raw_data`, the
   SKU-resolution `status`, etc. via that same UPDATE grant. Bumps `updated_at`.
4. **Frontend:** `ProviderOrdersPage` (`app/src/provider/`) gained a per-order
   fulfillment-status `SelectField` + tracking-number `TextField` + "Save" button
   (disabled until the draft actually differs from the persisted row), calling
   `supabase.from('platform_orders').update(...)` directly — no Worker involvement,
   plain RLS-authorized mutation like every brand/provider CRUD page in this repo.
   All five brand-facing order pages (`ShopifyOrdersPage`/`TiktokOrdersPage`/
   `AmazonOrdersPage`/`EbayOrdersPage`/`WalmartOrdersPage`) gained a second,
   read-only `StatusBadge` for `fulfillment_status` plus a tracking-number line —
   read-only per ROADMAP's ask, no update affordance on the brand side at all.
5. **`app/src/types/database.ts`** (hand-authored interim types, see its own header
   comment) updated to match: new `OrderFulfillmentStatus` type, new
   `fulfillment_status`/`tracking_number`/`updated_at` fields on `platform_orders`'
   Row/Insert/Update shapes, new `order_fulfillment_status` Enums entry. Still
   UNVERIFIED against a real generated schema — same standing sandbox limitation as
   every prior phase (no live Postgres reachable here, see Landmines).
6. **Tests:** `supabase/tests/platform_orders_fulfillment_rls.test.sql` (8 pgTAP
   assertions — brand cannot update at all; uninvolved provider cannot mutate;
   approved-booking provider can update fulfillment_status and tracking_number, both
   persisted; the protect-trigger blocks smuggling a `status`/`brand_id` change
   through the same UPDATE). `ProviderOrdersPage.test.tsx` gained a test driving the
   full select-status → type-tracking-number → click-Save flow and asserting the
   exact `update()` payload. All five brand order-page test files updated for the two
   new required Row fields.
7. **No Eyes/visual verification possible in this sandbox.** `ProviderOrdersPage` and
   the five brand order pages are all auth-gated routes; signing in requires a real
   Supabase Auth backend, and this sandbox cannot reach one (see the standing "no
   live DB reachable" Landmines entry) — so the new fulfillment UI is
   typecheck/lint/unit-test verified only, not screenshot-verified. Flagged
   UNVERIFIED rather than skipped silently.

**Admin Panel (built, Phase 12):** admin oversight of brands/providers/bookings/orders/
sync history, plus two moderation actions. Two ask-triggers were resolved with the
client before writing any code (ROADMAP.md flagged the access-pattern question
explicitly): **admin-only RLS policies** (not service-role-backed Worker endpoints) for
every read and for the booking-cancel action, since none of this data is secret — matches
the repo's existing "plain RLS CRUD unless it's genuinely privileged" architecture rule —
and **account deactivation is the one deliberate exception**, needing the service-role key
because Postgres RLS has no way to touch `auth.users` or invalidate a session.
1. **Schema** (`20260711114156_create_admin_panel.sql`): `profiles.is_active` (a
   *display* flag, not the enforcement mechanism — see point 3) plus a reusable
   `public.is_admin()` helper (`SECURITY INVOKER` — deliberate, not an oversight: the
   caller's own session already has read access to their own `profiles` row via
   existing policies, so there's no need to bypass RLS just to check the caller's own
   role). New admin-only policies: `profiles_update_admin` (is_active only — the
   existing `prevent_role_change` trigger from Phase 1 already blocks role changes for
   everyone, admin included, with no bypass added), `booking_requests_select_admin` +
   `booking_requests_update_admin` (view/reject any booking — the existing
   `protect_booking_request_updates` trigger still blocks reassigning parties, so this
   grant is "change status only" for free), `platform_orders_select_admin` (view-only —
   order-status mutation is Phase 11's job, deliberately out of scope here),
   `sync_logs_select_admin` (the one exception to that table's zero-policy default,
   which Phase 10's own write-up explicitly deferred to this phase). The `*_tokens`
   tables (every marketplace's OAuth/refresh secrets) stay zero-policy regardless — an
   admin never sees a raw token either way, same as every other role.
2. **Closing a self-bypass gap**: `profiles_update_own` (owner-only, Phase 1) has no
   column restriction, so without a second trigger a deactivated user could simply set
   their own `is_active` back to `true` via that same permitted `UPDATE` — the new
   `profiles_update_admin` policy only helps for *other* rows. Fixed by
   `prevent_self_deactivation_bypass` (`BEFORE UPDATE`, same shape as
   `prevent_role_change`): any change to `is_active` is rejected unless the acting
   user's own role is `admin`.
3. **Real lockout, not a cosmetic flag**: `profiles.is_active` alone doesn't stop a
   deactivated user's still-valid session from doing anything — RLS on every other
   table is unchanged. The actual enforcement is Supabase Auth's own ban mechanism
   (`supabase.auth.admin.updateUserById(id, { ban_duration: '876000h' })`, confirmed
   against the installed `@supabase/supabase-js@2.110.2` — `ban_duration` and this
   exact "~100 years" idiom appear in the library's own JSDoc example), which needs the
   service-role key and therefore a Worker endpoint. `deactivateUser`/`reactivateUser`
   (`worker/src/admin/supabaseAdmin.ts`) call the ban API *and* mirror `is_active` onto
   `profiles` in the same action, so the RLS-visible directory shows status without a
   Worker round-trip for every read.
4. **Worker service layer** (`worker/src/admin/`): `env.ts` (needs only
   `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` — no new secret, same shape as Walmart's
   Phase 9 env), `supabaseAdmin.ts` (`verifyAdminAccessToken` — resolves the caller's
   user id via Supabase Auth *and* checks their `profiles.role === 'admin'`, since the
   service-role client bypasses RLS entirely and there's no RLS backstop the way a
   browser's own Supabase queries have; `deactivateUser`/`reactivateUser`),
   `handlers.ts` (`handleDeactivate`/`handleReactivate`). Same `fetchImpl`-injection
   testing convention as every prior platform — 11 new worker tests (285 total).
5. **Routes**: `POST /admin/users/:id/deactivate`, `POST /admin/users/:id/reactivate` —
   the first *dynamic-segment* routes in `worker/src/index.ts` (every prior route was a
   fixed pathname); dispatched via a small regex
   (`/^\/admin\/users\/([^/]+)\/(deactivate|reactivate)$/`) rather than adding a router
   dependency for two routes.
6. **RLS tests**: extended `profiles_rls.test.sql`, `booking_requests_rls.test.sql`,
   `platform_orders_rls.test.sql`, and `sync_logs_rls.test.sql` with an admin-principal
   fixture and both positive (admin sees/mutates everything in scope) and negative
   (role stays immutable even for an admin; a non-admin can't self-reactivate)
   coverage. **Landmine for the fixture itself**: there is no supported
   application-level way to create an admin account in this schema — self-service
   always forces the role down to `brand`, and `prevent_role_change` blocks a plain
   `UPDATE` unconditionally, admin included. Every new admin fixture seeds by
   temporarily disabling `profiles_role_immutable` for one `UPDATE`, matching the
   `profiles` migration's own "seeded directly by an operator" language — this repo
   still has no real operator-facing admin-provisioning tool, which is a gap, not a
   design choice; flagged again below.
7. **Frontend**: `AdminDashboardPage` rewritten from an empty shell to a real link
   list (matching `BrandDashboardPage`/`ProviderDashboardPage`'s existing pattern);
   new `UsersPage` (directory + Deactivate/Reactivate), `BookingsPage` (every booking,
   Reject-only — no Approve, since assigning a booking to a provider isn't an admin
   action), `OrdersPage` (read-only, every brand), `SyncLogsPage` (read-only, every
   platform's run history). `DashboardShell`'s admin nav group grew from a single
   "Overview" item to a real group (Users/Bookings/Orders/Sync history). `lib/worker.ts`
   gained `deactivateUser`/`reactivateUser`.
8. **`app/src/types/database.ts` gained two changes**: `profiles.is_active` (this
   phase's own column), and a `sync_logs` table entry that was simply **missing** —
   Phase 10 landed the real `sync_logs` table but its own session never updated this
   hand-authored types file, so `SyncLogsPage` would have had no type to import.
   Backfilled here rather than left for a future phase to trip over.
9. **Retrofit blast radius from a new required column**: adding `profiles.is_active`
   (non-nullable) to `Database['public']['Tables']['profiles']['Row']` broke 22 existing
   `Profile`-typed object literals across 18 test files (every fixture built before this
   phase). Not a design mistake — an accurate Row type for a `not null default true`
   column has to require the field; the alternative (marking it optional in Row) would
   silently lie about the schema. Fixed by adding `is_active: true` to every fixture.
   Full list is in the Phase 12 commit; if a future phase adds another required
   `profiles` column, expect the same fan-out and grep for `company_name:` (the
   cheapest reliable marker of a `Profile` literal in this codebase) to find every site.

**Testing & Hardening Pass (built, Phase 13):** closes the gaps Phases 1–12
accumulated — a full RLS audit, real e2e/visual/accessibility infrastructure
(this repo's first), and CI finally exercising a live Postgres instead of
every RLS/pgTAP test being authored-but-unexecuted.
1. **RLS audit found two real, distinct bugs**, not just missing coverage.
   First: `warehouses_rls.test.sql` fixtured `warehouse_services`/
   `storage_spaces` rows under provider A only, so its "provider A cannot see
   provider B's service/space" assertions were vacuously true regardless of
   whether Phase 3's directory-open SELECT policy existed at all — there was
   no fixture row under provider B's warehouse for the policy to actually
   grant or deny access to. Fixed by adding fixture rows under both
   providers' warehouses and asserting the real positive case (provider A
   *can* read provider B's rows via the directory policy) alongside the
   still-correct mutation-negative case. Second: the same file declared
   `plan(20)` but only had 19 real assertions — a bare count mismatch that
   would have failed at `finish()` the moment this suite first actually ran,
   which (per the sandbox limitation below) had never happened before this
   phase. Every other RLS test file's plan count was verified against its
   actual assertion count (a plain `grep -c` audit, not manual reading) and
   all 13 others were already accurate.
2. **This repo's RLS/pgTAP tests had genuinely never executed against a live
   Postgres before this phase** — every prior phase's own write-up says so
   explicitly ("written, not yet executed"), because the sandbox these
   phases were built in has no Docker access (see Landmines). GitHub
   Actions runners have both Docker and unrestricted network, so
   `.github/workflows/ci.yml`'s `supabase start`/`supabase db reset` steps
   (previously commented out, exactly for this moment) are now live, with a
   new `supabase test db` step actually running every `supabase/tests/*.sql`
   file. This is the first time any of this repo's RLS tests have real
   executable proof behind them rather than just internal consistency.
3. **Playwright infra, root-level, not inside `app/`**: `playwright.config.ts`
   + `e2e/global-setup.ts` + `e2e/smoke.spec.ts` + `e2e/visual.spec.ts` (the
   real file, replacing `visual.spec.example.ts` per that file's own
   "rename: drop .example" instruction) live at the repo root since e2e
   exercises the built app *and* would exercise the Worker if any spec
   needed it — it's a cross-package concern, not `app/`-internal. Needed a
   new root `tsconfig.json` (scoped to `e2e/**/*.ts` + `playwright.config.ts`)
   and a new root `.oxlintrc.json`, since neither existed before (root
   wasn't a workspace member — see `pnpm-workspace.yaml` — so `pnpm
   typecheck`/`pnpm lint`'s recursive `-r` flag never touched root-level
   files). Root `package.json` gained `typescript`, `@types/node`, `oxlint`,
   `@supabase/supabase-js`, `pg`, `@types/pg`, and `@axe-core/playwright` as
   devDependencies — each justified: the first three so root-level TS files
   have their own typecheck/lint coverage at all; `@supabase/supabase-js` +
   `pg` for `global-setup.ts`'s fixture seeding (REST API for
   brand/provider/order data, a direct Postgres connection only for the
   admin-account trigger-bypass — see point 5); `@axe-core/playwright` for
   the accessibility pass (point 4).
4. **Accessibility pass via axe-core inside the same e2e specs**, not a
   separate harness — `smoke.spec.ts` scans the brand booking page (the
   primary form-heavy page in the core journey) and `visual.spec.ts` scans
   every route it already visits, asserting zero `wcag2a`/`wcag2aa`
   violations. Deliberately *not* done as jsdom/vitest component tests:
   contrast is a real-pixel computation vitest's jsdom environment can't
   perform, so a browser-based check (axe-core running against actual
   rendered Chromium) is the only mechanism that can honestly claim to have
   checked contrast, not just ARIA structure.
5. **`e2e/global-setup.ts` seeds three roles, each a different way,
   documenting *why* each is different**: brand/provider are self-service,
   so global-setup drives the real `SignUpPage` form through a headless
   browser (not a hand-constructed Supabase session) — this is deliberately
   the *most* faithful path available, exercising the actual signup flow
   rather than bypassing it. `admin` has no self-service or REST-API
   provisioning path at all (see the Phase 12-era Landmines entry below) —
   the only way in is the same trigger-disable-for-one-`UPDATE` technique
   the pgTAP tests already use, done here via a direct `pg` connection to
   Supabase CLI's fixed local-dev Postgres (`postgres:postgres@127.0.0.1:
   54322`, confirmed against `supabase/config.toml`'s `[db]` port, no
   password override present). This is the first non-pgTAP context in the
   repo to use that bypass, and it's wrapped in a try/catch that skips
   admin-fixture creation (not the whole e2e run) on failure —
   `visual.spec.ts`'s admin `describe` block itself checks whether
   `e2e/.auth/admin.json` exists and self-skips if the seed didn't happen,
   so a raw-Postgres-connection failure degrades to "less coverage," not a
   red build. Warehouse/storage-space/product/`platform_orders` fixture
   data is seeded via the service-role REST client (the same "bypass RLS,
   mirror the service-role writer" pattern every pgTAP fixture already
   uses) — deliberately *not* via a real marketplace OAuth+webhook flow,
   since driving one of those in e2e is its own multi-day project outside
   this phase's scope; the booking itself is **not** pre-seeded, since
   creating and approving it live is exactly what `smoke.spec.ts` exists to
   prove.
6. **`e2e/smoke.spec.ts`** drives the exact ROADMAP-specified journey — booking
   request → provider approval → the seeded order becoming visible via that
   approval → provider sets `fulfillment_status`/`tracking_number` → brand
   sees it reflected back read-only — using two real browser contexts
   (`storageState` from global-setup) rather than one shared session, since
   the journey is genuinely two-sided and RLS visibility differs per role.
   Deliberately does **not** re-prove sign-up/sign-in itself (that already
   happens, for real, in global-setup) — this keeps the smoke spec focused
   on the journey ROADMAP actually asks for.
7. **Baseline bootstrap problem, solved via a scoped `workflow_dispatch`
   path, not by skipping the requirement.** `e2e/visual.spec.ts` needs
   committed baseline screenshots, but generating them requires a live
   Linux Playwright run this sandbox cannot do (no Docker, so no local
   Supabase for the app to run against either) — and TESTING.md is explicit
   that baselines must come from CI, never from a contributor's own laptop.
   `ci.yml` gained a `workflow_dispatch` trigger with an `update_snapshots`
   boolean input; when set, a job-level `permissions: contents: write`
   override (scoped to this one job, not the workflow default) lets a
   dedicated step run `playwright test --update-snapshots` and push the
   resulting `*-snapshots/` directories straight to the dispatched branch.
   Every regular `pull_request`/`push` run takes neither this permission
   nor this step. **UNVERIFIED — by design, this is the first thing to run
   once this phase's PR is open**: fire the workflow manually with
   `update_snapshots: true` before expecting `pnpm exec playwright test` to
   pass on a normal run.
8. **Every env-var name this phase introduced into CI is a documented
   assumption, not a verified fact**, flagged inline in `ci.yml` itself:
   `supabase status -o env`'s default output keys (`API_URL`, `ANON_KEY`,
   `SERVICE_ROLE_KEY`) come from Supabase CLI's own established convention,
   not a fetch this sandbox could perform (`supabase status` itself needs
   Docker) — confirmed only that `--override-name` exists and works via
   `supabase status --help` (no live instance needed for `--help`). If the
   first CI run shows these names are wrong, the fix is entirely inside the
   two `Capture`/`Map` steps in `ci.yml`, nothing else.
9. **The first live `supabase test db` run surfaced a real, systemic gap
   nine phases deep**: `20260711165411_grant_table_privileges.sql` grants
   base `SELECT`/`INSERT`/`UPDATE`/`DELETE` on every table to `anon`/
   `authenticated`, plus `ALTER DEFAULT PRIVILEGES` so this can't quietly
   reopen table-by-table. Every migration since Phase 1 created RLS
   policies but never `GRANT`ed table-level access at all — table grants and
   RLS are two separate Postgres gates, and without the grant every pgTAP
   query failed with "permission denied for table X" before RLS ever
   evaluated, instead of the RLS-mediated "0 rows" / "row-level security
   policy" errors every RLS test in this repo already asserts (Postgres's
   own error HINT named the exact fix). Confirmed this doesn't weaken
   anything: the `*_tokens`/`sync_logs` tables' zero-policy RLS still
   returns zero rows to everyone regardless of the grant — a table grant is
   a precondition for RLS to run, not an alternative to it.
10. **The same first live run also surfaced a genuine circular RLS bug from
    Phase 3**: `select`/`insert`/`update`/`delete` on `inventory`
    (`20260710133106_create_inventory.sql`) each check ownership via a live
    subquery into `products`, while `products_select_via_approved_booking`
    (added in that same migration) checks visibility via a live subquery
    back into `inventory` — evaluating either table's RLS recurses into the
    other's indefinitely ("infinite recursion detected in policy for
    relation inventory/products"). Neither this sandbox nor any prior phase
    could have caught this without an actual Postgres to run policies
    against. Fixed by `20260711182031_fix_inventory_products_rls_recursion.sql`:
    wraps the one edge that closes the cycle
    (`products_select_via_approved_booking`'s inventory lookup) in a
    `SECURITY DEFINER` function — such a function executes as its owner,
    exempt from RLS by default (no table here uses `FORCE ROW LEVEL
    SECURITY`), so its internal query into `inventory` never re-triggers
    `inventory`'s policies. The predicate itself is byte-for-byte identical
    (same joins/filters) — this changes *how* it's evaluated, not what's
    visible to anyone.
11. **One more bug, this time in Phase 12's own test, not the schema**:
    `profiles_rls.test.sql`'s "even an admin cannot change a profile's
    role" assertion set `role = 'provider'` on a fixture user whose role
    was *already* `'provider'` — a same-value "change" that correctly never
    trips `prevent_role_change`'s `new.role <> old.role` guard, so the test
    asserted an exception that had no reason to fire. `prevent_role_change`
    itself was never broken; the test target value just needed to be an
    actually-different role (`'brand'`). The tell for next time: an
    assertion like "X cannot change to value Y" is only a real test when Y
    differs from the fixture's current value — this class of test bug is
    invisible without live execution, same as the two findings above.
12. **A fourth bug, this time in `ci.yml` itself, only surfaced once
    `supabase test db` was passing and the pipeline reached the e2e step**:
    `supabase status -o env`'s output is shell-quoted
    (`API_URL="http://127.0.0.1:54321"`), but the original "Capture local
    Supabase connection info" step piped that output directly into
    `$GITHUB_ENV` (`supabase status -o env | tee /tmp/... >> "$GITHUB_ENV"`).
    GitHub's `GITHUB_ENV` file format does **not** do shell parsing — it
    takes everything after the first `=` as the literal value — so `API_URL`
    ended up containing the literal quote characters as part of its value.
    The next step's `echo "SUPABASE_URL=$API_URL" >> "$GITHUB_ENV"` then
    propagated those embedded quotes into `SUPABASE_URL`, producing
    `e2e/global-setup.ts`'s `createClient(SUPABASE_URL, ...)` call failing
    with "Invalid supabaseUrl: Must be a valid HTTP or HTTPS URL" — a string
    that looked correct in the workflow's own env-dump log (GitHub's log
    formatter always wraps env values in quotes for display, masking the
    bug) but wasn't. Fixed by writing `supabase status -o env`'s output to a
    plain file and `source`-ing it as real shell in the "Map" step (`set -a;
    source /tmp/supabase-status.env; set +a`) before re-exporting individual
    vars to `$GITHUB_ENV` — `source` parses the shell-quoted syntax
    correctly and strips the quotes, so the values written onward are bare
    strings. The tell for next time: never pipe a tool's shell-quoted
    `KEY="value"`-style output directly into `$GITHUB_ENV` — always parse it
    as shell first (`source`, or `eval`) since GITHUB_ENV's own format is a
    flat `KEY=value` (or heredoc) convention with no quote-stripping of its
    own.
13. **A fifth bug, once the env-quoting fix let CI reach the real Playwright
    browser for the first time**: `e2e/global-setup.ts`'s `signUpViaUi`
    called `page.getByLabel('Name')` to fill `SignUpPage`'s display-name
    field, but Playwright's `getByLabel` matches by substring by default —
    "Name" is also a substring of the page's other field, labeled "Company
    name (optional)" — so the locator resolved to 2 elements and Playwright
    correctly refused to guess ("strict mode violation"). Fixed by passing
    `{ exact: true }` to that one `getByLabel` call. The tell for next time:
    any `getByLabel`/`getByText`/`getByRole({name})` call is a substring
    match unless `exact: true` is passed — safe when the target string is
    unique among all labels on the page, a latent bug the moment a second
    label contains it as a substring (as happened here between "Name" and
    "Company name (optional)"), and this class of bug is invisible without
    a real browser actually resolving the locator, same as every other
    Phase 13 finding in this section.
14. **A sixth bug — this one a real, previously-shipped production defect in
    `AuthProvider.tsx`, not test infrastructure.** Once the label-locator fix
    let `signUpViaUi` actually submit the sign-up form, the resulting
    navigation to `/` bounced straight back to `/sign-in` instead of landing
    on `/brand` — reproduced consistently, not flaky. Root cause:
    `AuthProvider`'s `syncSession` awaited `fetchProfile(session.user.id)`
    (a network round trip) before calling `setState` even once. During that
    await, React state still held whatever `loading`/`session` values were
    set by the *initial* (pre-signup, unauthenticated) `getSession()`
    resolution — typically `loading: false, session: null`. `SignUpPage`
    calls `navigate('/')` immediately after `supabase.auth.signUp()`
    resolves, and `ProtectedRoute` reads `{ session, loading }` on that very
    render — seeing the stale `loading: false` (not the true "an auth
    transition is in progress" state) and `session: null`, it redirected to
    `/sign-in` before the new session's profile fetch ever got a chance to
    complete. This is a real race any user could hit on a slow connection,
    not an e2e-only artifact — it just took a real browser driving a real
    sign-up against a real (if local) Supabase instance to surface, since
    jsdom/mocked-network component tests never model this network-timing
    gap. Fixed in `app/src/hooks/AuthProvider.tsx`: `syncSession` now calls
    `setState` **synchronously** with `{ ...prev, session, loading: true }`
    the moment a non-null session arrives, before awaiting `fetchProfile` —
    so any consumer reading state during the profile-fetch window sees
    `loading: true`, never a stale `session: null`. Regression test:
    `app/src/hooks/AuthProvider.test.tsx` (new file) mocks
    `supabase.auth.onAuthStateChange`/`supabase.from` with a controllable
    pending profile-fetch promise and asserts the exact invariant that
    broke — confirmed red against the pre-fix code (session stayed `none`
    throughout), green after. The tell for next time: any `useEffect` that
    fires `setState` only after an `await` has a window, between the state
    change that triggers the effect and the `setState` call, where
    downstream consumers see **stale** state, not "no state yet" — if a
    boolean like `loading` is meant to cover that whole window, it must be
    set at the top of the async function, synchronously, not just at the
    end.
15. **A seventh bug — the same missing-GRANTs class as finding 9, but for a
    third role that finding's own migration didn't cover.** Once
    `signUpViaUi` worked, `e2e/global-setup.ts`'s service-role fixture
    seeding hit "permission denied for table warehouses" using
    `SUPABASE_SERVICE_ROLE_KEY`. `service_role` has the `BYPASSRLS`
    attribute, which only skips RLS *policy* evaluation — it is not a
    substitute for the base table-level `GRANT` a role needs before a query
    is attempted at all, and `20260711165411_grant_table_privileges.sql`
    only granted `anon`/`authenticated` (the two Data-API roles), never
    `service_role`. This is a bigger deal than an e2e fixture failing: every
    production write in `worker/` — marketplace tokens, `platform_orders`,
    `sync_logs`, admin moderation — uses this exact role, so the same gap
    was live in the real Worker code path, not just this test's fixture
    seeding, and had been since Phase 5. pgTAP's own RLS tests never caught
    it because their fixture inserts run as the `postgres` superuser, not
    `service_role`. Fixed by a second migration,
    `20260711211655_grant_service_role_table_privileges.sql` (kept separate
    from the already-pushed anon/authenticated migration rather than
    editing shared history) — same `GRANT`/`ALTER DEFAULT PRIVILEGES`
    shape, targeting `service_role`. The tell for next time: a missing-GRANT
    fix that enumerates specific roles needs to enumerate **every** role
    that actually touches the table, not just the ones the failure you're
    fixing happened to surface — anon/authenticated failing first didn't
    mean service_role was fine, it just meant nothing had exercised it live
    yet.
16. **An eighth bug, and the first real finding from the axe-core
    accessibility pass actually running** (`e2e/smoke.spec.ts`'s scan of
    `/brand/bookings`): `DashboardShell`'s sidebar nav-group labels
    ("Catalog", "Fulfillment", "Marketplaces") used `text-ink-tertiary` on
    `bg-surface-1` — in the light theme that's `#9195a0` on `#ffffff`, a
    2.99:1 contrast ratio, failing WCAG 2 AA's 4.5:1 minimum for normal-size
    text (`color-contrast`, `wcag2aa`/`wcag143`, impact: serious). This had
    shipped since the Phase 9 shadcn/Radix rewrite introduced
    `DashboardShell`'s nav groups — never caught before because this was the
    first time `axe-core` ran against a real rendered page in this repo (see
    finding 2 in this same section: this whole phase is the first live
    execution of *any* of Phase 13's own new checks). Computed contrast
    manually to pick the fix rather than guess: `text-ink-subtle`
    (`#6b7078` light / `#8a8f98` dark) gives 4.98:1 (light) and 6.08:1
    (dark) against `surface-1` in both themes — comfortably passing where
    `ink-tertiary` gives 2.99:1 (light, the one axe caught) and 3.43:1
    (dark, latent and technically also failing, just never exercised since
    Playwright defaults to light rendering with no explicit `colorScheme`
    set). Fixed by changing that one label's class from `text-ink-tertiary`
    to `text-ink-subtle` in `DashboardShell.tsx` — no other element used
    `ink-tertiary` for text content (`EmptyState`'s icon and `TextField`'s
    placeholder also use it, but axe's `color-contrast` rule only evaluates
    text nodes, not icons or placeholder pseudo-elements, so neither was
    flagged and neither was touched). The tell for next time: a color-token
    ladder with more steps than accessibility-safe options invites exactly
    this mistake — `ink-tertiary` reads as "the next step down from
    ink-subtle" in the token list, but nothing in `DESIGN.md` marks it as
    unsafe for text-on-surface-1; any future use of the two dimmest ink
    tokens for actual copy (not disabled/decorative use) should get its
    contrast ratio checked against the specific background it sits on
    before shipping, not assumed safe by token-ladder position.
17. **A ninth bug, in the smoke spec itself, surfaced once the a11y fix let
    the journey progress into the fulfillment step**: `providerPage
    .getByText('shipped')` matched 2 elements — `ProviderOrdersPage`'s
    read-only `StatusBadge` span showing the persisted `fulfillment_status`,
    **and** the "Fulfillment status" `SelectField`'s own `<option
    value="shipped">shipped</option>`, which exists in the DOM (and is
    text-matchable by Playwright) regardless of whether the native
    `<select>` is open. Fixed by scoping the assertion to
    `providerPage.locator('span').filter({ hasText: 'shipped' })` — matches
    only the badge, not the option, since `<option>` elements aren't
    `<span>`s. The brand-side equivalent assertion (`ShopifyOrdersPage`,
    line 74) didn't need the same fix — that page is read-only, with no
    `<select>` anywhere, so its `StatusBadge` is the only element containing
    "shipped" at all. The tell for next time: any page pairing a live
    `<select>` of status options with a separate read-only badge showing
    the *current* status is a latent `getByText` collision the moment the
    badge's text matches one of the select's option values — scope the
    locator to an element type/role the option can't also match, don't
    assume a plain text match is unique just because it reads that way in
    the rendered page.
18. **A tenth bug, and a second real accessibility finding — this time from
    the first `visual.spec.ts` route that actually renders a `success`-toned
    `StatusBadge`** (`/brand/shopify/orders`, scanning an order row with a
    resolved SKU): `text-success` on `bg-success/10` measured 3.89:1 in the
    light theme, again failing WCAG 2 AA's 4.5:1 floor. Computed the ceiling
    before picking a fix: light theme's `--color-success` (`#1a8a3a`) tops
    out at only **4.43:1 against pure white** — below 4.5:1 even with zero
    background tint — so no amount of adjusting the badge's `/10` opacity
    could fix this while keeping the same text color; the token itself had
    to get darker. Swept opacity from 20% down to 1% to confirm this (lower
    opacity paradoxically *increases* contrast here, since text and tint
    share the same base hue and converge toward each other as opacity
    rises) — even at 1% the ceiling was 4.38:1, still short. Darkened
    `--color-success` to `#177c34` (light theme only; dark theme's `#27a644`
    already passed at 5.64:1 against its own tint) — the new color's own
    10%-tint composite yields 4.62:1. While computing this, found the same
    latent defect in `--color-error` (`#d13438`), unexercised only because
    no `visual.spec.ts` route yet renders an `error`-toned badge (light
    theme, 10%-tint composite: 4.26:1) — fixed proactively to `#c63135`
    (10%-tint composite: 4.62:1) rather than waiting for a future CI run to
    surface it separately, same as `ink-tertiary`'s dark-theme case in
    finding 16. Both changes are CSS-variable-only (`app/src/index.css`'s
    light `@media` block) — `grep` confirmed `text-success`/`bg-success` and
    `text-error`/`bg-error` are used nowhere else in `app/src`, so neither
    change has any other call site to consider. `DESIGN.md`'s color table
    and Known Gaps section updated to match. **Separately noted, not
    fixed**: `DESIGN.md`'s own `status-badge` component spec says a status
    tint should "override text color only, never the pill's bg" — the
    actual `StatusBadge.tsx` implementation uses `bg-{tone}/10` for
    success/error, which is a pre-existing drift from that documented
    pattern. Out of scope for this bug fix (changing the structural
    bg-vs-text pattern is a design decision, not an accessibility
    requirement — the darkened tokens already make the *current* pattern
    compliant), but worth resolving as an explicit design-system cleanup
    later. The tell for next time: when a color fails contrast against its
    *tinted* background, check its contrast against the *lightest possible*
    background (pure white/canvas) before concluding a tint-opacity tweak
    can fix it — if the ceiling itself is below the threshold, only a
    darker (or lighter, in dark mode) base color closes the gap.
19. **An eleventh bug — a real test-isolation race, surfaced only once every
    prior finding was fixed and the suite ran far enough to reach it**: the
    baseline-bootstrap run's *own* re-run (after GitHub's `action_required`
    approval gate — see below) failed with a genuine pixel diff on
    `/provider/orders` (5228 pixels, ratio 0.02, over the 0.01 threshold) —
    not a missing-baseline error this time, an actual mismatch against the
    just-committed baseline. Root cause: `smoke.spec.ts` and
    `visual.spec.ts` share the exact same brand/provider/order fixtures
    seeded once by `global-setup.ts`, and `smoke.spec.ts` actively mutates
    the seeded order's `fulfillment_status`/`tracking_number` (its own
    journey's last step) — the same order `visual.spec.ts`'s
    `/provider/orders` scan reads read-only. `playwright.config.ts` had
    `fullyParallel: true` with no `workers` override, so the CI runner
    picked its own default (2, per the run's own "Running 28 tests using 2
    workers" log line) — with no ordering guarantee between the two spec
    files, whether the screenshot captures the order *before* or *after*
    smoke's mutation is non-deterministic, and the just-generated baseline
    happened to capture one ordering while this re-run's fresh worker
    scheduling captured the other. Fixed by setting `workers:
    process.env.CI ? 1 : undefined` — forces fully serial execution in CI,
    the simplest correct fix for a suite with shared mutable fixture state
    (the alternative — giving `visual.spec.ts` its own isolated order
    fixture, or wrapping each spec file's state in a transaction — is a
    real e2e-architecture improvement but out of scope for closing out this
    phase; noted as a candidate for a future hardening pass). The tell for
    next time, and the one this whole phase keeps re-teaching: a test suite
    with fixtures shared and mutated across spec files is only as
    deterministic as its execution ordering guarantees — `fullyParallel`
    plus multiple workers assumes test *isolation*, and the moment two
    spec files touch the same row, that assumption silently breaks in a
    way no sandbox without a live multi-worker Playwright run could ever
    catch. **Correction, found while chasing the follow-up:** `workers: 1`
    was a real, worthwhile fix (a shared-fixture suite genuinely isn't safe
    under unordered parallel workers), but it was **not** what actually
    caused the `/provider/orders` diff, and the first write-up above
    mis-attributed it. Proof: after `workers: 1` landed, a fresh
    `workflow_dispatch` bootstrap run — via `pnpm exec playwright test
    e2e/visual.spec.ts --update-snapshots`, i.e. **`visual.spec.ts` alone**
    — reported "No baseline changes to commit" (a byte-for-byte match
    against the existing baseline), while the very next full-suite
    comparison run, using the exact same code and the exact same serial
    `workers: 1` ordering, still failed with the *identical* 5228-pixel
    diff. Two runs, same commit, same ordering, opposite outcomes — that
    contradiction is what exposed the real bug: **the baseline-generation
    command and the real comparison command were never equivalent in
    scope.** `ci.yml`'s comparison step runs `pnpm exec playwright test`
    (the full suite — `smoke.spec.ts` *and* `visual.spec.ts` together, one
    `globalSetup`, one dev server), so `smoke.spec.ts`'s mutation of the
    seeded order's `fulfillment_status`/`tracking_number` always precedes
    `visual.spec.ts`'s `/provider/orders` screenshot. But the baseline step
    ran `playwright test e2e/visual.spec.ts --update-snapshots` — a file
    filter that **excludes `smoke.spec.ts` entirely** — so the committed
    baseline permanently captured the order's pristine, pre-mutation state.
    Every real comparison run would forever disagree with it, deterministic
    ordering or not. Fixed by changing the baseline step to `pnpm exec
    playwright test --update-snapshots` (no file filter — the same full
    suite the comparison step runs; `--update-snapshots` is a no-op for
    `smoke.spec.ts`, which has no screenshot assertions). Deliberately not
    two sequential `playwright test` invocations (`smoke.spec.ts` then
    `visual.spec.ts`): each separate invocation re-runs `globalSetup` and
    tries to start its own dev server, and re-running `globalSetup` a
    second time in the same job would attempt to sign up the same seeded
    brand/provider emails again and fail outright. The tell for next time,
    compounding the one above: when two runs of *supposedly* identical code
    under *supposedly* identical conditions disagree, don't keep patching
    the most recent theory — find the one concrete configuration
    difference between the two commands actually being compared (here: a
    file-path filter silently narrowing what a "generate the baseline"
    command exercises versus what "check the baseline" exercises).
20. **A twelfth, non-bug wrinkle in the CI plumbing itself**: the
    baseline-bootstrap job's own commit (authored as `github-actions[bot]`
    via `git config user.name`/`user.email` in the "Generate + commit
    visual baselines" step) triggered a new `pull_request` "synchronize"
    check run that came back `action_required` instead of running —
    GitHub's own safeguard against a bot-authored push auto-running a
    workflow without a human in the loop, not anything this repo's
    `ci.yml` did wrong. Resolved by manually re-triggering that specific
    run (`rerun_workflow_run`) as a human collaborator, which bypasses the
    gate. Not a recurring landmine to fix in code — future baseline
    bootstrap runs on this branch will hit the same gate and need the same
    manual re-run, which is an acceptable, infrequent cost for a path that
    only exists to seed committed screenshots once.

## Stack rules

### TypeScript
- `strict` is on in both `app/` and `worker/` — verified in `tsconfig.app.json` /
  `tsconfig.node.json` / `worker/tsconfig.json`. Never silence an error with `any`, `as`, or
  `@ts-ignore` — fix the type.
- Generated types are the source of truth (`app/src/types/database.ts` from Supabase, once
  generated). Never hand-edit; regenerate with `pnpm db:types`.
- Exhaustive `switch` over unions with a `never` default. Model states with discriminated
  unions, not boolean flags.

### React (Vite SPA — no meta-framework)
- Plain client-rendered SPA. Routing is `react-router` (v8, the unified package — `BrowserRouter`
  / `Routes` / `Route`, no data-router/loader features used yet).
- Data access: Supabase client directly from components/hooks for anything RLS can authorize
  alone. Anything requiring a secret or third-party call goes through the Worker, called via
  `fetch`.
- One export per file for anything importing React hooks/context (`react/only-export-components`
  in `.oxlintrc.json`) — e.g. `hooks/auth-context.ts` (context + types), `hooks/AuthProvider.tsx`
  (the provider component), `hooks/useAuth.ts` (the hook) are three files, not one, on purpose.
- `.env.local` (gitignored) holds `VITE_*` vars from `app/.env.example`. Anything in a `VITE_*`
  var ships to the client — never put a secret there.
- **Design system is `DESIGN.md`, binding** (see the @import at the top of this file). Colors/
  radii/typography are Tailwind v4 `@theme` tokens in `app/src/index.css` (`bg-canvas`,
  `text-ink`, `border-hairline`, etc.) — never hand-write a `slate-*`/`red-*`/`green-*` Tailwind
  class in a page; go through the tokens. Shared primitives live in `app/src/components/ui/`
  (`Button`, `Card`, `TextField`, `SelectField`, `StatusBadge`, `ListRow`, `EmptyState`,
  `ErrorText`, plus shell-only `Avatar`, `DropdownMenu`, `Sheet`, `Separator`) — pages compose
  these, they don't hand-roll form/button markup. Dark is the `@theme` default
  (`prefers-color-scheme: dark`); light overrides via a `prefers-color-scheme: light` media
  query on the same CSS variables — no manual toggle exists.
- **`components/ui/*` is built on Radix UI primitives + `class-variance-authority`** (the
  shadcn/ui structural pattern), adopted after Phase 9 once every page was still a flat stack
  of full-width link buttons with no persistent nav chrome. Every primitive kept its existing
  public prop API (`variant`, `tone`, `label`, plain children) unchanged, so this was a
  `components/ui/*` + `DashboardShell.tsx`-only rewrite — no page file needed to change to pick
  up the new look. `DashboardShell` is now a real app shell: a role-aware sidebar (grouped nav
  — Catalog/Fulfillment/Marketplaces for brand, flat list for provider, single item for admin)
  with active-route highlighting, a footer user menu (`DropdownMenu` + `Avatar` initials +
  sign-out), and a `Sheet` (Radix `Dialog`)-based slide-in drawer for the same nav below `md:`.
  Deliberately **not** adopted: shadcn's own `--background`/`--foreground`/`--popover` color
  convention — every Radix-backed primitive still reads FBP's own token names, to avoid a
  second parallel color system. Also deliberately **not** converted: `SelectField` stays a
  styled native `<select>`, not Radix's `Select` — see the Landmine below.

### Supabase
- **Every schema change is a migration** in `supabase/migrations/` (`pnpm db:new <name>`).
  Dashboard-only changes are drift and treated as bugs.
- After any schema change: `pnpm db:reset` locally, **regenerate types
  (`pnpm db:types`), commit them** in the same change.
- **RLS is on for every table.** A new table isn't done until its policies exist and have
  tests (TESTING.md → RLS tests). Assume the anon key is public.
- `service_role` key: Worker context only, never bundled for the client, never logged.
- Local ports (`supabase/config.toml`): API `54321`, Postgres `54322`, pooler `54329`, Studio
  `54323`, inbucket/SMTP `54324`, analytics `54327`. Local-first: develop against
  `supabase start`, not production.
- Supabase CLI is a pinned workspace devDependency (`supabase` in root `package.json`) — run
  via `pnpm exec supabase ...` / the `db:*` scripts, not a global install or `pnpm dlx` (dlx
  re-resolves the version every call).

### Cloudflare Workers
- `worker/wrangler.toml` is the source of truth for bindings; keep the `Env` interface in
  `worker/src/index.ts` in sync with it.
- Workers ≠ Node. `nodejs_compat` is enabled in `wrangler.toml`; still verify each Node API
  used is actually supported before relying on it.
- Secrets via `wrangler secret put` in production, `.dev.vars` (gitignored) locally — never in
  code or committed to `wrangler.toml`.
- Mind the limits: CPU time, subrequest count, body sizes. Long-running order-sync work will
  need a queue/cron approach, not a single request — decide and document here when it's built.
- Tests run in the Workers runtime via `@cloudflare/vitest-pool-workers` (`worker/vitest.config.ts`),
  not plain Node. **Landmine:** this package's v4 line (`0.18.x`, matching Vitest 4) dropped the
  `@cloudflare/vitest-pool-workers/config` subpath and `defineWorkersConfig`. Current API: import
  `{ cloudflareTest }` from the package root, pass it as a Vitest `plugins: [cloudflareTest({ wrangler:
  { configPath: './wrangler.toml' } })]` entry in a config built with `defineConfig` from
  `vitest/config`. Don't reintroduce the old `/config` import from an older tutorial/example.
- **Testing outbound `fetch` calls (Phase 5):** every function in `worker/src/shopify/` that
  hits the network (Shopify's API, or Supabase via `supabaseAdmin.ts`) takes a trailing
  `fetchImpl: typeof fetch = fetch` parameter, forwarded into supabase-js's own
  `createClient(url, key, { global: { fetch } })` option for the admin-client calls. Verified
  empirically in this sandbox (see Landmines) that this works cleanly inside
  `@cloudflare/vitest-pool-workers`' workerd runtime — TESTING.md's MSW convention was the
  starting assumption, but MSW's Node-network-layer interception has no defined relationship
  to workerd's native `fetch`, and this dependency-injection boundary sidesteps the question
  entirely with no new dependency. Confirmed again in Phase 6's `worker/src/tiktok/` (49
  more tests), Phase 7's `worker/src/amazon/` (37 more tests), Phase 8's
  `worker/src/ebay/` (44 more tests), and Phase 9's `worker/src/walmart/` (34 more
  tests, 226 total in the worker, 273 across app+worker) — this pattern has now
  covered every auth-model shape this repo's marketplace integrations use; no
  future platform integration should reach for MSW in the Worker either. Phase 10's
  `scheduledSync.ts`/`syncLogs.ts` (34 more tests, 263 total in the worker) reuse the
  exact same convention — the one exception is `index.test.ts`'s new `scheduled()`
  test, which stubs `globalThis.fetch` instead of injecting one: `scheduled()`'s
  signature is fixed by Cloudflare's `ExportedHandler` type and takes no extra
  parameter, so there's no injection seam at that one entry point the way every other
  handler has.
- **Shared vs. per-platform Worker code (decided in Phase 6, held through Phase 7-9):**
  `worker/src/shared/` holds primitives with no platform-specific logic (`hmac.ts`,
  `oauthState.ts` — moved out of `shopify/` in Phase 6 once TikTok needed the exact same
  ones, see above). Platform-specific modules (`client.ts`, `supabaseAdmin.ts`,
  `sync.ts`, `handlers.ts`, `env.ts`, `types.ts`) stay duplicated one directory per
  platform rather than abstracted behind a shared interface — Phase 7 made this the
  obviously correct call, not just a two-platform guess: Amazon's auth model
  (self-authorization, no OAuth redirect, no request signing, no webhook) differs from
  Shopify/TikTok's so fundamentally that even `oauthState.ts` doesn't apply to it. Phase
  8's eBay integration is a second data point in the *other* direction: it shares
  Shopify/TikTok's OAuth-redirect shape closely enough to reuse `oauthState.ts` and the
  same `ensureAccessToken`-with-skew caching idea Amazon introduced — but it still isn't
  worth extracting a shared interface, since eBay's RuName-instead-of-redirect_uri
  quirk and its mandatory account-deletion endpoint (a requirement no other platform
  has at all) are each real, platform-specific enough to make a generalized abstraction
  leaky rather than clean. Phase 9's Walmart integration is a third data point
  confirming the "reuse patterns, duplicate modules" call: it reuses the
  `ensureAccessToken`-with-skew *idea* yet again, but its auth model (client-credentials,
  no refresh_token, no app-level Worker secret at all) is different enough from both
  Shopify/TikTok/eBay's redirect flow and Amazon's refresh-token flow that no single
  shared interface could express all three cleanly. With five platforms and three
  distinct auth-model shapes now built, this decision is considered settled for this
  repo's remaining marketplace work, not just provisional. The `fetchImpl`-injection
  and `ensureAccessToken`-shape *patterns* travel between platforms; the modules that
  use them stay duplicated.

## Branching & deployment model (Phase 14)

**`master` = staging, `main` = production.** Feature branches PR into `master`
(same as every phase so far); a **promotion PR from `master` into `main`**
releases to production — `ci.yml`'s `ship-gate` runs on that PR exactly like
any other, since its trigger is `pull_request` regardless of base branch.
This replaces the ad-hoc "merge main up to date with master" commits earlier
phases used (see git history around Phase 12/13) with something CI actually
gates.

**One shared Supabase project for both environments** — a client decision,
not a technical default. The tradeoff, stated plainly: there is no database
isolation between staging and production under this model. A migration,
a bad RLS policy, or seeded test data landing on `master` is immediately live
against the same rows real `main` users would see, since both environments'
Workers hold the same `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`. Accepted
for now to avoid provisioning/paying for a second Supabase project; revisit
if real user data ever lands in this project — at that point "staging" stops
meaning "isolated" and starts meaning "same DB, different Cloudflare
deployment," which is a materially weaker safety net than the two-project
option this repo turned down.

**Cloudflare: two Worker deployments (`fbp-worker` prod / `fbp-worker-staging`
staging, via `worker/wrangler.toml`'s `[env.staging]`), one Pages project
(`fbp-app`, ASSUMPTION — any name works, this is just wrangler's
`--project-name`) with two branch deployments** (`--branch=main` is the
production deployment, `--branch=master` gets Cloudflare Pages' own stable
branch-alias URL — this is Cloudflare's native "preview vs. production"
branch behavior, not something this repo's CI has to construct). No custom
domain yet — both environments run on Cloudflare's default `*.pages.dev`/
`*.workers.dev` subdomains (client decision; revisit when a real domain is
ready — ROADMAP.md's Phase 14 domain/SSL bullet is deferred, not skipped).

**Deploy is CI-driven, not Cloudflare-dashboard-driven** — `deploy-staging`/
`deploy-production` jobs in `ci.yml`, gated on `needs: ship-gate` and on
`github.event_name == 'push'` to the matching branch, using
`cloudflare/wrangler-action@v3` (verified against its own README — inputs
`apiToken`/`accountId`/`command`/`workingDirectory`/`environment`, matching
what `ci.yml` uses). Consistent with this repo's existing "dashboard-only
changes are drift" rule for Supabase (see Stack rules → Supabase) — a
Cloudflare Pages project connected directly to GitHub via its own dashboard
integration would deploy outside version control and outside `ship-gate`'s
gate, so this repo deploys via an explicit, readable CI step instead.

**One-time, account-level setup this cannot do from a coding session** (needs
whoever holds the Cloudflare account): create the Pages project, generate a
scoped API token + account ID, add them as GitHub Environment secrets
(`staging`/`production` environments — see below), and run `wrangler secret
put` once per environment for every Worker secret in
`worker/.dev.vars.example`. See ROADMAP.md's Phase 14 checklist for the exact
steps; UNVERIFIED until that happens and a real push exercises these jobs.

## Environment & secrets

- `app/.env.example` and `worker/.dev.vars.example` are the contracts — every required var
  listed there with a comment. Adding a var without updating the example breaks the next
  machine.
- Never print secret values in logs, test output, or chat. Refer to them by name.
- **CI/deploy secrets (Phase 14), GitHub Environment-scoped (`staging`/`production`,
  Settings → Environments — not the repo-wide Secrets page, so staging and
  production can hold different `WORKER_URL` values)**: `CLOUDFLARE_API_TOKEN`,
  `CLOUDFLARE_ACCOUNT_ID` (same value in both environments — one Cloudflare
  account), `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (same value in both,
  per the shared-project decision above), `WORKER_URL` (**different** per
  environment — each environment's own deployed Worker URL, baked into the
  Pages build as `VITE_WORKER_URL`). See `deploy-staging`/`deploy-production`
  in `ci.yml`.
- Required vars today:
  - `app/.env.local`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_WORKER_URL`
    (the Worker's own URL — `app/src/lib/worker.ts` calls it directly via `fetch` with the
    Supabase session's `access_token` as a bearer token; needed even for local dev since
    `App.tsx` imports it eagerly, same as `lib/supabase.ts`'s existing throw-if-missing guard)
  - `worker/.dev.vars`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOPIFY_CLIENT_ID`,
    `SHOPIFY_CLIENT_SECRET` (also signs the OAuth install-state token and verifies
    webhook/callback HMACs), `SHOPIFY_SCOPES`, `APP_URL` (where the browser lands after OAuth),
    `WORKER_URL` (the Worker's own URL, used as the Shopify OAuth `redirect_uri` — TikTok has
    no equivalent var, see Phase 6 write-up), `TIKTOK_APP_KEY`, `TIKTOK_APP_SECRET` (also signs
    the OAuth install-state token and, per the Phase 6 ASSUMPTION notes, request/webhook
    signatures), `AMAZON_CLIENT_ID`, `AMAZON_CLIENT_SECRET` (LWA app credentials, used only
    to refresh a brand-submitted refresh token into a short-lived access token — no
    APP_URL/WORKER_URL equivalent either, since Amazon's self-authorization model has no
    OAuth redirect flow at all, see Phase 7 write-up), `EBAY_CLIENT_ID`,
    `EBAY_CLIENT_SECRET` (also signs the OAuth install-state token, reusing
    `shared/oauthState.ts`), `EBAY_RU_NAME` (eBay's assigned redirect identifier, used
    in place of a literal `redirect_uri` — see Phase 8 write-up), `EBAY_VERIFICATION_TOKEN`
    (for the mandatory marketplace-account-deletion endpoint's challenge hash; reuses the
    existing `APP_URL`/`WORKER_URL` bindings otherwise). **Walmart (Phase 9) needs no new
    var at all** — its client-credentials grant uses only the brand-submitted
    `client_id`/`client_secret` stored in `walmart_tokens`, entered via
    `WalmartConnectPage`; see Phase 9 write-up.
  - This completes every marketplace integration in this repo's initial scope
    (Shopify/TikTok/Amazon/eBay/Walmart, Phases 5-9). Future marketplace additions
    (if any) would extend this list the same way each phase above did.
  - **Admin panel (Phase 12) needs no new var either** — `worker/src/admin/` reuses
    `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` above to call Supabase Auth's admin API
    (ban/unban) for account deactivation; see Phase 12 write-up.

## Definition of Done

A change is done when **all** are true:
- [ ] Recon Report produced before the work (non-trivial changes)
- [ ] Floor green after every edit (typecheck + lint + touched-code tests)
- [ ] New/changed behavior has tests at the right level (TESTING.md ladder)
- [ ] Full suite + build green; e2e smoke green for user-facing changes
- [ ] Evidence Block delivered — commands, exit codes, UNVERIFIED list (may be empty)
- [ ] What & Why delivered
- [ ] This file updated if commands, architecture, or landmines changed

## Landmines (living section — append as discovered)

- **Tailwind cascade order is not DOM class order.** Tried to give `Button`'s `secondary`
  variant a red border/text override for a Delete action via `className="text-error
  border-error/50"` stacked after the variant's own classes — unreliable, because Tailwind's
  compiled stylesheet orders same-property utilities by its own internal rules, not by where
  they appear in the `className` string, so the "later" class in the string does not reliably
  win. Fixed by adding a proper `danger` variant to `Button` instead of overriding colors via
  className stacking. Same footgun applies to any shared primitive — extend the primitive's
  variant set, don't fight its own classes with more classes.
- **Google Fonts CDN load failed in this sandbox** (`ERR_CONNECTION_RESET`, caught by
  `scripts/eyes.mjs`) — the sandbox's proxy blocks it, same category as the Docker Hub/
  `supabase.co` blocks below. Rather than treat it as sandbox-only noise, reconsidered the
  dependency itself and dropped it: `app/index.html` has no font `<link>`; font stacks in
  `app/src/index.css`'s `@theme` lead with the system UI font, with `Inter`/`JetBrains Mono`
  as unreachable fallbacks. Don't reintroduce a webfont CDN without a real reason — see
  DESIGN.md's Implementation notes.
- `@cloudflare/vitest-pool-workers` v4 (`0.18.x`) has no `/config` export — see Cloudflare
  Workers stack rule above. Cost real debugging time during initial scaffold; don't copy an
  older v3-era example verbatim.
- `pnpm dlx supabase init` run from *inside* a `supabase/` directory nests a second
  `supabase/supabase/` — always run Supabase CLI commands (`init`, `migration new`, etc.) from
  the **repo root**, never from inside `supabase/`.
- `.claude/hooks/floor.sh` (Stop-hook "turn" mode) originally hardcoded `npx tsc --noEmit` at
  repo root. That's fine for a single-package repo but this is a pnpm workspace with no root
  `tsconfig.json` — bare `tsc` at root found no project and dumped CLI help instead of
  type-checking, which the hook then treated as a failure. Fixed to run `npm run --if-present
  typecheck`, which delegates to the real `pnpm -r typecheck` in root `package.json`. If a hook
  ever hardcodes a tool invocation instead of calling the repo's own verified script, assume it
  will drift the moment the repo stops being a flat single-package layout.
- New workspace deps with native/native-adjacent postinstall scripts (`workerd`, `esbuild`,
  `sharp`) get silently skipped by pnpm until approved. They're pre-approved via
  `onlyBuiltDependencies` in `pnpm-workspace.yaml` — if a fresh install ever behaves as if
  `wrangler`/`vitest-pool-workers` didn't build, check that list before debugging further.
- `.claude/hooks/floor.sh` (PostToolUse "file" mode) originally hardcoded `npx --no-install
  eslint` on every edited `.ts`/`.tsx` file. This repo has never installed ESLint anywhere —
  we use `oxlint` (see Overrides) — so that `npx` call was silently resolving to an unrelated
  eslint binary from outside the repo and failing on a missing `eslint.config.js`. Fixed to
  walk up from the edited file to the nearest `package.json` and run **that package's own**
  `lint` script, so it works for any linter and both `app/` and `worker/` without hardcoding a
  tool name.
- CI's `pnpm/action-setup@v4` step must **not** pass an explicit `version:` input — root
  `package.json` already pins `"packageManager": "pnpm@10.33.0"`, and the action refuses to
  run at all ("Multiple versions of pnpm specified") when both are set. Let the action read
  the version from `packageManager` alone.
- This sandbox's outbound network policy hard-blocks Docker Hub's registry CDN and `supabase.co`
  directly (403, confirmed via the proxy status endpoint, not a fixable retry). Raw-TCP database
  connections are also categorically unsupported through this session's proxy regardless of
  host. Net effect: **no live DB (local Docker or hosted) is reachable from inside this specific
  sandboxed session** — migrations/RLS tests get authored here and executed/verified by the
  human (or a different, unrestricted session) against a real Postgres. Don't assume this
  limitation applies to every environment this repo is developed in — it's this sandbox's policy,
  not a property of the repo.
- `scripts/eyes.mjs`'s `chromium.launch()` failed with "Executable doesn't exist" the first time
  it ran in this environment — the pre-installed Chromium build (`/opt/pw-browsers`, pinned
  build 1194) didn't match what the installed `@playwright/test` version expected (build 1228).
  Fixed by passing `executablePath: '/opt/pw-browsers/chromium'` explicitly instead of letting
  Playwright resolve its own expected bundled browser. Phase 13's root `playwright.config.ts`
  hit the exact same mismatch (this sandbox has `chromium`/`chromium-1194`/
  `chromium_headless_shell-1194`, not whatever build the installed `@playwright/test` version
  expects) — rather than hardcode this sandbox's path into a file every environment (including
  CI, which installs its own exactly-matched browser via `playwright install --with-deps
  chromium`) shares, `playwright.config.ts` reads an optional
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` env var and only overrides `launchOptions.executablePath`
  when it's set. Verified end-to-end in this sandbox via
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/opt/pw-browsers/chromium pnpm exec playwright test
  e2e/visual.spec.ts --update-snapshots` against the two fixture-independent unauthenticated
  routes (`/sign-up`, `/sign-in`) — real browser launch, real navigation, real screenshot
  capture, and the axe-core accessibility scan all passed cleanly (zero WCAG violations) before
  the generated snapshots were deleted again (committed baselines must come from CI's Linux
  runner, never this sandbox, per TESTING.md).
- Assumed an RLS-blocked cross-user `UPDATE` would raise an error; per Supabase's own security
  guidance (and confirmed while writing `supabase/tests/profiles_rls.test.sql`) it instead
  silently matches zero rows (`UPDATE` requires a `SELECT`-visible row first). Test for the row
  count via `GET DIAGNOSTICS ... = ROW_COUNT`, not `throws_ok`.
- **Phase 5 risk that turned out fine:** went in assuming MSW might not intercept network calls
  made by code running inside `@cloudflare/vitest-pool-workers`' workerd isolate (MSW patches
  Node's HTTP layer; workerd's `fetch` is a separate native implementation with no defined
  relationship to it). Rather than find out the hard way, sidestepped it: every Worker function
  that calls `fetch` (directly, or via supabase-js's `global.fetch` option) takes an injected
  `fetchImpl` parameter defaulting to global `fetch`. Verified empirically — 64 worker tests,
  all passing, all in the real Workers runtime, zero new test dependencies. See the Cloudflare
  Workers stack rule above; reuse this pattern for Phases 6-9 instead of reaching for MSW.
- `app/vite.config.ts`'s `test.env` block (placeholder `VITE_*` vars so module-load-time
  `throw`s in `lib/*.ts` don't fire under Vitest) needs a new entry **every time a new
  `lib/*.ts` file adopts the same "throw if the env var is missing" pattern** — `lib/worker.ts`
  (Phase 5) needed `VITE_WORKER_URL` added alongside the existing Supabase ones, or
  `App.test.tsx` fails at import time despite not touching Shopify at all (`App.tsx` imports
  every page eagerly, including ones behind roles the test never assumes).
- **`ShopifyOrdersPage`'s missing platform filter (found during Phase 6, introduced in
  Phase 5):** the page queried `platform_orders` with no `.eq('platform', 'shopify')` —
  harmless with exactly one marketplace connected, since every row in the table was
  necessarily Shopify's. The moment Phase 6 added a second platform sharing the same
  table, this became a real cross-platform leak (a brand's TikTok orders would appear on
  their Shopify order list and vice versa). Fixed on both `ShopifyOrdersPage` and the new
  `TiktokOrdersPage`, with a test asserting the `.eq()` call. **The tell for this class of
  bug:** a query against a shared/polymorphic table that looks complete with N=1 of the
  discriminating value in play is unverified for N>1 — audit every existing query against
  `platform_orders` (or any future shared table) again the next time a new discriminant
  value actually starts being written, don't assume "it worked before" means "it's scoped
  correctly."
- **TikTok Shop's own API docs (`partner.tiktokshop.com`) returned HTTP 403** when fetched
  directly via `WebFetch` from this sandbox — a different failure mode than the Docker
  Hub/`supabase.co`/Google Fonts blocks elsewhere in this file (those are outright
  connection resets; this was a live HTTP response, likely bot/JS-challenge protection on
  TikTok's docs site rather than the sandbox's proxy policy specifically — unconfirmed
  either way). Worked around by cross-referencing multiple secondary sources (search
  results, third-party SDK READMEs) describing the same published signing
  algorithm/OAuth flow, and flagging every resulting implementation detail as an explicit
  ASSUMPTION in `worker/src/tiktok/client.ts` and `types.ts` rather than presenting
  secondary-source-derived code as verified. If a future session gets real doc access
  (different network policy, or a logged-in browser session), reconcile those ASSUMPTION
  comments against the first-party spec before any live TikTok credential is wired up —
  don't assume the unit tests passing means the wire format is correct, only that the
  code is internally consistent with itself.
- **Amazon's SP-API docs portal (`developer-docs.amazon.com`) also returned HTTP 403**
  when fetched directly via `WebFetch` from this sandbox, same failure mode as TikTok's
  docs site above. Unlike TikTok, though, a first-party fallback existed: Amazon
  publishes its API schemas as machine-readable JSON in the public
  `amzn/selling-partner-api-models` GitHub repo, and `raw.githubusercontent.com` was
  fetchable — so `worker/src/amazon/types.ts`'s field names (`AmazonOrderId`,
  `SellerSKU`, etc.) come from that first-party schema, not a secondary description.
  The LWA refresh-token flow and the Oct 2023 SigV4-deprecation changelog were each
  confirmed via multiple independent secondary sources (the changelog page itself also
  403'd). Net effect: Phase 7's Amazon integration rests on firmer evidence than Phase
  6's TikTok integration, but is still UNVERIFIED end-to-end against a live seller
  account — same posture, better grounding. If a docs-portal fetch ever works from a
  future session, reconcile the LWA/SigV4 claims against the first-party page before any
  live Amazon credential is wired up.
- **eBay's docs portal (`developer.ebay.com`) also returned HTTP 403** when fetched
  directly via `WebFetch` from this sandbox — same failure mode as TikTok's and
  Amazon's docs sites above. The fallback here was a third kind, distinct from both
  prior ones: `WebSearch`'s result synthesis quoted `developer.ebay.com`'s own page
  content directly (exact request/response field names, the RuName redirect-uri
  mechanic, the account-deletion challenge-hash algorithm) rather than either (a) a
  first-party machine-readable schema fetched from elsewhere (Amazon's GitHub-repo
  fallback) or (b) purely third-party paraphrase of the same spec (TikTok's posture).
  Treated this as firmer than TikTok's grounding but still short of an actual fetched
  page, so every eBay code path is flagged the same ASSUMPTION-grade way as TikTok's
  and Amazon's (`worker/src/ebay/client.ts`, `types.ts`) pending live verification. If
  a docs-portal fetch ever succeeds from a future session, reconcile the OAuth
  request/response shapes and the challenge-hash algorithm against the first-party
  page before any live eBay credential is wired up.
- **eBay requires a compliance endpoint no other platform in this repo needed**: the
  Marketplace Account Deletion notification subscription (see the Phase 8 write-up
  above). This is easy to miss because it isn't an order webhook and isn't optional —
  eBay's Developer Program can restrict API access for an app that stores eBay user
  data without a working, correctly-hashed challenge-response endpoint. The tell for
  next time: check a marketplace's compliance/GDPR-notification requirements
  separately from its order-sync webhook requirements — the two are easy to conflate
  but are answered by completely different parts of a platform's docs.
- **Walmart's docs portal (`developer.walmart.com`) also returned HTTP 403** when
  fetched directly via `WebFetch` from this sandbox — same failure mode as every
  other marketplace platform's docs site above. Same fallback class as Phase 8's
  eBay integration: `WebSearch`'s result synthesis quoted `developer.walmart.com`'s
  own page content directly (the token endpoint, the client-credentials grant
  shape, the required `WM_*` headers, the 15-minute token lifetime, the orders
  response's nested shape) rather than third-party paraphrase. Flagged the same
  ASSUMPTION-grade way in `worker/src/walmart/client.ts`/`types.ts`, pending live
  verification against a real Walmart seller account.
- **Walmart's auth model doesn't fit either existing template** — worth noting
  explicitly since by Phase 9, two templates (OAuth-redirect from Shopify/TikTok/
  eBay, refresh-token self-authorization from Amazon) already existed and it would
  have been easy to force-fit Walmart into the closer-looking one (Amazon's, since
  neither has a browser redirect). It doesn't: Walmart's client-credentials grant
  has no refresh_token concept at all — client_id/client_secret themselves are
  reused on every access-token mint, not exchanged once for a longer-lived
  refresh_token the way Amazon's flow works. The tell for next time: "no OAuth
  redirect" is not the same shape every time — check whether a durable long-lived
  token exists at all before assuming a template fits, don't just pattern-match on
  the absence of a browser redirect step.
- **Radix `Select` would have broken every `SelectField` test on adoption.** Went
  in planning to convert `SelectField` (`InventoryPage`, `SkuMappingsPage`) to
  Radix's `Select` primitive as part of the shadcn/Radix rewrite of
  `components/ui/*`. Checked the existing tests first (`InventoryPage.test.tsx`)
  and found them driving it via `userEvent.selectOptions(screen.getByLabelText(...),
  'value')` — that API dispatches a native `<select>` change event and only works
  against a real `<select>` element; Radix's `Select` renders a custom trigger
  button + portaled listbox with no native `<select>` in the DOM at all, so every
  existing test would have needed rewriting to click-then-click-an-item instead.
  Kept `SelectField` as a styled native `<select>` (chevron icon via
  `lucide-react`, same focus-ring treatment as `TextField`) instead — real shadcn
  value (Radix `Select`) sacrificed for zero test churn and zero risk of subtly
  changing keyboard/screen-reader behavior pages already depended on. The tell for
  next time: before swapping a primitive's underlying implementation, grep its
  existing tests for how they interact with it — a component's *test-facing* API
  can be a hard constraint even when its *visual* API has room to change.
- **Adding `NavLink` to `DashboardShell` broke all 18 page-level component tests
  that render a page directly** (`ProductsPage.test.tsx` et al.) — `NavLink` calls
  `useLocation()` internally, which throws "may be used only in the context of a
  `<Router>`" outside one. Every one of those tests renders its page wrapped only
  in `<AuthContext.Provider>`, with no router, because `DashboardShell` previously
  had no router dependency at all (just a sign-out button). Fixed by wrapping each
  test's `renderWithAuth()` in `<MemoryRouter>`. The tell for next time: adding
  *any* `react-router` hook/component to a shared shell component is a foundation-
  level change that can break every page test that renders through it, even tests
  that have nothing to do with navigation — grep for the shell's usages before
  assuming a shell-only change is isolated to the shell.
- **Moving `pages/*.tsx` into `pages/{brand,provider,admin}/` broke every test
  that used `vi.mock('../lib/...')`, silently, not with a type error.**
  Bumping `import ... from '../lib/x'` to `'../../lib/x'` after a file moves
  one directory deeper is the obvious half of the fix; `vi.mock('../lib/x', ...)`
  calls are a separate string literal Vitest resolves independently of any
  `import` statement, so a sed pass targeting `from '../` left every
  `vi.mock('../lib/...')` pointing at a now-nonexistent path. The failure mode
  wasn't a red build — `tsc`/`oxlint` both passed, since `vi.mock`'s argument
  is just a string, not a typechecked import — it only surfaced at test run
  as `vi.mocked(supabase.from).mockReturnValueOnce is not a function`, because
  the real (unmocked) module loaded instead. The tell for next time: after
  moving any file with `vi.mock(<relative path>, ...)` calls, grep for
  `vi.mock\(.*\.\./` in the moved files specifically — it's invisible to both
  the type checker and the linter, only the test run catches it.
- **The page reorg above was actually two rounds, not one** — first into
  `pages/{brand,provider,admin}/` (nested one level under `pages/`), then
  promoted again to top-level `src/{brand,provider,admin}/` plus a new
  `src/products/` once it became clear "separate folders" meant top-level,
  not nested, and that product catalog management should be its own
  concern rather than folded into `brand/` even though only the brand role
  uses it today. Both rounds needed the exact same `vi.mock`-path fix from
  the entry above (moving one directory level changes import depth either
  way). **Current, settled structure:** `src/brand/`, `src/provider/`,
  `src/admin/`, `src/products/` for routed pages; `src/pages/` holds only
  the three role-agnostic pages (`SignInPage`/`SignUpPage`/`RoleRedirect`)
  that run before a role exists; `src/components/`, `src/hooks/`,
  `src/lib/`, `src/types/` stay shared across every role, not duplicated
  per folder. The tell for next time: when a reorg request uses a word
  like "separate" or "own folder," confirm the exact directory depth and
  scope intended before executing — a folder-structure change is cheap to
  redo once, expensive to redo twice.
- **This repo still has no supported way to create an admin account** (discovered
  writing Phase 12's RLS tests). Self-service signup always forces the requested role
  down to `brand`/`provider` (Phase 1's `handle_new_user`), and `prevent_role_change`
  blocks a plain `UPDATE` on `profiles.role` unconditionally — admin included, no
  bypass. The only way this session found to seed an admin fixture was disabling
  `profiles_role_immutable` for one `UPDATE` inside a test transaction. That's fine
  for a pgTAP test's own transaction (rolled back at the end either way), but it is
  **not** a real provisioning path — nothing in this repo lets an actual operator turn
  a real signed-up user into an admin today. Revisit before Phase 12's admin panel is
  used with real accounts; candidates: a one-off `SECURITY DEFINER` RPC callable only
  via the Supabase dashboard's SQL editor (service-role context), or a documented
  direct-SQL runbook step.
- **Adding a new required (`not null`) column to an existing, widely-fixture'd table
  is a foundation-level change, not a one-file edit** — adding `profiles.is_active`
  (Phase 12) broke 22 `Profile`-typed object literals across 18 test files that
  predated the column, since an accurate `Database['public']['Tables']['profiles']['Row']`
  type has to require a `not null default true` field (marking it optional in `Row`
  would misrepresent the schema — only `Insert`/`Update` get the `?`). The tell for
  next time: after adding a required column to any table with existing fixtures, run
  `tsc --noEmit` immediately and expect a real fan-out, not zero errors — don't assume
  "it's just a migration" stays contained to the migration. `grep -rn "company_name:"`
  (or the equivalent unique-enough field for another table) finds every literal fast.
- **`app/src/types/database.ts` had silently drifted out of sync with a merged
  migration** (discovered doing Phase 12 recon): Phase 10's `sync_logs` table landed
  in `supabase/migrations/` from a different session, but that session never touched
  this hand-authored types file, so `sync_logs` had no TypeScript type at all until
  Phase 12 added one. Since this file can't be regenerated from a live DB in this
  sandbox (see the network-limitation landmine below), it only stays accurate through
  manual discipline — the tell for next time: when starting recon on a phase, diff
  `supabase/migrations/` against this file's own header comment (which lists every
  migration it claims to reflect) rather than assuming it's current.
- **Root-level `.ts` files run as ESM (`package.json`'s `"type": "module"`), so
  `__dirname`/`__filename` don't exist** — `playwright.config.ts` and every `e2e/*.ts` file
  hit `ReferenceError: __dirname is not defined` the first time this repo had TypeScript
  files living at the repo root instead of inside `app/`/`worker/` (Vite/Vitest's own
  config already avoided this problem, since neither ever used `__dirname`). Fixed with
  `path.dirname(fileURLToPath(import.meta.url))` everywhere a directory-relative path was
  needed. Caught by `pnpm exec playwright test --list`, which parses every spec file
  without needing a live browser or dev server — the tell for next time: run `--list`
  as a free, zero-infrastructure sanity check on any new root-level `.ts`/`.mts` file
  before assuming Node's classic CJS globals are available.
- **`test.skip(condition, reason)` called inside a Playwright test body is too late to
  prevent that test's own fixtures from being created** — `e2e/smoke.spec.ts`'s original
  shape called `test.skip(!hasFixtures, ...)` as the first line inside `test('...', async
  ({ browser }) => { ... })`, but Playwright resolves every fixture a test declares
  (`browser` here) *before* invoking the test callback body at all, so the skip check
  never got a chance to run before the browser launch attempt — which then failed for an
  unrelated reason (this sandbox's Playwright browser-version mismatch, see the
  `scripts/eyes.mjs` entry above) and looked like a real bug rather than a skip-timing
  bug. `e2e/visual.spec.ts`'s brand/provider/admin route groups got this right from the
  start by calling `test.skip()` at the `test.describe()` level (which Playwright *does*
  evaluate before creating any fixtures for tests inside that block) — `smoke.spec.ts`
  was fixed to wrap its single test in the same describe-level pattern. The tell for next
  time: any conditional skip that depends on external state (a missing fixture file, a
  missing env var) belongs at the `describe`/suite level, never inside a test callback
  that declares fixtures needing real setup (`browser`, `page`, `context`).
- **This repo's RLS/pgTAP tests had never executed against a live Postgres before Phase
  13** — every prior phase's own CLAUDE.md write-up says "written, not yet executed"
  and meant it literally; this sandbox has no Docker (see the network-limitation
  landmine below), so nothing before this phase could actually run `supabase test db`.
  One of the two real bugs the Phase 13 RLS audit found (`warehouses_rls.test.sql`
  declaring `plan(20)` for 19 real assertions) would have failed on the very first
  execution, silently sitting undetected for nine phases. The tell for next time: a
  `grep -c` audit of `select plan(N)` vs. actual `select (is|throws_like|lives_ok)(`
  call counts across every `supabase/tests/*.sql` file takes seconds and catches this
  whole class of bug without needing a live database at all — worth running any time
  a new RLS test file is added, not just during a dedicated hardening phase.

## Overrides

- **No Next.js**, despite it being common for this stack combination. This app is entirely
  auth-gated dashboards (brand/provider/admin) with no public/SEO surface — Next.js's main
  value (SSR, ISR, SEO) buys nothing here, and running it on Cloudflare needs the Workers
  adapter and its edge-runtime restrictions for no benefit. Instead: a plain Vite SPA
  (`app/`) deployed as static assets, with **all** privileged/server-side logic in a Cloudflare
  Worker (`worker/`). If a public marketing page is ever needed, build it as a small separate
  static/Astro page rather than pulling the whole app into a meta-framework.
- `app/` uses `oxlint` (shipped by the `create-vite` template) instead of ESLint. Not yet
  reconsidered; revisit if oxlint's rule coverage proves insufficient.
- Playwright (`@playwright/test`, root devDependency) is installed for `scripts/eyes.mjs` as of
  the first real pages (sign-up/sign-in), but `e2e/visual.spec.example.ts` is still a template,
  not a running spec — wire up real `@smoke` e2e once there's a journey worth automating
  end-to-end (not just eyeballing).
