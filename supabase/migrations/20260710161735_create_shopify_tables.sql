-- Phase 5: Shopify marketplace integration.
--
-- shopify_tokens holds one OAuth access token per brand's connected Shopify
-- store. It is written only by the Worker using the service-role key (the
-- OAuth callback and disconnect flow never run as an authenticated Supabase
-- user) — RLS is enabled with *zero* policies, so authenticated/anon get no
-- access at all, and service_role bypasses RLS entirely per Supabase
-- convention. This is "locked down as defense-in-depth" per ROADMAP.md, not
-- an oversight: nothing here is meant to ever be readable through the
-- Data API.
--
-- platform_orders is the unified order table order-sync writes into,
-- populated the same Worker-only way (manual sync endpoint + webhook
-- receiver, both service-role). brand_id is a plain FK here, not
-- trigger-derived like sku_mappings/booking_requests, because the row is
-- never inserted by an authenticated client in the first place — the
-- service-role key bypasses RLS, so there's no client-supplied brand_id to
-- protect against. Brand sees its own orders; a provider sees a brand's
-- orders only through an approved booking_requests row connecting them —
-- same predicate as inventory_select_via_approved_booking (see
-- 20260710133106_create_inventory.sql), since an order isn't tied to a
-- specific warehouse/storage_space the way inventory is.
--
-- resolved_master_sku / status reflect only Phase 4's SKU-resolution
-- outcome (has this order's line item(s) been matched to a product via
-- sku_mappings?), not fulfillment state — that's Phase 11's job.

create type public.platform_order_status as enum ('pending', 'resolved', 'unmapped');

create table public.shopify_tokens (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  shop_domain text not null,
  access_token text not null,
  scope text not null,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  constraint shopify_tokens_brand_id_key unique (brand_id)
);

alter table public.shopify_tokens enable row level security;
-- No policies: service-role only. See header comment.

create table public.platform_orders (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  platform public.marketplace_platform not null,
  platform_order_id text not null,
  raw_data jsonb not null,
  resolved_master_sku text,
  status public.platform_order_status not null default 'pending',
  created_at timestamptz not null default now(),
  constraint platform_orders_platform_order_id_key unique (platform, platform_order_id)
);

create index platform_orders_brand_id_idx on public.platform_orders (brand_id);

alter table public.platform_orders enable row level security;

create policy "platform_orders_select_own"
on public.platform_orders
for select
to authenticated
using ( (select auth.uid()) = brand_id );

create policy "platform_orders_select_via_approved_booking"
on public.platform_orders
for select
to authenticated
using (
  exists (
    select 1
    from public.booking_requests br
    where br.brand_id = platform_orders.brand_id
      and br.provider_id = (select auth.uid())
      and br.status = 'approved'
  )
);

-- No insert/update/delete policy: only the Worker (service-role) writes
-- these rows, same rationale as shopify_tokens above.
