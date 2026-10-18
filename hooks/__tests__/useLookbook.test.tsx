import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useLookbookEntries } from '@/hooks/useLookbook';
import { useAuthStore } from '@/store/useAuthStore';

const mockSignedOutfits = jest.fn();
const mockSignedWardrobe = jest.fn();

jest.mock('@/services/supabase', () => {
  // Declared inside the factory: a `const` referenced from here would be
  // `undefined` when Jest evaluates the factory (before the module body runs).
  const data: Record<string, unknown> = {
    outfits: [
      {
        id: 'o1',
        created_at: '2026-10-18T10:00:00.000Z',
        mood: 'relaxed',
        event_summary: 'casual',
        rendered_image_url: 'renders/user-1/a.png',
        item_ids: ['t1'],
      },
      {
        id: 'o2',
        created_at: '2026-10-17T10:00:00.000Z',
        mood: null,
        event_summary: null,
        rendered_image_url: null,
        item_ids: ['t1'],
      },
    ],
    wardrobe_items: [{ id: 't1', image_url: 'user-1/t1.jpg' }],
  };
  const builder = (table: string) => {
    const resolved = Promise.resolve({ data: data[table] ?? null, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order']) chain[m] = () => chain;
    // Back the chain with a real Promise so `await chain` settles.
    chain.then = resolved.then.bind(resolved);
    chain.catch = resolved.catch.bind(resolved);
    chain.single = () => resolved;
    chain.maybeSingle = () => resolved;
    return chain;
  };
  return {
    isSupabaseConfigured: () => true,
    getSupabase: () => ({
      from: builder,
      storage: {
        from: (bucket: string) => ({
          createSignedUrls: bucket === 'outfits' ? mockSignedOutfits : mockSignedWardrobe,
        }),
      },
    }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  useAuthStore.setState({ user: { id: 'user-1' } as never, isLoading: false });
  mockSignedWardrobe.mockResolvedValue({
    data: [{ path: 'user-1/t1.jpg', signedUrl: 'https://signed/t1.jpg' }],
  });
  mockSignedOutfits.mockResolvedValue({
    data: [{ path: 'renders/user-1/a.png', signedUrl: 'https://signed/render.png' }],
  });
});

it('signs the persisted render for the thumbnail and falls back to a photo', async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = await renderHook(() => useLookbookEntries(), { wrapper });

  await waitFor(() => expect(result.current.data?.length).toBe(2));
  const withRender = result.current.data!.find((e) => e.id === 'o1')!;
  const withoutRender = result.current.data!.find((e) => e.id === 'o2')!;

  // Persisted AI render wins, cached by its stable storage path.
  expect(withRender.thumbnailUrl).toBe('https://signed/render.png');
  expect(withRender.thumbnailKey).toBe('renders/user-1/a.png');
  // No render → first item photo (current behaviour).
  expect(withoutRender.thumbnailUrl).toBe('https://signed/t1.jpg');
  expect(withoutRender.thumbnailKey).toBe('t1');
});
