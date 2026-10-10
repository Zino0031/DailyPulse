import { useEffect, useMemo, useRef, useState } from 'react';

import { useDominantDressCode } from '@/hooks/useCalendarEvents';
import { useProfile } from '@/hooks/useProfile';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useWeather } from '@/hooks/useWeather';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { WardrobeItemRow } from '@/types/database';
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
 * Remote AI pick with local fallback. Returns null when the function is
 * undeployed/unreachable (offline preview keeps working); throws CAPPED
 * when the server enforces the daily tier limit — callers must NOT fall
 * back to local compose in that case.
 */
const CAPPED = Symbol('capped');
const REMOTE_TIMEOUT_MS = 25000;

async function remoteCompose(
  ctx: OutfitContext,
  items: WardrobeItemRow[],
  excludeTopIds: string[],
): Promise<OutfitBoard[] | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const call = supabase.functions.invoke<{
    outfitId: string;
    itemIds: string[];
    reasoning: string[];
    capped?: boolean;
  }>('generate-outfit', {
    body: {
      weather: { tempC: ctx.tempC, rainPct: ctx.rainPct },
      dress: ctx.dress,
      mood: ctx.mood,
      gender: ctx.gender,
      excludeTopIds,
    },
  });
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('timeout')), REMOTE_TIMEOUT_MS),
  );
  let result: Awaited<typeof call>;
  try {
    result = await Promise.race([call, timeout]);
  } catch {
    return null;
  }
  if (result.error) {
    const status = (result.error as { status?: number }).status;
    if (status === 429 || result.data?.capped) throw CAPPED;
    return null;
  }
  const picks = result.data;
  if (!picks?.itemIds?.length) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const [top, bottom, shoes, ...rest] = picks.itemIds
    .map((id) => byId.get(id))
    .filter((i): i is WardrobeItemRow => Boolean(i));
  if (!top || !bottom || !shoes) return null;
  return [
    {
      key: `ai-${picks.outfitId}`,
      top,
      bottom,
      shoes,
      outerwear:
        rest.find((i) => i.category === 'outerwear') ?? null,
      accessory:
        rest.find((i) => i.category === 'accessory') ?? null,
      score: 0,
      reasons: picks.reasoning.slice(0, 4),
      source: 'ai',
    },
  ];
}

/**
 * Generate → preview → save/unsave → regenerate flow for the outfit route.
 * AI edge function first (#14), on-device composer as fallback — screen
 * code doesn't care which produced the boards.
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
  const { data: profile } = useProfile();

  const [runId, setRunId] = useState(0);
  const [stage, setStage] = useState(0);
  const [allowance, setAllowance] = useState<Allowance | null>(null);
  const [saved, setSaved] = useState<SavedOutfit | null>(null);
  const [saving, setSaving] = useState(false);
  const [boards, setBoards] = useState<OutfitBoard[]>([]);
  const [boardsPending, setBoardsPending] = useState(true);
  const seenTops = useRef<string[]>([]);

  const ctx: OutfitContext = useMemo(
    () => ({
      tempC: weather?.current.temperatureC ?? 20,
      rainPct: weather?.today.precipitationProbabilityMaxPct ?? 0,
      dress,
      mood,
      gender: profile?.gender ?? 'prefer_not_to_say',
    }),
    [weather, dress, mood, profile],
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

  // AI first, local composer as fallback. Runs per generation; the staged
  // progress UI keeps covering while either path resolves.
  useEffect(() => {
    if (wardrobeLoading || items.length === 0) {
      setBoards([]);
      setBoardsPending(wardrobeLoading);
      return;
    }
    let cancelled = false;
    setBoardsPending(true);
    (async () => {
      try {
        const remote = await remoteCompose(ctx, items, seenTops.current);
        if (cancelled) return;
        if (remote && remote.length > 0) {
          seenTops.current = [...seenTops.current, remote[0].top.id].slice(-6);
          setBoards(remote);
        } else {
          setBoards(composeOutfits(items, ctx, runId));
        }
      } catch (e) {
        if (cancelled) return;
        if (e === CAPPED) {
          setAllowance((prev) =>
            prev ? { ...prev, allowed: false, remaining: 0 } : prev,
          );
          setBoards([]);
        } else {
          setBoards(composeOutfits(items, ctx, runId));
        }
      } finally {
        if (!cancelled) setBoardsPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, wardrobeLoading, items.length]);

  const generating =
    wardrobeLoading || boardsPending || stage < GENERATION_STAGES.length - 1;
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
            source: 'local',
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
