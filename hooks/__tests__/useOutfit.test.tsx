import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import OutfitDetailScreen from '@/app/outfit/[id]';
import { closetKeys } from '@/hooks/useCloset';
import { outfitKeys, type LastOutfit } from '@/hooks/useOutfit';
import { profileKeys } from '@/hooks/useProfile';
import { subscriptionKeys } from '@/hooks/useSubscription';
import type { ClosetItem } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';
import { usePaywallStore } from '@/store/usePaywallStore';
import { usageDay } from '@/supabase/functions/_shared/tiers';
import type { Tier } from '@/types/database';

let mockParams: { id: string } = { id: 'new' };
jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  Link: ({ children }: { children: ReactNode }) => children,
  router: { back: jest.fn(), push: jest.fn() },
}));
jest.mock('@/hooks/useWeather', () => ({ useWeather: () => ({ data: undefined }) }));
jest.mock('@/hooks/useCalendarEvents', () => ({ useDominantDressCode: () => null }));
jest.mock('@/components/avatar/AvatarPreview', () => ({ AvatarPreview: () => null }));
jest.mock('@/services/closet', () => ({
  ...jest.requireActual('@/services/closet'),
  fetchClosetItems: jest.fn(async () => mockItems),
}));

/** Chainable PostgREST stand-in: every call returns itself; awaiting resolves. */
const mockTables: Record<string, unknown> = {};
const mockInvoke = jest.fn();
jest.mock('@/services/supabase', () => {
  const builder = (table: string) => {
    const result = () => ({ data: mockTables[table] ?? null, error: null });
    const chain: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'update', 'delete', 'insert', 'order']) {
      chain[m] = () => chain;
    }
    chain.single = async () => result();
    chain.maybeSingle = async () => result();
    chain.then = (resolve: (v: unknown) => unknown) => resolve(result());
    return chain;
  };
  return {
    isSupabaseConfigured: () => true,
    getSupabase: () => ({
      auth: {
        getSession: async () => ({ data: { session: { user: { id: 'user-1' } } } }),
        getUser: async () => ({ data: { user: { id: 'user-1' } } }),
      },
      functions: { invoke: mockInvoke },
      from: builder,
    }),
  };
});

const USER = 'user-1';
function item(id: string, category: ClosetItem['category']): ClosetItem {
  return {
    id,
    user_id: USER,
    image_url: `https://img/${id}.jpg`,
    imageUri: `https://img/${id}.jpg`,
    category,
    colors: ['navy'],
    formality: 'casual',
    season: [],
    fabric: '',
    pattern: '',
    created_at: '2026-10-01T00:00:00.000Z',
  };
}
const mockItems = [item('t1', 'top'), item('b1', 'bottom'), item('s1', 'shoes')];

const aiPick = (used: number, n = 1) => ({
  data: {
    outfits: Array.from({ length: n }, (_, i) => ({
      outfitId: `o${i + 1}`,
      itemIds: ['t1', 'b1', 's1'],
      reasoning: ['Styled for 20°', 'Navy keeps it calm'],
    })),
    usage: { used, limit: null },
  },
  error: null,
});
const httpError = (status: number, body: unknown) => ({
  data: null,
  error: new FunctionsHttpError(new Response(JSON.stringify(body), { status })),
});

let client: QueryClient;
function renderScreen({ tier = 'free', used = 0 }: { tier?: Tier; used?: number } = {}) {
  client.setQueryData(closetKeys.items(USER), mockItems);
  client.setQueryData(profileKeys.details(USER), { tier } as never);
  client.setQueryData(['profile'], { gender: 'prefer_not_to_say' });
  client.setQueryData(subscriptionKeys.usage(USER, usageDay()), used);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 568 },
        insets: { top: 20, left: 0, right: 0, bottom: 0 },
      }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<OutfitDetailScreen />, { wrapper: Wrapper });
}

/** Staged progress dwells ≈1.4s before boards show. */
const WAIT = { timeout: 4000 };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = { id: 'new' };
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
  usePaywallStore.setState({ reason: null });
});
afterEach(() => client.clear());

it('generates once, then shows the spent allowance and a locked Regenerate on Free', async () => {
  mockInvoke.mockResolvedValue(aiPick(1));
  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  expect(mockInvoke.mock.calls[0][1].body.regenerate).toBe(false);
  expect(screen.getByTestId('outfit-usage').props.children).toMatch(
    /^No AI outfits left today on Free\. More unlock (today|tomorrow) at /,
  );

  // Free sees a locked Regenerate: the paywall explains, no second generation.
  expect(screen.getByText('Plus')).toBeTruthy();
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  expect(usePaywallStore.getState().reason).toBe('regenerate');
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  // The current look stays on screen.
  expect(screen.getByText('AI styled')).toBeTruthy();
});

it('does not call the stylist when today is already used, and opens the paywall', async () => {
  await renderScreen({ tier: 'free', used: 1 });
  expect(await screen.findByTestId('outfit-capped', {}, WAIT)).toBeTruthy();
  expect(screen.getByText("You've used today's AI outfit")).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(usePaywallStore.getState().reason).toBe('daily_limit');
  // No on-device boards sneak past the cap.
  expect(screen.queryByText('On-device')).toBeNull();
});

it('honours a server-side cap (429) instead of falling back to the local composer', async () => {
  mockInvoke.mockResolvedValue(httpError(429, { capped: true, code: 'daily_limit', usage: { used: 1 } }));
  await renderScreen({ tier: 'free', used: 0 });
  expect(await screen.findByTestId('outfit-capped', {}, WAIT)).toBeTruthy();
  expect(screen.queryByText('On-device')).toBeNull();
  expect(usePaywallStore.getState().reason).toBe('daily_limit');
});

