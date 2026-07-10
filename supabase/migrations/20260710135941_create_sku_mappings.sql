-- Resolves a marketplace-assigned SKU back to a brand's Master SKU (products
-- row). One brand can list the same platform_sku only once per platform —
-- enforced by a unique constraint on (brand_id, platform, platform_sku).
--
-- brand_id is trigger-derived from product_id, never client-supplied — same
-- pattern as booking_requests.provider_id (see 20260710133104). A unique
-- constraint can't span a join, so brand_id is denormalized onto this table
-- purely to make that constraint enforceable; product_id remains the
-- authoritative link. This derivation also does double duty as the
-- authorization check: unlike products/warehouses (where ownership is a
-- direct self-reference and needed an explicit role check in WITH CHECK),
-- here brand_id resolves to the product's *actual* owner regardless of who's
-- inserting, so a mismatched inserter is rejected by the ownership predicate
-- alone — no separate role check needed, since products' own insert policy
-- already gates who could own a product in the first place.

create type public.marketplace_platform as enum ('amazon', 'tiktok', 'ebay', 'walmart', 'shopify');

create table public.sku_mappings (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  brand_id uuid not null references public.profiles (id) on delete cascade,
  platform public.marketplace_platform not null,
  platform_sku text not null,
  created_at timestamptz not null default now(),
  constraint sku_mappings_brand_platform_sku_key unique (brand_id, platform, platform_sku)
);

create index sku_mappings_product_id_idx on public.sku_mappings (product_id);
create index sku_mappings_brand_id_idx on public.sku_mappings (brand_id);

alter table public.sku_mappings enable row level security;

create policy "sku_mappings_select_own"
on public.sku_mappings
for select
to authenticated
using ( (select auth.uid()) = brand_id );

create policy "sku_mappings_insert_own"
on public.sku_mappings
for insert
to authenticated
with check ( (select auth.uid()) = brand_id );

create policy "sku_mappings_delete_own"
on public.sku_mappings
for delete
to authenticated
using ( (select auth.uid()) = brand_id );

-- No update policy: a wrong mapping is deleted and recreated, not edited —
-- there's nothing to correct in place that isn't just "this row shouldn't
-- exist" (ASSUMPTION: simplest option for a table with no editable frontend
-- yet; revisit if a future UI wants in-place correction of a typoed SKU).

create function public.set_sku_mapping_brand_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_brand_id uuid;
begin
  select brand_id into resolved_brand_id
  from public.products
  where id = new.product_id;

  if resolved_brand_id is null then
    raise exception 'sku_mappings.product_id does not reference an existing product';
  end if;

  new.brand_id := resolved_brand_id;
  return new;
end;
$$;

revoke execute on function public.set_sku_mapping_brand_id() from public, anon, authenticated;

create trigger sku_mappings_set_brand_id
  before insert on public.sku_mappings
  for each row execute function public.set_sku_mapping_brand_id();
