// Subscription tiers (PRD §3.5, issue #17): limits, perks copy and the
// RevenueCat → tier mapping. Single source of truth for the app and the
// edge functions (generate-outfit, render-outfit, revenuecat-webhook).
// Keep this file dependency-free so both runtimes can import it.
//
// The numeric limits are mirrored in SQL by `public.tier_limits()`
// (supabase/migrations/20261016000000_subscriptions.sql) so the database
// can enforce them atomically. A unit test fails if the two drift.

export const TIERS = ['free', 'plus', 'pro'] as const;
export type Tier = (typeof TIERS)[number];

export type RenderQuality = 'standard' | 'hd';

export interface Plan {
  id: Tier;
  name: string;
  /** One line under the plan name on the paywall. */
  tagline: string;
  /** Max closet items; `null` = unlimited. */
  itemLimit: number | null;
  /** AI outfit generations per UTC day (generate + regenerate); `null` = unlimited. */
  dailyGenerations: number | null;
  /** Outfit options returned per generation. */
  outfitOptions: number;
  /** AI previews per UTC day; `null` = unlimited. Separate budget from generations. */
  dailyPreviews: number | null;
  /** Re-roll a generated outfit for fresh options. */
  canRegenerate: boolean;
  renderQuality: RenderQuality;
  /** Human-readable perks, only for features the app actually enforces. */
  perks: string[];
}

export const PLANS: Record<Tier, Plan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Everything you need to get started',
    itemLimit: 50,
    dailyGenerations: 1,
    outfitOptions: 1,
    dailyPreviews: 1,
    canRegenerate: false,
    renderQuality: 'standard',
    perks: ['Up to 50 closet items', '1 AI outfit a day', '1 AI preview a day', 'Standard-quality previews'],
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    tagline: 'More room and more looks every day',
    itemLimit: 250,
    dailyGenerations: 3,
    outfitOptions: 3,
    dailyPreviews: 5,
    canRegenerate: true,
    renderQuality: 'standard',
    perks: [
      'Up to 250 closet items',
      '3 AI outfits a day, 3 options each',
      'Regenerate for fresh options',
      '5 AI previews a day',
      'Standard-quality previews',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    tagline: 'No limits, sharpest previews',
    itemLimit: null,
    dailyGenerations: 20,
    outfitOptions: 5,
    dailyPreviews: 20,
    canRegenerate: true,
    renderQuality: 'hd',
    perks: [
      'Unlimited closet items',
      '20 AI outfits a day, 5 options each',
      'Regenerate any time',
      '20 AI previews a day',
      'HD previews (2× sharper)',
    ],
  },
};

/** Pixel size of AI previews per quality level (3:4 portrait). */
export const RENDER_SIZE: Record<RenderQuality, { width: number; height: number }> = {
  standard: { width: 768, height: 1024 },
  hd: { width: 1152, height: 1536 },
};

/**
 * RevenueCat entitlement identifiers. Configure entitlements with exactly
 * these ids in the RevenueCat dashboard (see supabase/README.md).
 */
export const ENTITLEMENTS = { plus: 'plus', pro: 'pro' } as const;

/** Error codes shared between the database / functions and the app. */
export const LIMIT_ERRORS = {
  closetFull: 'closet_full',
  dailyLimit: 'daily_limit',
  previewLimit: 'preview_limit',
  regenerateLocked: 'regenerate_locked',
} as const;

export function isTier(value: unknown): value is Tier {
  return typeof value === 'string' && (TIERS as readonly string[]).includes(value);
}

/** Unknown / missing tiers fall back to Free — never to a paid plan. */
export function planFor(tier: unknown): Plan {
  return PLANS[isTier(tier) ? tier : 'free'];
}

/** Higher tier wins when several entitlements are active. */
export function tierFromEntitlementIds(ids: Iterable<string>): Tier {
  const active = new Set(ids);
  if (active.has(ENTITLEMENTS.pro)) return 'pro';
  if (active.has(ENTITLEMENTS.plus)) return 'plus';
  return 'free';
}

/**
 * Which tier a store product / package unlocks, read from its identifier
 * (`myoutfit_plus_monthly`, `pro.annual`, `$rc_pro` …). `null` when the id
 * names neither tier — the paywall then hides that package.
 */
export function tierFromProductId(id: string): Exclude<Tier, 'free'> | null {
  const words = id.toLowerCase().split(/[^a-z0-9]+/);
  if (words.includes('pro')) return 'pro';
  if (words.includes('plus')) return 'plus';
  return null;
}

/** Remaining allowance; `null` = unlimited. Never negative. */
export function remainingOf(limit: number | null, used: number): number | null {
  return limit === null ? null : Math.max(0, limit - used);
}

export function isAtLimit(limit: number | null, used: number): boolean {
  return limit !== null && used >= limit;
}

/** Usage resets at UTC midnight so the server and every device agree. */
export function usageDay(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** The next UTC midnight — shown to users in their local time. */
export function nextUsageReset(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
}

// ------------------------------------------------------------------
// RevenueCat REST v1 `GET /subscribers/{id}` → tier
// https://www.revenuecat.com/docs/api-v1/customer-info-model
// ------------------------------------------------------------------

export interface RcEntitlement {
  expires_date: string | null;
  grace_period_expires_date?: string | null;
  product_identifier: string;
}

export interface RcSubscription {
  store?: string;
  is_sandbox?: boolean;
  expires_date?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

export interface RcSubscriber {
  original_app_user_id?: string;
  entitlements?: Record<string, RcEntitlement>;
  subscriptions?: Record<string, RcSubscription>;
}

export interface SubscriptionState {
  tier: Tier;
  /** 'active' while a paid entitlement is live, otherwise 'expired' / 'none'. */
  status: 'active' | 'expired' | 'none';
  productId: string | null;
  expiresAt: string | null;
  store: string | null;
  environment: 'sandbox' | 'production' | null;
  willRenew: boolean;
}

function isLive(entitlement: RcEntitlement, now: Date): boolean {
  const ends = [entitlement.expires_date, entitlement.grace_period_expires_date ?? null];
  // A null expiry is a lifetime / non-expiring grant.
  if (entitlement.expires_date === null) return true;
  return ends.some((end) => end !== null && Date.parse(end) > now.getTime());
}

/**
 * Current state from a subscriber payload. Order-independent and
 * idempotent: webhook retries or out-of-order events always converge.
 */
export function subscriptionStateFrom(
  subscriber: RcSubscriber | null | undefined,
  now: Date = new Date(),
): SubscriptionState {
  const entitlements = subscriber?.entitlements ?? {};
  const liveIds = Object.keys(entitlements).filter((id) => isLive(entitlements[id], now));
  const tier = tierFromEntitlementIds(liveIds);
  const hadAny = Object.keys(entitlements).length > 0;

  const winning = tier === 'free' ? null : entitlements[ENTITLEMENTS[tier]];
  const productId = winning?.product_identifier ?? null;
  const sub = productId ? subscriber?.subscriptions?.[productId] : undefined;

  return {
    tier,
    status: tier !== 'free' ? 'active' : hadAny ? 'expired' : 'none',
    productId,
    expiresAt: winning?.expires_date ?? null,
    store: sub?.store ?? null,
    environment: sub ? (sub.is_sandbox ? 'sandbox' : 'production') : null,
    willRenew: Boolean(sub) && !sub?.unsubscribe_detected_at && !sub?.refunded_at,
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * App user ids are Supabase auth ids (the app calls `Purchases.logIn`).
 * Anonymous RevenueCat ids (`$RCAnonymousID:…`) can't map to an account.
 */
export function isAccountId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id);
}
