-- RLS policy tests for public.profiles — three principals per TESTING.md:
-- anon (no access), owner (full access to own row), other user (no access
-- to someone else's row). Run with: supabase test db

begin;
select plan(9);

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
  1,
  'user A sees exactly one row (their own)'
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

-- negative case: user A cannot see or mutate user B's row
select is(
  (select count(*) from public.profiles where id = '22222222-2222-2222-2222-222222222222')::int,
  0,
  'user A cannot see user B''s row'
);

select is(
  pg_temp.try_update_display_name('22222222-2222-2222-2222-222222222222', 'hijacked'),
  0,
  'user A''s update against user B''s row silently matches zero rows under RLS'
);

reset role;

select * from finish();
rollback;
