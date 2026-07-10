-- A brand requests to store inventory in one of a provider's storage spaces;
-- the provider approves or rejects it. `provider_id` is never taken from the
-- client — a BEFORE INSERT trigger derives it from the storage space's
-- owning warehouse, so a brand can't misdirect a request to the wrong
-- provider by passing an arbitrary provider_id.

create type public.booking_status as enum ('pending', 'approved', 'rejected');

create table public.booking_requests (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references public.profiles (id) on delete cascade,
  provider_id uuid not null references public.profiles (id) on delete cascade,
  storage_space_id uuid not null references public.storage_spaces (id) on delete cascade,
  status public.booking_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index booking_requests_brand_id_idx on public.booking_requests (brand_id);
create index booking_requests_provider_id_idx on public.booking_requests (provider_id);
create index booking_requests_storage_space_id_idx on public.booking_requests (storage_space_id);

alter table public.booking_requests enable row level security;

-- Only the two parties on a booking can see it — the negative case (an
-- uninvolved brand/provider sees nothing) is the security-relevant test here.
create policy "booking_requests_select_parties"
on public.booking_requests
for select
to authenticated
using (
  (select auth.uid()) = brand_id or (select auth.uid()) = provider_id
);

create policy "booking_requests_insert_brand"
on public.booking_requests
for insert
to authenticated
with check (
  (select auth.uid()) = brand_id
  and exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'brand'
  )
);

-- Only the provider can act on a request (approve/reject) — brand has no
-- update policy, so a request is immutable to its creator once submitted.
create policy "booking_requests_update_provider"
on public.booking_requests
for update
to authenticated
using ( (select auth.uid()) = provider_id )
with check ( (select auth.uid()) = provider_id );

-- Resolves provider_id from the storage space's warehouse. SECURITY DEFINER
-- is required here: the inserting brand only has directory (read-only) access
-- to storage_spaces/warehouses, and this lookup must succeed regardless of
-- whether that directory policy exists — see the profiles/warehouses
-- directory migration. Revoked from PUBLIC below since it's trigger-only,
-- matching the handle_new_user pattern from Phase 1.
create function public.set_booking_request_provider_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  resolved_provider_id uuid;
begin
  select w.provider_id into resolved_provider_id
  from public.storage_spaces s
  join public.warehouses w on w.id = s.warehouse_id
  where s.id = new.storage_space_id;

  if resolved_provider_id is null then
    raise exception 'storage space % does not exist', new.storage_space_id;
  end if;

  new.provider_id := resolved_provider_id;
  return new;
end;
$$;

revoke execute on function public.set_booking_request_provider_id() from public, anon, authenticated;

create trigger booking_requests_set_provider_id
  before insert on public.booking_requests
  for each row execute function public.set_booking_request_provider_id();

-- Defense in depth: the update policy already restricts UPDATE to the
-- provider on their own row, but without this a provider could still
-- reassign brand_id/provider_id/storage_space_id via that same permitted
-- UPDATE. Only `status` (and the updated_at bump below) may change.
create function public.protect_booking_request_updates()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.brand_id <> old.brand_id
     or new.provider_id <> old.provider_id
     or new.storage_space_id <> old.storage_space_id then
    raise exception 'booking request parties and storage space cannot be changed after creation';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

create trigger booking_requests_protect_updates
  before update on public.booking_requests
  for each row execute function public.protect_booking_request_updates();
