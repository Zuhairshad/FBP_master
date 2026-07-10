-- RLS policy tests for public.shopify_tokens. Unlike every other table in
-- this repo, this one is intentionally zero-policy: RLS is enabled but no
-- policy exists for any operation, so anon AND authenticated (including the
-- owning brand) get denied on everything. Only the service-role key (the
-- Worker's OAuth callback/sync/webhook handlers) can touch this table, since
-- service_role bypasses RLS entirely. Run with: supabase test db

begin;
select plan(5);

create function pg_temp.try_update_shopify_token(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.shopify_tokens set last_synced_at = now() where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_delete_shopify_token(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  delete from public.shopify_tokens where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

insert into auth.users (id, email, raw_user_meta_data)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'brand-shopify@example.com',
  '{"role": "brand", "display_name": "Brand Shopify"}'::jsonb
);

-- Written as the test-runner role (bypasses RLS), same as every other
-- fixture insert in this test suite — mirrors how the Worker's service-role
-- key would write this row in production.
insert into public.shopify_tokens (id, brand_id, shop_domain, access_token, scope)
values (
  'aaaaaaaa-1111-0000-0000-000000000001',
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'brand-shopify.myshopify.com',
  'shpat_fake_token',
  'read_orders'
);

-- anon --------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.shopify_tokens)::int,
  0,
  'anon has zero visibility into shopify_tokens'
);

reset role;

-- the owning brand, as an ordinary authenticated user --------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff","role":"authenticated"}';

select is(
  (select count(*) from public.shopify_tokens)::int,
  0,
  'even the owning brand cannot read shopify_tokens through the Data API — no select policy exists'
);

select throws_like(
  $$ insert into public.shopify_tokens (brand_id, shop_domain, access_token, scope)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'other.myshopify.com', 'shpat_x', 'read_orders') $$,
  '%row-level security policy%',
  'an authenticated brand cannot insert a shopify_tokens row directly — no insert policy exists'
);

-- UPDATE/DELETE with no applicable policy filter the target row out via an
-- implicit USING(false) rather than raising — they silently match zero rows
-- (same documented behavior as any RLS-blocked UPDATE/DELETE in this repo;
-- see CLAUDE.md Landmines). INSERT above throws because WITH CHECK rejects
-- the specific new row being inserted, which is a distinct code path.
select is(
  pg_temp.try_update_shopify_token('aaaaaaaa-1111-0000-0000-000000000001'),
  0,
  'an authenticated brand''s update against their own shopify_tokens row silently matches zero rows — no update policy exists'
);

select is(
  pg_temp.try_delete_shopify_token('aaaaaaaa-1111-0000-0000-000000000001'),
  0,
  'an authenticated brand''s delete against their own shopify_tokens row silently matches zero rows — no delete policy exists'
);

reset role;

select * from finish();
rollback;
