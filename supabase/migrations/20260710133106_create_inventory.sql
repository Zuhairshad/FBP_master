-- Brand-owned inventory levels per warehouse. Visible to the owning brand
-- always; visible to a provider only through an approved booking_requests
-- row connecting that brand to a storage space in the same warehouse — the
-- provider never gets a direct ownership column to check, so visibility is
-- derived by joining through booking_requests, same shape as Phase 2's
-- child-table-ownership-via-parent-join pattern.

create table public.inventory (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products (id) on delete cascade,
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  quantity integer not null default 0 check (quantity >= 0),
  created_at timestamptz not null default now(),
  constraint inventory_product_id_warehouse_id_key unique (product_id, warehouse_id)
);

create index inventory_product_id_idx on public.inventory (product_id);
create index inventory_warehouse_id_idx on public.inventory (warehouse_id);

alter table public.inventory enable row level security;

create policy "inventory_select_own"
on public.inventory
for select
to authenticated
using (
  exists (
    select 1 from public.products
    where products.id = inventory.product_id
      and products.brand_id = (select auth.uid())
  )
);

create policy "inventory_select_via_approved_booking"
on public.inventory
for select
to authenticated
using (
  exists (
    select 1
    from public.booking_requests br
    join public.storage_spaces ss on ss.id = br.storage_space_id
    join public.products p on p.id = inventory.product_id
    where ss.warehouse_id = inventory.warehouse_id
      and br.provider_id = (select auth.uid())
      and br.brand_id = p.brand_id
      and br.status = 'approved'
  )
);

create policy "inventory_insert_own"
on public.inventory
for insert
to authenticated
with check (
  exists (
    select 1 from public.products
    where products.id = inventory.product_id
      and products.brand_id = (select auth.uid())
  )
);

create policy "inventory_update_own"
on public.inventory
for update
to authenticated
using (
  exists (
    select 1 from public.products
    where products.id = inventory.product_id
      and products.brand_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.products
    where products.id = inventory.product_id
      and products.brand_id = (select auth.uid())
  )
);

create policy "inventory_delete_own"
on public.inventory
for delete
to authenticated
using (
  exists (
    select 1 from public.products
    where products.id = inventory.product_id
      and products.brand_id = (select auth.uid())
  )
);

-- A provider viewing visible inventory also needs to resolve the product's
-- name/master_sku for display. products RLS is otherwise owner-only
-- (Phase 2) — extend it with the same approved-booking predicate used above,
-- so "inventory visible via an approved booking" also means "the product
-- row behind it is visible," not just an opaque product_id.
create policy "products_select_via_approved_booking"
on public.products
for select
to authenticated
using (
  exists (
    select 1
    from public.inventory i
    join public.booking_requests br on br.brand_id = products.brand_id
    join public.storage_spaces ss on ss.id = br.storage_space_id
    where i.product_id = products.id
      and i.warehouse_id = ss.warehouse_id
      and br.provider_id = (select auth.uid())
      and br.status = 'approved'
  )
);
