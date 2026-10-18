-- AI preview renders live in the private `outfits` bucket at
-- `renders/<user_id>/<uuid>.png` and are uploaded by the `render-outfit` edge
-- function with the service role. That means storage.objects.owner is NOT the
-- app user, so the generic "Users read own private files" policy
-- (owner = auth.uid()) does not match and the client cannot mint a signed URL
-- for its own render.
--
-- The client re-signs renders on read (services/renders.ts — used by the
-- Lookbook grid and the saved-outfit view, issue #50), so grant select access
-- by our path convention instead. Permissive: it only ever adds access to
-- objects whose second path segment is the caller's own id.

drop policy if exists "Users read own outfit renders" on storage.objects;
create policy "Users read own outfit renders" on storage.objects
  for select
  using (
    bucket_id = 'outfits'
    and auth.uid() is not null
    and (storage.foldername(name))[2] = auth.uid()::text
  );
