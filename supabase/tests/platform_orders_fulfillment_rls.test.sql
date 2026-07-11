-- RLS policy tests for Phase 11's fulfillment-mutation policy on
-- public.platform_orders. platform_orders_rls.test.sql already covers the
-- pre-existing select-only policies (anon/owner/other-tenant/approved-
-- booking-provider) and proves no authenticated client can insert directly;
-- this suite covers only what Phase 11 added: the UPDATE policy scoped to
-- an approved-booking provider, the brand's continued lack of any update
-- policy, and the protect-trigger guarding every non-fulfillment column.
-- Run with: supabase test db

begin;
select plan(8);

create function pg_temp.try_update_fulfillment(
  target_id uuid,
  new_status public.order_fulfillment_status,
  new_tracking text
) returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.platform_orders
  set fulfillment_status = new_status, tracking_number = new_tracking
  where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: provider A (approved booking with brand X), provider B
-- (uninvolved — no booking with brand X at all), brand X owns the order.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-bbbb-bbbb-bbbb-111111111111',
  'provider-a-fulfillment@example.com',
  '{"role": "provider", "display_name": "Provider A"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '22222222-bbbb-bbbb-bbbb-222222222222',
  'provider-b-fulfillment@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '33333333-bbbb-bbbb-bbbb-333333333333',
  'brand-x-fulfillment@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  '11111111-0000-0000-0000-000000000002',
  '11111111-bbbb-bbbb-bbbb-111111111111',
  'Warehouse A',
  '1 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  '11111111-2222-0000-0000-000000000003',
  '11111111-0000-0000-0000-000000000002',
  'Pallet Rack A',
  'pallet',
  50
);

insert into public.booking_requests (id, brand_id, storage_space_id, status)
values (
  '99999999-3333-0000-0000-000000000002',
  '33333333-bbbb-bbbb-bbbb-333333333333',
  '11111111-2222-0000-0000-000000000003',
  'approved'
);

-- Written as the test-runner role (bypasses RLS) — mirrors the Worker's
-- service-role key, same as platform_orders_rls.test.sql's fixtures.
insert into public.platform_orders (id, brand_id, platform, platform_order_id, raw_data, resolved_master_sku, status)
values (
  'cccccccc-1111-0000-0000-000000000001',
  '33333333-bbbb-bbbb-bbbb-333333333333',
  'shopify',
  'shopify-order-3001',
  '{"id": 3001}'::jsonb,
  'SKU-X-001',
  'resolved'
);

-- brand X (owner) — no update policy exists for brand at all -----------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-bbbb-bbbb-bbbb-333333333333","role":"authenticated"}';

select is(
  pg_temp.try_update_fulfillment('cccccccc-1111-0000-0000-000000000001', 'shipped', 'TRACK-1'),
  0,
  'brand X (owner) cannot update fulfillment_status/tracking_number — no update policy for brand'
);

reset role;

-- provider B (uninvolved — no booking with brand X) --------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-bbbb-bbbb-bbbb-222222222222","role":"authenticated"}';

select is(
  pg_temp.try_update_fulfillment('cccccccc-1111-0000-0000-000000000001', 'shipped', 'TRACK-1'),
  0,
  'provider B (no approved booking with brand X) cannot mutate brand X''s order'
);

reset role;

-- provider A (approved booking with brand X) ---------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-bbbb-bbbb-bbbb-111111111111","role":"authenticated"}';

select is(
  pg_temp.try_update_fulfillment('cccccccc-1111-0000-0000-000000000001', 'processing', null),
  1,
  'provider A can update fulfillment_status via the approved-booking predicate'
);

select is(
  (select fulfillment_status from public.platform_orders where id = 'cccccccc-1111-0000-0000-000000000001'),
  'processing'::public.order_fulfillment_status,
  'the fulfillment_status change was actually persisted'
);

select is(
  pg_temp.try_update_fulfillment('cccccccc-1111-0000-0000-000000000001', 'shipped', 'TRACK-12345'),
  1,
  'provider A can set a tracking number when marking an order shipped'
);

select is(
  (select tracking_number from public.platform_orders where id = 'cccccccc-1111-0000-0000-000000000001'),
  'TRACK-12345',
  'the tracking number change was actually persisted'
);

select throws_like(
  $$ update public.platform_orders
     set status = 'unmapped'
     where id = 'cccccccc-1111-0000-0000-000000000001' $$,
  '%only fulfillment_status and tracking_number%',
  'provider A cannot use the fulfillment update policy to also rewrite the SKU-resolution status'
);

select throws_like(
  $$ update public.platform_orders
     set brand_id = '22222222-bbbb-bbbb-bbbb-222222222222'
     where id = 'cccccccc-1111-0000-0000-000000000001' $$,
  '%only fulfillment_status and tracking_number%',
  'provider A cannot reassign the order to a different brand via the fulfillment update policy'
);

reset role;

select * from finish();
rollback;
