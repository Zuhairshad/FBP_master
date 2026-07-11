-- Phase 13: this repo's RLS tests had never executed against a live Postgres
-- before this phase (see CLAUDE.md Landmines) — doing so for the first time,
-- in CI, surfaced a real systemic gap: every migration since Phase 1 created
-- RLS policies but never GRANTed base table privileges to `anon`/
-- `authenticated` at all. In Postgres, table-level GRANTs and RLS are two
-- separate gates: a role needs the GRANT for a query to be attempted in the
-- first place; RLS then filters which rows are visible (or blocks the
-- operation entirely, when a table has RLS enabled with no matching policy)
-- once that grant exists. Without the grant, every query hit
-- "permission denied for table X" before RLS ever evaluated, instead of the
-- RLS-mediated "0 rows" / "new row violates row-level security policy"
-- behavior every RLS test in this repo already asserts (confirmed against
-- `supabase test db`'s actual CI failure output — Postgres's own error HINT
-- literally said "GRANT SELECT ON public.<table> TO anon").
--
-- This does NOT widen access beyond what was already documented and
-- intended: RLS stays enabled on every table below, and for the *_tokens/
-- `sync_logs` tables specifically (zero policies by design — see their own
-- migrations) RLS's default-deny (enabled + no matching policy = no rows)
-- still fully applies regardless of this grant. A table-level GRANT is a
-- precondition for RLS to run at all, not an alternative to it — this is
-- Supabase's own standard convention, normally established via
-- `ALTER DEFAULT PRIVILEGES` at project-creation time.

grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on
  public.profiles,
  public.warehouses,
  public.warehouse_services,
  public.storage_spaces,
  public.products,
  public.booking_requests,
  public.inventory,
  public.sku_mappings,
  public.platform_orders,
  public.shopify_tokens,
  public.tiktok_tokens,
  public.amazon_tokens,
  public.ebay_tokens,
  public.walmart_tokens,
  public.sync_logs
to anon, authenticated;

-- Applies the same grant to any table a future migration creates in
-- `public`, so this gap can't quietly reopen one table at a time.
alter default privileges in schema public
  grant select, insert, update, delete on tables to anon, authenticated;
