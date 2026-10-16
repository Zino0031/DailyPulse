import { FunctionsHttpError } from '@supabase/supabase-js';
import Purchases, { PACKAGE_TYPE, PURCHASES_ERROR_CODE } from 'react-native-purchases';

import {
  buyPlan,
  identifyPurchaser,
  isBillingAvailable,
  isTestMode,
  loadPlanOffers,
  periodLabel,
  purchaseErrorMessage,
  resetPurchasesForTests,
  restorePlan,
  revenueCatKey,
  syncPlanWithServer,
  toPlanOffers,
} from '@/services/purchases';
import { getSupabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({ getSupabase: jest.fn() }));

const sdk = Purchases as jest.Mocked<typeof Purchases>;
const invoke = jest.fn();
(getSupabase as jest.Mock).mockReturnValue({ functions: { invoke } });

const KEYS = [
  'EXPO_PUBLIC_REVENUECAT_TEST_KEY',
  'EXPO_PUBLIC_REVENUECAT_IOS_KEY',
  'EXPO_PUBLIC_REVENUECAT_ANDROID_KEY',
  'EXPO_PUBLIC_REVENUECAT_WEB_KEY',
] as const;

function pkg(identifier: string, productId: string, packageType: string, extra = {}) {
  return {
    identifier,
    packageType,
    product: {
      identifier: productId,
      priceString: '$4.99',
      subscriptionPeriod: 'P1M',
      ...extra,
    },
  } as never;
}

beforeEach(() => {
  jest.clearAllMocks();
  resetPurchasesForTests();
  for (const key of KEYS) delete process.env[key];
});

describe('API keys', () => {
  it('is unavailable without a key, so the paywall can explain it', () => {
    expect(revenueCatKey()).toBeNull();
    expect(isBillingAvailable()).toBe(false);
    expect(isTestMode()).toBe(false);
  });

  it('uses the platform key (jest runs as iOS)', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_123';
    process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY = 'goog_123';
    expect(revenueCatKey()).toBe('appl_123');
    expect(isTestMode()).toBe(false);
  });

  it('prefers a Test Store key everywhere — no real charges', () => {
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY = 'appl_123';
    process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'test_abc';
    expect(revenueCatKey()).toBe('test_abc');
    expect(isTestMode()).toBe(true);
  });
});

describe('identifyPurchaser', () => {
  it('does nothing without a key', async () => {
    await identifyPurchaser('u1');
    expect(sdk.configure).not.toHaveBeenCalled();
  });

  it('configures once with the account id, then follows account switches', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'test_abc';
    await identifyPurchaser('u1');
    expect(sdk.configure).toHaveBeenCalledWith({ apiKey: 'test_abc', appUserID: 'u1' });

    await identifyPurchaser('u1');
    expect(sdk.logIn).not.toHaveBeenCalled();

    await identifyPurchaser('u2');
    expect(sdk.logIn).toHaveBeenCalledWith('u2');

    await identifyPurchaser(null);
    expect(sdk.logOut).toHaveBeenCalledTimes(1);
    expect(sdk.configure).toHaveBeenCalledTimes(1);
  });

  it('survives logging out an already-anonymous user', async () => {
    process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY = 'test_abc';
    await identifyPurchaser('u1');
    sdk.logOut.mockRejectedValueOnce({ code: PURCHASES_ERROR_CODE.LOG_OUT_ANONYMOUS_USER_ERROR });
    await expect(identifyPurchaser(null)).resolves.toBeUndefined();
  });
});

