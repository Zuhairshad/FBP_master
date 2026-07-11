-- RLS policy tests for public.sync_logs. Same zero-policy shape as every
-- `*_tokens` table (see e.g. amazon_tokens_rls.test.sql) for anon/ordinary
-- authenticated users — no policy exists for any operation, so both get
-- denied on everything; only the service-role key (the Worker's scheduled
-- sync handler) can write this table. Phase 12 adds the one exception: an
-- admin can read (not write) sync history. Run with: supabase test db

begin;
select plan(5);

create function pg_temp.try_update_sync_log(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.sync_logs set finished_at = now() where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Written as the test-runner role (bypasses RLS), same as every other
-- fixture insert in this test suite — mirrors how the Worker's service-role
-- key would write this row in production.
insert into public.sync_logs (id, platform, success_count, failure_count)
values (
  'aaaaaaaa-4444-0000-0000-000000000001',
  'amazon',
  3,
  0
);

-- anon --------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.sync_logs)::int,
  0,
  'anon has zero visibility into sync_logs'
);

reset role;

-- an ordinary authenticated user (brand or provider) ----------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"eeeeeeee-1111-0000-0000-000000000000","role":"authenticated"}';

select is(
  (select count(*) from public.sync_logs)::int,
  0,
  'an authenticated user cannot read sync_logs through the Data API — no select policy exists'
);

select throws_like(
  $$ insert into public.sync_logs (platform, success_count, failure_count) values ('shopify', 0, 0) $$,
  '%row-level security policy%',
  'an authenticated user cannot insert a sync_logs row directly — no insert policy exists'
);

-- UPDATE with no applicable policy filters the target row out via an
-- implicit USING(false) rather than raising — silently matches zero rows
-- (same documented behavior as any RLS-blocked UPDATE in this repo; see
-- CLAUDE.md Landmines).
select is(
  pg_temp.try_update_sync_log('aaaaaaaa-4444-0000-0000-000000000001'),
  0,
  'an authenticated user''s update against a sync_logs row silently matches zero rows — no update policy exists'
);

reset role;

-- admin: read-only oversight of sync history -------------------------------

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
  (select count(*) from public.sync_logs)::int,
  1,
  'admin can read sync_logs — the one exception to the zero-policy default'
);

reset role;

select * from finish();
rollback;
