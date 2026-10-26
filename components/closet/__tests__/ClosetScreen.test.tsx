import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import ClosetScreen from '@/app/(tabs)/closet';
import { closetKeys, closetMutationKeys } from '@/hooks/useCloset';
import { profileKeys } from '@/hooks/useProfile';
import * as closet from '@/services/closet';
import type { ClosetItem } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';
import { usePaywallStore } from '@/store/usePaywallStore';
import type { Tier } from '@/types/database';

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
  usePaywallStore.setState({ reason: null });
});

function onPlan(tier: Tier) {
  client.setQueryData(profileKeys.details(USER), { tier } as never);
}
const many = (n: number) => Array.from({ length: n }, (_, i) => item(`i${i}`));
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

  // Free plan: the count is shown against the 50-item capacity.
  expect(screen.getByText('3 of 50 items')).toBeTruthy();
  expect(screen.getByLabelText('All, 3 items')).toBeTruthy();
  expect(screen.getByLabelText('Shoes, 1 item')).toBeTruthy();

  await fireEvent.press(screen.getByTestId('closet-filter-shoes'));
  expect(screen.getByTestId('closet-item-s1')).toBeTruthy();
  expect(screen.queryByTestId('closet-item-t1')).toBeNull();
  expect(screen.getByText('3 of 50 items · showing 1 shoes')).toBeTruthy();

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

describe('plan capacity (issue #17)', () => {
  it('warns near the Free cap but still lets the user add', async () => {
    client.setQueryData(KEY, many(45));
    await renderScreen();

    expect(screen.getByText('5 closet spots left on Free.')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('closet-add'));
    expect(usePaywallStore.getState().reason).toBeNull();
    // The source picker opened instead.
    expect(screen.getByText('Add to your closet')).toBeTruthy();
  });

  it('opens the paywall instead of the picker when the closet is full', async () => {
    client.setQueryData(KEY, many(50));
    await renderScreen();

    expect(screen.getByText('Your closet is full — Free holds 50 items.')).toBeTruthy();
    expect(screen.getByTestId('closet-add').props.accessibilityHint).toMatch(/full on Free/);
    await fireEvent.press(screen.getByTestId('closet-add'));
    expect(usePaywallStore.getState().reason).toBe('closet_full');
    expect(screen.queryByText('Add to your closet')).toBeNull();
  });

  it('keeps items after a downgrade and explains the overflow', async () => {
    client.setQueryData(KEY, many(72));
    await renderScreen();
    expect(
      screen.getByText('You have 72 items — Free holds 50. Everything stays; upgrade to add more.'),
    ).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('See plans'));
    expect(usePaywallStore.getState().reason).toBe('closet_full');
  });

  it('shows no cap on Pro', async () => {
    onPlan('pro');
    client.setQueryData(KEY, many(300));
    await renderScreen();
    expect(screen.getByText('300 items')).toBeTruthy();
    expect(screen.queryByTestId('closet-capacity-notice')).toBeNull();
  });

  it('turns a server closet_full rejection into an upgrade prompt, not a retry', async () => {
    const vars = {
      photo: { uri: 'file://p.jpg', width: 1, height: 1 },
      imagePath: `${USER}/new.jpg`,
      tags: { category: 'shoes', colors: [], formality: 'casual', season: [], fabric: '', pattern: '' },
    };
    client.setQueryData(KEY, [item('t1')]);
    api.fetchClosetItems.mockResolvedValue([item('t1')]);
    await renderScreen();

    await act(async () => {
      await client
        .getMutationCache()
        .build(client, {
          mutationKey: closetMutationKeys.add,
          mutationFn: () => Promise.reject({ code: 'P0001', message: 'closet_full' }),
        })
        .execute(vars)
        .catch(() => undefined);
    });

    expect(
      await screen.findByText("Your closet is full, so we couldn't save your shoes."),
    ).toBeTruthy();
    expect(screen.queryByLabelText('Retry')).toBeNull();
    await fireEvent.press(screen.getByLabelText('See plans'));
    expect(usePaywallStore.getState().reason).toBe('closet_full');
    expect(api.removeClosetPhoto).toHaveBeenCalledWith(`${USER}/new.jpg`);
  });
});
