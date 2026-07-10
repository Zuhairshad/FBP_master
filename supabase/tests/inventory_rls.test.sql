-- RLS policy tests for public.inventory, plus the products_select_via_
-- approved_booking policy it motivated. Per TESTING.md: anon (no access),
-- owner (full access to own rows via product ownership), other tenant (no
-- access). Also exercises the roadmap's "integration test: approve flow
-- actually flips inventory visibility" requirement directly: the same
-- provider/product pair is checked for visibility both before and after the
-- booking_requests row backing it is approved. Run with: supabase test db

begin;
select plan(12);

create function pg_temp.try_update_inventory_quantity(target_id uuid, new_quantity int)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.inventory set quantity = new_quantity where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: provider A (warehouse + storage space), provider B (uninvolved,
-- no relationship to brand X at all), brand X (owns product P1), brand Y
-- (owns product P2, used only for the cross-tenant insert negative case).
-- The booking between brand X and provider A starts 'pending' — inventory
-- visibility for provider A is asserted both before and after it flips to
-- 'approved'.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '55555555-5555-5555-5555-555555555555',
  'provider-a@example.com',
  '{"role": "provider", "display_name": "Provider A"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '66666666-6666-6666-6666-666666666666',
  'provider-b@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '77777777-7777-7777-7777-777777777777',
  'brand-x@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '88888888-8888-8888-8888-888888888888',
  'brand-y@example.com',
  '{"role": "brand", "display_name": "Brand Y"}'::jsonb
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  '55555555-0000-0000-0000-000000000001',
  '55555555-5555-5555-5555-555555555555',
  'Warehouse A',
  '1 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  '55555555-2222-0000-0000-000000000001',
  '55555555-0000-0000-0000-000000000001',
  'Pallet Rack A',
  'pallet',
  50
);

insert into public.products (id, brand_id, master_sku, name)
values (
  '77777777-0000-0000-0000-000000000001',
  '77777777-7777-7777-7777-777777777777',
  'SKU-X-001',
  'Widget X'
);

insert into public.products (id, brand_id, master_sku, name)
values (
  '88888888-0000-0000-0000-000000000001',
  '88888888-8888-8888-8888-888888888888',
  'SKU-Y-001',
  'Widget Y'
);

insert into public.booking_requests (id, brand_id, storage_space_id)
values (
  '99999999-1111-0000-0000-000000000001',
  '77777777-7777-7777-7777-777777777777',
  '55555555-2222-0000-0000-000000000001'
);

-- anon ------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.inventory)::int,
  0,
  'anon has zero visibility into inventory'
);

reset role;

-- brand X (owner via product) ----------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"77777777-7777-7777-7777-777777777777","role":"authenticated"}';

insert into public.inventory (id, product_id, warehouse_id, quantity)
values (
  '77777777-9999-0000-0000-000000000001',
  '77777777-0000-0000-0000-000000000001',
  '55555555-0000-0000-0000-000000000001',
  40
);

select is(
  (select count(*) from public.inventory)::int,
  1,
  'brand X sees exactly one inventory row (their own product''s)'
);

select throws_like(
  $$ insert into public.inventory (product_id, warehouse_id, quantity)
     values ('88888888-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 5) $$,
  '%row-level security policy%',
  'brand X cannot create inventory for brand Y''s product'
);

select throws_like(
  $$ insert into public.inventory (product_id, warehouse_id, quantity)
     values ('77777777-0000-0000-0000-000000000001', '55555555-0000-0000-0000-000000000001', 99) $$,
  '%duplicate key value violates unique constraint%',
  'brand X cannot set a second inventory row for the same product+warehouse pair'
);

select is(
  pg_temp.try_update_inventory_quantity('77777777-9999-0000-0000-000000000001', 45),
  1,
  'brand X can update the quantity on their own inventory row'
);

reset role;

-- provider B (uninvolved — no booking with brand X at all) -----------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*) from public.inventory)::int,
  0,
  'provider B (no relationship to brand X) sees zero inventory rows'
);

reset role;

-- provider A, booking still pending: inventory not yet visible -------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*) from public.inventory where product_id = '77777777-0000-0000-0000-000000000001')::int,
  0,
  'provider A cannot see brand X''s inventory while the booking is still pending'
);

select is(
  (select count(*) from public.products where id = '77777777-0000-0000-0000-000000000001')::int,
  0,
  'provider A cannot see brand X''s product while the booking is still pending'
);

reset role;

-- approve the booking (bypasses RLS here deliberately — the approval flow's
-- own RLS is covered by booking_requests_rls.test.sql; this test only needs
-- the resulting state change).
update public.booking_requests set status = 'approved'
where id = '99999999-1111-0000-0000-000000000001';

-- provider A, booking now approved: inventory becomes visible ---------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*) from public.inventory where product_id = '77777777-0000-0000-0000-000000000001')::int,
  1,
  'approving the booking flips inventory visibility on for provider A'
);

select is(
  (select count(*) from public.products where id = '77777777-0000-0000-0000-000000000001')::int,
  1,
  'approving the booking also makes the underlying product row resolvable for provider A'
);

select is(
  (select quantity from public.inventory where product_id = '77777777-0000-0000-0000-000000000001'),
  45,
  'provider A reads the correct, up-to-date quantity once visible'
);

reset role;

-- provider B remains uninvolved even after the A<->X approval ---------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"66666666-6666-6666-6666-666666666666","role":"authenticated"}';

select is(
  (select count(*) from public.inventory)::int,
  0,
  'provider B still sees zero inventory rows — the approval was between brand X and provider A, not B'
);

reset role;

select * from finish();
rollback;
