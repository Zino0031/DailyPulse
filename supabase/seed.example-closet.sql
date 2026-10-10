-- Example closet seed for testing the outfit composer (issue #15).
-- Run in: Supabase Dashboard → SQL Editor → New query.
--
-- Steps:
--   1. Authentication → Users → copy the tester's UUID.
--   2. Replace TESTER_UUID below with it (keep the quotes).
--   3. Run. Re-run safely (deletes that user's old seeded rows first).
-- Photos are picsum placeholders; metadata is realistic for the composer.

-- delete previous seed for this user (idempotent re-runs)
delete from public.wardrobe_items
where user_id = 'TESTER_UUID'
  and image_url like 'https://picsum.photos/seed/%';

insert into public.wardrobe_items (user_id, image_url, category, colors, formality, season)
values
  -- tops
  ('TESTER_UUID', 'https://picsum.photos/seed/white-tee/600/800', 'top', '{white}', 'casual', '{summer,spring}'),
  ('TESTER_UUID', 'https://picsum.photos/seed/navy-shirt/600/800', 'top', '{navy,blue}', 'business', '{spring,autumn}'),
  ('TESTER_UUID', 'https://picsum.photos/seed/beige-sweater/600/800', 'top', '{beige,cream}', 'casual', '{autumn,winter}'),
  -- bottoms
  ('TESTER_UUID', 'https://picsum.photos/seed/blue-jeans/600/800', 'bottom', '{blue}', 'casual', '{spring,summer,autumn}'),
  ('TESTER_UUID', 'https://picsum.photos/seed/black-trousers/600/800', 'bottom', '{black}', 'formal', '{autumn,winter,spring}'),
  -- shoes
  ('TESTER_UUID', 'https://picsum.photos/seed/white-sneakers/600/800', 'shoes', '{white}', 'casual', '{spring,summer}'),
  ('TESTER_UUID', 'https://picsum.photos/seed/brown-loafers/600/800', 'shoes', '{brown}', 'business', '{spring,autumn}'),
  -- outerwear
  ('TESTER_UUID', 'https://picsum.photos/seed/trench-coat/600/800', 'outerwear', '{beige}', 'business', '{autumn,spring}'),
  -- accessory
  ('TESTER_UUID', 'https://picsum.photos/seed/sunglasses/600/800', 'accessory', '{black}', 'casual', '{summer}');

-- verify
select category, count(*) from public.wardrobe_items
where user_id = 'TESTER_UUID' group by category order by category;
