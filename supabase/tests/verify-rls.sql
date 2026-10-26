-- Issue #2 — RLS verification with two test users.
-- How to run (owner, Supabase dashboard -> SQL editor):
--   1. Create two users (Authentication -> Add user) and copy their UUIDs below.
--   2. Insert one wardrobe row per user AS SERVICE ROLE (bypasses RLS),
--      or sign in as each user in the app and upload one item.
--   3. Replace USER_A_UUID / USER_B_UUID, run each block, confirm counts.
--
-- Block 1 — act as USER A: must see ONLY user A's rows.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'USER_A_UUID', 'role', 'authenticated')::text,
  true
);
select 'wardrobe_as_A' as check_name, count(*) as row_count
from public.wardrobe_items;
-- EXPECTED: row_count = rows owned by A only (0 cross-user rows).
select 'avatars_as_A' as check_name, count(*) as row_count
from public.avatars;
select 'outfits_as_A' as check_name, count(*) as row_count
from public.outfits;
select 'users_as_A' as check_name, count(*) as row_count
from public.users;
-- EXPECTED users: 1 (own profile row only).

-- Block 2 — act as USER B: must see ONLY user B's rows.
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'USER_B_UUID', 'role', 'authenticated')::text,
  true
);
select 'wardrobe_as_B' as check_name, count(*) as row_count
from public.wardrobe_items;
select 'users_as_B' as check_name, count(*) as row_count
from public.users;
-- EXPECTED users: 1 (own profile row only).

-- Block 3 — write isolation: A cannot insert for B (must raise RLS error).
select set_config(
  'request.jwt.claims',
  json_build_object('sub', 'USER_A_UUID', 'role', 'authenticated')::text,
  true
);
insert into public.wardrobe_items (user_id, image_url, category)
values ('USER_B_UUID', 'https://example.com/should-fail.jpg', 'top');
-- EXPECTED: ERROR "new row violates row-level security policy".

-- Cleanup session override.
select set_config('request.jwt.claims', '', true);
