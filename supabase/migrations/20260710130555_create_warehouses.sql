-- Provider-owned warehouse setup: a warehouse has services offered and
-- storage spaces available. Mirrors the profiles pattern from Phase 1:
-- owner-only RLS plus a role check on insert so a brand account can't
-- create warehouse rows under its own id (ownership alone isn't
-- authorization — see the Supabase security checklist's BOLA/IDOR note).

create table public.warehouses (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  address_line1 text not null,
  city text not null,
  state text,
  postal_code text not null,
  country text not null,
  created_at timestamptz not null default now()
);

create index warehouses_provider_id_idx on public.warehouses (provider_id);

alter table public.warehouses enable row level security;

create policy "warehouses_select_own"
on public.warehouses
for select
to authenticated
using ( (select auth.uid()) = provider_id );

create policy "warehouses_insert_own"
on public.warehouses
for insert
to authenticated
with check (
  (select auth.uid()) = provider_id
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'provider'
  )
);

create policy "warehouses_update_own"
on public.warehouses
for update
to authenticated
using ( (select auth.uid()) = provider_id )
with check ( (select auth.uid()) = provider_id );

create policy "warehouses_delete_own"
on public.warehouses
for delete
to authenticated
using ( (select auth.uid()) = provider_id );

create table public.warehouse_services (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create index warehouse_services_warehouse_id_idx on public.warehouse_services (warehouse_id);

alter table public.warehouse_services enable row level security;

-- Child-table ownership is derived through the parent warehouse's
-- provider_id — there's no provider_id column here to check directly.
create policy "warehouse_services_select_own"
on public.warehouse_services
for select
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = warehouse_services.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "warehouse_services_insert_own"
on public.warehouse_services
for insert
to authenticated
with check (
  exists (
    select 1 from public.warehouses
    where warehouses.id = warehouse_services.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "warehouse_services_update_own"
on public.warehouse_services
for update
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = warehouse_services.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.warehouses
    where warehouses.id = warehouse_services.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "warehouse_services_delete_own"
on public.warehouse_services
for delete
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = warehouse_services.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create table public.storage_spaces (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  name text not null,
  unit_type text not null,
  capacity_units integer not null,
  created_at timestamptz not null default now(),
  constraint storage_spaces_capacity_units_check check (capacity_units >= 0)
);

create index storage_spaces_warehouse_id_idx on public.storage_spaces (warehouse_id);

alter table public.storage_spaces enable row level security;

create policy "storage_spaces_select_own"
on public.storage_spaces
for select
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = storage_spaces.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "storage_spaces_insert_own"
on public.storage_spaces
for insert
to authenticated
with check (
  exists (
    select 1 from public.warehouses
    where warehouses.id = storage_spaces.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "storage_spaces_update_own"
on public.storage_spaces
for update
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = storage_spaces.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.warehouses
    where warehouses.id = storage_spaces.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);

create policy "storage_spaces_delete_own"
on public.storage_spaces
for delete
to authenticated
using (
  exists (
    select 1 from public.warehouses
    where warehouses.id = storage_spaces.warehouse_id
      and warehouses.provider_id = (select auth.uid())
  )
);
