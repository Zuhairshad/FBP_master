-- RLS policy tests for public.warehouses, public.warehouse_services, and
-- public.storage_spaces. Three principals per TESTING.md: anon (no access),
-- owner (full access to own rows), other provider (no access to their rows).
-- Also covers the role-check defense-in-depth added in the warehouses/
-- products migrations (a non-provider account cannot create a warehouse row
-- even under its own id). Run with: supabase test db

begin;
select plan(20);

-- Silent-zero-row helpers — RLS-blocked UPDATE/DELETE match 0 rows rather
-- than raising (same reasoning as profiles_rls.test.sql's helper: UPDATE and
-- DELETE both require the row to be USING-visible first).
create function pg_temp.try_update_warehouse_name(target_id uuid, new_name text)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.warehouses set name = new_name where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_delete_warehouse(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  delete from public.warehouses where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: two providers, one brand (profiles populated via the Phase 1
-- handle_new_user trigger), one warehouse per provider plus a service and a
-- storage space under provider A's warehouse.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'provider-a@example.com',
  '{"role": "provider", "display_name": "Provider A"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'provider-b@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'cccccccc-cccc-cccc-cccc-cccccccccccc',
  'brand-x@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  'Warehouse A',
  '1 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
  'Warehouse B',
  '2 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.warehouse_services (id, warehouse_id, name)
values (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Pick & Pack'
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  'aaaaaaaa-2222-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Pallet Rack A',
  'pallet',
  50
);

-- warehouses: anon --------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.warehouses)::int,
  0,
  'anon has zero visibility into warehouses'
);

reset role;

-- warehouses: provider A (owner) -------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*) from public.warehouses)::int,
  1,
  'provider A sees exactly one warehouse (their own)'
);

select is(
  (select count(*) from public.warehouses where id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  0,
  'provider A cannot see provider B''s warehouse'
);

select lives_ok(
  $$ insert into public.warehouses (provider_id, name, address_line1, city, postal_code, country)
     values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Warehouse A2', '3 Dock Rd', 'Columbus', '43215', 'US') $$,
  'provider A can insert a second warehouse under their own id'
);

select throws_like(
  $$ insert into public.warehouses (provider_id, name, address_line1, city, postal_code, country)
     values ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Hijacked', '4 Dock Rd', 'Columbus', '43215', 'US') $$,
  '%row-level security policy%',
  'provider A cannot insert a warehouse under provider B''s id'
);

select is(
  pg_temp.try_update_warehouse_name('aaaaaaaa-0000-0000-0000-000000000001', 'Warehouse A Renamed'),
  1,
  'provider A can update their own warehouse'
);

select is(
  pg_temp.try_update_warehouse_name('bbbbbbbb-0000-0000-0000-000000000001', 'hijacked'),
  0,
  'provider A''s update against provider B''s warehouse silently matches zero rows under RLS'
);

select is(
  pg_temp.try_delete_warehouse('bbbbbbbb-0000-0000-0000-000000000001'),
  0,
  'provider A''s delete against provider B''s warehouse silently matches zero rows under RLS'
);

reset role;

-- warehouses: brand cannot create a warehouse ------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"cccccccc-cccc-cccc-cccc-cccccccccccc","role":"authenticated"}';

select throws_like(
  $$ insert into public.warehouses (provider_id, name, address_line1, city, postal_code, country)
     values ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Brand-owned?', '5 Dock Rd', 'Columbus', '43215', 'US') $$,
  '%row-level security policy%',
  'a brand account cannot create a warehouse even under its own id'
);

reset role;

-- warehouse_services: anon -------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.warehouse_services)::int,
  0,
  'anon has zero visibility into warehouse_services'
);

reset role;

-- warehouse_services: provider A (owner via parent warehouse) -------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*) from public.warehouse_services)::int,
  1,
  'provider A sees exactly one service (their own warehouse''s)'
);

select is(
  (select count(*) from public.warehouse_services
   where warehouse_id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  0,
  'provider A cannot see a service under provider B''s warehouse'
);

select lives_ok(
  $$ insert into public.warehouse_services (warehouse_id, name)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'Kitting') $$,
  'provider A can insert a service under their own warehouse'
);

select throws_like(
  $$ insert into public.warehouse_services (warehouse_id, name)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'Hijacked service') $$,
  '%row-level security policy%',
  'provider A cannot insert a service under provider B''s warehouse'
);

reset role;

-- storage_spaces: anon -----------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.storage_spaces)::int,
  0,
  'anon has zero visibility into storage_spaces'
);

reset role;

-- storage_spaces: provider A (owner via parent warehouse) -----------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","role":"authenticated"}';

select is(
  (select count(*) from public.storage_spaces)::int,
  1,
  'provider A sees exactly one storage space (their own warehouse''s)'
);

select is(
  (select count(*) from public.storage_spaces
   where warehouse_id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  0,
  'provider A cannot see a storage space under provider B''s warehouse'
);

select lives_ok(
  $$ insert into public.storage_spaces (warehouse_id, name, unit_type, capacity_units)
     values ('aaaaaaaa-0000-0000-0000-000000000001', 'Bin Shelf 1', 'bin', 20) $$,
  'provider A can insert a storage space under their own warehouse'
);

select throws_like(
  $$ insert into public.storage_spaces (warehouse_id, name, unit_type, capacity_units)
     values ('bbbbbbbb-0000-0000-0000-000000000001', 'Hijacked space', 'bin', 20) $$,
  '%row-level security policy%',
  'provider A cannot insert a storage space under provider B''s warehouse'
);

reset role;

select * from finish();
rollback;
