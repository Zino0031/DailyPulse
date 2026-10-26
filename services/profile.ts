// Profile writes (Epic 1, issue #5) + keyless city search.
// Place search: Open-Meteo geocoding — https://open-meteo.com/en/docs/geocoding-api

import { getSupabase } from '@/services/supabase';
import type { ProfileDraft } from '@/utils/profile';

/**
 * Upserts the signed-in user's `users` row. Upsert (not update) covers the
 * rare account whose signup trigger never created the row. RLS restricts
 * writes to `auth.uid() = id`.
 */
export async function saveProfile(
  userId: string,
  email: string | null,
  draft: ProfileDraft,
  { completeOnboarding }: { completeOnboarding: boolean },
): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .upsert({
      id: userId,
      email,
      full_name: draft.fullName.trim(),
      gender: draft.gender,
      location_lat: draft.location?.latitude ?? null,
      location_lon: draft.location?.longitude ?? null,
      location_name: draft.location?.label ?? null,
      style_prefs: draft.styles,
      ...(completeOnboarding ? { onboarded_at: new Date().toISOString() } : {}),
    });
  if (error) throw error;
}

/** Marks onboarding as done without touching profile fields (Skip). */
export async function skipOnboarding(userId: string, email: string | null): Promise<void> {
  const { error } = await getSupabase()
    .from('users')
    .upsert({ id: userId, email, onboarded_at: new Date().toISOString() });
  if (error) throw error;
}

export interface PlaceResult {
  id: number;
  latitude: number;
  longitude: number;
  /** "Oran, Oran, Algeria" — name + region + country, deduplicated. */
  label: string;
  /** "Oran, Algeria" — what gets stored and shown afterwards. */
  shortLabel: string;
}

/** City search, top 5 matches. Empty array for queries under 2 chars. */
export async function searchPlaces(query: string, signal?: AbortSignal): Promise<PlaceResult[]> {
  const name = query.trim();
  if (name.length < 2) return [];
  const params = new URLSearchParams({ name, count: '5', language: 'en', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`, { signal });
  if (!res.ok) throw new Error("Couldn't search places right now.");
  const data = (await res.json()) as {
    results?: {
      id: number;
      name: string;
      latitude: number;
      longitude: number;
      admin1?: string;
      country?: string;
    }[];
  };
  return (data.results ?? []).map((r) => {
    const parts = [r.name, r.admin1, r.country].filter(
      (p, i, all): p is string => Boolean(p) && all.indexOf(p) === i,
    );
    return {
      id: r.id,
      latitude: r.latitude,
      longitude: r.longitude,
      label: parts.join(', '),
      shortLabel: [r.name, r.country].filter(Boolean).join(', '),
    };
  });
}
