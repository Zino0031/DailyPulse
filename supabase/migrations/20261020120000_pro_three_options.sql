-- Issue #48 D6: cap outfit options at 3 on every plan.
--
-- Five "Option N" pills don't fit a 320px phone, so Pro drops from 5 to 3.
-- The catalog is now Free 1x1x1, Plus 3x3x5, Pro 20x3x20.
--
-- Only the returned values change here, so `create or replace` keeps
-- `consume_generation()`/`consume_preview()` (which select from this
-- function) working without dropping them first. Mirrors PLANS in
-- supabase/functions/_shared/tiers.ts — the drift test fails if they disagree.

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
    case p_tier when 'pro' then 3 when 'plus' then 3 else 1 end,
    case p_tier when 'pro' then 20 when 'plus' then 5 else 1 end;
$$;
