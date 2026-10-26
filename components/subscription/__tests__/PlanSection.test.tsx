import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react-native';
import type { ReactNode } from 'react';

import { PlanSection } from '@/components/subscription/PlanSection';
import { closetKeys } from '@/hooks/useCloset';
import { profileKeys } from '@/hooks/useProfile';
import { subscriptionKeys } from '@/hooks/useSubscription';
import { useAuthStore } from '@/store/useAuthStore';
import { usePaywallStore } from '@/store/usePaywallStore';
import { usageDay } from '@/supabase/functions/_shared/tiers';
import type { Tier } from '@/types/database';

const USER = 'user-1';
let client: QueryClient;

function renderSection(tier?: Tier, items = 0, usedGenerations = 0) {
  if (tier) client.setQueryData(profileKeys.details(USER), { tier } as never);
  client.setQueryData(
    closetKeys.items(USER),
    Array.from({ length: items }, (_, i) => ({ id: `i${i}` })),
  );
  client.setQueryData(subscriptionKeys.usage(USER, usageDay()), usedGenerations);
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return render(<PlanSection />, { wrapper: Wrapper });
}

beforeEach(() => {
  client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  useAuthStore.setState({ user: { id: USER } as never, isLoading: false });
  usePaywallStore.setState({ reason: null });
});
afterEach(() => client.clear());

it('falls back to Free instead of loading forever when the profile query is disabled', async () => {
  // No backend env in Jest → useProfileDetails never runs.
  await renderSection();
  expect(screen.queryByText('Loading your plan…')).toBeNull();
  expect(screen.getByText('Everything you need to get started')).toBeTruthy();
  expect(screen.getByLabelText('Upgrade')).toBeTruthy();
});

it('shows both allowances with numbers, and a full closet in words', async () => {
  await renderSection('free', 50);
  expect(screen.getByTestId('profile-closet-meter').props.accessibilityValue).toMatchObject({
    max: 50,
    now: 50,
  });
  expect(screen.getByText('Full — upgrade to add more. Nothing gets deleted.')).toBeTruthy();
  expect(screen.getByText(/^Resets (today|tomorrow) at /)).toBeTruthy();
});

it('shows finite Pro budgets and opens the plan sheet', async () => {
  await renderSection('pro', 300, 7);
  expect(screen.getByText('7 of 20')).toBeTruthy();
  expect(screen.queryByText(/^Resets /)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText('Manage plan'));
  expect(usePaywallStore.getState().reason).toBe('upgrade');
});
