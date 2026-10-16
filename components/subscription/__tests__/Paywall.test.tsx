import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import type { ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Paywall } from '@/components/subscription/Paywall';
import { profileKeys } from '@/hooks/useProfile';
import * as purchases from '@/services/purchases';
import type { PlanOffer } from '@/services/purchases';
import { useAuthStore } from '@/store/useAuthStore';
import { showPaywall, usePaywallStore } from '@/store/usePaywallStore';
import type { Tier } from '@/types/database';

jest.mock('@/services/purchases', () => ({
  isBillingAvailable: jest.fn(),
  isTestMode: jest.fn(),
  loadPlanOffers: jest.fn(),
  buyPlan: jest.fn(),
  restorePlan: jest.fn(),
  syncPlanWithServer: jest.fn(),
  managementUrl: jest.fn(),
  identifyPurchaser: jest.fn(),
}));

const api = purchases as jest.Mocked<typeof purchases>;
const USER = 'user-1';
const offer = (tier: 'plus' | 'pro', price: string): PlanOffer =>
  ({ tier, price, period: 'month', pkg: { identifier: `${tier}_monthly` } }) as never;
const OFFERS = [offer('plus', '$4.99'), offer('pro', '$9.99')];

let client: QueryClient;
function renderPaywall(tier: Tier = 'free') {
  client.setQueryData(profileKeys.details(USER), { tier } as never);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 320, height: 568 },
        insets: { top: 20, left: 0, right: 0, bottom: 0 },
      }}>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </SafeAreaProvider>
  );
  return render(<Paywall />, { wrapper: Wrapper });
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
  usePaywallStore.setState({ reason: null });
  api.isBillingAvailable.mockReturnValue(true);
  api.isTestMode.mockReturnValue(false);
  api.loadPlanOffers.mockResolvedValue(OFFERS);
});
afterEach(() => client.clear());

it('stays closed until a screen asks for it', async () => {
  await renderPaywall();
  expect(screen.queryByTestId('paywall')).toBeNull();
  expect(api.loadPlanOffers).not.toHaveBeenCalled();
});

it('explains the trigger and lists Free (current) plus both upgrades with store prices', async () => {
  await renderPaywall('free');
  await act(async () => showPaywall('regenerate'));

  expect(screen.getByText('Regenerate comes with Plus')).toBeTruthy();
  expect(screen.getByTestId('paywall-plan-free')).toBeTruthy();
  expect(screen.getByText('Your plan')).toBeTruthy();
  expect(await screen.findByText('$4.99 / month')).toBeTruthy();
  expect(screen.getByText('$9.99 / month')).toBeTruthy();
  // The plan that unlocks the feature is the recommended one.
  expect(screen.getByText('Recommended')).toBeTruthy();
  expect(screen.getByTestId('paywall-buy-plus').props.accessibilityHint).toBe(
    'Opens the App Store to subscribe for $4.99 per month',
  );
  expect(screen.queryByTestId('paywall-test-mode')).toBeNull();
});

it('only offers upgrades — a Plus user sees Plus (current) and Pro', async () => {
  await renderPaywall('plus');
  await act(async () => showPaywall('daily_limit'));
  expect(screen.queryByTestId('paywall-plan-free')).toBeNull();
  expect(screen.queryByTestId('paywall-buy-plus')).toBeNull();
  expect(screen.getByTestId('paywall-buy-pro')).toBeTruthy();
  expect(screen.getByLabelText('Manage subscription')).toBeTruthy();
});

it('flags test mode so testers know nothing is charged', async () => {
  api.isTestMode.mockReturnValue(true);
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  expect(
    screen.getByText('Test mode — purchases are simulated and nothing is charged.'),
  ).toBeTruthy();
});

it('explains when this build cannot sell plans instead of showing dead buttons', async () => {
  api.isBillingAvailable.mockReturnValue(false);
  await renderPaywall();
  await act(async () => showPaywall('closet_full'));

  expect(screen.getByTestId('paywall-unavailable')).toBeTruthy();
  expect(screen.queryByTestId('paywall-buy-plus')).toBeNull();
  expect(screen.queryByTestId('paywall-restore')).toBeNull();
  // Perks are still readable so users know what each plan includes.
  expect(screen.getByText('Up to 250 closet items')).toBeTruthy();
  expect(api.loadPlanOffers).not.toHaveBeenCalled();
});

