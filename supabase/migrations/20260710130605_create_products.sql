-- Brand-owned product listings, keyed by a brand-scoped Master SKU. Every
-- marketplace-assigned SKU will eventually resolve back to this row via
-- Phase 4's sku_mappings table — this is the anchor that resolution points at.

create table public.products (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  master_sku text not null,
  name text not null,
  description text,
  created_at timestamptz not null default now(),
  constraint products_brand_id_master_sku_key unique (brand_id, master_sku)
);

create index products_brand_id_idx on public.products (brand_id);

alter table public.products enable row level security;

create policy "products_select_own"
on public.products
for select
to authenticated
using ( (select auth.uid()) = brand_id );

create policy "products_insert_own"
on public.products
for insert
to authenticated
with check (
  (select auth.uid()) = brand_id
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'brand'
  )
);

create policy "products_update_own"
on public.products
for update
to authenticated
using ( (select auth.uid()) = brand_id )
with check ( (select auth.uid()) = brand_id );

create policy "products_delete_own"
on public.products
for delete
to authenticated
using ( (select auth.uid()) = brand_id );
