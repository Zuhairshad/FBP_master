-- RLS policy tests for public.profiles — three principals per TESTING.md:
-- anon (no access), owner (full access to own row), other user (read-only
-- directory access, no mutation, to someone else's row). Run with:
-- supabase test db
--
-- NOTE: Phase 3 (20260710133050_extend_directory_visibility.sql) added a
-- profiles_select_directory policy (to authenticated using (true)) so a
-- brand can see a provider's identity before any booking relationship
-- exists, and vice versa. This intentionally widens SELECT beyond
-- owner-only — mutation (UPDATE) stays owner-only, unaffected. The
-- assertions below reflect that: "other user" now sees the row (read) but
-- still cannot mutate it.

begin;
select plan(15);
-- Phase 12 added 6 assertions (admin fixture sanity check + is_active
-- moderation coverage) on top of the original 9.

-- Helper: runs an UPDATE as whatever role is currently active and returns the
-- affected row count. Needed because a blocked RLS UPDATE silently matches 0
-- rows rather than raising — there's no plain pgTAP assertion for "0 rows
-- affected", so we capture it via GET DIAGNOSTICS. Defined before any role
-- switch below so EXECUTE is available via the default PUBLIC grant.
create function pg_temp.try_update_display_name(target_id uuid, new_name text)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.profiles set display_name = new_name where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Same shape, for is_active — Phase 12's account-deactivation moderation
-- action.
create function pg_temp.try_update_is_active(target_id uuid, new_value boolean)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.profiles set is_active = new_value where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Two fake users, inserted directly into auth.users. This also exercises the
-- handle_new_user trigger — each insert should produce exactly one profiles row.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-1111-1111-1111-111111111111',
  'brand-a@example.com',
  '{"role": "brand", "display_name": "Brand A", "company_name": "A Co"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  '22222222-2222-2222-2222-222222222222',
  'provider-b@example.com',
  '{"role": "provider", "display_name": "Provider B"}'::jsonb
);

-- Trigger correctness -------------------------------------------------------

select is(
  (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'brand'::public.user_role,
  'trigger resolves the requested self-service role (brand)'
);

select is(
  (select role from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'provider'::public.user_role,
  'trigger resolves the requested self-service role (provider)'
);

-- A signup attempting to self-assign "admin" must fall back to "brand".
insert into auth.users (id, email, raw_user_meta_data)
values (
  '33333333-3333-3333-3333-333333333333',
  'sneaky@example.com',
  '{"role": "admin", "display_name": "Sneaky"}'::jsonb
);

select is(
  (select role from public.profiles where id = '33333333-3333-3333-3333-333333333333'),
  'brand'::public.user_role,
  'a self-service signup requesting "admin" is forced to "brand"'
);

-- Phase 12: seed a real admin fixture. There is no supported application-level
-- path to do this (self-service always forces down to brand, and
-- prevent_role_change blocks a plain UPDATE unconditionally, admin included —
-- see CLAUDE.md's "admin is never self-service" note) — matching how the
-- profiles migration's own header describes admin provisioning ("seeded
-- directly by an operator"), this bypasses the trigger for the single seed
-- UPDATE, same privilege level an operator would need anyway.
insert into auth.users (id, email, raw_user_meta_data)
values (
  '55555555-5555-5555-5555-555555555555',
  'admin-a@example.com',
  '{"role": "admin", "display_name": "Admin Alpha"}'::jsonb
);

alter table public.profiles disable trigger profiles_role_immutable;
update public.profiles set role = 'admin' where id = '55555555-5555-5555-5555-555555555555';
alter table public.profiles enable trigger profiles_role_immutable;

select is(
  (select role from public.profiles where id = '55555555-5555-5555-5555-555555555555'),
  'admin'::public.user_role,
  'admin fixture seeded correctly (operator-only path, bypassing the self-service trigger)'
);

-- anon: no access -------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.profiles)::int,
  0,
  'anon has zero visibility into profiles'
);

reset role;

-- owner: full access to own row, none to others ----------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated"}';

select is(
  (select count(*) from public.profiles)::int,
  4,
  'user A sees all profiles via the directory policy (own + others), not just their own'
);

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Brand A',
  'user A can read their own profile'
);

update public.profiles set display_name = 'Brand A Updated'
where id = '11111111-1111-1111-1111-111111111111';

select is(
  (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Brand A Updated',
  'user A can update their own display_name'
);

-- directory read succeeds (by design, see NOTE above); mutation still doesn't
select is(
  (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  'Provider B',
  'user A can read user B''s row via the directory policy'
);

select is(
  pg_temp.try_update_display_name('22222222-2222-2222-2222-222222222222', 'hijacked'),
  0,
  'user A''s update against user B''s row silently matches zero rows under RLS'
);

-- Phase 12: is_active is admin-only, even for a user acting on their own row.
select throws_like(
  $$ update public.profiles set is_active = false where id = '11111111-1111-1111-1111-111111111111' $$,
  '%is_active can only be changed by an admin%',
  'user A cannot deactivate their own account — is_active is admin-only'
);

select is(
  pg_temp.try_update_is_active('22222222-2222-2222-2222-222222222222', false),
  0,
  'user A''s attempt to deactivate user B silently matches zero rows — no row-level access to B''s row at all'
);

reset role;

-- admin: can moderate any profile's is_active, but role stays immutable ----

set local role authenticated;
set local request.jwt.claims to '{"sub":"55555555-5555-5555-5555-555555555555","role":"authenticated"}';

select is(
  pg_temp.try_update_is_active('22222222-2222-2222-2222-222222222222', false),
  1,
  'admin can deactivate user B''s account'
);

select is(
  (select is_active from public.profiles where id = '22222222-2222-2222-2222-222222222222'),
  false,
  'user B''s profile reflects the deactivation'
);

select throws_like(
  $$ update public.profiles set role = 'provider' where id = '22222222-2222-2222-2222-222222222222' $$,
  '%role cannot be changed%',
  'even an admin cannot change a profile''s role — prevent_role_change has no admin bypass'
);

reset role;

select * from finish();
rollback;
