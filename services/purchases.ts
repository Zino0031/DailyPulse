// RevenueCat client (issue #17). The app only *shows* plans and starts
// purchases; the tier that unlocks features is always the server's
// `users.tier`, written by the revenuecat-webhook edge function.
// Docs: https://www.revenuecat.com/docs/getting-started/installation/expo
import { FunctionsHttpError } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import Purchases, {
  PACKAGE_TYPE,
  PURCHASES_ERROR_CODE,
  type PurchasesPackage,
} from 'react-native-purchases';

import { getSupabase } from '@/services/supabase';
import {
  tierFromEntitlementIds,
  tierFromProductId,
  type Tier,
} from '@/supabase/functions/_shared/tiers';
import { isNetworkError } from '@/utils/errors';

export type PaidTier = Exclude<Tier, 'free'>;

/**
 * Public SDK key for this platform. A Test Store key (`test_…`) wins on
 * every platform: purchases are simulated, nothing is ever charged.
 * `process.env.EXPO_PUBLIC_*` must be read literally so Expo inlines it.
 */
export function revenueCatKey(): string | null {
  const test = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY;
  if (test) return test;
  const key = Platform.select({
    ios: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY,
    android: process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY,
    web: process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY,
  });
  return key || null;
}

export function isBillingAvailable(): boolean {
  return revenueCatKey() !== null;
}

/** Test Store / sandbox: show a "no real charges" banner on the paywall. */
export function isTestMode(): boolean {
  return revenueCatKey()?.startsWith('test_') ?? false;
}

let configured = false;
let identifiedAs: string | null = null;

/**
 * Ties RevenueCat to the Supabase account (app user id = auth uid) so the
 * webhook can map purchases back to `users`. Safe to call on every auth
 * change; a no-op without a key.
 */
export async function identifyPurchaser(userId: string | null): Promise<void> {
  const apiKey = revenueCatKey();
  if (!apiKey) return;
  if (!configured) {
    Purchases.configure({ apiKey, appUserID: userId ?? undefined });
    configured = true;
    identifiedAs = userId;
    return;
  }
  if (userId === identifiedAs) return;
  if (userId) {
    await Purchases.logIn(userId);
  } else {
    try {
      await Purchases.logOut();
    } catch {
      // Already anonymous — nothing to clear.
    }
  }
  identifiedAs = userId;
}

/** Test seam: forget SDK state between tests. */
export function resetPurchasesForTests(): void {
  configured = false;
  identifiedAs = null;
}

export interface PlanOffer {
  tier: PaidTier;
  pkg: PurchasesPackage;
  /** Localized by the store, e.g. "$4.99". */
  price: string;
  /** "month", "year", "week" … or null for one-off products. */
  period: string | null;
}

const PERIOD_BY_TYPE: Partial<Record<PACKAGE_TYPE, string>> = {
  [PACKAGE_TYPE.WEEKLY]: 'week',
  [PACKAGE_TYPE.MONTHLY]: 'month',
  [PACKAGE_TYPE.TWO_MONTH]: '2 months',
  [PACKAGE_TYPE.THREE_MONTH]: '3 months',
  [PACKAGE_TYPE.SIX_MONTH]: '6 months',
  [PACKAGE_TYPE.ANNUAL]: 'year',
};

const ISO_UNIT: Record<string, string> = { D: 'day', W: 'week', M: 'month', Y: 'year' };

/** "P1M" → "month", "P3M" → "3 months", null → null. */
export function periodLabel(pkg: PurchasesPackage): string | null {
  const byType = PERIOD_BY_TYPE[pkg.packageType];
  if (byType) return byType;
  const match = /^P(\d+)([DWMY])$/.exec(pkg.product.subscriptionPeriod ?? '');
  if (!match) return null;
  const count = Number(match[1]);
  const unit = ISO_UNIT[match[2]];
  return count === 1 ? unit : `${count} ${unit}s`;
}

/** Monthly first, then the shortest-looking period — one offer per tier. */
function preference(pkg: PurchasesPackage): number {
  const order = [PACKAGE_TYPE.MONTHLY, PACKAGE_TYPE.ANNUAL, PACKAGE_TYPE.WEEKLY];
  const index = order.indexOf(pkg.packageType);
  return index === -1 ? order.length : index;
}

/**
 * Packages from the current offering, matched to tiers by product id
 * (`…plus…` / `…pro…`). Unmatched packages are ignored rather than shown
 * as a mystery plan.
 */
