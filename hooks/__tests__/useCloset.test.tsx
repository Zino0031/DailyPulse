import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { useWardrobe } from '@/hooks/useWardrobe';
import {
  closetKeys,
  useAddClosetItem,
  useClosetItems,
  useDeleteClosetItem,
  useUpdateClosetItem,
} from '@/hooks/useCloset';
import * as closet from '@/services/closet';
import type { ClosetItem } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';

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
    created_at: `2026-10-0${id.length}T00:00:00.000Z`,
    ...overrides,
  };
}

/** Promise we resolve/reject by hand to observe the in-flight state. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
const list = () => client.getQueryData<ClosetItem[]>(KEY) ?? [];

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
});

afterEach(() => client.clear());

describe('useClosetItems', () => {
  it('does not fetch while signed out', async () => {
    useAuthStore.setState({ user: null });
    const { result } = await renderHook(() => useClosetItems(), { wrapper });
    expect(result.current.fetchStatus).toBe('idle');
    expect(api.fetchClosetItems).not.toHaveBeenCalled();
  });

  it('fetches the signed-in user’s items under a user-scoped key', async () => {
    api.fetchClosetItems.mockResolvedValue([item('a')]);
    const { result } = await renderHook(() => useClosetItems(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.fetchClosetItems).toHaveBeenCalledWith(USER);
    expect(list().map((i) => i.id)).toEqual(['a']);
  });
});

describe('useAddClosetItem', () => {
  const vars = {
    photo: { uri: 'file:///local.jpg', width: 900, height: 1200 },
    imagePath: `${USER}/new.jpg`,
    tags: {
      category: 'shoes' as const,
      colors: ['black'],
      formality: 'casual' as const,
      season: [],
      fabric: 'leather',
      pattern: '',
    },
  };

  it('shows the item immediately as pending, then swaps in the saved row', async () => {
    client.setQueryData(KEY, [item('a')]);
    const insert = deferred<closet.ClosetItem>();
    api.insertClosetItem.mockReturnValue(insert.promise);
    api.fetchClosetItems.mockResolvedValue([]);

    const { result } = await renderHook(() => useAddClosetItem(), { wrapper });
    await act(async () => result.current.mutate(vars));

    await waitFor(() => expect(list()).toHaveLength(2));
    expect(list()[0]).toMatchObject({
      category: 'shoes',
      imageUri: 'file:///local.jpg',
      pending: true,
    });
    expect(list()[0].id).toMatch(/^temp-/);

    const saved = item('real', { category: 'shoes', image_url: vars.imagePath, imageUri: null });
    api.fetchClosetItems.mockResolvedValue([saved, item('a')]);
    await act(async () => insert.resolve(saved));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.insertClosetItem).toHaveBeenCalledWith(USER, vars.imagePath, vars.tags);
    expect(list().some((i) => i.id.startsWith('temp-'))).toBe(false);
    expect(list().find((i) => i.id === 'real')?.pending).toBeFalsy();
  });

  it('removes the optimistic item when saving fails', async () => {
    client.setQueryData(KEY, [item('a')]);
    api.insertClosetItem.mockRejectedValue(new Error('Network request failed'));
    api.fetchClosetItems.mockResolvedValue([item('a')]);

    const { result } = await renderHook(() => useAddClosetItem(), { wrapper });
    await act(async () => result.current.mutate(vars));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list().map((i) => i.id)).toEqual(['a']);
    // Photo is kept so the Closet screen can offer a retry.
    expect(api.removeClosetPhoto).not.toHaveBeenCalled();
  });
});

describe('useUpdateClosetItem', () => {
  it('applies new tags optimistically and restores the old ones on failure', async () => {
    const original = item('a', { formality: 'casual' });
    client.setQueryData(KEY, [original, item('bb')]);
    const update = deferred<closet.ClosetItem>();
    api.updateClosetItem.mockReturnValue(update.promise);
    api.fetchClosetItems.mockImplementation(async () => list());

    const { result } = await renderHook(() => useUpdateClosetItem(), { wrapper });
    const tags = {
      category: 'top' as const,
      colors: ['red'],
      formality: 'formal' as const,
      season: [],
      fabric: 'silk',
      pattern: 'solid',
    };
    await act(async () => result.current.mutate({ item: original, tags }));

    await waitFor(() => expect(list()[0]).toMatchObject({ formality: 'formal', pending: true }));

    await act(async () => update.reject(new Error('boom')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list()[0]).toMatchObject({ id: 'a', formality: 'casual', colors: ['navy'], pending: false });
    expect(list()[1].id).toBe('bb');
  });
});

describe('useDeleteClosetItem', () => {
  it('hides the item at once and puts it back in date order if the delete fails', async () => {
    const newest = item('ccc'); // created 2026-10-03
    const middle = item('bb'); // 2026-10-02
    const oldest = item('a'); // 2026-10-01
    client.setQueryData(KEY, [newest, middle, oldest]);
    const del = deferred<void>();
    api.deleteClosetItem.mockReturnValue(del.promise);
    api.fetchClosetItems.mockImplementation(async () => list());

    const { result } = await renderHook(() => useDeleteClosetItem(), { wrapper });
    await act(async () => result.current.mutate({ item: middle }));

    await waitFor(() => expect(list().map((i) => i.id)).toEqual(['ccc', 'a']));

    await act(async () => del.reject(new Error('Network request failed')));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(list().map((i) => i.id)).toEqual(['ccc', 'bb', 'a']);
  });

  it('keeps the item gone and marks the list for refresh on success', async () => {
    client.setQueryData(KEY, [item('a'), item('bb')]);
    api.deleteClosetItem.mockResolvedValue();
    api.fetchClosetItems.mockResolvedValue([item('bb')]);

    const { result } = await renderHook(() => useDeleteClosetItem(), { wrapper });
    await act(async () => result.current.mutate({ item: item('a') }));

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(api.deleteClosetItem).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }));
    expect(list().map((i) => i.id)).toEqual(['bb']);
    expect(client.getQueryState(KEY)?.isInvalidated).toBe(true);
  });
});

describe('useWardrobe (outfit composer feed)', () => {
  it('shares the closet cache, so closet changes reach outfit suggestions', async () => {
    api.fetchClosetItems.mockResolvedValue([item('a')]);
    const { result } = await renderHook(() => ({ closet: useClosetItems(), wardrobe: useWardrobe() }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.wardrobe.isSuccess).toBe(true));
    // One network fetch for both consumers.
    expect(api.fetchClosetItems).toHaveBeenCalledTimes(1);

    await act(async () => {
      client.setQueryData<ClosetItem[]>(KEY, (list) => [item('new'), ...(list ?? [])]);
    });
    // Observers are notified on the next tick (TanStack notifyManager).
    await waitFor(() => expect(result.current.wardrobe.data?.map((i) => i.id)).toEqual(['new', 'a']));
    // Signed URL travels with each item (image_url is a private path).
    expect(result.current.wardrobe.data?.[1].imageUri).toBe('https://signed/a');
  });
});
