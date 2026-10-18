// AI preview render storage (issue #50).
//
// `render-outfit` uploads to the private `outfits` bucket under
// `renders/<user_id>/<uuid>.png` and stores that **path** in
// `outfits.rendered_image_url`. Reading it back needs a fresh signed URL —
// minting one per fetch (like wardrobe photos) means thumbnails never die
// when the 7-day signature expires. Rows written before #50 may still hold a
// full signed URL; those are used as-is.
import { isRemoteUrl } from '@/supabase/functions/_shared/wardrobeTags';

import { getSupabase } from '@/services/supabase';

/** Private bucket that holds AI preview renders. */
export const RENDER_BUCKET = 'outfits';
const SIGNED_URL_TTL_S = 60 * 60 * 24 * 7;

/**
 * Resolve stored render values to displayable URLs. Returns a map keyed by
 * the stored value so a row can look up its own URL. Legacy signed URLs map
 * to themselves. Signing failures are swallowed — a missing thumbnail falls
 * back to the first item photo instead of breaking the screen.
 */
export async function resolveRenderUrls(
  stored: Iterable<string | null | undefined>,
): Promise<Map<string, string>> {
  const values = [...new Set([...stored].filter((v): v is string => Boolean(v)))];
  const resolved = new Map<string, string>();
  const paths: string[] = [];
  for (const value of values) {
    if (isRemoteUrl(value)) resolved.set(value, value);
    else paths.push(value);
  }
  if (paths.length === 0) return resolved;
  const { data } = await getSupabase()
    .storage.from(RENDER_BUCKET)
    .createSignedUrls(paths, SIGNED_URL_TTL_S);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) resolved.set(entry.path, entry.signedUrl);
  }
  return resolved;
}
