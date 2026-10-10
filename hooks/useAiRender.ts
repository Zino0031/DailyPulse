import { useCallback, useEffect, useMemo, useState } from 'react';

import { buildRenderPrompt, buildRenderUrl } from '@/services/aiRender';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';

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
 * Chain: render-outfit edge function → keyless Pollinations URL → photos.
 * Deterministic seeds make expo-image caching and free retries work.
 */
export function useAiRender(
  board: OutfitBoard | undefined,
  ctx: OutfitContext,
) {
  const fallbackUrl = useMemo(() => {
    if (!board) return null;
    return buildRenderUrl(
      buildRenderPrompt(board, ctx),
      seedFromKey(board.key),
      [board.top.image_url, board.bottom.image_url, board.shoes.image_url],
    );
  }, [board, ctx]);

  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [started, setStarted] = useState(false);
  const [working, setWorking] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  // Switching boards resets to the photo view — a fresh tap re-renders.
  useEffect(() => {
    setRemoteUrl(null);
    setStarted(false);
    setWorking(false);
    setLoaded(false);
    setFailed(false);
  }, [board?.key]);

  const generate = useCallback(async () => {
    if (!board || working) return;
    setStarted(true);
    setWorking(true);
    setLoaded(false);
    setFailed(false);
    setRemoteUrl(null);
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
          const call = supabase.functions.invoke<{ renderUrl?: string }>(
            'render-outfit',
            {
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
            },
          );
          const timeout = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('timeout')), REMOTE_TIMEOUT_MS),
          );
          const { data: result, error } = await Promise.race([call, timeout]);
          if (!error && result?.renderUrl) setRemoteUrl(result.renderUrl);
        }
      } catch {
        // falls through to the keyless URL below
      }
    }
    setWorking(false);
  }, [board, ctx, working]);

  const url = remoteUrl ?? (started && !working ? fallbackUrl : null);

  return {
    url: failed ? null : url,
    started,
    isLoading: working || (Boolean(url) && !loaded && !failed),
    engine: remoteUrl ? ('cf' as const) : null,
    generate,
    onLoad: () => setLoaded(true),
    onError: () => setFailed(true),
    retry: () => void generate(),
  };
}
