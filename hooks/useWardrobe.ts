import { useClosetItems } from '@/hooks/useCloset';

/**
 * Read-only wardrobe feed for the composer. Shares the Closet tab's query
 * (one fetch, one offline cache), so adding, editing or deleting an item in
 * the closet is reflected in outfit suggestions right away. Items carry a
 * signed `imageUri` — `image_url` is a private storage path.
 */
export function useWardrobe() {
  return useClosetItems();
}
