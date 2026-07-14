-- Phase 12: Admin Panel. Access pattern decided with the client: admin-only
-- RLS policies (not service-role-backed Worker endpoints for reads) — this
-- matches the repo's existing "plain RLS CRUD unless it's genuinely
-- privileged" architecture rule, and every table below has nothing secret in
-- it (unlike the *_tokens tables, which stay zero-policy regardless of who's
-- asking — an admin never sees a raw OAuth token either way).
--
-- Scope (also decided with the client): view-only oversight of brands/
-- providers/bookings/orders/sync history, plus two moderation actions —
-- cancel/reject any booking (RLS-authorized here), and deactivate a user
-- account (RLS only gets a mirror flag; the actual lockout is a Worker
-- endpoint using Supabase Auth's ban mechanism — see worker/src/admin/,
-- not part of this migration).

-- is_active is a *display* flag here, not the enforcement mechanism — see
-- the migration header above. It lets the admin UI/directory show a
-- deactivated account without a Worker round-trip for every read.
alter table public.profiles add column is_active boolean not null default true;

-- Used inside other tables' RLS policies below. SECURITY INVOKER (the
-- default) is deliberate, not an oversight: the invoking user's own
-- session queries public.profiles for their own row, which profiles'
-- existing owner-only/directory SELECT policies already permit — no need
-- to bypass RLS with SECURITY DEFINER just to check the caller's own role.
create function public.is_admin()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'admin'
  );
$$;

-- Lets an admin flip is_active on any profile row. Combined with the
-- trigger below (which gates the *column*, not the row) this closes two
-- separate gaps: an admin acting on someone else's row (this policy), and
-- a non-admin abusing the existing profiles_update_own policy to just flip
-- their own is_active back on (the trigger).
create policy "profiles_update_admin"
on public.profiles
for update
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- Without this, profiles_update_own (owner-only, no column restriction)
-- would let a deactivated user simply set their own is_active back to
-- true via the same permitted UPDATE — the row-level admin policy above
-- only helps for *other* rows, not a user's own. Same shape as
-- prevent_role_change from Phase 1, applied to a different column.
create function public.prevent_self_deactivation_bypass()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.is_active <> old.is_active and not public.is_admin() then
    raise exception 'is_active can only be changed by an admin';
  end if;
  return new;
end;
$$;

create trigger profiles_is_active_admin_only
  before update on public.profiles
  for each row execute function public.prevent_self_deactivation_bypass();

-- booking_requests: admin sees every booking (not just its two parties) and
-- can update status on any of them. The existing
-- protect_booking_request_updates trigger already blocks reassigning
-- brand_id/provider_id/storage_space_id regardless of which policy
-- authorized the UPDATE, so this grant is effectively "admin can change
-- status only" for free.
create policy "booking_requests_select_admin"
on public.booking_requests
for select
to authenticated
using ( public.is_admin() );

create policy "booking_requests_update_admin"
on public.booking_requests
for update
to authenticated
using ( public.is_admin() )
with check ( public.is_admin() );

-- platform_orders: view-only oversight. No admin update policy — order
-- status/fulfillment mutation is Phase 11's job, deliberately out of scope
-- here (see ROADMAP.md).
create policy "platform_orders_select_admin"
on public.platform_orders
for select
to authenticated
using ( public.is_admin() );

-- sync_logs had zero policies since Phase 10, whose own write-up deferred
-- "who can read this" to this exact phase.
create policy "sync_logs_select_admin"
on public.sync_logs
for select
to authenticated
using ( public.is_admin() );
