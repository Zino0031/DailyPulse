import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import { OutfitCard } from '@/components/outfit/OutfitCard';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { usePaywallStore } from '@/store/usePaywallStore';
import type { WardrobeItemRow } from '@/types/database';
import type { Allowance } from '@/utils/subscription';

const mockInvoke = jest.fn();
const mockFrom = jest.fn();
const mockState: {
  tier: 'free' | 'plus' | 'pro';
  quality: 'standard' | 'hd';
  preview: Allowance & { isLoading: boolean };
} = {
  tier: 'free',
  quality: 'standard',
  preview: { used: 0, limit: 1, remaining: 1, atLimit: false, nearLimit: false, isLoading: false },
};

jest.mock('@/services/supabase', () => ({
  isSupabaseConfigured: () => true,
  getSupabase: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
    },
    functions: { invoke: mockInvoke },
    from: mockFrom,
  }),
}));
jest.mock('@/hooks/useSubscription', () => ({
  subscriptionKeys: { all: ['subscription'] },
  usePlan: () => ({
    tier: mockState.tier,
    plan: {
      name: 'Plan',
      dailyPreviews: mockState.preview.limit,
      dailyGenerations: 1,
      renderQuality: mockState.quality,
    },
  }),
  usePreviewUsage: () => mockState.preview,
}));
jest.mock('@/components/avatar/AvatarPreview', () => ({ AvatarPreview: () => null }));

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

function renderCard(
  overrides: Partial<OutfitBoard> = {},
  onPreviewPersisted?: (outfitId: string, boardKey: string) => void,
) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(
    <OutfitCard
      board={{ ...board, ...overrides } as OutfitBoard}
      ctx={ctx}
      onPreviewPersisted={onPreviewPersisted}
    />,
    { wrapper: Wrapper },
  );
}

async function preview() {
  await renderCard();
  await fireEvent.press(screen.getByLabelText('Generate AI preview'));
}

beforeEach(() => {
  jest.clearAllMocks();
  usePaywallStore.setState({ reason: null });
  mockState.tier = 'free';
  mockState.quality = 'standard';
  mockState.preview = {
    used: 0,
    limit: 1,
    remaining: 1,
    atLimit: false,
    nearLimit: false,
    isLoading: false,
  };
  mockFrom.mockImplementation(() => tableBuilder({ data: { id: 'draft-1' }, error: null }));
});

it('shows a persisted render immediately, no Preview tap', async () => {
  await renderCard({ renderUrl: 'https://signed/render.png' });

  expect(screen.getByLabelText('AI style preview of this outfit')).toBeTruthy();
  expect(screen.queryByLabelText('Generate AI preview')).toBeNull();
  expect(mockInvoke).not.toHaveBeenCalled();
});

it('creates a draft row for an on-device preview and reports it to the screen', async () => {
  const onPersisted = jest.fn();
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });

  await renderCard({ outfitId: undefined, source: 'local' }, onPersisted);
  await fireEvent.press(screen.getByLabelText('Generate AI preview'));

  await waitFor(() => expect(onPersisted).toHaveBeenCalledWith('draft-1', 'ai-o1'));
  expect(mockInvoke.mock.calls[0][1].body.outfitId).toBe('draft-1');
});

it('offers the upgrade path and opens the paywall when previews are spent', async () => {
  mockInvoke.mockResolvedValue(
    httpError(429, { capped: true, code: 'preview_limit', usage: { used: 1, limit: 1 } }),
  );

  await preview();

  await waitFor(() => expect(screen.getByTestId('outfit-preview-upgrade')).toBeTruthy());
  // Reuses the tested paywall copy instead of a hard-coded string.
  expect(screen.getByText("You've used today's AI preview")).toBeTruthy();
  // No substituted image ever shows.
  expect(screen.queryByLabelText('AI style preview of this outfit')).toBeNull();

  await fireEvent.press(screen.getByTestId('outfit-preview-upgrade'));
  expect(usePaywallStore.getState().reason).toBe('preview');
});

it('shows no upgrade CTA when the user is already on Pro', async () => {
  mockState.tier = 'pro';
  mockInvoke.mockResolvedValue(
    httpError(429, { capped: true, code: 'preview_limit', usage: { used: 20, limit: 20 } }),
  );

  await preview();

  await waitFor(() => expect(screen.getByText("You've used today's 20 AI previews")).toBeTruthy());
  expect(screen.queryByTestId('outfit-preview-upgrade')).toBeNull();
});

it('lets the user retry an engine outage without pushing an upgrade when none exists', async () => {
  mockState.tier = 'pro';
  mockInvoke.mockResolvedValue(httpError(502, { error: 'render unavailable, try again' }));

  await preview();

  await waitFor(() => expect(screen.getByTestId('outfit-preview-retry')).toBeTruthy());
  expect(screen.queryByTestId('outfit-preview-see-plans')).toBeNull();

  await fireEvent.press(screen.getByTestId('outfit-preview-retry'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
});

it('offers both retry and plans to a free user on an engine outage', async () => {
  mockInvoke.mockResolvedValue(httpError(502, { error: 'render unavailable, try again' }));

  await preview();

  await waitFor(() => expect(screen.getByTestId('outfit-preview-retry')).toBeTruthy());
  expect(screen.getByTestId('outfit-preview-see-plans')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('outfit-preview-see-plans'));
  expect(usePaywallStore.getState().reason).toBe('preview');
});

it('does not offer a retry when the user simply needs to sign in', async () => {
  mockInvoke.mockResolvedValue(httpError(401, { error: 'sign in required' }));

  await preview();

  await waitFor(() =>
    expect(screen.getByText('Sign in to preview this outfit with AI.')).toBeTruthy(),
  );
  expect(screen.queryByTestId('outfit-preview-retry')).toBeNull();
});

it('never upsells HD to a Pro user whose render fell back to standard', async () => {
  mockState.tier = 'pro';
  mockState.quality = 'hd';
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });

  await preview();

  await waitFor(() => expect(screen.getByLabelText('AI style preview of this outfit')).toBeTruthy());
  expect(screen.queryByTestId('outfit-hd-upsell')).toBeNull();
  expect(screen.getByText('Standard')).toBeTruthy();
});

it('shows an HD upsell to a free user on a standard render', async () => {
  mockInvoke.mockResolvedValue({
    data: { renderUrl: 'https://cdn/render.png', quality: 'standard' },
    error: null,
  });

  await preview();

  await waitFor(() => expect(screen.getByTestId('outfit-hd-upsell')).toBeTruthy());
});
