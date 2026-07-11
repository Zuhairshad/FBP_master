-- RLS policy tests for public.booking_requests. Per TESTING.md: anon (no
-- access), the two parties on a booking (full access to their own booking),
-- and an uninvolved brand/provider (no access to someone else's booking —
-- the roadmap's explicit negative case for this phase). Also covers the
-- provider_id-derivation trigger, the brand-only insert role check, that
-- only the provider can act on a request, and the immutability trigger
-- protecting brand_id/provider_id/storage_space_id after creation. Phase 12
-- adds admin oversight: sees every booking regardless of party, can act on
-- any of them, but still cannot reassign parties/space (the existing
-- immutability trigger has no admin bypass). Run with: supabase test db

begin;
select plan(17);

create function pg_temp.try_update_booking_status(target_id uuid, new_status public.booking_status)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.booking_requests set status = new_status where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: two providers (each with one warehouse + one storage space) and
-- two brands. Brand X requests provider A's space — that booking is the
-- A<->X relationship; provider B and brand Y are the uninvolved third parties.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-1111-1111-1111-111111111111',
  'provider-a@example.com',
  '{"role": "provider", "display_name": "Provider A"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '22222222-2222-2222-2222-222222222222',
  'provider-b@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '33333333-3333-3333-3333-333333333333',
  'brand-x@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '44444444-4444-4444-4444-444444444444',
  'brand-y@example.com',
  '{"role": "brand", "display_name": "Brand Y"}'::jsonb
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  '11111111-0000-0000-0000-000000000001',
  '11111111-1111-1111-1111-111111111111',
  'Warehouse A',
  '1 Dock Rd',
  'Columbus',
  '43215',
  'US'
);

insert into public.warehouses (id, provider_id, name, address_line1, city, postal_code, country)
values (
  '22222222-0000-0000-0000-000000000001',
  '22222222-2222-2222-2222-222222222222',
  'Warehouse B',
  '2 Dock Rd',
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

-- A second space under the same warehouse, used only as the "attempted
-- reassignment" target for the immutability-trigger test below.
insert into public.storage_spaces (id, warehouse_id, name, unit_type, capacity_units)
values (
  '11111111-2222-0000-0000-000000000002',
  '11111111-0000-0000-0000-000000000001',
  'Bin Shelf B',
  'bin',
  20
);

-- Booking: brand X requests provider A's space. provider_id is intentionally
-- omitted here — the BEFORE INSERT trigger must derive it.
insert into public.booking_requests (id, brand_id, storage_space_id)
values (
  '99999999-0000-0000-0000-000000000001',
  '33333333-3333-3333-3333-333333333333',
  '11111111-2222-0000-0000-000000000001'
);

select is(
  (select provider_id from public.booking_requests where id = '99999999-0000-0000-0000-000000000001'),
  '11111111-1111-1111-1111-111111111111'::uuid,
  'the provider_id trigger correctly derives the owning provider from the storage space'
);

-- anon ------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.booking_requests)::int,
  0,
  'anon has zero visibility into booking_requests'
);

reset role;

-- brand X (party) ---------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}';

select is(
  (select count(*) from public.booking_requests)::int,
  1,
  'brand X sees exactly one booking (their own request)'
);

select lives_ok(
  $$ insert into public.booking_requests (brand_id, storage_space_id)
     values ('33333333-3333-3333-3333-333333333333', '11111111-2222-0000-0000-000000000001') $$,
  'brand X can create a booking request under their own id'
);

select throws_like(
  $$ insert into public.booking_requests (brand_id, storage_space_id)
     values ('44444444-4444-4444-4444-444444444444', '11111111-2222-0000-0000-000000000001') $$,
  '%row-level security policy%',
  'brand X cannot create a booking request under brand Y''s id'
);

select is(
  pg_temp.try_update_booking_status('99999999-0000-0000-0000-000000000001', 'approved'),
  0,
  'brand X cannot approve/reject their own request — no update policy for brand'
);

reset role;

-- provider A (party) -------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

-- Two bookings exist for provider A's space at this point: the original
-- fixture plus the one brand X just created via the lives_ok insert above.
select is(
  (select count(*) from public.booking_requests)::int,
  2,
  'provider A sees both incoming requests for their space'
);

select throws_like(
  $$ insert into public.booking_requests (brand_id, storage_space_id)
     values ('11111111-1111-1111-1111-111111111111', '11111111-2222-0000-0000-000000000001') $$,
  '%row-level security policy%',
  'a provider account cannot create a booking request even under its own id'
);

select is(
  pg_temp.try_update_booking_status('99999999-0000-0000-0000-000000000001', 'approved'),
  1,
  'provider A can approve the incoming request'
);

select throws_like(
  $$ update public.booking_requests
     set storage_space_id = '11111111-2222-0000-0000-000000000002'
     where id = '99999999-0000-0000-0000-000000000001' $$,
  '%cannot be changed%',
  'provider A cannot reassign the storage space on an existing booking'
);

reset role;

-- uninvolved parties: brand Y and provider B --------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated"}';

select is(
  (select count(*) from public.booking_requests where id = '99999999-0000-0000-0000-000000000001')::int,
  0,
  'brand Y (uninvolved) cannot see the booking between brand X and provider A'
);

select is(
  pg_temp.try_update_booking_status('99999999-0000-0000-0000-000000000001', 'rejected'),
  0,
  'brand Y''s update against the A<->X booking silently matches zero rows under RLS'
);

reset role;

set local role authenticated;
set local request.jwt.claims to '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated"}';

select is(
  (select count(*) from public.booking_requests where id = '99999999-0000-0000-0000-000000000001')::int,
  0,
  'provider B (uninvolved) cannot see the booking between brand X and provider A'
);

select is(
  pg_temp.try_update_booking_status('99999999-0000-0000-0000-000000000001', 'rejected'),
  0,
  'provider B''s update against the A<->X booking silently matches zero rows under RLS'
);

reset role;

-- admin: sees every booking, can act on any, still can't reassign parties --

insert into auth.users (id, email, raw_user_meta_data)
values (
  '55555555-5555-5555-5555-555555555555',
  'admin-a@example.com',
  '{"role": "admin", "display_name": "Admin Alpha"}'::jsonb
);

alter table public.profiles disable trigger profiles_role_immutable;
update public.profiles set role = 'admin' where id = '55555555-5555-5555-5555-555555555555';
alter table public.profiles enable trigger profiles_role_immutable;

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  (select count(*) from public.booking_requests)::int,
  2,
  'admin sees every booking, not just ones they''re a party to'
);

select is(
  pg_temp.try_update_booking_status('99999999-0000-0000-0000-000000000001', 'rejected'),
  1,
  'admin can reject a booking even though they''re not a party to it'
);

select throws_like(
  $$ update public.booking_requests
     set storage_space_id = '11111111-2222-0000-0000-000000000002'
     where id = '99999999-0000-0000-0000-000000000001' $$,
  '%cannot be changed%',
  'even an admin cannot reassign the storage space on an existing booking'
);

reset role;

select * from finish();
rollback;
