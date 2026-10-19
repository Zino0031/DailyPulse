import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';

import { useClosetItems } from '@/hooks/useCloset';
import { profileKeys, useProfileDetails } from '@/hooks/useProfile';
import {
  buyPlan,
  identifyPurchaser,
  isBillingAvailable,
  loadPlanOffers,
  restorePlan,
  syncPlanWithServer,
  type PlanOffer,
} from '@/services/purchases';
import { getSupabase, isSupabaseConfigured } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';
import { planFor, usageDay, type Tier } from '@/supabase/functions/_shared/tiers';
import type { SubscriptionRow } from '@/types/database';
import { allowanceOf, type Allowance } from '@/utils/subscription';

export const subscriptionKeys = {
  all: ['subscription'] as const,
  usage: (userId: string | null, day: string) => ['subscription', userId, 'usage', day] as const,
  preview: (userId: string | null, day: string) =>
    ['subscription', userId, 'preview', day] as const,
  row: (userId: string | null) => ['subscription', userId, 'row'] as const,
  offers: (userId: string | null) => ['subscription', userId, 'offers'] as const,
};

function useUserId(): string | null {
  return useAuthStore((s) => s.user?.id ?? null);
}

/**
 * The plan that gates features — always the server's `users.tier`, so the
 * UI never promises what the backend will refuse.
 */
export function usePlan() {
  // isLoading (not isPending): a disabled query — signed out, or no
  // backend configured — must fall back to Free, not spin forever.
  const { data, isLoading } = useProfileDetails();
  const tier: Tier = planFor(data?.tier).id;
  return { tier, plan: planFor(tier), isLoading: isLoading && data === undefined };
}

/** Today's AI generations vs the plan's daily allowance (UTC day). */
export function useGenerationUsage(): Allowance & { isLoading: boolean } {
  const userId = useUserId();
  const { plan } = usePlan();
  const day = usageDay();
  const query = useQuery({
    queryKey: subscriptionKeys.usage(userId, day),
    queryFn: async (): Promise<number> => {
      const { data, error } = await getSupabase()
        .from('generation_usage')
        .select('used')
        .eq('user_id', userId as string)
        .eq('day', day)
        .maybeSingle();
      if (error) throw error;
      return data?.used ?? 0;
    },
    enabled: userId !== null && isSupabaseConfigured(),
    staleTime: 60 * 1000,
    retry: 1,
  });
  return {
    ...allowanceOf(plan.dailyGenerations, query.data ?? 0),
    isLoading: query.isLoading,
  };
}

/** Today's AI previews vs the plan's daily allowance (UTC day). */
export function usePreviewUsage(): Allowance & { isLoading: boolean } {
  const userId = useUserId();
  const { plan } = usePlan();
  const day = usageDay();
  const query = useQuery({
    queryKey: subscriptionKeys.preview(userId, day),
    queryFn: async (): Promise<number> => {
      const { data, error } = await getSupabase()
        .from('preview_usage')
        .select('used')
        .eq('user_id', userId as string)
        .eq('day', day)
        .maybeSingle();
      if (error) throw error;
      return data?.used ?? 0;
    },
    enabled: userId !== null && isSupabaseConfigured(),
    staleTime: 60 * 1000,
    retry: 1,
  });
  return {
    ...allowanceOf(plan.dailyPreviews, query.data ?? 0),
    isLoading: query.isLoading,
  };
}

/** Closet items vs the plan's capacity. Reads the (offline) closet cache. */
export function useClosetCapacity(): Allowance {
  const { plan } = usePlan();
  const { data } = useClosetItems();
  return allowanceOf(plan.itemLimit, data?.length ?? 0);
}

/** Renewal / expiry details written by the RevenueCat webhook. */
export function useSubscriptionRow() {
  const userId = useUserId();
  return useQuery({
    queryKey: subscriptionKeys.row(userId),
    queryFn: async (): Promise<SubscriptionRow | null> => {
      const { data, error } = await getSupabase()
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: userId !== null && isSupabaseConfigured(),
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Store prices for Plus / Pro. Only fetched while the paywall is open. */
export function usePlanOffers(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: subscriptionKeys.offers(userId),
    queryFn: loadPlanOffers,
    enabled: enabled && isBillingAvailable(),
    staleTime: 30 * 60 * 1000,
    retry: 1,
  });
}

export interface PlanChangeResult {
  /** False when the user cancelled the store sheet. */
  completed: boolean;
  /** Tier the store reports; the server may lag a few seconds. */
  tier: Tier | null;
  /** True once `users.tier` is confirmed updated on the server. */
  synced: boolean;
}

/** Server sync + cache refresh after any store change. */
async function settle(queryClient: QueryClient, storeTier: Tier): Promise<PlanChangeResult> {
  let synced = false;
  let tier: Tier = storeTier;
  try {
    tier = await syncPlanWithServer();
    synced = true;
  } catch {
    // The webhook still lands; the UI says the plan is activating.
  }
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: profileKeys.all }),
    queryClient.invalidateQueries({ queryKey: subscriptionKeys.all }),
  ]);
  return { completed: true, tier, synced };
}

export function usePurchasePlan() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (offer: PlanOffer): Promise<PlanChangeResult> => {
      const bought = await buyPlan(offer.pkg);
      if (!bought) return { completed: false, tier: null, synced: false };
      return settle(queryClient, offer.tier);
    },
  });
}

export function useRestorePurchases() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<PlanChangeResult> => settle(queryClient, await restorePlan()),
  });
}

/** Keeps RevenueCat's app user id in step with the signed-in account. */
export function usePurchasesIdentity(): void {
  const userId = useUserId();
  useEffect(() => {
    identifyPurchaser(userId).catch(() => {
      // Purchases stay unavailable this session; the paywall explains why.
    });
  }, [userId]);
}
