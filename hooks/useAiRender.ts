import { FunctionsHttpError } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';

import { subscriptionKeys, usePlan } from '@/hooks/useSubscription';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { LIMIT_ERRORS, type RenderQuality } from '@/supabase/functions/_shared/tiers';

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
 * Manual AI render for a board — runs ONLY when generate() is called
 * (button tap), never on option switches, to protect render quota.
 *
 * Cloudflare (`render-outfit`) is the only engine: there is no client-side
 * fallback URL (issue #45). When the server refuses for budget reasons the
 * hook flags `previewCapped`; any other failure flags `failure` and `url`
 * stays null so the card offers the right message instead of a substituted
 * image. A render that was produced but failed to *load* is tracked
 * separately (`imageFailed`) so retrying never spends a second preview.
 */
export function useAiRender(board: OutfitBoard | undefined, ctx: OutfitContext) {
  // Pro previews render in HD; the server applies the same rule itself.
  const { plan } = usePlan();
  const planQuality = plan.renderQuality;
  const queryClient = useQueryClient();

  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteQuality, setRemoteQuality] = useState<RenderQuality | null>(null);
  const [started, setStarted] = useState(false);
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
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

  // Switching boards resets to the photo view — a fresh tap re-renders.
  useEffect(() => {
    setRemoteUrl(null);
    setRemoteQuality(null);
    setStarted(false);
    setWorking(false);
    setLoaded(false);
    setImageFailed(false);
    setImageRetryKey(0);
    retriedImage.current = false;
    setPreviewCapped(false);
    setFailure(null);
  }, [board?.key]);

  const generate = useCallback(async () => {
    if (!board || working) return;
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
        if (!data.session) {
          reason = 'sign_in';
        } else {
          const pieces = [board.top, board.bottom, board.shoes, board.outerwear, board.accessory]
            .filter((i) => i !== null);
          const call = supabase.functions.invoke<{
            renderUrl?: string;
            quality?: RenderQuality;
            usage?: { used: number; limit: number | null };
          }>('render-outfit', {
            body: {
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
              setRemoteQuality(result.quality ?? 'standard');
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
  }, [board, ctx, working, queryClient]);

  const retry = useCallback(() => {
    void generate();
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
    generate,
    onLoad: () => setLoaded(true),
    onError,
    reloadImage,
    retry,
  };
}
