-- RLS policy tests for public.platform_orders. Per TESTING.md: anon (no
-- access), owner (full access to own rows), other tenant (no access) — plus
-- the approved-booking provider-visibility predicate, same shape as
-- inventory_rls.test.sql. Unlike inventory, there is no insert/update/delete
-- policy at all here (only the Worker's service-role key writes these rows),
-- so this suite also proves an authenticated brand cannot insert one
-- directly. Run with: supabase test db

begin;
select plan(8);

-- Fixtures: provider A (approved booking with brand X), provider B
-- (uninvolved), brand X (owns an order), brand Y (owns a separate order,
-- used for the cross-tenant negative case).
insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-aaaa-aaaa-aaaa-111111111111',
  'provider-a-orders@example.com',
  '{"role": "provider", "display_name": "Provider A"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '22222222-aaaa-aaaa-aaaa-222222222222',
  'provider-b-orders@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '33333333-aaaa-aaaa-aaaa-333333333333',
  'brand-x-orders@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '44444444-aaaa-aaaa-aaaa-444444444444',
  'brand-y-orders@example.com',
  '{"role": "brand", "display_name": "Brand Y"}'::jsonb
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  '11111111-0000-0000-0000-000000000001',
  '11111111-aaaa-aaaa-aaaa-111111111111',
  'Warehouse A',
  '1 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  '11111111-2222-0000-0000-000000000001',
  '11111111-0000-0000-0000-000000000001',
  'Pallet Rack A',
  'pallet',
  50
);

insert into public.booking_requests (id, brand_id, storage_space_id, status)
values (
  '99999999-3333-0000-0000-000000000001',
  '33333333-aaaa-aaaa-aaaa-333333333333',
  '11111111-2222-0000-0000-000000000001',
  'approved'
);

-- Written as the test-runner role (bypasses RLS) — mirrors how the Worker's
-- service-role key writes these rows in production; no authenticated client
-- ever inserts a platform_orders row.
insert into public.platform_orders (id, brand_id, platform, platform_order_id, raw_data, resolved_master_sku, status)
values (
  'bbbbbbbb-1111-0000-0000-000000000001',
  '33333333-aaaa-aaaa-aaaa-333333333333',
  'shopify',
  'shopify-order-1001',
  '{"id": 1001}'::jsonb,
  'SKU-X-001',
  'resolved'
);

insert into public.platform_orders (id, brand_id, platform, platform_order_id, raw_data, status)
values (
  'bbbbbbbb-2222-0000-0000-000000000001',
  '44444444-aaaa-aaaa-aaaa-444444444444',
  'shopify',
  'shopify-order-2001',
  '{"id": 2001}'::jsonb,
  'unmapped'
);

-- anon --------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.platform_orders)::int,
  0,
  'anon has zero visibility into platform_orders'
);

reset role;

-- brand X (owner) -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-aaaa-aaaa-aaaa-333333333333","role":"authenticated"}';

select is(
  (select count(*) from public.platform_orders)::int,
  1,
  'brand X sees exactly one order (their own)'
);

select throws_like(
  $$ insert into public.platform_orders (brand_id, platform, platform_order_id, raw_data)
     values ('33333333-aaaa-aaaa-aaaa-333333333333', 'shopify', 'shopify-order-9999', '{}'::jsonb) $$,
  '%row-level security policy%',
  'an authenticated brand cannot insert a platform_orders row directly — only the Worker''s service-role key does'
);

reset role;

-- brand Y (other tenant) -----------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-aaaa-aaaa-aaaa-444444444444","role":"authenticated"}';

select is(
  (select count(*) from public.platform_orders where id = 'bbbbbbbb-1111-0000-0000-000000000001')::int,
  0,
  'brand Y cannot see brand X''s order'
);

reset role;

-- provider B (uninvolved — no booking with brand X at all) -----------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-aaaa-aaaa-aaaa-222222222222","role":"authenticated"}';

select is(
  (select count(*) from public.platform_orders)::int,
  0,
  'provider B (no relationship to brand X) sees zero orders'
);

reset role;

-- provider A (approved booking with brand X) --------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-aaaa-aaaa-aaaa-111111111111","role":"authenticated"}';

select is(
  (select count(*) from public.platform_orders where id = 'bbbbbbbb-1111-0000-0000-000000000001')::int,
  1,
  'provider A sees brand X''s order via the approved booking'
);

select is(
  (select resolved_master_sku from public.platform_orders where id = 'bbbbbbbb-1111-0000-0000-000000000001'),
  'SKU-X-001',
  'provider A reads the resolved master SKU on the visible order'
);

select is(
  (select count(*) from public.platform_orders where id = 'bbbbbbbb-2222-0000-0000-000000000001')::int,
  0,
  'provider A still cannot see brand Y''s order — no booking connects them'
);

reset role;

select * from finish();
rollback;
