import { create } from 'zustand';

import type { PaywallReason } from '@/utils/subscription';

interface PaywallState {
  /** Why the paywall is open; null = closed. */
  reason: PaywallReason | null;
  /** Bumps on every open — keys the paywall body so it starts fresh. */
  openCount: number;
  show: (reason: PaywallReason) => void;
  hide: () => void;
}

/**
 * One paywall for the whole app (mounted in app/_layout.tsx). Any screen
 * opens it with a reason, so the copy always explains what just happened.
 */
export const usePaywallStore = create<PaywallState>()((set) => ({
  reason: null,
  openCount: 0,
  show: (reason) => set((state) => ({ reason, openCount: state.openCount + 1 })),
  hide: () => set({ reason: null }),
}));

export const showPaywall = (reason: PaywallReason) => usePaywallStore.getState().show(reason);