it('disables a plan the store has no price for, and says why', async () => {
  api.loadPlanOffers.mockResolvedValue([offer('plus', '$4.99')]);
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  expect(await screen.findByText('Not available yet')).toBeTruthy();
  expect(screen.getByTestId('paywall-buy-pro').props.accessibilityState.disabled).toBe(true);
});

it('offers a retry when prices fail to load', async () => {
  api.loadPlanOffers.mockRejectedValue(new Error('Network request failed'));
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  // usePlanOffers retries once (≈1s backoff) before giving up.
  expect(
    await screen.findByText(
      "You're offline — check your connection and try again.",
      {},
      { timeout: 4000 },
    ),
  ).toBeTruthy();
  // Cards say the price failed to load — not that the plan doesn't exist.
  expect(screen.getAllByText("Price didn't load")).toHaveLength(2);
  expect(screen.queryByText('Not available yet')).toBeNull();
  api.loadPlanOffers.mockResolvedValue(OFFERS);
  await fireEvent.press(screen.getByLabelText('Retry'));
  expect(await screen.findByText('$4.99 / month')).toBeTruthy();
});

it('buys, syncs the server tier and confirms', async () => {
  api.buyPlan.mockResolvedValue(true);
  api.syncPlanWithServer.mockResolvedValue('plus');
  await renderPaywall();
  await act(async () => showPaywall('closet_full'));
  await screen.findByText('$4.99 / month');

  await fireEvent.press(screen.getByTestId('paywall-buy-plus'));
  expect(await screen.findByText("You're on Plus now. Enjoy!")).toBeTruthy();
  expect(api.buyPlan).toHaveBeenCalledWith(OFFERS[0].pkg);
  expect(screen.getByLabelText('Done')).toBeTruthy();
});

it('says the plan is activating when the server sync lags', async () => {
  api.buyPlan.mockResolvedValue(true);
  api.syncPlanWithServer.mockRejectedValue(new Error('down'));
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  await screen.findByText('$9.99 / month');

  await fireEvent.press(screen.getByTestId('paywall-buy-pro'));
  expect(await screen.findByText(/your Pro plan is activating/)).toBeTruthy();
});

it('shows nothing alarming when the user backs out of the store', async () => {
  api.buyPlan.mockResolvedValue(false);
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  await screen.findByText('$4.99 / month');
  await fireEvent.press(screen.getByTestId('paywall-buy-plus'));
  await waitFor(() => expect(api.buyPlan).toHaveBeenCalled());
  expect(screen.queryByTestId('paywall-notice')).toBeNull();
  expect(api.syncPlanWithServer).not.toHaveBeenCalled();
});

it('shows store errors in plain words', async () => {
  api.buyPlan.mockRejectedValue(
    new Error(
      'Your payment is waiting for approval. Your plan unlocks as soon as it goes through.',
    ),
  );
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  await screen.findByText('$4.99 / month');
  await fireEvent.press(screen.getByTestId('paywall-buy-plus'));
  expect(await screen.findByText(/waiting for approval/)).toBeTruthy();
});

describe('restore purchases', () => {
  it('restores a previous plan', async () => {
    api.restorePlan.mockResolvedValue('pro');
    api.syncPlanWithServer.mockResolvedValue('pro');
    await renderPaywall();
    await act(async () => showPaywall('upgrade'));
    await fireEvent.press(screen.getByTestId('paywall-restore'));
    expect(await screen.findByText("Restored — you're on Pro.")).toBeTruthy();
  });

  it('says so when there is nothing to restore', async () => {
    api.restorePlan.mockResolvedValue('free');
    api.syncPlanWithServer.mockResolvedValue('free');
    await renderPaywall();
    await act(async () => showPaywall('upgrade'));
    await fireEvent.press(screen.getByTestId('paywall-restore'));
    expect(
      await screen.findByText("We didn't find an active plan on this App Store account."),
    ).toBeTruthy();
  });
});

it('starts fresh on every opening', async () => {
  api.restorePlan.mockResolvedValue('free');
  api.syncPlanWithServer.mockResolvedValue('free');
  await renderPaywall();
  await act(async () => showPaywall('upgrade'));
  await fireEvent.press(screen.getByTestId('paywall-restore'));
  await screen.findByTestId('paywall-notice');

  await fireEvent.press(screen.getByTestId('paywall-close'));
  expect(usePaywallStore.getState().reason).toBeNull();
  await act(async () => showPaywall('hd'));
  expect(screen.getByText('HD previews come with Pro')).toBeTruthy();
  expect(screen.queryByTestId('paywall-notice')).toBeNull();
});
