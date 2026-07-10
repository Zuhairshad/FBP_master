-- RLS policy tests for public.products. Three principals per TESTING.md:
-- anon (no access), owner (full access to own rows), other brand (no access
-- to their rows). Also covers the role-check defense-in-depth (a provider
-- account cannot create a product row even under its own id) and the
-- brand_id+master_sku uniqueness constraint. Run with: supabase test db

begin;
select plan(10);

create function pg_temp.try_update_product_name(target_id uuid, new_name text)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  update public.products set name = new_name where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create function pg_temp.try_delete_product(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  delete from public.products where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: two brands, one provider (profiles populated via the Phase 1
-- handle_new_user trigger), one product per brand.
insert into auth.users (id, email, raw_user_meta_data)
values (
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'brand-x@example.com',
  '{"role": "brand", "display_name": "Brand X"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'brand-y@example.com',
  '{"role": "brand", "display_name": "Brand Y"}'::jsonb
);

insert into auth.users (id, email, raw_user_meta_data)
values (
  'ffffffff-ffff-ffff-ffff-ffffffffffff',
  'provider-z@example.com',
  '{"role": "provider", "display_name": "Provider Z"}'::jsonb
);

insert into public.products (id, brand_id, master_sku, name)
values (
  'dddddddd-0000-0000-0000-000000000001',
  'dddddddd-dddd-dddd-dddd-dddddddddddd',
  'SKU-X-001',
  'Widget X'
);

insert into public.products (id, brand_id, master_sku, name)
values (
  'eeeeeeee-0000-0000-0000-000000000001',
  'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee',
  'SKU-Y-001',
  'Widget Y'
);

-- anon ----------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.products)::int,
  0,
  'anon has zero visibility into products'
);

reset role;

-- brand X (owner) -------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select is(
  (select count(*) from public.products)::int,
  1,
  'brand X sees exactly one product (their own)'
);

select is(
  (select count(*) from public.products where id = 'eeeeeeee-0000-0000-0000-000000000001')::int,
  0,
  'brand X cannot see brand Y''s product'
);

select lives_ok(
  $$ insert into public.products (brand_id, master_sku, name)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'SKU-X-002', 'Widget X2') $$,
  'brand X can insert a second product under their own id'
);

select throws_like(
  $$ insert into public.products (brand_id, master_sku, name)
     values ('dddddddd-dddd-dddd-dddd-dddddddddddd', 'SKU-X-001', 'Duplicate SKU') $$,
  '%duplicate key value violates unique constraint%',
  'a brand cannot reuse a master_sku it already has'
);

select throws_like(
  $$ insert into public.products (brand_id, master_sku, name)
     values ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee', 'SKU-HIJACK', 'Hijacked') $$,
  '%row-level security policy%',
  'brand X cannot insert a product under brand Y''s id'
);

select is(
  pg_temp.try_update_product_name('dddddddd-0000-0000-0000-000000000001', 'Widget X Renamed'),
  1,
  'brand X can update their own product'
);

select is(
  pg_temp.try_update_product_name('eeeeeeee-0000-0000-0000-000000000001', 'hijacked'),
  0,
  'brand X''s update against brand Y''s product silently matches zero rows under RLS'
);

select is(
  pg_temp.try_delete_product('eeeeeeee-0000-0000-0000-000000000001'),
  0,
  'brand X''s delete against brand Y''s product silently matches zero rows under RLS'
);

reset role;

-- provider cannot create a product ------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"ffffffff-ffff-ffff-ffff-ffffffffffff","role":"authenticated"}';

select throws_like(
  $$ insert into public.products (brand_id, master_sku, name)
     values ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'SKU-Z-001', 'Provider-owned?') $$,
  '%row-level security policy%',
  'a provider account cannot create a product even under its own id'
);

reset role;

select * from finish();
rollback;
