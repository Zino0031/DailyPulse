import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { FunctionsHttpError } from '@supabase/supabase-js';
import type { ReactNode } from 'react';

import { OutfitCard } from '@/components/outfit/OutfitCard';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { usePaywallStore } from '@/store/usePaywallStore';
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
jest.mock('@/components/avatar/AvatarPreview', () => ({ AvatarPreview: () => null }));

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

function renderCard() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<OutfitCard board={board} ctx={ctx} />, { wrapper: Wrapper });
}
beforeEach(() => {
  jest.clearAllMocks();
  usePaywallStore.setState({ reason: null });
});

it('offers the upgrade path and opens the paywall when previews are spent', async () => {
  mockInvoke.mockResolvedValue({
    data: null,
    error: new FunctionsHttpError(
      new Response(
        JSON.stringify({ capped: true, code: 'preview_limit', usage: { used: 1, limit: 1 } }),
        { status: 429 },
      ),
    ),
  });

  await renderCard();
  await fireEvent.press(screen.getByLabelText('Generate AI preview'));

  await waitFor(() => expect(screen.getByTestId('outfit-preview-upgrade')).toBeTruthy());
  // No substituted image ever shows.
  expect(screen.queryByLabelText('AI style preview of this outfit')).toBeNull();

  await fireEvent.press(screen.getByTestId('outfit-preview-upgrade'));
  expect(usePaywallStore.getState().reason).toBe('preview');
});