export function toPlanOffers(packages: PurchasesPackage[]): PlanOffer[] {
  const best = new Map<PaidTier, PurchasesPackage>();
  for (const pkg of packages) {
    const tier = tierFromProductId(pkg.product.identifier) ?? tierFromProductId(pkg.identifier);
    if (!tier) continue;
    const current = best.get(tier);
    if (!current || preference(pkg) < preference(current)) best.set(tier, pkg);
  }
  return (['plus', 'pro'] as const)
    .filter((tier) => best.has(tier))
    .map((tier) => {
      const pkg = best.get(tier)!;
      return { tier, pkg, price: pkg.product.priceString, period: periodLabel(pkg) };
    });
}

export async function loadPlanOffers(): Promise<PlanOffer[]> {
  const offerings = await Purchases.getOfferings();
  return toPlanOffers(offerings.current?.availablePackages ?? []);
}

interface StoreError {
  code?: string;
  userCancelled?: boolean | null;
}

export function isPurchaseCancelled(error: unknown): boolean {
  const e = error as StoreError | null;
  return e?.userCancelled === true || e?.code === PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR;
}

/** One calm sentence for any store / SDK failure. */
export function purchaseErrorMessage(error: unknown): string {
  const code = (error as StoreError | null)?.code;
  switch (code) {
    case PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR:
      return 'Your payment is waiting for approval. Your plan unlocks as soon as it goes through.';
    case PURCHASES_ERROR_CODE.NETWORK_ERROR:
    case PURCHASES_ERROR_CODE.OFFLINE_CONNECTION_ERROR:
      return "You're offline — check your connection and try again.";
    case PURCHASES_ERROR_CODE.PURCHASE_NOT_ALLOWED_ERROR:
      return "Purchases aren't allowed on this device. Check Screen Time or parental controls.";
    case PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR:
      return 'You already own this plan. Tap "Restore purchases" to unlock it here.';
    case PURCHASES_ERROR_CODE.RECEIPT_ALREADY_IN_USE_ERROR:
    case PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR:
      return 'This store account already has a plan linked to another myOutfit account.';
    case PURCHASES_ERROR_CODE.PRODUCT_NOT_AVAILABLE_FOR_PURCHASE_ERROR:
      return "This plan isn't available in your region right now.";
    case PURCHASES_ERROR_CODE.STORE_PROBLEM_ERROR:
    case PURCHASES_ERROR_CODE.PRODUCT_REQUEST_TIMED_OUT_ERROR:
      return "The store isn't responding. Please try again in a moment.";
    case PURCHASES_ERROR_CODE.CONFIGURATION_ERROR:
    case PURCHASES_ERROR_CODE.INVALID_CREDENTIALS_ERROR:
      return "Purchases aren't set up correctly in this build yet.";
    case PURCHASES_ERROR_CODE.TEST_STORE_SIMULATED_PURCHASE_ERROR:
      return 'The test store simulated a failed purchase. Nothing was charged.';
    default:
      return isNetworkError(error)
        ? "You're offline — check your connection and try again."
        : "Couldn't complete the purchase. Please try again.";
  }
}

/** Resolves false when the user backs out of the store sheet. */
export async function buyPlan(pkg: PurchasesPackage): Promise<boolean> {
  try {
    await Purchases.purchasePackage(pkg);
    return true;
  } catch (error) {
    if (isPurchaseCancelled(error)) return false;
    throw new Error(purchaseErrorMessage(error));
  }
}

/** The tier the store says this account owns after a restore. */
export async function restorePlan(): Promise<Tier> {
  try {
    const info = await Purchases.restorePurchases();
    return tierFromEntitlementIds(Object.keys(info.entitlements.active));
  } catch (error) {
    throw new Error(purchaseErrorMessage(error));
  }
}

/** Store page where the user can cancel or change billing. */
export async function managementUrl(): Promise<string | null> {
  if (!isBillingAvailable()) return null;
  try {
    return (await Purchases.getCustomerInfo()).managementURL;
  } catch {
    return null;
  }
}

/**
 * Asks the server to re-read RevenueCat and update `users.tier` now,
 * instead of waiting for the webhook (usually seconds, can be minutes).
 */
export async function syncPlanWithServer(): Promise<Tier> {
  const { data, error } = await getSupabase().functions.invoke<{ tier?: Tier }>(
    'revenuecat-webhook',
    { body: {} },
  );
  if (error || !data?.tier) {
    let message = "Couldn't refresh your plan.";
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === 'string')
        message = `${body.error[0].toUpperCase()}${body.error.slice(1)}.`;
    }
    throw new Error(message);
  }
  return data.tier;
}
