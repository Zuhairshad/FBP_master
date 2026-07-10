-- Roles: brand and provider are self-service (chosen at sign-up); admin is
-- never self-service — seeded directly by an operator, never through the
-- public sign-up flow.
create type public.user_role as enum ('brand', 'provider', 'admin');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role public.user_role not null,
  display_name text not null,
  company_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Owner-only access. No insert/delete policies for authenticated/anon: RLS
-- default-denies both, since the only legitimate insert path is the
-- handle_new_user trigger below (SECURITY DEFINER, not a client action).
create policy "profiles_select_own"
on public.profiles
for select
to authenticated
using ( (select auth.uid()) = id );

create policy "profiles_update_own"
on public.profiles
for update
to authenticated
using ( (select auth.uid()) = id )
with check ( (select auth.uid()) = id );

-- Populates a profile row from sign-up metadata (supabase-js signUp's
-- `options.data`). Never trust raw_user_meta_data for authorization elsewhere
-- (it's client-editable) — this function only uses it once, at creation, and
-- only accepts the two self-service roles; anything else (including an
-- attempted "admin") silently falls back to "brand".
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested_role_text text := new.raw_user_meta_data ->> 'role';
  resolved_role public.user_role;
begin
  if requested_role_text in ('brand', 'provider') then
    resolved_role := requested_role_text::public.user_role;
  else
    resolved_role := 'brand';
  end if;

  insert into public.profiles (id, role, display_name, company_name)
  values (
    new.id,
    resolved_role,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.email),
    new.raw_user_meta_data ->> 'company_name'
  );

  return new;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on new functions, which would
-- make this callable directly as an RPC by anon/authenticated. It's only
-- meant to run as a trigger, so revoke that.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Defense in depth: even though the update policy already restricts updates
-- to the owning row, without this a user could still flip their own role
-- (e.g. brand -> admin) via an otherwise-permitted UPDATE.
create function public.prevent_role_change()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.role <> old.role then
    raise exception 'role cannot be changed after sign-up';
  end if;
  return new;
end;
$$;

create trigger profiles_role_immutable
  before update on public.profiles
  for each row execute function public.prevent_role_change();
