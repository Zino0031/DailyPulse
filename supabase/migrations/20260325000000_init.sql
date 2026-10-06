-- myOutfit initial schema — docs/ARCHITECTURE.md §3 (ERD)
-- Applies cleanly on a fresh Supabase project via `supabase db push`
-- or the dashboard SQL editor. Idempotent where safe (IF NOT EXISTS /
-- ON CONFLICT / DROP IF EXISTS) so re-runs don't fail.

-- ------------------------------------------------------------------
-- 0. Helpers
-- ------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------------
-- 1. Tables
-- ------------------------------------------------------------------

-- App profile. id doubles as the owner id (references auth.users).
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text not null default '',
  location_lat numeric,
  location_lon numeric,
  tier text not null default 'free'
    check (tier in ('free', 'plus', 'pro')),
  created_at timestamptz not null default now()
);

create table if not exists public.avatars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  image_url text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
-- One active avatar per user.
create unique index if not exists avatars_one_active_per_user
  on public.avatars (user_id) where is_active;
create index if not exists avatars_user_id_idx on public.avatars (user_id);

create table if not exists public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  image_url text not null,
  category text not null
    check (category in ('top', 'bottom', 'shoes', 'outerwear', 'accessory')),
  colors text[] not null default '{}',
  formality text not null default 'casual'
    check (formality in ('casual', 'business', 'formal', 'athletic')),
  season text[] not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists wardrobe_items_user_id_idx
  on public.wardrobe_items (user_id);
create index if not exists wardrobe_items_user_category_idx
  on public.wardrobe_items (user_id, category);

create table if not exists public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  item_ids uuid[] not null default '{}',
  rendered_image_url text,
  weather_summary jsonb not null default '{}',
  event_summary text,
  mood text,
  is_saved boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists outfits_user_id_idx on public.outfits (user_id);
create index if not exists outfits_user_saved_idx
  on public.outfits (user_id) where is_saved;

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.users (id) on delete cascade,
  revenuecat_customer_id text,
  status text not null default 'active',
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------------
-- 2. Auto-provision app profile on signup
-- ------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------------
-- 3. Row Level Security — users only ever see their own rows
-- ------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.avatars enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfits enable row level security;
alter table public.subscriptions enable row level security;

-- users: the row id IS the owner id.
drop policy if exists "Users manage own profile" on public.users;
create policy "Users manage own profile" on public.users
  for all
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- avatars
drop policy if exists "Users manage own avatars" on public.avatars;
create policy "Users manage own avatars" on public.avatars
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- wardrobe_items
drop policy if exists "Users manage own wardrobe" on public.wardrobe_items;
create policy "Users manage own wardrobe" on public.wardrobe_items
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- outfits
drop policy if exists "Users manage own outfits" on public.outfits;
create policy "Users manage own outfits" on public.outfits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- subscriptions (read-only for the client; writes go through the
-- RevenueCat webhook edge function with the service role).
drop policy if exists "Users read own subscription" on public.subscriptions;
create policy "Users read own subscription" on public.subscriptions
  for select
  using (auth.uid() = user_id);

-- ------------------------------------------------------------------
-- 4. Storage buckets + object policies
--    avatars: public read / wardrobe + outfits: owner-only
-- ------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values
  ('avatars', 'avatars', true),
  ('wardrobe', 'wardrobe', false),
  ('outfits', 'outfits', false)
on conflict (id) do nothing;

-- Public read of avatar renders (used on Home + shared previews).
drop policy if exists "Public read avatars" on storage.objects;
create policy "Public read avatars" on storage.objects
  for select
  using (bucket_id = 'avatars');

-- Owners manage their own objects in every app bucket.
drop policy if exists "Users upload own files" on storage.objects;
create policy "Users upload own files" on storage.objects
  for insert
  with check (
    bucket_id in ('avatars', 'wardrobe', 'outfits')
    and auth.uid() = owner
  );

drop policy if exists "Users read own private files" on storage.objects;
create policy "Users read own private files" on storage.objects
  for select
  using (
    bucket_id in ('wardrobe', 'outfits')
    and auth.uid() = owner
  );

drop policy if exists "Users update own files" on storage.objects;
create policy "Users update own files" on storage.objects
  for update
  using (
    bucket_id in ('avatars', 'wardrobe', 'outfits')
    and auth.uid() = owner
  )
  with check (
    bucket_id in ('avatars', 'wardrobe', 'outfits')
    and auth.uid() = owner
  );

drop policy if exists "Users delete own files" on storage.objects;
create policy "Users delete own files" on storage.objects
  for delete
  using (
    bucket_id in ('avatars', 'wardrobe', 'outfits')
    and auth.uid() = owner
  );
