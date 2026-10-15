import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GENDERS, STYLE_PREFS, type Gender, type StylePref } from '@/constants/profile';
import { saveProfile, skipOnboarding } from '@/services/profile';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import type { UserRow } from '@/types/database';
import { EMPTY_DRAFT, type ProfileDraft } from '@/utils/profile';

export { GENDERS, type Gender };

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
  | 'full_name'
  | 'email'
  | 'gender'
  | 'location_lat'
  | 'location_lon'
  | 'location_name'
  | 'style_prefs'
  | 'tier'
  | 'onboarded_at'
  | 'created_at'
>;

export const profileKeys = {
  all: ['profile'] as const,
  details: (userId: string | null) => ['profile', userId, 'details'] as const,
};

/**
 * Full `users` row for the Profile tab. Keyed by user id so a persisted or
 * in-memory cache never shows one account's details to another.
 */
export function useProfileDetails() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  return useQuery({
    queryKey: profileKeys.details(userId),
    queryFn: async (): Promise<ProfileDetails | null> => {
      const { data, error } = await getSupabase()
        .from('users')
        .select(
          'full_name, email, gender, location_lat, location_lon, location_name, style_prefs, tier, onboarded_at, created_at',
        )
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

/**
 * Saves the profile form. `completeOnboarding` stamps `onboarded_at` so the
 * auth gate stops sending the user to onboarding. Invalidates every
 * `['profile', …]` query (incl. the stylist's gender read).
 */
export function useSaveProfile() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: (vars: { draft: ProfileDraft; completeOnboarding: boolean }) => {
      if (!user) throw new Error('Sign in to save your profile.');
      return saveProfile(user.id, user.email ?? null, vars.draft, {
        completeOnboarding: vars.completeOnboarding,
      });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: profileKeys.all }),
  });
}

/** Skip onboarding for now — the Profile tab offers to finish it later. */
export function useSkipOnboarding() {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  return useMutation({
    mutationFn: () => {
      if (!user) throw new Error('Sign in to continue.');
      return skipOnboarding(user.id, user.email ?? null);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: profileKeys.all }),
  });
}

/** Profile row → form values (edit mode / resuming from the server). */
export function draftFromProfile(profile: ProfileDetails | null | undefined): ProfileDraft {
  if (!profile) return EMPTY_DRAFT;
  const styleIds: readonly string[] = STYLE_PREFS.map((s) => s.id);
  return {
    fullName: profile.full_name ?? '',
    gender: (GENDERS as readonly string[]).includes(profile.gender)
      ? (profile.gender as Gender)
      : 'prefer_not_to_say',
    location:
      profile.location_lat != null && profile.location_lon != null
        ? {
            latitude: Number(profile.location_lat),
            longitude: Number(profile.location_lon),
            label: profile.location_name,
          }
        : null,
    styles: (profile.style_prefs ?? []).filter((s): s is StylePref => styleIds.includes(s)),
  };
}
