-- Phase 6: TikTok Shop marketplace integration.
--
-- tiktok_tokens mirrors shopify_tokens' shape and rationale exactly (see
-- 20260710161735_create_shopify_tables.sql's header comment): one row per
-- brand's connected TikTok Shop, written only by the Worker's service-role
-- key (OAuth callback + sync + webhook handlers never run as an
-- authenticated Supabase user), RLS enabled with *zero* policies as
-- defense-in-depth. access_token/refresh_token should never be readable
-- through the Data API, by anyone but service_role.
--
-- shop_id is TikTok Shop's identifier for the seller's connected shop
-- (resolved via a follow-up "authorized shops" call after token exchange,
-- since TikTok's OAuth callback itself doesn't return it — see
-- worker/src/tiktok/client.ts). refresh_token is stored because TikTok
-- access tokens expire (unlike Shopify's, which don't) and must be renewed
-- without another OAuth round-trip.
--
-- platform_orders needs no schema change: its `platform` column already
-- accepts 'tiktok' (see marketplace_platform, 20260710135941_create_sku_mappings.sql)
-- and its existing RLS policies are platform-agnostic.

create table public.tiktok_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  shop_id text not null,
  access_token text not null,
  refresh_token text not null,
  access_token_expires_at timestamptz not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint tiktok_tokens_brand_id_key unique (brand_id)
);

alter table public.tiktok_tokens enable row level security;
-- No policies: service-role only. See header comment.
