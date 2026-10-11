import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ClosetScreen from '@/app/(tabs)/closet';
import { closetKeys, closetMutationKeys } from '@/hooks/useCloset';
import * as closet from '@/services/closet';
import type { ClosetItem } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  router: { push: (...args: unknown[]) => mockPush(...args) },
}));
jest.mock('@/services/closet', () => ({
  fetchClosetItems: jest.fn(),
  insertClosetItem: jest.fn(),
  updateClosetItem: jest.fn(),
  deleteClosetItem: jest.fn(),
  uploadClosetPhoto: jest.fn(),
  removeClosetPhoto: jest.fn(),
}));
jest.mock('@/services/ai', () => ({ suggestItemTags: jest.fn() }));

const api = closet as jest.Mocked<typeof closet>;
const USER = 'user-1';
const KEY = closetKeys.items(USER);

function item(id: string, overrides: Partial<ClosetItem> = {}): ClosetItem {
  return {
    id,
    user_id: USER,
    image_url: `${USER}/${id}.jpg`,
    imageUri: `https://signed/${id}`,
    category: 'top',
    colors: ['navy'],
    formality: 'casual',
    season: [],
    fabric: '',
    pattern: '',
    created_at: '2026-10-01T00:00:00.000Z',
    ...overrides,
  };
}

let client: QueryClient;
function renderScreen() {
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<ClosetScreen />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
});
afterEach(() => client.clear());

it('asks signed-out users to sign in instead of showing an empty grid', async () => {
  useAuthStore.setState({ user: null });
  await renderScreen();
  expect(screen.getByText('Sign in to see your closet')).toBeTruthy();
  expect(screen.queryByTestId('closet-add')).toBeNull();
});

it('guides a new user with an empty state and an add action', async () => {
  api.fetchClosetItems.mockResolvedValue([]);
  await renderScreen();
  expect(await screen.findByText('Your closet is empty')).toBeTruthy();
  expect(screen.getByText('Add your first piece to get outfit ideas')).toBeTruthy();
  expect(screen.getByTestId('closet-empty-add')).toBeTruthy();
  // No filter chips when there's nothing to filter.
  expect(screen.queryByTestId('closet-filter-all')).toBeNull();
});

it('filters by category with live counts and a helpful filtered-empty state', async () => {
  client.setQueryData(KEY, [item('t1'), item('t2'), item('s1', { category: 'shoes' })]);
  await renderScreen();

  expect(screen.getByText('3 items')).toBeTruthy();
  expect(screen.getByLabelText('All, 3 items')).toBeTruthy();
  expect(screen.getByLabelText('Shoes, 1 item')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('closet-filter-shoes'));
  expect(screen.getByTestId('closet-item-s1')).toBeTruthy();
  expect(screen.queryByTestId('closet-item-t1')).toBeNull();
  expect(screen.getByText('3 items · showing 1 shoes')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('closet-filter-bottom'));
  expect(screen.getByText('No bottoms yet')).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Show all'));
  expect(screen.getByTestId('closet-item-t1')).toBeTruthy();
});

it('opens the edit screen for a tapped item', async () => {
  client.setQueryData(KEY, [item('t1')]);
  await renderScreen();
  await fireEvent.press(screen.getByTestId('closet-item-t1'));
  expect(mockPush).toHaveBeenCalledWith({ pathname: '/item/[id]', params: { id: 't1' } });
});

it('keeps showing the saved closet offline and says so', async () => {
  // Stale cached data → background refetch → network failure.
  client.setQueryData(KEY, [item('t1')], { updatedAt: 0 });
  api.fetchClosetItems.mockRejectedValue(new Error('Network request failed'));
  await renderScreen();

  // useClosetItems retries once (≈1s backoff) before giving up.
  expect(
    await screen.findByText("You're offline — showing your saved closet.", {}, { timeout: 4000 }),
  ).toBeTruthy();
  expect(api.fetchClosetItems).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('closet-item-t1')).toBeTruthy();
});

it('reports a failed optimistic delete with retry, and dismiss clears it', async () => {
  const target = item('t1');
  client.setQueryData(KEY, [target]);
  api.deleteClosetItem.mockRejectedValue(new Error('Network request failed'));
  api.fetchClosetItems.mockResolvedValue([target]);
  await renderScreen();

  // Same path the edit modal takes: a mutation under the closet key.
  await act(async () => {
    await client
      .getMutationCache()
      .build(client, {
        mutationKey: closetMutationKeys.remove,
        mutationFn: () => api.deleteClosetItem(target),
      }, { variables: { item: target } } as never)
      .execute({ item: target })
      .catch(() => undefined);
  });

  const notice = await screen.findByTestId('closet-mutation-notice');
  expect(notice).toBeTruthy();
  expect(screen.getByText(/Couldn't delete your top — it's back in your closet\./)).toBeTruthy();
  expect(screen.getByLabelText('Retry')).toBeTruthy();

  await fireEvent.press(screen.getByLabelText('Dismiss message'));
  await waitFor(() => expect(screen.queryByTestId('closet-mutation-notice')).toBeNull());
});
