import { useQuery } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { WardrobeItemRow } from '@/types/database';

/**
 * Read-only wardrobe feed for the composer. Epic 3 (closet CRUD) builds
 * the write side on top of this same table.
 */
export function useWardrobe() {
  return useQuery({
    queryKey: ['wardrobe-items'],
    queryFn: async (): Promise<WardrobeItemRow[]> => {
      if (!isSupabaseConfigured()) return [];
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return [];
      const { data: items, error } = await supabase
        .from('wardrobe_items')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return items;
    },
    staleTime: 2 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
