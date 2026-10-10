import { useEffect, useMemo, useState } from 'react';

import { useDominantDressCode } from '@/hooks/useCalendarEvents';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useWeather } from '@/hooks/useWeather';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import {
  checkAllowance,
  composeOutfits,
  type Allowance,
  type OutfitBoard,
  type OutfitContext,
} from '@/services/outfit';

export const GENERATION_STAGES = [
  'Reading the sky',
  'Checking your calendar',
  'Scoring your wardrobe',
  'Styling the boards',
] as const;

const MIN_STAGE_MS = 450;

export interface SavedOutfit {
  id: string;
  isSaved: boolean;
}

/**
 * Generate → preview → save/unsave → regenerate flow for the outfit route.
 * Local composer now; the generate-outfit edge function (#14) slots into
 * runGeneration() when it lands — screen code doesn't change.
 */
export function useOutfit() {
  const {
    data: items = [],
    isLoading: wardrobeLoading,
    isError: wardrobeError,
    refetch: retryLoad,
  } = useWardrobe();
  const { data: weather } = useWeather();
  const mood = useUserPreferencesStore((s) => s.mood) ?? 'neutral';
  const dress = useDominantDressCode() ?? 'casual';

  const [runId, setRunId] = useState(0);
  const [stage, setStage] = useState(0);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [saved, setSaved] = useState<SavedOutfit | null>(null);
  const [saving, setSaving] = useState(false);

  const ctx: OutfitContext = useMemo(
    () => ({
      tempC: weather?.current.temperatureC ?? 20,
      rainPct: weather?.today.precipitationProbabilityMaxPct ?? 0,
      dress,
      mood,
    }),
    [weather, dress, mood],
  );

  // Staged progress UI with a minimum dwell per stage (NFR feel target).
  useEffect(() => {
    setStage(0);
    if (wardrobeLoading) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < GENERATION_STAGES.length; i++) {
      timers.push(setTimeout(() => setStage(i), i * MIN_STAGE_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [runId, wardrobeLoading]);

  useEffect(() => {
    checkAllowance().then(setAllowance);
  }, [runId]);

  const boards: OutfitBoard[] = useMemo(() => {
    if (wardrobeLoading || items.length === 0) return [];
    return composeOutfits(items, ctx, runId);
  }, [wardrobeLoading, items, ctx, runId]);

  const generating = wardrobeLoading || stage < GENERATION_STAGES.length - 1;
  const emptyCloset = !wardrobeLoading && items.length === 0;
  const capped = allowance !== null && !allowance.allowed;

  async function save(board: OutfitBoard): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    setSaving(true);
    try {
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: row, error } = await supabase
        .from('outfits')
        .insert({
          user_id: user.id,
          item_ids: [
            board.top.id,
            board.bottom.id,
            board.shoes.id,
            ...(board.outerwear ? [board.outerwear.id] : []),
            ...(board.accessory ? [board.accessory.id] : []),
          ],
          weather_summary: {
            tempC: ctx.tempC,
            rainPct: ctx.rainPct,
          } as Record<string, unknown>,
          mood: ctx.mood,
          event_summary: ctx.dress,
          is_saved: true,
        })
        .select('id')
        .single();
      if (error || !row) return null;
      setSaved({ id: row.id, isSaved: true });
      return row.id;
    } finally {
      setSaving(false);
    }
  }

  async function unsave(outfitId: string): Promise<void> {
    if (!isSupabaseConfigured()) {
      setSaved(null);
      return;
    }
    setSaving(true);
    try {
      const supabase = getSupabase();
      await supabase.from('outfits').delete().eq('id', outfitId);
      setSaved(null);
    } finally {
      setSaving(false);
    }
  }

  function regenerate() {
    setSaved(null);
    setRunId((n) => n + 1);
  }

  return {
    boards,
    generating,
    stage: GENERATION_STAGES[Math.min(stage, GENERATION_STAGES.length - 1)],
    emptyCloset,
    wardrobeError,
    retryLoad,
    capped,
    allowance,
    saved,
    saving,
    save,
    unsave,
    regenerate,
    ctx,
  };
}

/** Load a previously saved outfit row + its items for read-only viewing. */
export function useSavedOutfit(id: string | undefined) {
  const [board, setBoard] = useState<OutfitBoard | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!id || id === 'new' || !isSupabaseConfigured()) {
        if (mounted) setIsLoading(false);
        return;
      }
      try {
        const supabase = getSupabase();
        const { data: row, error } = await supabase
          .from('outfits')
          .select('*')
          .eq('id', id)
          .maybeSingle();
        if (error || !row) throw new Error('not found');
        const { data: found } = await supabase
          .from('wardrobe_items')
          .select('*')
          .in('id', row.item_ids);
        const byId = new Map((found ?? []).map((i) => [i.id, i]));
        const [topId, bottomId, shoesId, ...rest] = row.item_ids;
        const top = byId.get(topId);
        const bottom = byId.get(bottomId);
        const shoes = byId.get(shoesId);
        if (!top || !bottom || !shoes) throw new Error('items missing');
        if (mounted) {
          setBoard({
            key: row.id,
            top,
            bottom,
            shoes,
            outerwear: rest.map((rid) => byId.get(rid)).find((i) => i?.category === 'outerwear') ?? null,
            accessory: rest.map((rid) => byId.get(rid)).find((i) => i?.category === 'accessory') ?? null,
            score: 0,
            reasons: [
              row.event_summary ? `${row.event_summary} dress code` : 'Saved look',
              ...(row.mood ? [`${row.mood} mood`] : []),
            ],
          });
        }
      } catch {
        if (mounted) setIsError(true);
      } finally {
        if (mounted) setIsLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  return { board, isLoading, isError };
}
