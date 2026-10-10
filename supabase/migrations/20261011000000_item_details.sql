-- Epic 3 follow-up: richer vision tags need somewhere to live.
-- Safe additive migration (defaults cover pre-existing rows). Idempotent.
-- '' = "unknown / not set"; vocabulary mirrors
-- supabase/functions/_shared/wardrobeTags.ts (FABRICS, PATTERNS).

alter table public.wardrobe_items
  add column if not exists fabric text not null default '',
  add column if not exists pattern text not null default '';

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_fabric_check,
  add constraint wardrobe_items_fabric_check check (
    fabric in ('', 'cotton', 'denim', 'linen', 'wool', 'silk', 'polyester', 'leather', 'knit')
  ),
  drop constraint if exists wardrobe_items_pattern_check,
  add constraint wardrobe_items_pattern_check check (
    pattern in ('', 'solid', 'striped', 'plaid', 'floral', 'graphic', 'polka-dot', 'colorblock', 'distressed')
  );
