-- RLS policy tests for public.sku_mappings. Per TESTING.md: anon (no access),
-- owner (full access to own rows), other brand (no access to their rows).
-- Also covers the brand_id-derivation trigger, the resulting cross-brand
-- insert rejection (brand X cannot map a SKU onto brand Y's product, even
-- with brand Y's own product_id — the trigger resolves brand_id to Y, and
-- WITH CHECK then rejects X as the inserter), and the
-- (brand_id, platform, platform_sku) uniqueness constraint. Run with:
-- supabase test db

begin;
select plan(10);

create function pg_temp.try_delete_sku_mapping(target_id uuid)
returns int
language plpgsql
as $$
declare
  affected int;
begin
  delete from public.sku_mappings where id = target_id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

-- Fixtures: two brands, one product each (profiles populated via the Phase 1
-- handle_new_user trigger).
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

-- brand_id is intentionally omitted here — the BEFORE INSERT trigger must
-- derive it from product_id.
insert into public.sku_mappings (id, product_id, platform, platform_sku)
values (
  '99999999-2222-0000-0000-000000000001',
  'dddddddd-0000-0000-0000-000000000001',
  'amazon',
  'AMZ-X-001'
);

select is(
  (select brand_id from public.sku_mappings where id = '99999999-2222-0000-0000-000000000001'),
  'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid,
  'the brand_id trigger correctly derives the owning brand from product_id'
);

-- anon ------------------------------------------------------------------

set local role anon;

select is(
  (select count(*) from public.sku_mappings)::int,
  0,
  'anon has zero visibility into sku_mappings'
);

reset role;

-- brand X (owner) -----------------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select is(
  (select count(*) from public.sku_mappings)::int,
  1,
  'brand X sees exactly one SKU mapping (their own)'
);

select lives_ok(
  $$ insert into public.sku_mappings (product_id, platform, platform_sku)
     values ('dddddddd-0000-0000-0000-000000000001', 'tiktok', 'TT-X-001') $$,
  'brand X can create a mapping for their own product'
);

select throws_like(
  $$ insert into public.sku_mappings (product_id, platform, platform_sku)
     values ('dddddddd-0000-0000-0000-000000000001', 'amazon', 'AMZ-X-001') $$,
  '%duplicate key value violates unique constraint%',
  'brand X cannot reuse the same platform+platform_sku combination twice'
);

select throws_like(
  $$ insert into public.sku_mappings (product_id, platform, platform_sku)
     values ('eeeeeeee-0000-0000-0000-000000000001', 'amazon', 'AMZ-HIJACK') $$,
  '%row-level security policy%',
  'brand X cannot map a SKU onto brand Y''s product, even with brand Y''s own product_id'
);

reset role;

-- brand Y (other tenant) -----------------------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee","role":"authenticated"}';

select is(
  (select count(*) from public.sku_mappings where id = '99999999-2222-0000-0000-000000000001')::int,
  0,
  'brand Y cannot see brand X''s SKU mapping'
);

select is(
  pg_temp.try_delete_sku_mapping('99999999-2222-0000-0000-000000000001'),
  0,
  'brand Y''s delete against brand X''s SKU mapping silently matches zero rows under RLS'
);

reset role;

-- brand X can delete their own mapping ---------------------------------------

set local role authenticated;
set local request.jwt.claims to '{"sub":"dddddddd-dddd-dddd-dddd-dddddddddddd","role":"authenticated"}';

select is(
  pg_temp.try_delete_sku_mapping('99999999-2222-0000-0000-000000000001'),
  1,
  'brand X can delete their own SKU mapping'
);

select is(
  (select count(*) from public.sku_mappings where id = '99999999-2222-0000-0000-000000000001')::int,
  0,
  'the deleted mapping is gone'
);

reset role;

select * from finish();
rollback;
