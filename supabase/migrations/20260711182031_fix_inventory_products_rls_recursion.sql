-- Phase 13's first live pgTAP run surfaced "infinite recursion detected in
-- policy for relation inventory/products" — a genuine circular RLS
-- dependency introduced in Phase 3, invisible until policies actually ran
-- against a real Postgres. `inventory`'s SELECT/INSERT/UPDATE/DELETE
-- policies (20260710133106_create_inventory.sql) check ownership via a live
-- subquery into `public.products`; `products_select_via_approved_booking`
-- (added in that same migration) checks visibility via a live subquery back
-- into `public.inventory`. Evaluating either table's RLS for a provider
-- recurses into the other's RLS indefinitely.
--
-- Fix: wrap the one edge that closes the cycle —
-- `products_select_via_approved_booking`'s inventory lookup — in a
-- SECURITY DEFINER function. Such a function executes as its owner (the
-- same role that created every table via migrations), which is exempt from
-- RLS by default unless a table has FORCE ROW LEVEL SECURITY (none here
-- do) — so the function's own query into `inventory` never re-triggers
-- inventory's policies, breaking the cycle. The predicate itself is
-- unchanged (identical joins/filters), so this changes no row's actual
-- visibility, only how it's evaluated.

create function public.inventory_visible_to_provider_for_product(target_product_id uuid, target_brand_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.inventory i
    join public.booking_requests br on br.brand_id = target_brand_id
    join public.storage_spaces ss on ss.id = br.storage_space_id
    where i.product_id = target_product_id
      and i.warehouse_id = ss.warehouse_id
      and br.provider_id = (select auth.uid())
      and br.status = 'approved'
  );
$$;

drop policy "products_select_via_approved_booking" on public.products;

create policy "products_select_via_approved_booking"
on public.products
for select
to authenticated
using (
  public.inventory_visible_to_provider_for_product(products.id, products.brand_id)
);
