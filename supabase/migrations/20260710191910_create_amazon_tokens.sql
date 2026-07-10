-- Phase 7: Amazon SP-API marketplace integration.
--
-- amazon_tokens mirrors shopify_tokens/tiktok_tokens' shape and rationale
-- (see 20260710161735_create_shopify_tables.sql / 20260710172204_create_tiktok_tokens.sql
-- header comments): one row per brand's connected Amazon seller account,
-- written only by the Worker's service-role key, RLS enabled with *zero*
-- policies as defense-in-depth.
--
-- Unlike Shopify/TikTok, there is no OAuth install/callback flow behind
-- this table: Amazon's SP-API for a private/internal app uses
-- "self-authorization" — the seller generates a long-lived refresh token
-- directly in Seller Central and hands it to the brand, who submits it
-- through our own form (see worker/src/amazon/handlers.ts's handleConnect).
-- refresh_token is therefore brand-submitted rather than Worker-obtained,
-- but still written only via the service-role key (the frontend never
-- talks to this table directly, same as every other *_tokens table) and
-- still never readable back out through the Data API.
--
-- marketplace_id is required because every SP-API order/order-item call is
-- scoped to one or more Amazon marketplaces (e.g. "ATVPDKIKX0DER" for the US)
-- — single-marketplace-per-brand for now, matching Shopify/TikTok's
-- single-store-per-brand scope (revisit if a brand selling in multiple
-- Amazon marketplaces turns out to matter).
--
-- access_token/access_token_expires_at cache the short-lived (1 hour) LWA
-- access token minted from refresh_token, so sync doesn't re-mint one on
-- every call.
--
-- platform_orders needs no schema change: its `platform` column already
-- accepts 'amazon' (see marketplace_platform, 20260710135941_create_sku_mappings.sql).

create table public.amazon_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  marketplace_id text not null,
  refresh_token text not null,
  access_token text,
  access_token_expires_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint amazon_tokens_brand_id_key unique (brand_id)
);

alter table public.amazon_tokens enable row level security;
-- No policies: service-role only. See header comment.
