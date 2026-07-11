-- Phase 13's second live CI run (after 20260711165411_grant_table_privileges.sql
-- fixed anon/authenticated) surfaced the same class of gap for a third role:
-- e2e/global-setup.ts's service-role fixture seeding hit "permission denied
-- for table warehouses" using SUPABASE_SERVICE_ROLE_KEY. `service_role` has
-- the BYPASSRLS attribute, which is a genuinely different Postgres concept
-- from table-level GRANTs — bypassing RLS only skips row-level policy
-- evaluation, it does not substitute for the base GRANT a role needs before
-- a query is attempted at all. This repo's migrations never granted
-- service_role anything either, same root cause as the anon/authenticated
-- gap, just not caught by that fix since it only targeted the two Data-API
-- roles. This is the role the real Cloudflare Worker uses for every
-- privileged write in production (marketplace tokens, platform_orders,
-- sync_logs, admin moderation) — this gap was live in the actual worker
-- code path, not just e2e fixture seeding, and would have surfaced the
-- moment any Worker handler tried to write to a table created after
-- whatever implicit default-privilege baseline this local Postgres image
-- ships with.

grant usage on schema public to service_role;

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
to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
