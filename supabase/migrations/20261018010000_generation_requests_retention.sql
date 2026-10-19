-- Issue #44 review: retention for the generation idempotency table.
--
-- `generation_requests` only needs to outlive a generation plus the client's
-- retry window. Without a cleanup, successful rows kept their whole `response`
-- forever and the table grew unbounded. Keep two days.
--
-- pg_cron is optional: if the extension isn't installed (some free projects
-- don't have it), `generate-outfit` still sweeps this user's old rows
-- opportunistically on each generate call, so the table can't grow forever.
--
-- The checks are nested on purpose. `cron.job` must never appear in an
-- always-evaluated expression: PL/pgSQL plans the whole boolean condition, so
-- `... and not exists (select 1 from cron.job ...)` fails with
-- `relation "cron.job" does not exist` on projects without pg_cron — the
-- `and` guard does not save it. The outer check only reads `pg_catalog`, so it
-- is always safe; the static `cron.*` references get planned only once we know
-- the schema exists.

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'cron' and c.relname = 'job'
  ) then
    if not exists (select 1 from cron.job where jobname = 'generation_requests_retention') then
      perform cron.schedule(
        'generation_requests_retention',
        '17 3 * * *',
        $job$delete from public.generation_requests where created_at < now() - interval '2 days'$job$
      );
    end if;
  end if;
end
$$;
