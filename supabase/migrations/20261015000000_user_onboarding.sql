-- Epic 1 (issue #5): onboarding profile form.
-- Safe additive migration — defaults cover pre-existing rows.

alter table public.users
  -- Style catalogue lives in constants/profile.ts (STYLE_PREFS).
  add column if not exists style_prefs text[] not null default '{}',
  -- "City, Country" shown next to the stored coordinates.
  add column if not exists location_name text,
  -- Set when the user finishes or skips onboarding; null = show the flow.
  add column if not exists onboarded_at timestamptz;
