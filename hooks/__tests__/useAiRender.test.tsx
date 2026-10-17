import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';

import { useAiRender } from '@/hooks/useAiRender';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import type { WardrobeItemRow } from '@/types/database';

const mockInvoke = jest.fn();
jest.mock('@/services/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
    },
    functions: { invoke: mockInvoke },
  }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  usePlan: () => ({ plan: { renderQuality: 'standard' } }),
}));

function wear(id: string, category: WardrobeItemRow['category']): WardrobeItemRow {
  return {
    id,
    user_id: 'user-1',
    image_url: `https://img/${id}.jpg`,
    category,
    colors: ['navy'],
    formality: 'casual',
    season: [],
    fabric: '',
    pattern: '',
    created_at: '2026-10-01T00:00:00.000Z',
  } as unknown as WardrobeItemRow;
}

const board = {
  key: 'ai-o1',
  top: wear('t1', 'top'),
  bottom: wear('b1', 'bottom'),
  shoes: wear('s1', 'shoes'),
  outerwear: null,
  accessory: null,
  score: 0,
  reasons: ['Styled for 20°'],
  source: 'ai',
  outfitId: 'o1',
} as OutfitBoard;

const ctx = {
  tempC: 20,
  rainPct: 0,
  dress: 'casual',
  mood: 'relaxed',
  gender: 'prefer_not_to_say',
} as unknown as OutfitContext;

const httpError = (status: number, body: unknown) => ({
  data: null,
  error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
});

beforeEach(() => jest.clearAllMocks());

it('renders the server image on a successful preview', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });
  const { result } = await renderHook(() => useAiRender(board, ctx));

  await act(async () => {
    await result.current.generate();
  });

  await waitFor(() => expect(result.current.url).toBe('https://cdn/render.png'));
  expect(result.current.previewCapped).toBe(false);
  expect(result.current.unavailable).toBe(false);
});

it('never produces a fallback URL when previews are spent (429)', async () => {
  mockInvoke.mockResolvedValue(
    httpError(429, { capped: true, code: 'preview_limit', usage: { used: 1, limit: 1 } }),
  );
  const { result } = await renderHook(() => useAiRender(board, ctx));

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.url).toBeNull();
  expect(result.current.previewCapped).toBe(true);
  // Budget refusal is not the same as an engine failure.
  expect(result.current.unavailable).toBe(false);
});

it('flags unavailable (no render, no fallback) when the engine fails', async () => {
  mockInvoke.mockResolvedValue(httpError(502, { error: 'render unavailable, try again' }));
  const { result } = await renderHook(() => useAiRender(board, ctx));

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.url).toBeNull();
  expect(result.current.unavailable).toBe(true);
  expect(result.current.previewCapped).toBe(false);
});
