import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useAuthStore } from '@/store/useAuthStore';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import { isRemoteUrl } from '@/services/closet';
import { resolveRenderUrls } from '@/services/renders';
import { lookbookKeys } from '@/utils/queryKeys';

export { lookbookKeys };

export interface LookbookEntry {
  id: string;
  createdAt: string;
  mood: string | null;
  dressCode: string | null;
  /** Prefer rendered AI preview, else first item photo. */
  thumbnailUrl: string | null;
  /** Storage path for expo-image cacheKey (stable across signatures). */
  thumbnailKey: string | null;
  itemCount: number;
}

/**
 * Saved outfits (`is_saved`), newest first. Thumbnails resolve through the
 * private buckets exactly like the closet grid. persists across restarts
 * via Supabase (server truth) + TanStack Query cache.
 */
export function useLookbookEntries() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: lookbookKeys.entries(userId),
    queryFn: async (): Promise<LookbookEntry[]> => {
      if (!isSupabaseConfigured() || !userId) return [];
      const supabase = getSupabase();
      const { data: rows, error } = await supabase
        .from('outfits')
        .select('id,created_at,mood,event_summary,rendered_image_url,item_ids')
        .eq('user_id', userId)
        .eq('is_saved', true)
        .order('created_at', { ascending: false });
      if (error) throw error;
      if (!rows.length) return [];

      const itemIds = [...new Set(rows.flatMap((r) => r.item_ids ?? []))];
      let photos = new Map<string, string | null>();
      if (itemIds.length > 0) {
        const { data: items } = await supabase
          .from('wardrobe_items')
          .select('id,image_url')
          .in('id', itemIds);
        const paths = (items ?? [])
          .map((i) => i.image_url)
          .filter((p) => !isRemoteUrl(p));
        const signed = new Map<string, string>();
        if (paths.length > 0) {
          const { data: urls } = await supabase.storage
            .from('wardrobe')
            .createSignedUrls(paths, 60 * 60 * 24 * 7);
          for (const u of urls ?? []) {
            if (u.path && u.signedUrl) signed.set(u.path, u.signedUrl);
          }
        }
        photos = new Map(
          (items ?? []).map((i) => [
            i.id,
            isRemoteUrl(i.image_url)
              ? i.image_url
              : (signed.get(i.image_url) ?? null),
          ]),
        );
      }

      const renderUrls = await resolveRenderUrls(
        rows.map((r) => r.rendered_image_url),
      );

      return rows.map((row) => {
        const firstPhoto =
          row.item_ids?.map((id: string) => photos.get(id)).find(Boolean) ?? null;
        const render = row.rendered_image_url
          ? (renderUrls.get(row.rendered_image_url) ?? null)
          : null;
        return {
          id: row.id,
          createdAt: row.created_at,
          mood: row.mood,
          dressCode: row.event_summary,
          thumbnailUrl: render ?? firstPhoto,
          thumbnailKey: row.rendered_image_url ?? row.item_ids?.[0] ?? row.id,
          itemCount: row.item_ids?.length ?? 0,
        };
      });
    },
    enabled: isSupabaseConfigured() && userId !== null,
    staleTime: 2 * 60 * 1000,
    retry: 1,
  });
}

/** Delete a saved look (issue #16 acceptance). Invalidates the grid. */
export function useDeleteLookbookEntry() {
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useMutation({
    mutationFn: async (outfitId: string): Promise<void> => {
      const { error } = await getSupabase()
        .from('outfits')
        .delete()
        .eq('id', outfitId);
      if (error) throw error;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: lookbookKeys.entries(userId) }),
  });
}
