import { useCallback, useEffect, useState } from 'react';

import { usePlan } from '@/hooks/useSubscription';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { LIMIT_ERRORS, type RenderQuality } from '@/supabase/functions/_shared/tiers';
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
 * Manual AI render for a board — runs ONLY when generate() is called
 * (button tap), never on option switches, to protect render quota.
 *
 * Cloudflare (`render-outfit`) is the only engine: there is no client-side
 * fallback URL (issue #45). When the server refuses for budget reasons the
 * hook flags `previewCapped`; any other failure flags `unavailable`. Either
 * way `url` stays null so the card can offer the upgrade path instead of a
 * substituted image.
 */
export function useAiRender(
  board: OutfitBoard | undefined,
  ctx: OutfitContext,
) {
  // Pro previews render in HD; the server applies the same rule itself.
  const { plan } = usePlan();
  const planQuality = plan.renderQuality;

  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [remoteQuality, setRemoteQuality] = useState<RenderQuality | null>(null);
  const [started, setStarted] = useState(false);
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [previewCapped, setPreviewCapped] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [previewUsage, setPreviewUsage] = useState<{ used: number; limit: number | null } | null>(
    null,
  );

  // Switching boards resets to the photo view — a fresh tap re-renders.
  useEffect(() => {
    setRemoteUrl(null);
    setRemoteQuality(null);
    setStarted(false);
    setWorking(false);
    setLoaded(false);
    setFailed(false);
    setPreviewCapped(false);
    setUnavailable(false);
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
        if (data.session) {
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
  }, [board, ctx, working]);

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
    generate,
    onLoad: () => setLoaded(true),
    onError: () => setFailed(true),
    retry: () => void generate(),
  };
}
