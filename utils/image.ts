import { Image } from 'expo-image';

/**
 * Warm expo-image's cache for images the user is about to see (PRD §4).
 *
 * Only *stable* URLs are worth prefetching: `prefetch()` keys the cache by the
 * URL, matching an `<Image>` that has no custom `cacheKey`. Private wardrobe
 * photos deliberately render with `cacheKey = <storage path>` so their rotating
 * signed URLs never re-download (see components/closet/ClosetItemCard.tsx) —
 * prefetching those would seed a second, useless entry. Callers therefore pass
 * only permanent URLs: public avatars, saved AI renders, remote item photos.
 */
export function prefetchImages(
  urls: Iterable<string | null | undefined>,
  cachePolicy: 'disk' | 'memory' | 'memory-disk' = 'memory-disk',
): void {
  const unique = [...new Set(urls)].filter((u): u is string => Boolean(u));
  if (unique.length === 0) return;
  // Fire-and-forget: a failed prefetch is a missed optimisation, never an error.
  void Image.prefetch(unique, cachePolicy).catch(() => undefined);
}