describe('plan offers', () => {
  it('maps packages to tiers, one per tier, monthly first', () => {
    const offers = toPlanOffers([
      pkg('$rc_annual', 'myoutfit_plus_annual', PACKAGE_TYPE.ANNUAL, { priceString: '$39.99' }),
      pkg('$rc_monthly', 'myoutfit_plus_monthly', PACKAGE_TYPE.MONTHLY),
      pkg('pro', 'myoutfit_pro_monthly', PACKAGE_TYPE.MONTHLY, { priceString: '$9.99' }),
      pkg('coins', 'coin_pack', PACKAGE_TYPE.CUSTOM),
    ]);
    expect(offers.map((o) => [o.tier, o.price, o.period])).toEqual([
      ['plus', '$4.99', 'month'],
      ['pro', '$9.99', 'month'],
    ]);
  });

  it('labels custom periods from the ISO duration', () => {
    expect(periodLabel(pkg('x', 'pro_x', PACKAGE_TYPE.CUSTOM, { subscriptionPeriod: 'P3M' }))).toBe(
      '3 months',
    );
    expect(periodLabel(pkg('x', 'pro_x', PACKAGE_TYPE.CUSTOM, { subscriptionPeriod: 'P1W' }))).toBe(
      'week',
    );
    expect(periodLabel(pkg('x', 'pro_x', PACKAGE_TYPE.LIFETIME, { subscriptionPeriod: null }))).toBe(
      null,
    );
  });

  it('returns no offers when the dashboard has no current offering', async () => {
    sdk.getOfferings.mockResolvedValueOnce({ current: null, all: {} } as never);
    await expect(loadPlanOffers()).resolves.toEqual([]);
  });
});

describe('buyPlan', () => {
  const plan = pkg('$rc_monthly', 'plus_monthly', PACKAGE_TYPE.MONTHLY);

  it('resolves true on success', async () => {
    sdk.purchasePackage.mockResolvedValueOnce({} as never);
    await expect(buyPlan(plan)).resolves.toBe(true);
  });

  it('treats backing out of the store sheet as a non-error', async () => {
    sdk.purchasePackage.mockRejectedValueOnce({
      code: PURCHASES_ERROR_CODE.PURCHASE_CANCELLED_ERROR,
      userCancelled: true,
    });
    await expect(buyPlan(plan)).resolves.toBe(false);
  });

  it('turns store failures into a readable sentence', async () => {
    sdk.purchasePackage.mockRejectedValueOnce({ code: PURCHASES_ERROR_CODE.PAYMENT_PENDING_ERROR });
    await expect(buyPlan(plan)).rejects.toThrow(/waiting for approval/);
  });
});

it.each([
  [PURCHASES_ERROR_CODE.NETWORK_ERROR, /offline/],
  [PURCHASES_ERROR_CODE.PRODUCT_ALREADY_PURCHASED_ERROR, /Restore purchases/],
  [PURCHASES_ERROR_CODE.RECEIPT_IN_USE_BY_OTHER_SUBSCRIBER_ERROR, /another myOutfit account/],
  [PURCHASES_ERROR_CODE.TEST_STORE_SIMULATED_PURCHASE_ERROR, /Nothing was charged/],
  ['999', /Couldn't complete the purchase/],
])('purchaseErrorMessage(%s)', (code, message) => {
  expect(purchaseErrorMessage({ code })).toMatch(message);
});

describe('restorePlan', () => {
  it('reports the restored tier from active entitlements', async () => {
    sdk.restorePurchases.mockResolvedValueOnce({
      entitlements: { active: { pro: {}, plus: {} } },
    } as never);
    await expect(restorePlan()).resolves.toBe('pro');
  });

  it('reports Free when nothing was found', async () => {
    await expect(restorePlan()).resolves.toBe('free');
  });
});

describe('syncPlanWithServer', () => {
  it('returns the tier the server wrote', async () => {
    invoke.mockResolvedValueOnce({ data: { tier: 'plus' }, error: null });
    await expect(syncPlanWithServer()).resolves.toBe('plus');
    expect(invoke).toHaveBeenCalledWith('revenuecat-webhook', { body: {} });
  });

  it("surfaces the function's own message", async () => {
    const response = new Response(JSON.stringify({ error: 'could not sync your plan, try again' }), {
      status: 500,
    });
    invoke.mockResolvedValueOnce({ data: null, error: new FunctionsHttpError(response) });
    await expect(syncPlanWithServer()).rejects.toThrow('Could not sync your plan, try again.');
  });
});
