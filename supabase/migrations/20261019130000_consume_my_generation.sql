-- On-device generations count too (#50 follow-up).
--
-- `consume_generation` is service-role only because `generate-outfit` calls
-- it server-side. When the app composes on-device (`EXPO_PUBLIC_AI_GENERATION
-- =false`, or no AI call is made), it still has to spend one of the plan's
-- daily generations so Regenerate behaves the same with or without AI.
--
-- This wrapper always uses the caller's id, so a client can only spend its own
-- budget — unlike calling `consume_generation(p_user)` directly.
create or replace function public.consume_my_generation()
returns table (allowed boolean, used integer, daily_limit integer, tier text)
language sql
security definer
set search_path = public
as $$
  select * from public.consume_generation(auth.uid());
$$;

revoke all on function public.consume_my_generation() from public, anon;
grant execute on function public.consume_my_generation() to authenticated;
