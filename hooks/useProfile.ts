import { useQuery } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/services/supabase';

export const GENDERS = [
  'female',
  'male',
  'nonbinary',
  'prefer_not_to_say',
] as const;

export type Gender = (typeof GENDERS)[number];

/**
 * Minimal profile read (gender for the stylist). Epic 1 owns the write
 * side — the onboarding form must save users.gender from this catalogue.
 */
export function useProfile() {
  return useQuery({
    queryKey: ['profile'],
    queryFn: async (): Promise<{ gender: Gender }> => {
      if (!isSupabaseConfigured()) return { gender: 'prefer_not_to_say' };
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return { gender: 'prefer_not_to_say' };
      const { data: row } = await supabase
        .from('users')
        .select('gender')
        .eq('id', user.id)
        .maybeSingle();
      const gender = (row as { gender?: string } | null)?.gender;
      return {
        gender: (GENDERS as readonly string[]).includes(gender ?? '')
          ? (gender as Gender)
          : 'prefer_not_to_say',
      };
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });
}
