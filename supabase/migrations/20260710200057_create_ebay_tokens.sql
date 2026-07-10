-- Phase 8: eBay marketplace integration.
--
-- ebay_tokens mirrors shopify_tokens/tiktok_tokens/amazon_tokens' shape and
-- rationale (see those migrations' header comments): one row per brand's
-- connected eBay seller account, written only by the Worker's service-role
-- key, RLS enabled with *zero* policies as defense-in-depth.
--
-- eBay's OAuth model is the authorization-code-grant redirect flow (same
-- shape as Shopify/TikTok, not Amazon's self-authorization) — see
-- worker/src/ebay/client.ts. access_token is short-lived (2 hours);
-- refresh_token is long-lived (eBay documents ~18 months) and is what gets
-- used to mint a fresh access_token without another OAuth round-trip, same
-- caching pattern as amazon_tokens' access_token/access_token_expires_at
-- pair (see worker/src/ebay/sync.ts's ensureAccessToken).
--
-- One eBay-specific quirk: eBay's OAuth authorize URL takes a `redirect_uri`
-- parameter, but eBay requires it to be a "RuName" — a redirect-URL-name
-- eBay assigns per registered app, not a literal callback URL — so unlike
-- Shopify's WORKER_URL-based redirect_uri, this Worker never constructs one;
-- see worker/src/ebay/env.ts's EBAY_RU_NAME.
--
-- platform_orders needs no schema change: its `platform` column already
-- accepts 'ebay' (see marketplace_platform, 20260710135941_create_sku_mappings.sql).

create table public.ebay_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  refresh_token text not null,
  refresh_token_expires_at timestamptz not null,
  access_token text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ebay_tokens_brand_id_key unique (brand_id)
);

alter table public.ebay_tokens enable row level security;
-- No policies: service-role only. See header comment.
