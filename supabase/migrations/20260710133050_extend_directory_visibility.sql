-- Marketplace directory visibility. Phase 3's booking flow needs a brand to
-- browse providers/warehouses/storage spaces (and see who the provider is)
-- *before* any relationship exists between them — the owner-only policies
-- from Phase 1/2 (profiles_select_own, warehouses_select_own, etc.) only
-- grant access once a row's own id matches, which is exactly wrong for a
-- directory. Postgres RLS combines multiple permissive policies with OR, so
-- these add broad read access on top of the existing owner-only policies
-- without weakening them (insert/update/delete stay owner-only, untouched).
--
-- ASSUMPTION: this makes every profile (including admin rows) readable to
-- any authenticated user — display_name/company_name/role only, no email or
-- secret ever lives in `profiles`, so the exposure is low. Alternative
-- considered: a narrower view exposing only provider profiles, or scoping by
-- an explicit "listed" flag — rejected for now as unneeded complexity until
-- there's a real privacy requirement to justify it.

create policy "profiles_select_directory"
on public.profiles
for select
to authenticated
using ( true );

create policy "warehouses_select_directory"
on public.warehouses
for select
to authenticated
using ( true );

create policy "warehouse_services_select_directory"
on public.warehouse_services
for select
to authenticated
using ( true );

create policy "storage_spaces_select_directory"
on public.storage_spaces
for select
to authenticated
using ( true );
