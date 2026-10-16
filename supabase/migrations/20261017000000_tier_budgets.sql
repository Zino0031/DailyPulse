-- Issue #42: tiered generation budgets (options per generation + separate
-- AI preview budget). Extends 20261016000000_subscriptions.sql — create or
-- replace keeps reruns safe. Limits mirror supabase/functions/_shared/tiers.ts
-- (PLANS); the drift test fails if the two disagree.
--
-- NOTE: Postgres forbids changing a function's return type while dependents
-- (consume_generation) exist, so tier_limits is dropped + recreated with its
-- dependent re-created right after. Whole file runs in one transaction.

drop function if exists public.consume_generation(uuid);
drop function if exists public.tier_limits(text);

-- ------------------------------------------------------------------
-- 1. Plan limits (null = unlimited). Adds outfit options + daily previews.
-- ------------------------------------------------------------------
create or replace function public.tier_limits(p_tier text)
returns table (
  item_limit integer,
  daily_generations integer,
  outfit_options integer,
  daily_previews integer
)
language sql
immutable
as $$
  select
    case p_tier when 'pro' then null when 'plus' then 250 else 50 end,
    case p_tier when 'pro' then 20 when 'plus' then 3 else 1 end,
    case p_tier when 'pro' then 5 when 'plus' then 3 else 1 end,
    case p_tier when 'pro' then 20 when 'plus' then 5 else 1 end;
$$;

-- Re-created verbatim (was dropped above only to allow tier_limits to
-- change shape). Consumed by generate-outfit; unchanged behavior.
create or replace function public.consume_generation(p_user uuid)
returns table (allowed boolean, used integer, daily_limit integer, tier text)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_tier text;
  v_limit integer;
  v_used integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  select u.tier into v_tier from public.users u where u.id = p_user;
  v_tier := coalesce(v_tier, 'free');
  select l.daily_generations into v_limit from public.tier_limits(v_tier) l;

  insert into public.generation_usage as g (user_id, day, used)
  values (p_user, v_day, 1)
  on conflict (user_id, day) do update
    set used = g.used + 1
    where v_limit is null or g.used < v_limit
  returning g.used into v_used;

  if v_used is null then
    -- Conflict row existed and was already at the cap.
    select g.used into v_used
    from public.generation_usage g
    where g.user_id = p_user and g.day = v_day;
    return query select false, v_used, v_limit, v_tier;
  else
    return query select true, v_used, v_limit, v_tier;
  end if;
end;
$$;

revoke all on function public.consume_generation(uuid) from public, anon, authenticated;
grant execute on function public.consume_generation(uuid) to service_role;

-- ------------------------------------------------------------------
-- 2. Daily AI preview usage (UTC days, same pattern as generation_usage).
--    Viewing an already-rendered board must never spend preview budget —
--    only fresh renders consume, and failures refund.
-- ------------------------------------------------------------------
create table if not exists public.preview_usage (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day)
);

alter table public.preview_usage enable row level security;

drop policy if exists "Users read own preview usage" on public.preview_usage;
create policy "Users read own preview usage" on public.preview_usage
  for select
  using (auth.uid() = user_id);

-- Atomic check-and-increment: two parallel renders can't both slip under
-- the cap. Returns whether the render may run.
create or replace function public.consume_preview(p_user uuid)
returns table (allowed boolean, used integer, daily_limit integer, tier text)
language plpgsql
security definer set search_path = public
as $$
#variable_conflict use_column
declare
  v_tier text;
  v_limit integer;
  v_used integer;
  v_day date := (now() at time zone 'utc')::date;
begin
  select u.tier into v_tier from public.users u where u.id = p_user;
  v_tier := coalesce(v_tier, 'free');
  select l.daily_previews into v_limit from public.tier_limits(v_tier) l;

  insert into public.preview_usage as g (user_id, day, used)
  values (p_user, v_day, 1)
  on conflict (user_id, day) do update
    set used = g.used + 1
    where v_limit is null or g.used < v_limit
  returning g.used into v_used;

  if v_used is null then
    -- Conflict row existed and was already at the cap.
    select g.used into v_used
    from public.preview_usage g
    where g.user_id = p_user and g.day = v_day;
    return query select false, v_used, v_limit, v_tier;
  else
    return query select true, v_used, v_limit, v_tier;
  end if;
end;
$$;

-- Gives a preview back when the render failed after consuming it.
create or replace function public.refund_preview(p_user uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.preview_usage
  set used = greatest(used - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Service role only (edge functions). Clients can read usage, never spend it.
revoke all on function public.consume_preview(uuid) from public, anon, authenticated;
revoke all on function public.refund_preview(uuid) from public, anon, authenticated;
grant execute on function public.consume_preview(uuid) to service_role;
grant execute on function public.refund_preview(uuid) to service_role;
