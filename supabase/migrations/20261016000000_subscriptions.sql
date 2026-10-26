-- Epic 6 (issue #17): RevenueCat subscriptions + tier gating.
-- Safe additive migration, idempotent where possible.
--
-- Limits live in supabase/functions/_shared/tiers.ts (PLANS). They are
-- mirrored in public.tier_limits() below so the database can enforce them
-- atomically; utils/__tests__/tierLimitsSql.test.ts fails on drift.

-- ------------------------------------------------------------------
-- 1. Plan limits (null = unlimited)
-- ------------------------------------------------------------------
create or replace function public.tier_limits(p_tier text)
returns table (item_limit integer, daily_generations integer)
language sql
immutable
as $$
  select
    case p_tier when 'pro' then null when 'plus' then 250 else 50 end,
    case p_tier when 'pro' then null when 'plus' then 5 else 1 end;
$$;

-- ------------------------------------------------------------------
-- 2. users.tier is server-owned. RLS lets users write their own row
--    (profile form), so without this guard anyone could self-upgrade.
--    Only the service role (RevenueCat webhook / sync) may change it.
-- ------------------------------------------------------------------
create or replace function public.guard_user_tier()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.tier := 'free';
    elsif new.tier is distinct from old.tier then
      new.tier := old.tier;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists users_guard_tier on public.users;
create trigger users_guard_tier
  before insert or update on public.users
  for each row execute function public.guard_user_tier();

-- ------------------------------------------------------------------
-- 3. subscriptions: one row per user, written only by the webhook
--    (service role). The client reads it (existing select policy).
-- ------------------------------------------------------------------
alter table public.subscriptions
  add column if not exists tier text not null default 'free',
  add column if not exists product_id text,
  add column if not exists store text,
  add column if not exists environment text,
  add column if not exists will_renew boolean not null default false,
  add column if not exists updated_at timestamptz not null default now();

alter table public.subscriptions
  alter column status set default 'none',
  drop constraint if exists subscriptions_tier_check,
  add constraint subscriptions_tier_check check (tier in ('free', 'plus', 'pro')),
  drop constraint if exists subscriptions_status_check,
  add constraint subscriptions_status_check check (status in ('active', 'expired', 'none')),
  drop constraint if exists subscriptions_environment_check,
  add constraint subscriptions_environment_check
    check (environment is null or environment in ('sandbox', 'production'));

-- ------------------------------------------------------------------
-- 4. Daily AI generation usage (UTC days, same as tiers.ts usageDay()).
--    A counter instead of counting `outfits` rows: saving a look or
--    viewing a saved one must never spend a generation.
-- ------------------------------------------------------------------
create table if not exists public.generation_usage (
  user_id uuid not null references public.users (id) on delete cascade,
  day date not null,
  used integer not null default 0 check (used >= 0),
  primary key (user_id, day)
);

alter table public.generation_usage enable row level security;

drop policy if exists "Users read own usage" on public.generation_usage;
create policy "Users read own usage" on public.generation_usage
  for select
  using (auth.uid() = user_id);

-- Atomic check-and-increment: two parallel requests can't both slip
-- under the cap. Returns whether the generation may run.
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

-- Gives a generation back when the AI call failed after consuming it.
create or replace function public.refund_generation(p_user uuid)
returns void
language sql
security definer set search_path = public
as $$
  update public.generation_usage
  set used = greatest(used - 1, 0)
  where user_id = p_user and day = (now() at time zone 'utc')::date;
$$;

-- Service role only (edge functions). Clients can read usage, never spend it.
revoke all on function public.consume_generation(uuid) from public, anon, authenticated;
revoke all on function public.refund_generation(uuid) from public, anon, authenticated;
grant execute on function public.consume_generation(uuid) to service_role;
grant execute on function public.refund_generation(uuid) to service_role;

-- ------------------------------------------------------------------
-- 5. Closet capacity. Enforced on insert so no client can bypass it.
--    Existing items above the cap (after a downgrade) are kept.
-- ------------------------------------------------------------------
create or replace function public.enforce_closet_limit()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_limit integer;
  v_count integer;
begin
  -- Serialize inserts per user so parallel uploads can't overshoot.
  perform pg_advisory_xact_lock(hashtext('closet:' || new.user_id::text));
  select l.item_limit into v_limit
  from public.users u, public.tier_limits(u.tier) l
  where u.id = new.user_id;
  if v_limit is null then
    return new;
  end if;
  select count(*) into v_count from public.wardrobe_items w where w.user_id = new.user_id;
  if v_count >= v_limit then
    raise exception 'closet_full'
      using hint = format('Your plan holds %s items.', v_limit);
  end if;
  return new;
end;
$$;

drop trigger if exists wardrobe_items_enforce_limit on public.wardrobe_items;
create trigger wardrobe_items_enforce_limit
  before insert on public.wardrobe_items
  for each row execute function public.enforce_closet_limit();