it('lets Plus regenerate and tells the server it is a regenerate', async () => {
  mockInvoke.mockResolvedValue(aiPick(2));
  await renderScreen({ tier: 'plus', used: 1 });
  await screen.findByText('AI styled', {}, WAIT);
  expect(screen.getByTestId('outfit-usage').props.children).toBe('1 of 3 AI outfits left today.');
  expect(screen.queryByText('Plus')).toBeNull();

  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  expect(mockInvoke.mock.calls[1][1].body.regenerate).toBe(true);
  expect(usePaywallStore.getState().reason).toBeNull();
});

it('falls back to the on-device composer when the function is unreachable', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('down') });
  await renderScreen({ tier: 'free', used: 0 });
  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(usePaywallStore.getState().reason).toBeNull();
});

it('never spends a generation when opening a saved outfit', async () => {
  mockParams = { id: 'saved-1' };
  mockTables.outfits = { id: 'saved-1', item_ids: ['t1', 'b1', 's1'], event_summary: 'casual', mood: null };
  mockTables.wardrobe_items = mockItems;
  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByLabelText('Remove this outfit', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
});

it('renders the cached last look offline without calling the stylist', async () => {
  // Simulate what PersistQueryClientProvider rehydrates on a cold/offline launch.
  const cached: LastOutfit = {
    day: usageDay(),
    boards: [
      {
        key: 'cached-1',
        top: mockItems[0],
        bottom: mockItems[1],
        shoes: mockItems[2],
        outerwear: null,
        accessory: null,
        score: 0,
        reasons: ['Styled for your saved weather'],
        source: 'ai',
      },
    ],
  };
  client.setQueryData<LastOutfit>(outfitKeys.last(USER), cached);

  await renderScreen({ tier: 'free', used: 0 });

  // Shown immediately — no staged-progress card, no network generation.
  expect(await screen.findByText('AI styled')).toBeTruthy();
  expect(screen.getByText('Styled for your saved weather')).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(usePaywallStore.getState().reason).toBeNull();
});

it('still generates when only an on-device look was cached', async () => {
  // A local board is free to recompose — it must not lock the user out of AI.
  client.setQueryData<LastOutfit>(outfitKeys.last(USER), {
    day: usageDay(),
    boards: [
      {
        key: 'local-1',
        top: mockItems[0],
        bottom: mockItems[1],
        shoes: mockItems[2],
        outerwear: null,
        accessory: null,
        score: 0,
        reasons: ['On-device only'],
        source: 'local',
      },
    ],
  });
  mockInvoke.mockResolvedValue(aiPick(1));

  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

// --- Issue #44: a refresh must never start a second generation --------------

it('resumes a persisted in-flight request instead of spending again', async () => {
  // Mid-generation refresh: the intent survived the reload, the look did not.
  client.setQueryData(outfitKeys.pending(USER), {
    requestId: 'req-in-flight-1',
    day: usageDay(),
  });
  mockInvoke.mockResolvedValue(aiPick(1));

  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  // The server got the original id, so it replays instead of charging again.
  expect(mockInvoke.mock.calls[0][1].body.requestId).toBe('req-in-flight-1');
  // The intent is settled — it can never resume (and re-charge) a third time.
  expect(client.getQueryData(outfitKeys.pending(USER))).toBeUndefined();
  // …and the finished look is cached, so the next remount renders it free.
  expect(client.getQueryData<LastOutfit>(outfitKeys.last(USER))?.boards).toHaveLength(1);
});

it('keeps the intent when the stylist fails so a remount can replay it', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('down') });

  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  // A spend may have landed without a response: the intent must survive so the
  // next mount replays it at no extra cost instead of charging for a lost look.
  const pending = client.getQueryData<{ requestId: string }>(outfitKeys.pending(USER));
  expect(pending?.requestId).toBe(mockInvoke.mock.calls[0][1].body.requestId);
});

it('drops the intent when the server refuses the generation', async () => {
  mockInvoke.mockResolvedValue(
    httpError(429, { capped: true, code: 'daily_limit', usage: { used: 1 } }),
  );

  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByTestId('outfit-capped', {}, WAIT)).toBeTruthy();
  // Nothing was spent on a refusal, so there is nothing to resume.
  expect(client.getQueryData(outfitKeys.pending(USER))).toBeUndefined();
});

it('keeps the intent when the server says the generation is still in flight', async () => {
  // The first invocation is still generating: don't spend a second one.
  client.setQueryData(outfitKeys.pending(USER), {
    requestId: 'req-in-flight-9',
    day: usageDay(),
  });
  mockInvoke.mockResolvedValue({ data: { pending: true, code: 'generation_pending' }, error: null });

  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(client.getQueryData<{ requestId: string }>(outfitKeys.pending(USER))?.requestId).toBe(
    'req-in-flight-9',
  );
});

it('mints a fresh request id when the user regenerates', async () => {
  mockInvoke.mockResolvedValue(aiPick(2));
  await renderScreen({ tier: 'plus', used: 1 });
  await screen.findByText('AI styled', {}, WAIT);
  const first = mockInvoke.mock.calls[0][1].body.requestId;
  expect(typeof first).toBe('string');

  await fireEvent.press(screen.getByTestId('outfit-regenerate'));

  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  // A regenerate is a new intent — it must not replay the previous request.
  expect(mockInvoke.mock.calls[1][1].body.requestId).not.toBe(first);
});
