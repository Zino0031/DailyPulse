-- Epic 3 follow-up: richer vision tags need somewhere to live.
-- Safe additive migration (defaults cover pre-existing rows).

alter table public.wardrobe_items
  add column if not exists fabric text not null default '',
  add column if not exists pattern text not null default '';
