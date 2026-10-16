import { readFileSync } from 'fs';
import { join } from 'path';

import {
  isAccountId,
  isAtLimit,
  nextUsageReset,
  PLANS,
  planFor,
  remainingOf,
  subscriptionStateFrom,
  tierFromEntitlementIds,
  tierFromProductId,
  usageDay,
} from '../tiers';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const FUTURE = '2026-11-16T12:00:00Z';
const PAST = '2026-09-16T12:00:00Z';

describe('plans (PRD §3.5 acceptance)', () => {
  it('matches the issue: Free 50/1, Plus 250/5 + regenerate, Pro unlimited + HD', () => {
    expect(PLANS.free).toMatchObject({
      itemLimit: 50,
      dailyGenerations: 1,
      canRegenerate: false,
      renderQuality: 'standard',
    });
    expect(PLANS.plus).toMatchObject({
      itemLimit: 250,
      dailyGenerations: 5,
      canRegenerate: true,
      renderQuality: 'standard',
    });
    expect(PLANS.pro).toMatchObject({
      itemLimit: null,
      dailyGenerations: null,
      canRegenerate: true,
      renderQuality: 'hd',
    });
  });

  it('never upgrades an unknown tier', () => {
    expect(planFor('enterprise').id).toBe('free');
    expect(planFor(null).id).toBe('free');
    expect(planFor('plus').id).toBe('plus');
  });
});

describe('the SQL mirror of the limits', () => {
  const sql = readFileSync(
    join(__dirname, '../../../migrations/20261016000000_subscriptions.sql'),
    'utf8',
  );
  const fn = sql.slice(sql.indexOf('function public.tier_limits'), sql.indexOf('$$;'));
  const cases = [...fn.matchAll(/case p_tier when 'pro' then (\w+) when 'plus' then (\w+) else (\w+) end/g)];
  const num = (v: string) => (v === 'null' ? null : Number(v));

  it('has exactly two limit columns', () => {
    expect(cases).toHaveLength(2);
  });

  it('enforces the same closet and daily generation limits as tiers.ts', () => {
    const [items, generations] = cases;
    expect([num(items[1]), num(items[2]), num(items[3])]).toEqual([
      PLANS.pro.itemLimit,
      PLANS.plus.itemLimit,
      PLANS.free.itemLimit,
    ]);
    expect([num(generations[1]), num(generations[2]), num(generations[3])]).toEqual([
      PLANS.pro.dailyGenerations,
      PLANS.plus.dailyGenerations,
      PLANS.free.dailyGenerations,
    ]);
  });
});

describe('tier mapping', () => {
  it('prefers the highest active entitlement', () => {
    expect(tierFromEntitlementIds(['plus', 'pro'])).toBe('pro');
    expect(tierFromEntitlementIds(['plus'])).toBe('plus');
    expect(tierFromEntitlementIds(['legacy'])).toBe('free');
    expect(tierFromEntitlementIds([])).toBe('free');
  });

  it.each([
    ['myoutfit_plus_monthly', 'plus'],
    ['pro.annual', 'pro'],
    ['$rc_pro_monthly', 'pro'],
    ['Plus-Weekly', 'plus'],
    ['product_professional', null],
    ['surplus_monthly', null],
    ['$rc_monthly', null],
  ])('%s → %s', (id, tier) => {
    expect(tierFromProductId(id)).toBe(tier);
  });
});

describe('allowance math', () => {
  it('treats null as unlimited and never goes negative', () => {
    expect(remainingOf(null, 999)).toBeNull();
    expect(remainingOf(5, 7)).toBe(0);
    expect(isAtLimit(null, 999)).toBe(false);
    expect(isAtLimit(1, 1)).toBe(true);
    expect(isAtLimit(5, 4)).toBe(false);
  });

  it('counts usage per UTC day and resets at the next UTC midnight', () => {
    expect(usageDay(new Date('2026-10-16T23:59:59.000Z'))).toBe('2026-10-16');
    expect(usageDay(new Date('2026-10-17T00:00:00.000Z'))).toBe('2026-10-17');
    expect(nextUsageReset(NOW).toISOString()).toBe('2026-10-17T00:00:00.000Z');
    // Month / year rollover.
    expect(nextUsageReset(new Date('2026-12-31T20:00:00Z')).toISOString()).toBe(
      '2027-01-01T00:00:00.000Z',
    );
  });
});

describe('subscriptionStateFrom (RevenueCat subscriber → state)', () => {
  it('reads an active, renewing Plus subscription', () => {
    expect(
      subscriptionStateFrom(
        {
          entitlements: { plus: { expires_date: FUTURE, product_identifier: 'plus_monthly' } },
          subscriptions: { plus_monthly: { store: 'app_store', is_sandbox: true } },
        },
        NOW,
      ),
    ).toEqual({
      tier: 'plus',
      status: 'active',
      productId: 'plus_monthly',
      expiresAt: FUTURE,
      store: 'app_store',
      environment: 'sandbox',
      willRenew: true,
    });
  });

  it('keeps access during a billing grace period', () => {
    const state = subscriptionStateFrom(
      {
        entitlements: {
          pro: { expires_date: PAST, grace_period_expires_date: FUTURE, product_identifier: 'pro_m' },
        },
      },
      NOW,
    );
    expect(state.tier).toBe('pro');
  });

  it('falls back to Free once everything expired', () => {
    const state = subscriptionStateFrom(
      { entitlements: { pro: { expires_date: PAST, product_identifier: 'pro_m' } } },
      NOW,
    );
    expect(state).toMatchObject({ tier: 'free', status: 'expired', productId: null });
  });

  it('treats a null expiry as a lifetime grant', () => {
    expect(
      subscriptionStateFrom(
        { entitlements: { pro: { expires_date: null, product_identifier: 'pro_life' } } },
        NOW,
      ).tier,
    ).toBe('pro');
  });

  it('picks Pro over Plus and reports a cancelled renewal', () => {
    const state = subscriptionStateFrom(
      {
        entitlements: {
          plus: { expires_date: FUTURE, product_identifier: 'plus_m' },
          pro: { expires_date: FUTURE, product_identifier: 'pro_m' },
        },
        subscriptions: {
          pro_m: { store: 'play_store', is_sandbox: false, unsubscribe_detected_at: PAST },
        },
      },
      NOW,
    );
    expect(state).toMatchObject({
      tier: 'pro',
      productId: 'pro_m',
      environment: 'production',
      willRenew: false,
    });
  });

  it('handles a brand-new customer', () => {
    expect(subscriptionStateFrom({}, NOW)).toMatchObject({ tier: 'free', status: 'none' });
    expect(subscriptionStateFrom(undefined, NOW).tier).toBe('free');
  });
});

it('only maps real account ids, never anonymous RevenueCat ids', () => {
  expect(isAccountId('7c9e6679-7425-40de-944b-e07fc1f90ae7')).toBe(true);
  expect(isAccountId('$RCAnonymousID:abc123')).toBe(false);
  expect(isAccountId(undefined)).toBe(false);
});
