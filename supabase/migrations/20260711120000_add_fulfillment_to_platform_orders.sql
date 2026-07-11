-- Phase 11: Provider Fulfillment Dashboard.
--
-- platform_orders already carries `status` (Phase 4/5's SKU-resolution
-- outcome: pending/resolved/unmapped) — fulfillment is a separate concern
-- layered on top via new columns, not a repurposing of that column (its own
-- header comment in 20260710161735_create_shopify_tables.sql already flagged
-- this as "that's Phase 11's job").
--
-- fulfillment_status: the provider-driven pick/pack/ship/deliver lifecycle.
-- tracking_number: free-text, set once a provider ships.
--
-- Mutation is scoped to exactly the same predicate as the existing
-- `platform_orders_select_via_approved_booking` policy — a provider with an
-- approved booking connecting them to the order's brand. This is
-- deliberately not a new per-order "assigned provider" column: nothing in
-- this repo's data model designates one specific provider as "the"
-- fulfilling provider for an order (a brand's approved bookings can span
-- multiple providers/warehouses), so "the fulfilling provider" is read as
-- "a provider who can already see this order" — the same set the SELECT
-- policy already grants, not a new assignment concept (ASSUMPTION — no
-- "claim an order" UI is asked for anywhere in ROADMAP.md for this phase).
--
-- A protect-trigger (same shape as protect_booking_request_updates from
-- Phase 3) blocks changing anything except fulfillment_status/
-- tracking_number via that update policy — otherwise a provider permitted to
-- update the row at all could also rewrite brand_id/raw_data/
-- resolved_master_sku/status, none of which fulfillment work should touch.
-- Brand gets no update policy at all — read-only, per ROADMAP's "Brand UI:
-- read-only status/tracking view."

create type public.order_fulfillment_status as enum ('pending', 'processing', 'shipped', 'delivered');

alter table public.platform_orders
  add column fulfillment_status public.order_fulfillment_status not null default 'pending',
  add column tracking_number text,
  add column updated_at timestamptz not null default now();

create policy "platform_orders_update_fulfillment"
on public.platform_orders
for update
to authenticated
using (
  exists (
    select 1
    from public.booking_requests br
    where br.brand_id = platform_orders.brand_id
      and br.provider_id = (select auth.uid())
      and br.status = 'approved'
  )
)
with check (
  exists (
    select 1
    from public.booking_requests br
    where br.brand_id = platform_orders.brand_id
      and br.provider_id = (select auth.uid())
      and br.status = 'approved'
  )
);

create function public.protect_platform_order_fulfillment_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.brand_id <> old.brand_id
     or new.platform <> old.platform
     or new.platform_order_id <> old.platform_order_id
     or new.raw_data is distinct from old.raw_data
     or new.resolved_master_sku is distinct from old.resolved_master_sku
     or new.status <> old.status
     or new.created_at <> old.created_at then
    raise exception 'only fulfillment_status and tracking_number can be changed on an existing order';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger platform_orders_protect_fulfillment_updates
  before update on public.platform_orders
  for each row execute function public.protect_platform_order_fulfillment_updates();
