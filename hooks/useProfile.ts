import { useQuery } from '@tanstack/react-query';

import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import type { UserRow } from '@/types/database';

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

export type ProfileDetails = Pick<
  UserRow,
  'full_name' | 'email' | 'gender' | 'location_lat' | 'location_lon' | 'tier' | 'created_at'
>;

/**
 * Full `users` row for the Profile tab. Keyed by user id so a persisted or
 * in-memory cache never shows one account's details to another.
 */
export function useProfileDetails() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: ['profile', userId, 'details'],
    queryFn: async (): Promise<ProfileDetails | null> => {
      const { data, error } = await getSupabase()
        .from('users')
        .select('full_name, email, gender, location_lat, location_lon, tier, created_at')
        .eq('id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data as ProfileDetails | null;
    },
    enabled: userId !== null && isSupabaseConfigured(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
