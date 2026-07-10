-- Phase 10: Order Sync Automation.
--
-- sync_logs records one row per platform per scheduled sync run — the
-- Worker's scheduled() handler (worker/src/index.ts) starts a row when it
-- begins syncing a platform's connected brands, then updates it with
-- finished_at/success_count/failure_count/error_message once that
-- platform's run completes. A row is created and updated only by the
-- Worker's service-role key (worker/src/shared/syncLogs.ts), same as every
-- other Worker-owned table — RLS enabled with *zero* policies, mirroring
-- the `*_tokens` tables' defense-in-depth shape (ASSUMPTION: unlike the
-- tokens tables, nothing in here is secret — no credential or PII — so this
-- is stricter than strictly necessary; kept zero-policy for consistency
-- with every other Worker-written table rather than inventing a new access
-- shape ahead of Phase 12's "admin oversight" work, which is where this
-- table's real read path should be decided).
--
-- error_message holds only the *last* error hit during a platform's run,
-- not every per-brand error — enough to see "something failed" and go look
-- at Worker logs for detail, not a full audit trail (ASSUMPTION: simplest
-- option given no UI consumes this yet; revisit if Phase 12 needs
-- per-brand granularity).

create table public.sync_logs (
  id uuid primary key default gen_random_uuid(),
  platform public.marketplace_platform not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  error_message text,
  constraint sync_logs_counts_not_negative check (success_count >= 0 and failure_count >= 0)
);

create index sync_logs_platform_started_at_idx on public.sync_logs (platform, started_at desc);

alter table public.sync_logs enable row level security;
-- No policies: service-role only. See header comment.
