import { useQueryClient } from '@tanstack/react-query';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDominantDressCode } from '@/hooks/useCalendarEvents';
import { useProfile } from '@/hooks/useProfile';
import { subscriptionKeys, useGenerationUsage, usePlan } from '@/hooks/useSubscription';
import { useUserPreferencesStore } from '@/store/useUserPreferencesStore';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useWeather } from '@/hooks/useWeather';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { showPaywall } from '@/store/usePaywallStore';
import { LIMIT_ERRORS, usageDay } from '@/supabase/functions/_shared/tiers';
import type { WardrobeItemRow } from '@/types/database';
import {
  composeOutfits,
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
 * Cache key for the last generated look. Persisted (utils/queryCache.ts) so a
 * cold or offline launch renders today's outfit instead of a spinner.
 */
export const outfitKeys = {
  last: (userId: string | null) => ['outfit-last', userId] as const,
  /**
   * In-flight generation intent, persisted so a refresh mid-generation resumes
   * the same request id instead of spending a second generation (#44).
   */
  pending: (userId: string | null) => ['outfit-pending', userId] as const,
};

export interface LastOutfit {
  boards: OutfitBoard[];
  /** UTC day the look was generated for (`usageDay()`) — never reused tomorrow. */
  day: string;
}

/** One user intent to generate; reused across remounts until it settles. */
export interface PendingGeneration {
  requestId: string;
  /** UTC day the intent was made for (`usageDay()`). */
  day: string;
  /** Whether the original intent was a regenerate — resume must preserve it. */
  regenerate?: boolean;
  /** Tops the original intent wanted to avoid — resume must preserve it. */
  excludeTopIds?: string[];
}

/**
 * Request id for one generation intent. The server dedups on it, so it only
 * needs to be unique — not cryptographically strong. (Issue #44.)
 */
export function newRequestId(): string {
  const cryptoRef = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (typeof cryptoRef?.randomUUID === 'function') return cryptoRef.randomUUID();
  return `gen-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

/**
 * The server refused for plan reasons. Callers must NOT fall back to the
 * local composer — that would quietly bypass the tier limit.
 */
class PlanLimitError extends Error {
  constructor(
    readonly reason: 'daily_limit' | 'regenerate',
    readonly used: number | null,
  ) {
    super(reason);
  }
}

/**
 * The server still owns the intent (HTTP 202 `generation_pending`): another
 * invocation is mid-generation and hasn't recorded a result yet. We keep the
 * same request id and retry rather than falling back to the on-device composer,
 * which would hide a generation the user may already have spent (#44).
 */
class PendingError extends Error {
  constructor() {
    super('generation_pending');
  }
}

/** Retries for a still-cooking intent, and the wait between them. */
const PENDING_RETRY_MS = 700;
const PENDING_RETRY_TRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const REMOTE_TIMEOUT_MS = 25000;

interface RemoteResult {
  boards: OutfitBoard[];
  used: number | null;
}

/**
 * Remote AI pick. Returns null when the function is undeployed or
 * unreachable (the offline composer takes over); throws PlanLimitError
 * when the daily cap or the regenerate lock applies.
 */
async function composeRemote(
  ctx: OutfitContext,
  items: WardrobeItemRow[],
  excludeTopIds: string[],
  regenerate: boolean,
  count: number,
  requestId: string,
): Promise<RemoteResult | null> {
  if (!isSupabaseConfigured()) return null;
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  if (!data.session) return null;
  const call = supabase.functions.invoke<{
    outfits?: { outfitId: string; itemIds: string[]; reasoning: string[] }[];
    usage?: { used: number; limit: number | null };
    /** Present on a 202: another invocation is still generating this intent. */
    pending?: boolean;
  }>('generate-outfit', {
    body: {
      weather: { tempC: ctx.tempC, rainPct: ctx.rainPct },
      dress: ctx.dress,
      mood: ctx.mood,
      gender: ctx.gender,
      count,
      excludeTopIds,
      regenerate,
      requestId,
    },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('timeout')), REMOTE_TIMEOUT_MS);
  });
  let result: Awaited<typeof call>;
  try {
    result = await Promise.race([call, timeout]);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
  if (result.error) {
    if (result.error instanceof FunctionsHttpError) {
      const response = result.error.context as Response;
      const body = (await response.json().catch(() => null)) as {
        code?: string;
        usage?: { used?: number };
      } | null;
      if (response.status === 429 || body?.code === LIMIT_ERRORS.dailyLimit) {
        throw new PlanLimitError('daily_limit', body?.usage?.used ?? null);
      }
      if (body?.code === LIMIT_ERRORS.regenerateLocked) {
        throw new PlanLimitError('regenerate', null);
      }
    }
    return null;
  }
  const picks = result.data;
  // A 202 (`generation_pending`) is not a failure: the caller retries the same
  // id instead of treating it as an unreachable function.
  if (picks?.pending) throw new PendingError();
  if (!picks?.outfits?.length) return null;
  const byId = new Map(items.map((i) => [i.id, i]));
  const boards: OutfitBoard[] = [];
  for (const pick of picks.outfits) {
    const [top, bottom, shoes, ...rest] = pick.itemIds
      .map((id) => byId.get(id))
      .filter((i): i is WardrobeItemRow => Boolean(i));
    if (!top || !bottom || !shoes) continue;
    boards.push({
      key: `ai-${pick.outfitId}`,
      top,
      bottom,
      shoes,
      outerwear: rest.find((i) => i.category === 'outerwear') ?? null,
      accessory: rest.find((i) => i.category === 'accessory') ?? null,
      score: 0,
      reasons: pick.reasoning.slice(0, 4),
      source: 'ai',
      outfitId: pick.outfitId,
    });
  }
  if (boards.length === 0) return null;
  return { used: picks.usage?.used ?? null, boards };
}

/**
 * In-flight generations keyed by request id. A remount (refresh, StrictMode
 * double-effect) that resumes the same intent joins the running call instead
 * of firing a second one — the server dedups too, but there is no reason to
 * send it twice. (Issue #44.)
 */
const inflightGenerations = new Map<string, Promise<RemoteResult | null>>();

function remoteCompose(
  ctx: OutfitContext,
  items: WardrobeItemRow[],
  excludeTopIds: string[],
  regenerate: boolean,
  count: number,
  requestId: string,
): Promise<RemoteResult | null> {
  const existing = inflightGenerations.get(requestId);
  if (existing) return existing;
  const run = composeRemote(ctx, items, excludeTopIds, regenerate, count, requestId).finally(() => {
    inflightGenerations.delete(requestId);
  });
  inflightGenerations.set(requestId, run);
  return run;
}

/** Weather + calendar + mood + wearer — what the stylist and renders use. */
export function useOutfitContext(): OutfitContext {
  const { data: weather } = useWeather();
  const mood = useUserPreferencesStore((s) => s.mood) ?? 'neutral';
  const dress = useDominantDressCode() ?? 'casual';
  const { data: profile } = useProfile();
  return useMemo(
    () => ({
      tempC: weather?.current.temperatureC ?? 20,
      rainPct: weather?.today.precipitationProbabilityMaxPct ?? 0,
      dress,
      mood,
      gender: profile?.gender ?? 'prefer_not_to_say',
    }),
    [weather, dress, mood, profile],
  );
}

/** Deletes a saved outfit row (the read-only saved view's "Remove"). */
export function useRemoveOutfit() {
  const [removing, setRemoving] = useState(false);
  async function remove(outfitId: string): Promise<void> {
    if (!isSupabaseConfigured()) return;
    setRemoving(true);
    try {
      await getSupabase().from('outfits').delete().eq('id', outfitId);
    } finally {
      setRemoving(false);
    }
  }
  return { remove, removing };
}

/** Why Regenerate can't run right now; null = it can. */
export type RegenerateLock = 'plan' | 'limit' | null;

/**
 * Generate → preview → save/unsave → regenerate flow for the outfit route.
 * AI edge function first (#14), on-device composer as fallback — screen
 * code doesn't care which produced the boards. Plan limits (#17) come from
 * the server; hitting one opens the paywall instead of failing silently.
 */
export function useOutfit() {
  const {
    data: items = [],
    isLoading: wardrobeLoading,
    isError: wardrobeError,
    refetch: retryLoad,
  } = useWardrobe();
  const ctx = useOutfitContext();
  const { plan } = usePlan();
  const usage = useGenerationUsage();
  const queryClient = useQueryClient();
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const lastKey = outfitKeys.last(userId);
  // Restored synchronously: PersistQueryClientProvider rehydrates before the
  // tree mounts, so a cold/offline launch finds today's look already cached.
  const [restored] = useState<LastOutfit | null>(
    () => queryClient.getQueryData<LastOutfit>(lastKey) ?? null,
  );
  const { remove, removing } = useRemoveOutfit();

  // A generation the previous mount started but never saw finish (refresh
  // mid-flight). Resuming the same request id lets the server replay it
  // instead of charging again. (Issue #44.)
  const pendingKey = outfitKeys.pending(userId);
  const [restoredPending] = useState<PendingGeneration | null>(
    () => queryClient.getQueryData<PendingGeneration>(pendingKey) ?? null,
  );
  // One request id per intent: reused across remounts, minted anew on an
  // explicit regenerate.
  const requestIdRef = useRef<string>(
    restoredPending && restoredPending.day === usageDay()
      ? restoredPending.requestId
      : newRequestId(),
  );
  // The request id whose result has already been applied. Re-runs mid-flight
  // (items change, StrictMode, a usage refetch) must re-join the in-flight call
  // rather than bail out — bailing was a stuck-spinner bug, and re-joining lets
  // a second mount pick up the result (#44).
  const settledRef = useRef<string | null>(null);

  const [runId, setRunId] = useState(0);
  // Bumped by "Check again" — re-runs the effect without the regenerate
  // semantics that `runId` carries.
  const [retryToken, setRetryToken] = useState(0);
  // A restored AI look for today is shown as-is — no auto-regeneration, so a
  // cold/offline open is instant and costs no AI generation. On-device boards
  // are free to recompose, so only AI picks opt out of generating.
  const restoredIsAi =
    restored !== null && restored.boards.some((b) => b.source === 'ai');
  const showRestored =
    runId === 0 && restored !== null && restored.day === usageDay() && restoredIsAi;
  const [stage, setStage] = useState(0);
  const [blocked, setBlocked] = useState<PlanLimitError['reason'] | null>(null);
  const [saved, setSaved] = useState<SavedOutfit | null>(null);
  const [saving, setSaving] = useState(false);
  const [boards, setBoards] = useState<OutfitBoard[]>(
    showRestored && restored ? restored.boards : [],
  );
  const [boardsPending, setBoardsPending] = useState(!showRestored);
  // The server still owns the intent (202) — show a "still styling" card with a
  // Check again action instead of a silent on-device look (#44).
  const [stillPending, setStillPending] = useState(false);
  // Resuming a persisted intent — the loading copy says so, so a refresh
  // doesn't read as a brand-new (billable) generation.
  const [resuming, setResuming] = useState(
    restoredPending !== null && restoredPending.day === usageDay(),
  );
  const seenTops = useRef<string[]>([]);
  // Read inside the generation effect without re-running it on every
  // usage refetch (a finished generation must not trigger another).
  const atLimitRef = useRef(usage.atLimit);
  atLimitRef.current = usage.atLimit;

  const setUsed = (used: number | null) => {
    const key = subscriptionKeys.usage(userId, usageDay());
    if (used === null) void queryClient.invalidateQueries({ queryKey: key });
    else queryClient.setQueryData<number>(key, used);
  };

  /** Persist the last AI-styled look so the next launch renders it before the network. */
  function rememberOutfit(next: OutfitBoard[]) {
    const ai = next.filter((b) => b.source === 'ai');
    if (ai.length === 0) return; // on-device boards recompose for free
    queryClient.setQueryData<LastOutfit>(lastKey, { boards: ai, day: usageDay() });
  }

  /** Persist the intent BEFORE the call so a refresh can resume it (#44). */
  function rememberPending(requestId: string, regenerate: boolean, excludeTopIds: string[]) {
    queryClient.setQueryData<PendingGeneration>(pendingKey, {
      requestId,
      day: usageDay(),
      regenerate,
      excludeTopIds,
    });
  }

  /** The intent settled (succeeded, or refused) — nothing left to resume. */
  function clearPending() {
    queryClient.removeQueries({ queryKey: pendingKey });
  }

  // Staged progress UI with a minimum dwell per stage (NFR feel target).
  useEffect(() => {
    if (showRestored) {
      setStage(GENERATION_STAGES.length - 1);
      return;
    }
    setStage(0);
    if (wardrobeLoading) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i < GENERATION_STAGES.length; i++) {
      timers.push(setTimeout(() => setStage(i), i * MIN_STAGE_MS));
    }
    return () => timers.forEach(clearTimeout);
  }, [runId, wardrobeLoading, showRestored]);

  // AI first, local composer as fallback. Runs per generation; the staged
  // progress UI keeps covering while either path resolves.
  useEffect(() => {
    if (showRestored) {
      setBoards(restored ? restored.boards : []);
      setBoardsPending(false);
      return;
    }
    if (wardrobeLoading || items.length === 0) {
      setBoards([]);
      setBoardsPending(wardrobeLoading);
      return;
    }
    // Wait for today's usage so a capped user isn't sent to the server.
    if (usage.isLoading) {
      setBoardsPending(true);
      return;
    }
    if (atLimitRef.current) {
      setBlocked('daily_limit');
      if (runId === 0) setBoards([]);
      setBoardsPending(false);
      return;
    }
    // One intent = one request. A re-run mid-flight (items change, StrictMode
    // double-effect, a usage refetch) re-joins the in-flight call rather than
    // bailing — bailing left the spinner stuck, because the first run's cleanup
    // had already cancelled its `finally` (#44). We only stop once it settles.
    if (settledRef.current === requestIdRef.current) return;
    const requestId = requestIdRef.current;
    // A resumed intent keeps its original regenerate / exclude semantics.
    const resumingIntent =
      restoredPending !== null &&
      restoredPending.day === usageDay() &&
      restoredPending.requestId === requestId;
    const regenerate = resumingIntent ? Boolean(restoredPending?.regenerate) : runId > 0;
    const excludeTopIds = resumingIntent
      ? (restoredPending?.excludeTopIds ?? [])
      : seenTops.current;
    rememberPending(requestId, regenerate, excludeTopIds);
    let cancelled = false;
    setStillPending(false);
    setBoardsPending(true);
    const maxBoards = plan.outfitOptions;
    (async () => {
      try {
        let remote: RemoteResult | null = null;
        for (let attempt = 0; ; attempt++) {
          try {
            remote = await remoteCompose(
              ctx,
              items,
              excludeTopIds,
              regenerate,
              maxBoards,
              requestId,
            );
            break;
          } catch (err) {
            if (cancelled) return;
            // Still cooking: retry the same id a couple of times before
            // surfacing the "still styling" card.
            if (err instanceof PendingError && attempt < PENDING_RETRY_TRIES) {
              await sleep(PENDING_RETRY_MS);
              if (cancelled) return;
              continue;
            }
            throw err;
          }
        }
        if (cancelled) return;
        if (remote && remote.boards.length > 0) {
          settledRef.current = requestId;
          setResuming(false);
          seenTops.current = [...seenTops.current, remote.boards[0].top.id].slice(-6);
          const next = remote.boards.slice(0, maxBoards);
          setBoards(next);
          rememberOutfit(next);
          setUsed(remote.used);
          clearPending();
        } else {
          // Unreachable function: no spend to protect, but keep the intent so a
          // later mount retries rather than silently downgrading to on-device.
          const next = composeOutfits(items, ctx, runId).slice(0, maxBoards);
          setBoards(next);
          rememberOutfit(next);
          // The meter may disagree with the screen after any side-effect-free
          // path — re-read the truth instead of assuming no spend landed.
          setUsed(null);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof PendingError) {
          // Still cooking after retries: keep the intent and say so, rather
          // than showing an on-device look the user may have paid for.
          setStillPending(true);
          setResuming(false);
          setUsed(null);
        } else if (e instanceof PlanLimitError) {
          // Refused, so the intent is settled — nothing was spent to resume.
          settledRef.current = requestId;
          setResuming(false);
          clearPending();
          setBlocked(e.reason);
          if (e.reason === 'daily_limit') {
            setUsed(e.used);
            // A first run has nothing to show; a refused regenerate keeps
            // the current look on screen.
            if (runId === 0) setBoards([]);
          }
        } else {
          // Unknown failure: a spend may have landed without a response. Keep
          // the intent so a remount replays it (0 extra spend) instead of
          // charging again for a look the user never saw (#44).
          const next = composeOutfits(items, ctx, runId).slice(0, maxBoards);
          setBoards(next);
          rememberOutfit(next);
          setUsed(null);
        }
      } finally {
        if (!cancelled) setBoardsPending(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId, retryToken, wardrobeLoading, items.length, usage.isLoading, showRestored, restored]);

  // Paywall triggers on cap (issue #17) — once per refusal.
  useEffect(() => {
    if (blocked) showPaywall(blocked);
  }, [blocked]);

  const generating =
    !showRestored &&
    (wardrobeLoading || boardsPending || stage < GENERATION_STAGES.length - 1);
  const emptyCloset = !wardrobeLoading && items.length === 0;
  const capped = blocked === 'daily_limit' && boards.length === 0;
  const regenerateLock: RegenerateLock = !plan.canRegenerate
    ? 'plan'
    : usage.atLimit
      ? 'limit'
      : null;

  async function save(board: OutfitBoard): Promise<string | null> {
    if (!isSupabaseConfigured()) return null;
    setSaving(true);
    try {
      const supabase = getSupabase();
      // AI picks already have a row — flip it instead of duplicating it.
      if (board.outfitId) {
        const { error } = await supabase
          .from('outfits')
          .update({ is_saved: true })
          .eq('id', board.outfitId);
        if (error) return null;
        setSaved({ id: board.outfitId, isSaved: true });
        return board.outfitId;
      }
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
    // A generated row stays (it's the AI pick on screen) — only unflag it.
    if (!boards.some((b) => b.outfitId === outfitId)) {
      await remove(outfitId);
      setSaved(null);
      return;
    }
    setSaving(true);
    try {
      await getSupabase().from('outfits').update({ is_saved: false }).eq('id', outfitId);
      setSaved(null);
    } finally {
      setSaving(false);
    }
  }

  function regenerate() {
    if (regenerateLock) {
      showPaywall(regenerateLock === 'plan' ? 'regenerate' : 'daily_limit');
      return;
    }
    setSaved(null);
    setBlocked(null);
    setStillPending(false);
    setResuming(false);
    // A pending intent still owns a generation — replay it before spending a
    // new one, so Regenerate never abandons a look the user may have paid for.
    const pending = queryClient.getQueryData<PendingGeneration>(pendingKey);
    if (pending && pending.day === usageDay()) {
      requestIdRef.current = pending.requestId;
      settledRef.current = null;
      setRetryToken((n) => n + 1);
      return;
    }
    // A regenerate is a new intent: mint a fresh id so the server generates
    // instead of replaying the previous request (#44).
    requestIdRef.current = newRequestId();
    settledRef.current = null;
    setRunId((n) => n + 1);
  }

  /** Re-check a still-cooking intent by resending the same request id. */
  function checkAgain() {
    setStillPending(false);
    setRetryToken((n) => n + 1);
  }

  return {
    boards,
    generating,
    stage: GENERATION_STAGES[Math.min(stage, GENERATION_STAGES.length - 1)],
    /** True while picking up a persisted in-flight intent after a refresh. */
    resuming,
    /** True when the server still owns the intent (202) — offer Check again. */
    stillPending,
    checkAgain,
    emptyCloset,
    wardrobeError,
    retryLoad,
    capped,
    usage,
    plan,
    regenerateLock,
    saved,
    saving: saving || removing,
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
