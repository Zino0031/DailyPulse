import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { usePlan } from '@/hooks/useSubscription';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { LIMIT_ERRORS, type RenderQuality } from '@/supabase/functions/_shared/tiers';
import { lookbookKeys, savedOutfitKeys } from '@/utils/queryKeys';
import { FunctionsHttpError } from '@supabase/supabase-js';

function seedFromKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
}

const REMOTE_TIMEOUT_MS = 60000;

/**
 * Persist an on-device board as an unsaved draft so its preview render has a
 * row to attach to (issue #50). AI boards already have a row and never reach
 * here. The row is invisible in the Lookbook until Save flips `is_saved`.
 */
async function createDraftOutfit(
  userId: string,
  board: OutfitBoard,
  ctx: OutfitContext,
): Promise<string | null> {
  const { data, error } = await getSupabase()
    .from('outfits')
    .insert({
      user_id: userId,
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
      is_saved: false,
    })
    .select('id')
    .single();
  if (error || !data) return null;
  return data.id;
}

/**
 * Manual AI render for a board — runs ONLY when generate() is called
 * (button tap), never on option switches, to protect render quota.
 *
 * Cloudflare (`render-outfit`) is the only engine: there is no client-side
 * fallback URL (issue #45). When the server refuses for budget reasons the
 * hook flags `previewCapped`; any other failure flags `unavailable`. Either
 * way `url` stays null so the card can offer the upgrade path instead of a
 * substituted image.
 *
 * The render is persisted against the outfit row (issue #50): `outfitId` is
 * sent so a re-opened look shows the saved image without a second preview.
 * On-device boards get a draft row on first preview, and its id is surfaced
 * through `outfitId`/`onPersisted` so Save reuses it instead of inserting.
 */
export function useAiRender(
  board: OutfitBoard | undefined,
  ctx: OutfitContext,
  onPersisted?: (outfitId: string) => void,
) {
  // Pro previews render in HD; the server applies the same rule itself.
  const { plan } = usePlan();
  const planQuality = plan.renderQuality;
  const queryClient = useQueryClient();
  // Kept in a ref so an inline callback from the screen never re-runs effects.
  const onPersistedRef = useRef(onPersisted);
  onPersistedRef.current = onPersisted;
  // Renders produced this session, keyed by board. Switching options resets
  // the hook, so without this switching back would drop the image (and a
  // re-tap would spend another preview) — issue #50 note.
  const sessionRef = useRef(
    new Map<string, { url: string; quality: RenderQuality; rowId: string | null }>(),
  );

  const [rowId, setRowId] = useState<string | null>(board?.outfitId ?? null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(board?.renderUrl ?? null);
  const [remoteQuality, setRemoteQuality] = useState<RenderQuality | null>(null);
  const [started, setStarted] = useState(Boolean(board?.renderUrl));
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(board?.renderUrl));
  const [failed, setFailed] = useState(false);
  const [previewCapped, setPreviewCapped] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [previewUsage, setPreviewUsage] = useState<{ used: number; limit: number | null } | null>(
    null,
  );

  // Switching boards shows that board's saved render immediately (or the
  // empty state) — a fresh tap still re-renders and overwrites it.
  useEffect(() => {
    const key = board?.key;
    const cached = key ? sessionRef.current.get(key) : undefined;
    const saved = board?.renderUrl ?? cached?.url ?? null;
    setRowId(board?.outfitId ?? cached?.rowId ?? null);
    setRemoteUrl(saved);
    setRemoteQuality(cached?.quality ?? null);
    setStarted(Boolean(saved));
    setWorking(false);
    setLoaded(Boolean(saved));
    setFailed(false);
    setPreviewCapped(false);
    setUnavailable(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.key]);

  const generate = useCallback(async () => {
    if (!board || working) return;
    setStarted(true);
    setWorking(true);
    setLoaded(false);
    setFailed(false);
    setRemoteUrl(null);
    setPreviewCapped(false);
    setUnavailable(false);
    let gotRender = false;
    let capped = false;
    if (isSupabaseConfigured()) {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (user) {
          // Attach the render to an outfit row so it can be reused everywhere.
          let targetId = rowId;
          if (!targetId) {
            targetId = await createDraftOutfit(user.id, board, ctx);
            if (targetId) {
              setRowId(targetId);
              onPersistedRef.current?.(targetId);
            }
          }
          const pieces = [
            board.top,
            board.bottom,
            board.shoes,
            board.outerwear,
            board.accessory,
          ].filter((i) => i !== null);
          const call = supabase.functions.invoke<{
            renderUrl?: string;
            quality?: RenderQuality;
            usage?: { used: number; limit: number | null };
          }>('render-outfit', {
            body: {
              // Persist when we have (or just created) a row; only fall back
              // to the raw items when the draft couldn't be written.
              ...(targetId ? { outfitId: targetId } : {}),
              items: pieces.map((i) => ({
                image_url: i.image_url,
                category: i.category,
                colors: i.colors,
                formality: i.formality,
              })),
              ctx: { tempC: ctx.tempC, dress: ctx.dress, mood: ctx.mood, gender: ctx.gender },
              seed: seedFromKey(board.key),
            },
          });
          let timer: ReturnType<typeof setTimeout> | undefined;
          try {
            const timeout = new Promise<never>((_, reject) => {
              timer = setTimeout(() => reject(new Error('timeout')), REMOTE_TIMEOUT_MS);
            });
            const { data: result, error } = await Promise.race([call, timeout]);
            if (!error && result?.renderUrl) {
              gotRender = true;
              setRemoteUrl(result.renderUrl);
              const quality = result.quality ?? 'standard';
              setRemoteQuality(quality);
              sessionRef.current.set(board.key, {
                url: result.renderUrl,
                quality,
                rowId: targetId,
              });
            }
            if (result?.usage) setPreviewUsage(result.usage);
            if (error instanceof FunctionsHttpError) {
              const body = (await error.context.json().catch(() => null)) as {
                code?: string;
              } | null;
              // Budget spent: show the upgrade path, never a fallback render.
              if (
                error.context.status === 429 ||
                body?.code === LIMIT_ERRORS.dailyLimit ||
                body?.code === LIMIT_ERRORS.previewLimit
              ) {
                capped = true;
                setPreviewCapped(true);
              }
            }
          } finally {
            clearTimeout(timer);
          }
        }
      } catch {
        // Network/timeout — surfaces as `unavailable` below.
      }
    }
    // No render, no fallback: flag the honest state for the card to show.
    if (!gotRender && !capped) setUnavailable(true);
    setWorking(false);
    if (gotRender) {
      // The row now carries a new render — refresh the Lookbook thumbnail and
      // the saved-row cache so they show it (issue #50).
      void queryClient.invalidateQueries({ queryKey: lookbookKeys.all });
      void queryClient.invalidateQueries({ queryKey: savedOutfitKeys.all });
    }
  }, [board, ctx, working, rowId, queryClient]);

  return {
    url: failed ? null : remoteUrl,
    started,
    isLoading: working || (Boolean(remoteUrl) && !loaded && !failed),
    /** What was actually delivered (the server may fall back to standard). */
    quality: remoteUrl ? (remoteQuality ?? 'standard') : planQuality,
    /** True once the server refused a preview for budget reasons. */
    previewCapped,
    /** True when no render came back (engine failure) or the image failed to load. */
    unavailable: unavailable || failed,
    previewUsage,
    /** Row the render is attached to — Save should flip this instead of inserting. */
    outfitId: rowId,
    generate,
    onLoad: () => setLoaded(true),
    onError: () => setFailed(true),
    retry: () => void generate(),
  };
}
