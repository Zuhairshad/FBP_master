-- RLS policy tests for public.walmart_tokens. Same zero-policy shape as
-- shopify_tokens_rls.test.sql / tiktok_tokens_rls.test.sql /
-- amazon_tokens_rls.test.sql / ebay_tokens_rls.test.sql: RLS is enabled but
-- no policy exists for any operation, so anon AND authenticated (including
-- the owning brand) get denied on everything. Only the service-role key
-- (the Worker's connect/sync handlers) can touch this table. Run with:
-- supabase test db

begin;
select plan(5);

create function pg_temp.try_update_walmart_token(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.walmart_tokens set last_synced_at = now() where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_delete_walmart_token(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  delete from public.walmart_tokens where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  '11111111-2222-3333-4444-555555555555',
  'brand-walmart@example.com',
  '{"role": "brand", "display_name": "Brand Walmart"}'::jsonb
);

-- Written as the test-runner role (bypasses RLS), same as every other
-- fixture insert in this test suite — mirrors how the Worker's service-role
-- key would write this row in production.
insert into public.walmart_tokens (id, brand_id, client_id, client_secret)
values (
  'aaaaaaaa-4444-0000-0000-000000000001',
  '11111111-2222-3333-4444-555555555555',
  'fake_client_id',
  'fake_client_secret'
);

-- anon --------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.walmart_tokens)::int,
  0,
  'anon has zero visibility into walmart_tokens'
);

reset role;

-- the owning brand, as an ordinary authenticated user --------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"11111111-2222-3333-4444-555555555555","role":"authenticated"}';

select is(
  (select count(*) from public.walmart_tokens)::int,
  0,
  'even the owning brand cannot read walmart_tokens through the Data API — no select policy exists'
);

select throws_like(
  $$ insert into public.walmart_tokens (brand_id, client_id, client_secret)
     values ('11111111-2222-3333-4444-555555555555', 'x', 'y') $$,
  '%row-level security policy%',
  'an authenticated brand cannot insert a walmart_tokens row directly — no insert policy exists'
);

-- UPDATE/DELETE with no applicable policy filter the target row out via an
-- implicit USING(false) rather than raising — they silently match zero rows
-- (same documented behavior as any RLS-blocked UPDATE/DELETE in this repo;
-- see CLAUDE.md Landmines). INSERT above throws because WITH CHECK rejects
-- the specific new row being inserted, which is a distinct code path.
select is(
  pg_temp.try_update_walmart_token('aaaaaaaa-4444-0000-0000-000000000001'),
  0,
  'an authenticated brand''s update against their own walmart_tokens row silently matches zero rows — no update policy exists'
);

select is(
  pg_temp.try_delete_walmart_token('aaaaaaaa-4444-0000-0000-000000000001'),
  0,
  'an authenticated brand''s delete against their own walmart_tokens row silently matches zero rows — no delete policy exists'
);

reset role;

select * from finish();
rollback;
