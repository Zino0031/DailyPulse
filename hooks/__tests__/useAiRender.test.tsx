import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import { useAiRender } from '@/hooks/useAiRender';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import type { WardrobeItemRow } from '@/types/database';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();
const mockGetSession = jest.fn();
jest.mock('@/services/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: { getSession: mockGetSession },
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  subscriptionKeys: { all: ['subscription'] },
  usePlan: () => ({ tier: 'free', plan: { name: 'Free', renderQuality: 'standard' } }),
}));

/** Chainable PostgREST stand-in: every call returns itself; awaiting resolves. */
function tableBuilder(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'delete']) chain[m] = () => chain;
  chain.single = async () => result;
  chain.maybeSingle = async () => result;
  chain.then = (resolve: (v: unknown) => unknown) => resolve(result);
  return chain;
}

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

const localBoard = {
  ...board,
  key: 'local-1',
  source: 'local',
  outfitId: undefined,
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

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const renderAi = (b: OutfitBoard = board, onPersisted?: (outfitId: string) => void) =>
  renderHook(() => useAiRender(b, ctx, onPersisted), { wrapper });

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  mockGetSession.mockResolvedValue({ data: { session: { user: { id: 'user-1' } } } });
  mockFrom.mockImplementation(() => tableBuilder({ data: { id: 'draft-1' }, error: null }));
});

it('renders the server image on a successful preview', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard', usage: { used: 1, limit: 1 } },
    error: null,
  });
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  await waitFor(() => expect(result.current.url).toBe('https://cdn/render.png'));
  expect(result.current.previewCapped).toBe(false);
  expect(result.current.failure).toBeNull();
  expect(result.current.previewUsage).toEqual({ used: 1, limit: 1 });
});

it('persists against the existing row and never creates a draft for an AI board', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(mockInvoke.mock.calls[0][1].body.outfitId).toBe('o1');
  expect(mockFrom).not.toHaveBeenCalled();
  expect(result.current.outfitId).toBe('o1');
});

it('creates a draft row for an on-device board and exposes its id', async () => {
  const onPersisted = jest.fn();
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });
  const { result } = await renderAi(localBoard, onPersisted);

  await act(async () => {
    await result.current.generate();
  });

  await waitFor(() => expect(mockFrom).toHaveBeenCalledWith('outfits'));
  expect(mockInvoke.mock.calls[0][1].body.outfitId).toBe('draft-1');
  expect(onPersisted).toHaveBeenCalledWith('draft-1', 'local-1');
  expect(result.current.outfitId).toBe('draft-1');
});

it('shows a saved render immediately without spending a preview', async () => {
  const saved = { ...board, renderUrl: 'https://signed/render.png' } as OutfitBoard;
  const { result } = await renderAi(saved);

  expect(result.current.url).toBe('https://signed/render.png');
  expect(result.current.started).toBe(true);
  expect(result.current.isLoading).toBe(false);
  expect(mockInvoke).not.toHaveBeenCalled();
});

it('keeps a rendered preview when switching options and back (no re-spend)', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });
  const other = { ...board, key: 'ai-o2', outfitId: 'o2' } as OutfitBoard;
  const { result, rerender } = await renderHook(
    ({ b }: { b: OutfitBoard }) => useAiRender(b, ctx),
    { wrapper, initialProps: { b: board } },
  );

  await act(async () => {
    await result.current.generate();
  });
  await waitFor(() => expect(result.current.url).toBe('https://cdn/render.png'));

  await rerender({ b: other });
  expect(result.current.url).toBeNull();

  await rerender({ b: board });
  expect(result.current.url).toBe('https://cdn/render.png');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('never produces a fallback URL when previews are spent (429)', async () => {
  mockInvoke.mockResolvedValue(
    httpError(429, { capped: true, code: 'preview_limit', usage: { used: 1, limit: 1 } }),
  );
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.url).toBeNull();
  expect(result.current.previewCapped).toBe(true);
  // Budget refusal is not the same as an engine failure.
  expect(result.current.failure).toBeNull();
  expect(result.current.unavailable).toBe(false);
  // Server usage is captured so the card can show what's left.
  expect(result.current.previewUsage).toEqual({ used: 1, limit: 1 });
});

it('treats a bare 429 (gateway limit) as an engine outage, not a cap', async () => {
  mockInvoke.mockResolvedValue(httpError(429, { error: 'rate limited' }));
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.previewCapped).toBe(false);
  expect(result.current.failure).toBe('engine');
});

it('flags a retryable engine failure when the engine fails (502)', async () => {
  mockInvoke.mockResolvedValue(httpError(502, { error: 'render unavailable, try again' }));
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.url).toBeNull();
  expect(result.current.failure).toBe('engine');
  expect(result.current.unavailable).toBe(true);
  expect(result.current.previewCapped).toBe(false);
});

it('separates "sign in needed" from a retryable outage (401)', async () => {
  mockInvoke.mockResolvedValue(httpError(401, { error: 'sign in required' }));
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.failure).toBe('sign_in');
  expect(result.current.unavailable).toBe(false);
});

it('separates "can\'t preview this outfit" from an outage (404)', async () => {
  mockInvoke.mockResolvedValue(httpError(404, { error: 'outfit not found' }));
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(result.current.failure).toBe('outfit');
  expect(result.current.unavailable).toBe(false);
});

it('never calls the function without a session, and reports sign-in', async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  const { result } = await renderAi();

  await act(async () => {
    await result.current.generate();
  });

  expect(mockInvoke).not.toHaveBeenCalled();
  expect(result.current.failure).toBe('sign_in');
});

it('retries a failed image once before giving up, without re-rendering', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });
  const { result } = await renderAi();
  await act(async () => {
    await result.current.generate();
  });
  await waitFor(() => expect(result.current.url).toBe('https://cdn/render.png'));

  await act(async () => result.current.onError());
  // First failure silently reloads the same URL (new key), still not failed.
  expect(result.current.imageRetryKey).toBe(1);
  expect(result.current.imageFailed).toBe(false);

  await act(async () => result.current.onError());
  expect(result.current.imageFailed).toBe(true);
  // Crucially, no second generation was billed.
  expect(mockInvoke).toHaveBeenCalledTimes(1);

  await act(async () => result.current.reloadImage());
  expect(result.current.imageFailed).toBe(false);
});
