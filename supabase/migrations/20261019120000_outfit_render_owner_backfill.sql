-- Renders were originally uploaded by `render-outfit` with the service role,
-- so storage.objects.owner was the service role (not the app user). The app
-- re-signs renders on read, so those rows need either the path-based policy
-- from 20261019000000 or ownership that the generic "Users read own private
-- files" policy understands.
--
-- The edge function now uploads with the caller's JWT (owner = auth.uid()).
-- This backfill repairs objects written before that change; it only touches
-- `renders/<uuid>/...` paths whose second segment is a valid user id.

update storage.objects o
set owner = v.user_id
from (
  select
    id,
    ((storage.foldername(name))[2])::uuid as user_id
  from storage.objects
  where bucket_id = 'outfits'
    and name like 'renders/%'
    and (storage.foldername(name))[2]
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
) v
where o.id = v.id
  and o.owner is distinct from v.user_id;
