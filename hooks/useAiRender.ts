import { FunctionsHttpError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscriptionKeys, usePlan } from '@/hooks/useSubscription';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { LIMIT_ERRORS, type RenderQuality } from '@/supabase/functions/_shared/tiers';
import { lookbookKeys, savedOutfitKeys } from '@/utils/queryKeys';

function seedFromKey(key: string): number {
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return hash % 100000;
}

const REMOTE_TIMEOUT_MS = 60000;

/**
 * Why a preview never appeared. `engine` is the only retryable case — a tap
 * on "Try again" can actually succeed. `sign_in` and `outfit` are dead ends,
 * so the card must not offer a retry or an upgrade for them (issue #46).
 */
export type PreviewFailure = 'engine' | 'sign_in' | 'outfit';

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
 * hook flags `previewCapped`; any other failure flags `failure` and `url`
 * stays null so the card offers the right message instead of a substituted
 * image. A render that was produced but failed to *load* is tracked
 * separately (`imageFailed`) so retrying never spends a second preview.
 *
 * The render is persisted against the outfit row (issue #50): `outfitId` is
 * sent so a re-opened look shows the saved image without a second preview.
 * On-device boards get a draft row on first preview, and its id is surfaced
 * through `outfitId`/`onPersisted` so Save reuses it instead of inserting.
 */
export function useAiRender(
  board: OutfitBoard | undefined,
  ctx: OutfitContext,
  onPersisted?: (outfitId: string, boardKey: string) => void,
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
  // re-tap would spend another preview) — issue #50 note / #48 D1.
  const sessionRef = useRef(
    new Map<string, { url: string; quality: RenderQuality; rowId: string | null }>(),
  );

  const [rowId, setRowId] = useState<string | null>(board?.outfitId ?? null);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(board?.renderUrl ?? null);
  const [remoteQuality, setRemoteQuality] = useState<RenderQuality | null>(null);
  const [started, setStarted] = useState(Boolean(board?.renderUrl));
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(Boolean(board?.renderUrl));
  const [imageFailed, setImageFailed] = useState(false);
  const [imageRetryKey, setImageRetryKey] = useState(0);
  const [previewCapped, setPreviewCapped] = useState(false);
  const [failure, setFailure] = useState<PreviewFailure | null>(null);
  const [previewUsage, setPreviewUsage] = useState<{ used: number; limit: number | null } | null>(
    null,
  );
  // A spent preview that fails to load retries the same URL once before we
  // stop — never by calling the (billable) function again (issue #46).
  const retriedImage = useRef(false);
  // Keep an explicit regenerate across the failure-retry tap.
  const forced = useRef(false);

  // Switching boards shows that board's saved render immediately (or the
  // empty state) — a fresh tap still re-renders and overwrites it. If the
  // board has an outfitId, prefer the cached/rendered image for that board.key
  // to avoid re-spending previews (issue #48 D1).
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
    setImageFailed(false);
    setImageRetryKey(0);
    retriedImage.current = false;
    setPreviewCapped(false);
    setFailure(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board?.key]);

  const generate = useCallback(async (options?: { force?: boolean }) => {
    if (!board || working) return;
    forced.current = options?.force === true;
    setStarted(true);
    setWorking(true);
    setLoaded(false);
    setImageFailed(false);
    setImageRetryKey(0);
    retriedImage.current = false;
    setRemoteUrl(null);
    setRemoteQuality(null);
    setPreviewCapped(false);
    setFailure(null);
    let gotRender = false;
    let capped = false;
    let reason: PreviewFailure | null = null;
    if (!isSupabaseConfigured()) {
      reason = 'sign_in';
    } else {
      try {
        const supabase = getSupabase();
        const { data } = await supabase.auth.getSession();
        const user = data.session?.user;
        if (!user) {
          reason = 'sign_in';
        } else {
          // Attach the render to an outfit row so it can be reused everywhere.
          let targetId = rowId;
          if (!targetId) {
            targetId = await createDraftOutfit(user.id, board, ctx);
            if (targetId) {
              setRowId(targetId);
              // Report the board this draft belongs to as well: the callback
              // ref may already point at a different option if the user
              // switched while the draft was being created (#50 follow-up).
              onPersistedRef.current?.(targetId, board.key);
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
              // Persist when we have (or just created) a row; always send
              // outfitId when available so the server can reuse cached renders
              // and avoid double-spending previews (issue #48 D1).
              ...(targetId
                ? { outfitId: targetId }
                : board.outfitId
                  ? { outfitId: board.outfitId }
                  : {}),
              // An explicit "Regenerate preview" must render a new image even
              // though this outfit already has one stored.
              ...(options?.force ? { regenerate: true } : {}),
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
              const status = error.context.status;
              const body = (await error.context.json().catch(() => null)) as {
                code?: string;
                usage?: { used: number; limit: number | null };
              } | null;
              if (body?.usage) setPreviewUsage(body.usage);
              // Budget spent: show the upgrade path, never a fallback render.
              // Only the server's own code counts — a gateway 429 is an outage.
              if (body?.code === LIMIT_ERRORS.previewLimit) {
                capped = true;
                setPreviewCapped(true);
              } else if (status === 401) {
                reason = 'sign_in';
              } else if (status === 400 || status === 404) {
                reason = 'outfit';
              } else {
                reason = 'engine';
              }
            } else if (error) {
              reason = 'engine';
            }
          } finally {
            clearTimeout(timer);
          }
        }
      } catch {
        // Network/timeout — retryable, and the server refunds its 502s.
        reason = 'engine';
      }
    }
    // No render, no fallback: record the honest reason for the card to show.
    if (!gotRender && !capped) setFailure(reason ?? 'engine');
    // The server moved today's preview counter; refresh the meter.
    void queryClient.invalidateQueries({ queryKey: subscriptionKeys.all });
    setWorking(false);
    if (gotRender) {
      // The row now carries a new render — refresh the Lookbook thumbnail and
      // the saved-row cache so they show it (issue #50).
      void queryClient.invalidateQueries({ queryKey: lookbookKeys.all });
      void queryClient.invalidateQueries({ queryKey: savedOutfitKeys.all });
    }
  }, [board, ctx, working, rowId, queryClient]);

  const retry = useCallback(() => {
    void generate({ force: forced.current });
  }, [generate]);

  const onError = useCallback(() => {
    // Retry the same URL once (remount with cachePolicy "none"), then stop.
    if (!retriedImage.current) {
      retriedImage.current = true;
      setImageRetryKey((k) => k + 1);
      return;
    }
    setImageFailed(true);
  }, []);

  const reloadImage = useCallback(() => {
    retriedImage.current = false;
    setImageFailed(false);
    setImageRetryKey((k) => k + 1);
  }, []);

  return {
    url: remoteUrl,
    /** Bump to force expo-image to fetch the same URL again (no new render). */
    imageRetryKey,
    started,
    isLoading: working || (Boolean(remoteUrl) && !loaded && !imageFailed),
    /** What was actually delivered (the server may fall back to standard). */
    quality: remoteUrl ? (remoteQuality ?? 'standard') : planQuality,
    /** True once the server refused a preview for budget reasons. */
    previewCapped,
    /** Why the preview is missing; null while idle or after a success. */
    failure,
    /** Retryable engine failure — kept for the simplest call sites/tests. */
    unavailable: failure === 'engine',
    /** The render exists but its image wouldn't load (never re-spend for this). */
    imageFailed,
    previewUsage,
    /** Row the render is attached to — Save should flip this instead of inserting. */
    outfitId: rowId,
    generate,
    onLoad: () => setLoaded(true),
    onError,
    reloadImage,
    retry,
  };
}
