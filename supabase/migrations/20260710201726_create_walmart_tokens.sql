-- Phase 9: Walmart marketplace integration.
--
-- walmart_tokens mirrors shopify_tokens/tiktok_tokens/amazon_tokens/ebay_tokens'
-- shape and rationale (see those migrations' header comments): one row per
-- brand's connected Walmart seller account, written only by the Worker's
-- service-role key, RLS enabled with *zero* policies as defense-in-depth.
--
-- Walmart's Marketplace API auth model is a third distinct shape, different
-- from both prior patterns: it's an OAuth **client-credentials** grant (no
-- browser redirect, like Amazon's self-authorization; unlike Shopify/TikTok/
-- eBay's authorization-code-grant redirect flow) — but unlike Amazon, there
-- is no long-lived refresh_token at all. A Walmart seller generates their
-- own per-account Client ID + Client Secret directly in Walmart Seller
-- Center (self-authorization, same trust model as Amazon's brand-submitted
-- refresh_token) and hands both to the brand, who submits them through our
-- own form (see worker/src/walmart/handlers.ts's handleConnect). Every sync
-- mints a fresh access_token directly from client_id+client_secret via the
-- client-credentials grant — client_id/client_secret themselves are the
-- durable credential, filling the role amazon_tokens.refresh_token and
-- ebay_tokens.refresh_token each play for their platforms.
--
-- access_token/access_token_expires_at cache the short-lived (15 minutes —
-- shorter than every other platform's token here) access token, so sync
-- doesn't re-mint one on every call.
--
-- platform_orders needs no schema change: its `platform` column already
-- accepts 'walmart' (see marketplace_platform, 20260710135941_create_sku_mappings.sql).

create table public.walmart_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  client_id text not null,
  client_secret text not null,
  access_token text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint walmart_tokens_brand_id_key unique (brand_id)
);

alter table public.walmart_tokens enable row level security;
-- No policies: service-role only. See header comment.
