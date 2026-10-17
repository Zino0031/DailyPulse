// Pure helpers for tier UI copy (issue #17). No React, no SDK — unit tested.
import {
  isAtLimit,
  LIMIT_ERRORS,
  nextUsageReset,
  PLANS,
  remainingOf,
  type Plan,
  type Tier,
} from '@/supabase/functions/_shared/tiers';

/** Why the paywall opened — drives its headline and the highlighted plan. */
export type PaywallReason =
  | 'closet_full'
  | 'daily_limit'
  | 'preview'
  | 'regenerate'
  | 'hd'
  | 'upgrade';

const TIER_RANK: Record<Tier, number> = { free: 0, plus: 1, pro: 2 };

export function isUpgrade(from: Tier, to: Tier): boolean {
  return TIER_RANK[to] > TIER_RANK[from];
}

/**
 * "today at 7:00 PM" / "tomorrow at 1:00 AM" — usage resets at UTC
 * midnight, which lands on a different local hour for everyone.
 */
export function resetLabel(now: Date = new Date()): string {
  const reset = nextUsageReset(now);
  const time = reset.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const sameLocalDay = reset.toDateString() === now.toDateString();
  return `${sameLocalDay ? 'today' : 'tomorrow'} at ${time}`;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export interface PaywallCopy {
  title: string;
  body: string;
  /** Plan to visually recommend; null = no highlight. */
  highlight: Exclude<Tier, 'free'> | null;
}

export function paywallCopy(
  reason: PaywallReason,
  tier: Tier,
  now: Date = new Date(),
): PaywallCopy {
  const plan = PLANS[tier];
  const next: Exclude<Tier, 'free'> | null =
    tier === 'free' ? 'plus' : tier === 'plus' ? 'pro' : null;
  switch (reason) {
    case 'closet_full':
      return {
        title: 'Your closet is full',
        body: `${plan.name} holds ${plural(plan.itemLimit ?? 0, 'item')}. Everything you've added stays safe — pick a plan with more room to keep adding.`,
        highlight: next,
      };
    case 'daily_limit':
      return {
        title:
          plan.dailyGenerations === 1
            ? "You've used today's AI outfit"
            : `You've used today's ${plural(plan.dailyGenerations ?? 0, 'AI outfit')}`,
        body: `${plan.name} includes ${plural(plan.dailyGenerations ?? 0, 'AI outfit')} a day. More unlock ${resetLabel(now)}, or upgrade to keep styling now.`,
        highlight: next,
      };
    case 'preview':
      return {
        title:
          plan.dailyPreviews === 1
            ? "You've used today's AI preview"
            : `You've used today's ${plural(plan.dailyPreviews ?? 0, 'AI preview')}`,
        body: `${plan.name} includes ${plural(plan.dailyPreviews ?? 0, 'AI preview')} a day. More unlock ${resetLabel(now)}, or upgrade to preview more now.`,
        highlight: next,
      };
    case 'regenerate':
      return {
        title: 'Regenerate comes with Plus',
        body: 'Not feeling this look? Plus and Pro let you regenerate for fresh options. Your current outfit stays right here.',
        highlight: 'plus',
      };
    case 'hd':
      return {
        title: 'HD previews come with Pro',
        body: 'Pro renders AI previews at twice the resolution, so fabric and fit details stay crisp.',
        highlight: 'pro',
      };
    case 'upgrade':
    default:
      return {
        title: tier === 'pro' ? 'Your plan' : 'Choose your plan',
        body:
          tier === 'pro'
            ? "You're on Pro — every feature is unlocked."
            : 'Upgrade any time. You can cancel from your store account whenever you like.',
        highlight: next,
      };
  }
}

export interface Allowance {
  used: number;
  limit: number | null;
  remaining: number | null;
  atLimit: boolean;
  /** At or past 80% of a finite limit (DESIGN.md: warning = near-cap). */
  nearLimit: boolean;
}

export function allowanceOf(limit: number | null, used: number): Allowance {
  const atLimit = isAtLimit(limit, used);
  return {
    used,
    limit,
    remaining: remainingOf(limit, used),
    atLimit,
    nearLimit: !atLimit && limit !== null && used >= Math.ceil(limit * 0.8),
  };
}

/** "12 of 50" / "12" (unlimited). */
export function usageText(allowance: Allowance): string {
  return allowance.limit === null ? `${allowance.used}` : `${allowance.used} of ${allowance.limit}`;
}

/** One sentence about today's AI outfits, e.g. under the Generate button. */
export function generationsLine(plan: Plan, allowance: Allowance, now: Date = new Date()): string {
  if (allowance.limit === null) return `Unlimited AI outfits on ${plan.name}.`;
  if (allowance.atLimit) {
    return `No AI outfits left today on ${plan.name}. More unlock ${resetLabel(now)}.`;
  }
  return `${allowance.remaining} of ${plural(allowance.limit, 'AI outfit')} left today.`;
}

/** Closet line for warnings: null when there's nothing worth saying. */
export function closetNotice(plan: Plan, count: number): string | null {
  const a = allowanceOf(plan.itemLimit, count);
  if (a.limit === null) return null;
  if (count > a.limit) {
    return `You have ${plural(count, 'item')} — ${plan.name} holds ${a.limit}. Everything stays; upgrade to add more.`;
  }
  if (a.atLimit) return `Your closet is full — ${plan.name} holds ${plural(a.limit, 'item')}.`;
  if (a.nearLimit) {
    return `${plural(a.remaining ?? 0, 'closet spot')} left on ${plan.name}.`;
  }
  return null;
}

/** True for the database's closet cap rejection (see the migration). */
export function isClosetFullError(error: unknown): boolean {
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' && message.includes(LIMIT_ERRORS.closetFull);
}

/** "Renews Nov 16, 2026" / "Ends Nov 16, 2026" for the profile plan card. */
export function renewalText(expiresAt: string | null, willRenew: boolean): string | null {
  if (!expiresAt) return null;
  const date = new Date(expiresAt).toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return willRenew ? `Renews ${date}` : `Ends ${date} — won't renew`;
}
