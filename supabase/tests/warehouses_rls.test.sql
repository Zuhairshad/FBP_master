-- RLS policy tests for public.warehouses, public.warehouse_services, and
-- public.storage_spaces. Three principals per TESTING.md: anon (no access),
-- owner (full access to own rows), other provider (read-only directory
-- access, no mutation, to their rows). Also covers the role-check
-- defense-in-depth added in the warehouses/products migrations (a
-- non-provider account cannot create a warehouse row even under its own
-- id). Run with: supabase test db
--
-- NOTE: Phase 3 (20260710133050_extend_directory_visibility.sql) added
-- directory SELECT policies (to authenticated using (true)) on all three
-- tables so a brand can browse providers before any booking exists. All
-- three tables have fixture rows under both provider A and provider B, so
-- each one's "other provider can read via directory, but not mutate"
-- assertion is a real test of the wider policy rather than a vacuous count
-- (a prior version of this file only fixtured warehouse_services/
-- storage_spaces under provider A, which made the "provider A cannot see
-- provider B's service/space" assertions trivially true regardless of
-- whether the directory policy existed at all — found during the Phase 13
-- RLS audit and fixed here, along with a pre-existing plan-count mismatch
-- (this file declared plan(20) but only had 19 real assertions — would
-- have failed at finish() the first time it actually ran against a live
-- Postgres, another artifact of this repo never having live-verified its
-- RLS tests before Phase 13; see CLAUDE.md Landmines).

begin;
select plan(21);

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

create function pg_temp.try_update_warehouse_service_name(target_id uuid, new_name text)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.warehouse_services set name = new_name where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_update_storage_space_name(target_id uuid, new_name text)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.storage_spaces set name = new_name where id = target_id;
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

insert into public.warehouse_services (id, warehouse_id, name)
values (
  'bbbbbbbb-1111-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Cold Storage'
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  'aaaaaaaa-2222-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001',
  'Pallet Rack A',
  'pallet',
  50
);

insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  'bbbbbbbb-2222-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Pallet Rack B',
  'pallet',
  30
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
  2,
  'provider A sees both warehouses via the directory policy (own + provider B''s)'
);

select is(
  (select count(*) from public.warehouses where id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  1,
  'provider A can read provider B''s warehouse via the directory policy (read-only)'
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
  2,
  'provider A sees both services via the directory policy (own + provider B''s)'
);

select is(
  (select count(*) from public.warehouse_services
   where warehouse_id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  1,
  'provider A can read the service under provider B''s warehouse via the directory policy (read-only)'
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

select is(
  pg_temp.try_update_warehouse_service_name('bbbbbbbb-1111-0000-0000-000000000001', 'hijacked'),
  0,
  'provider A''s update against provider B''s service silently matches zero rows under RLS'
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
  2,
  'provider A sees both storage spaces via the directory policy (own + provider B''s)'
);

select is(
  (select count(*) from public.storage_spaces
   where warehouse_id = 'bbbbbbbb-0000-0000-0000-000000000001')::int,
  1,
  'provider A can read the storage space under provider B''s warehouse via the directory policy (read-only)'
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

select is(
  pg_temp.try_update_storage_space_name('bbbbbbbb-2222-0000-0000-000000000001', 'hijacked'),
  0,
  'provider A''s update against provider B''s storage space silently matches zero rows under RLS'
);

reset role;

select * from finish();
rollback;
