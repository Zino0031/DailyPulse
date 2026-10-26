import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { FunctionsFetchError, FunctionsHttpError } from '@supabase/supabase-js';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { StrictMode, type ReactNode } from 'react';
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
/** `EXPO_PUBLIC_AI_GENERATION` switch, mocked per test. */
let mockAiEnabled = true;
jest.mock('@/utils/ai', () => ({ aiGenerationEnabled: () => mockAiEnabled }));
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
/** `consume_my_generation` RPC (on-device mode). */
const mockRpcSingle = jest.fn();
const mockRpc = jest.fn(() => ({ single: mockRpcSingle }));
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
      rpc: mockRpc,
      from: builder,
      storage: {
        from: () => ({
          createSignedUrls: async (paths: string[]) => ({
            data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}` })),
            error: null,
          }),
        }),
      },
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
function renderScreen({
  tier = 'free',
  used = 0,
  strict = false,
}: { tier?: Tier; used?: number; strict?: boolean } = {}) {
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
      <QueryClientProvider client={client}>
        {strict ? <StrictMode>{children}</StrictMode> : children}
      </QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<OutfitDetailScreen />, { wrapper: Wrapper });
}

/** Staged progress dwells ≈1.4s before boards show. */
const WAIT = { timeout: 4000 };

beforeEach(() => {
  jest.clearAllMocks();
  // clearAllMocks keeps implementations; a mockReturnValue from one test would
  // otherwise leak a never-resolving promise into the next.
  mockInvoke.mockReset();
  for (const table of Object.keys(mockTables)) delete mockTables[table];
  mockAiEnabled = true;
  mockRpcSingle.mockReset();
  mockRpcSingle.mockResolvedValue({
    data: { allowed: true, used: 1, daily_limit: 3, tier: 'plus' },
    error: null,
  });
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

it('never offers an upgrade to a Pro user at the daily cap', async () => {
  await renderScreen({ tier: 'pro', used: 20 });
  expect(await screen.findByTestId('outfit-capped', {}, WAIT)).toBeTruthy();
  expect(usePaywallStore.getState().reason).toBeNull();
  expect(screen.queryByText('See plans')).toBeNull();
  expect(screen.getByText(/More unlock (today|tomorrow) at /)).toBeTruthy();
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

it('requests the catalog maximum and renders every option the server returns', async () => {
  // Issue #48 D2: a cold plan cache must not clamp a Pro response to 1.
  mockInvoke.mockResolvedValue(aiPick(1, 3));
  await renderScreen({ tier: 'pro', used: 0 });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke.mock.calls[0][1].body.count).toBe(3);
  expect(screen.getByText('Option 3')).toBeTruthy();
});

it('excludes every top from the previous generation when regenerating', async () => {
  // Issue #48 D3: the server must not bring back a top already on screen.
  mockItems.push(item('t2', 'top'), item('t3', 'top'));
  mockInvoke.mockResolvedValue({
    data: {
      outfits: [
        { outfitId: 'o1', itemIds: ['t1', 'b1', 's1'], reasoning: [] },
        { outfitId: 'o2', itemIds: ['t2', 'b1', 's1'], reasoning: [] },
        { outfitId: 'o3', itemIds: ['t3', 'b1', 's1'], reasoning: [] },
      ],
      usage: { used: 1, limit: null },
    },
    error: null,
  });
  try {
    await renderScreen({ tier: 'plus', used: 0 });
    await screen.findByText('AI styled', {}, WAIT);

    await fireEvent.press(screen.getByTestId('outfit-regenerate'));
    await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
    expect(mockInvoke.mock.calls[1][1].body.excludeTopIds).toEqual(
      expect.arrayContaining(['t1', 't2', 't3']),
    );
  } finally {
    mockItems.splice(3);
  }
});

it('falls back to the on-device composer when the function is unreachable', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('down') });
  await renderScreen({ tier: 'free', used: 0 });
  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(usePaywallStore.getState().reason).toBeNull();
});

it('never spends a generation when opening a saved outfit', async () => {
  mockParams = { id: 'saved-1' };
  mockTables.outfits = {
    id: 'saved-1',
    item_ids: ['t1', 'b1', 's1'],
    event_summary: 'casual',
    mood: null,
    rendered_image_url: 'renders/user-1/look.png',
  };
  mockTables.wardrobe_items = mockItems;
  await renderScreen({ tier: 'free', used: 0 });

  expect(await screen.findByLabelText('Remove this outfit', {}, WAIT)).toBeTruthy();
  // A persisted preview is shown directly — no "Preview with AI" re-spend path.
  expect(await screen.findByLabelText('AI style preview of this outfit', {}, WAIT)).toBeTruthy();
  expect(screen.queryByText('Preview with AI')).toBeNull();
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

it('restores a cached on-device look instead of spending again', async () => {
  // Every look now spends the daily allowance, so a remount reuses the cached
  // board rather than generating (and paying) for the same look again.
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

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(screen.getByText('On-device only')).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockRpc).not.toHaveBeenCalled();
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

it('charges the on-device fallback when the stylist fails without spending', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('down') });

  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  // The server count didn't move, so the fallback look is charged like any
  // other generation and the intent is settled.
  expect(mockRpc).toHaveBeenCalledWith('consume_my_generation');
  expect(client.getQueryData(outfitKeys.pending(USER))).toBeUndefined();
  // Cached, so a remount reuses the look instead of spending again.
  expect(client.getQueryData<LastOutfit>(outfitKeys.last(USER))?.boards).toHaveLength(1);
});

it('keeps the intent and does not double-charge when the AI already spent', async () => {
  mockInvoke.mockImplementation(async () => {
    // The function reserved a generation even though the response was lost.
    mockTables.generation_usage = { used: 1 };
    return { data: null, error: new FunctionsFetchError('down') };
  });

  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(mockRpc).not.toHaveBeenCalled();
  expect(screen.getByText('2 of 3 AI outfits left today.')).toBeTruthy();
  // The paid intent survives so a remount can replay the recorded result.
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

it('keeps the intent and asks the user to check again when the server is still cooking', async () => {
  // The first invocation is still generating: don't spend a second one, and
  // don't silently show an on-device look the user may have paid for.
  client.setQueryData(outfitKeys.pending(USER), {
    requestId: 'req-in-flight-9',
    day: usageDay(),
  });
  mockInvoke.mockResolvedValue({ data: { pending: true, code: 'generation_pending' }, error: null });

  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByTestId('outfit-pending-card', {}, WAIT)).toBeTruthy();
  expect(screen.queryByText('On-device')).toBeNull();
  expect(client.getQueryData<{ requestId: string }>(outfitKeys.pending(USER))?.requestId).toBe(
    'req-in-flight-9',
  );

  // "Check again" resends the same id — no new intent, no second spend.
  const before = mockInvoke.mock.calls.length;
  await fireEvent.press(screen.getByText('Check again'));
  await waitFor(() => expect(mockInvoke.mock.calls.length).toBeGreaterThan(before));
  expect(mockInvoke.mock.calls.at(-1)?.[1].body.requestId).toBe('req-in-flight-9');
  expect(mockInvoke.mock.calls.at(-1)?.[1].body.regenerate).toBe(false);
});

it('resumes a persisted regenerate intent with its original exclude list', async () => {
  // A regenerate that was in flight must not silently become a first run that
  // repeats the previous top (#44).
  client.setQueryData(outfitKeys.pending(USER), {
    requestId: 'req-regen-1',
    day: usageDay(),
    regenerate: true,
    excludeTopIds: ['t-old'],
  });
  mockInvoke.mockResolvedValue(aiPick(2));

  await renderScreen({ tier: 'plus', used: 0 });
  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();

  expect(mockInvoke.mock.calls[0][1].body.requestId).toBe('req-regen-1');
  expect(mockInvoke.mock.calls[0][1].body.regenerate).toBe(true);
  expect(mockInvoke.mock.calls[0][1].body.excludeTopIds).toEqual(['t-old']);
});

it('does not hang the spinner when the effect re-runs mid-flight (StrictMode)', async () => {
  mockInvoke.mockResolvedValue(aiPick(1));

  await renderScreen({ tier: 'free', used: 0, strict: true });

  // Mount → cleanup → mount used to cancel the only run and leave the spinner
  // up forever; the re-join means the boards still arrive, once.
  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
});

it('replays a pending intent on Regenerate instead of spending a new one', async () => {
  mockInvoke.mockResolvedValue(aiPick(2));
  await renderScreen({ tier: 'plus', used: 1 });
  await screen.findByText('AI styled', {}, WAIT);

  // A pending intent still owns a generation — Regenerate must replay it.
  client.setQueryData(outfitKeys.pending(USER), {
    requestId: 'req-pending-1',
    day: usageDay(),
    regenerate: true,
    excludeTopIds: [],
  });
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  expect(mockInvoke.mock.calls[1][1].body.requestId).toBe('req-pending-1');
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

it('tracks saved state per option instead of marking every option saved', async () => {
  mockInvoke.mockResolvedValue(aiPick(1, 2));
  await renderScreen({ tier: 'plus', used: 0 });

  // Save option 1.
  await screen.findByText('Option 2', {}, WAIT);
  await fireEvent.press(screen.getByLabelText('Save this outfit'));
  expect(await screen.findByLabelText('Unsave this outfit', {}, WAIT)).toBeTruthy();

  // Option 2 is a different row — it must still offer Save.
  await fireEvent.press(screen.getByLabelText('Preview option 2'));
  expect(screen.getByText('Save this look')).toBeTruthy();
  expect(screen.queryByLabelText('Unsave this outfit')).toBeNull();

  // Switching back restores option 1's saved state.
  await fireEvent.press(screen.getByLabelText('Preview option 1'));
  expect(screen.getByText('Saved ✓ — tap to unsave')).toBeTruthy();
});

it('deducts a regeneration from the daily allowance', async () => {
  mockInvoke.mockResolvedValueOnce(aiPick(1));
  await renderScreen({ tier: 'plus', used: 0 });
  await screen.findByText('AI styled', {}, WAIT);
  expect(screen.getByText('2 of 3 AI outfits left today.')).toBeTruthy();

  mockInvoke.mockResolvedValueOnce(aiPick(2));
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('1 of 3 AI outfits left today.', {}, WAIT)).toBeTruthy();
});

it('accepts the legacy single-outfit response instead of discarding it', async () => {
  mockInvoke.mockResolvedValue({
    data: {
      outfitId: 'legacy-1',
      itemIds: ['t1', 'b1', 's1'],
      reasoning: ['Styled for 20°'],
      usage: { used: 1, limit: null },
    },
    error: null,
  });
  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(screen.getByText('2 of 3 AI outfits left today.')).toBeTruthy();
  expect(screen.queryByTestId('outfit-ai-unavailable')).toBeNull();
});

it('charges the on-device fallback so the meter reflects the press', async () => {
  mockInvoke.mockResolvedValue({ data: null, error: new FunctionsFetchError('down') });
  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(screen.getByTestId('outfit-ai-unavailable')).toBeTruthy();
  // The AI didn't spend, so the fallback look spends one like any generation.
  expect(mockRpc).toHaveBeenCalledWith('consume_my_generation');
  expect(screen.getByText('2 of 3 AI outfits left today.')).toBeTruthy();
});

it('meters an on-device generation and lets Plus regenerate', async () => {
  mockAiEnabled = false;
  await renderScreen({ tier: 'plus', used: 0 });

  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(mockRpc).toHaveBeenCalledWith('consume_my_generation');
  // The first on-device look spends a daily generation just like an AI one.
  expect(screen.getByText('2 of 3 AI outfits left today.')).toBeTruthy();

  mockRpcSingle.mockResolvedValueOnce({
    data: { allowed: true, used: 2, daily_limit: 3, tier: 'plus' },
    error: null,
  });
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  expect(await screen.findByText('1 of 3 AI outfits left today.', {}, WAIT)).toBeTruthy();
});

it('opens the paywall when the server refuses an on-device generation', async () => {
  mockAiEnabled = false;
  mockRpcSingle.mockResolvedValueOnce({
    data: { allowed: false, used: 3, daily_limit: 3, tier: 'plus' },
    error: null,
  });
  await renderScreen({ tier: 'plus', used: 2 });

  expect(await screen.findByTestId('outfit-capped', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).not.toHaveBeenCalled();
  expect(usePaywallStore.getState().reason).toBe('daily_limit');
  // The look never lands on screen once the server says no.
  expect(screen.queryByText('On-device')).toBeNull();
});

it('marks a fresh regenerate after a charged fallback', async () => {
  mockInvoke.mockResolvedValueOnce(aiPick(1));
  await renderScreen({ tier: 'plus', used: 0 });
  await screen.findByText('AI styled', {}, WAIT);

  // First Regenerate fails; the on-device fallback is charged and settles the
  // intent, so the next press is a brand-new regenerate.
  mockInvoke.mockResolvedValueOnce({ data: null, error: new FunctionsFetchError('down') });
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  expect(await screen.findByText('On-device', {}, WAIT)).toBeTruthy();

  mockInvoke.mockResolvedValueOnce(aiPick(2));
  await fireEvent.press(screen.getByTestId('outfit-regenerate'));
  await waitFor(() => expect(mockInvoke).toHaveBeenCalledTimes(3));
  expect(mockInvoke.mock.calls[2][1].body.regenerate).toBe(true);
});

// Kept last: it defers the server response with a long-lived promise, which
// must not be left in flight while other tests run.
it('renders the result after a mid-flight remount with a single call', async () => {
  // Hold the server response so the remount happens while it is in flight.
  let resolveInvoke!: (value: unknown) => void;
  mockInvoke.mockReturnValue(
    new Promise((resolve) => {
      resolveInvoke = resolve;
    }),
  );

  const first = await renderScreen({ tier: 'free', used: 0 });
  await waitFor(() => expect(client.getQueryData(outfitKeys.pending(USER))).toBeTruthy());
  first.unmount();

  // A refresh keeps the persisted cache: same id, same in-flight call.
  const second = await renderScreen({ tier: 'free', used: 0 });
  await act(async () => {
    resolveInvoke(aiPick(1));
  });

  expect(await screen.findByText('AI styled', {}, WAIT)).toBeTruthy();
  expect(mockInvoke).toHaveBeenCalledTimes(1);
  second.unmount();
});
