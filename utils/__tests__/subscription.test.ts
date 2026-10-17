import { PLANS } from '@/supabase/functions/_shared/tiers';
import {
  allowanceOf,
  closetNotice,
  generationsLine,
  isClosetFullError,
  isUpgrade,
  paywallCopy,
  renewalText,
  resetLabel,
  usageText,
} from '@/utils/subscription';

const NOW = new Date('2026-10-16T12:00:00.000Z');
/** Same formatting the helper uses, so the test holds in any time zone. */
const localTime = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

describe('resetLabel', () => {
  it('names the next UTC midnight in local time, relative to the local day', () => {
    const label = resetLabel(NOW);
    expect(label).toMatch(/^(today|tomorrow) at /);
    expect(label.endsWith(localTime('2026-10-17T00:00:00.000Z'))).toBe(true);
  });
});

describe('allowanceOf', () => {
  it('flags near-cap from 80% and at-cap separately', () => {
    expect(allowanceOf(50, 39)).toMatchObject({ nearLimit: false, atLimit: false, remaining: 11 });
    expect(allowanceOf(50, 40)).toMatchObject({ nearLimit: true, atLimit: false, remaining: 10 });
    expect(allowanceOf(50, 50)).toMatchObject({ nearLimit: false, atLimit: true, remaining: 0 });
    expect(allowanceOf(1, 0)).toMatchObject({ nearLimit: false, atLimit: false });
  });

  it('is never near or at an unlimited cap', () => {
    expect(allowanceOf(null, 10_000)).toMatchObject({
      nearLimit: false,
      atLimit: false,
      remaining: null,
    });
    expect(usageText(allowanceOf(null, 12))).toBe('12');
    expect(usageText(allowanceOf(50, 12))).toBe('12 of 50');
  });
});

describe('paywallCopy', () => {
  it('explains a full closet without implying data loss', () => {
    const copy = paywallCopy('closet_full', 'free', NOW);
    expect(copy.title).toBe('Your closet is full');
    expect(copy.body).toContain('Free holds 50 items');
    expect(copy.body).toContain('stays safe');
    expect(copy.highlight).toBe('plus');
  });

  it('says when generations come back and points Plus users at Pro', () => {
    const free = paywallCopy('daily_limit', 'free', NOW);
    expect(free.title).toBe("You've used today's AI outfit");
    expect(free.body).toContain('1 AI outfit a day');
    expect(free.body).toContain(resetLabel(NOW));

    const plus = paywallCopy('daily_limit', 'plus', NOW);
    expect(plus.title).toBe("You've used today's 3 AI outfits");
    expect(plus.highlight).toBe('pro');
  });

  it('says when AI previews come back and points at the next plan', () => {
    const free = paywallCopy('preview', 'free', NOW);
    expect(free.title).toBe("You've used today's AI preview");
    expect(free.body).toContain('1 AI preview a day');
    expect(free.body).toContain(resetLabel(NOW));
    expect(free.highlight).toBe('plus');

    const plus = paywallCopy('preview', 'plus', NOW);
    expect(plus.title).toBe("You've used today's 5 AI previews");
    expect(plus.highlight).toBe('pro');
  });

  it('highlights the plan that unlocks the feature', () => {
    expect(paywallCopy('regenerate', 'free').highlight).toBe('plus');
    expect(paywallCopy('hd', 'plus').highlight).toBe('pro');
  });

  it('has nothing to sell to Pro users', () => {
    const copy = paywallCopy('upgrade', 'pro');
    expect(copy.title).toBe('Your plan');
    expect(copy.highlight).toBeNull();
  });
});

describe('closetNotice', () => {
  it('stays quiet with room to spare and on unlimited plans', () => {
    expect(closetNotice(PLANS.free, 10)).toBeNull();
    expect(closetNotice(PLANS.pro, 5000)).toBeNull();
  });

  it('counts down near the cap with correct plurals', () => {
    expect(closetNotice(PLANS.free, 49)).toBe('1 closet spot left on Free.');
    expect(closetNotice(PLANS.plus, 240)).toBe('10 closet spots left on Plus.');
  });

  it('distinguishes full from over-capacity after a downgrade', () => {
    expect(closetNotice(PLANS.free, 50)).toBe('Your closet is full — Free holds 50 items.');
    expect(closetNotice(PLANS.free, 51)).toMatch(/^You have 51 items — Free holds 50\./);
  });
});

describe('generationsLine', () => {
  it('reads naturally for every state', () => {
    expect(generationsLine(PLANS.free, allowanceOf(1, 0), NOW)).toBe('1 of 1 AI outfit left today.');
    expect(generationsLine(PLANS.plus, allowanceOf(3, 1), NOW)).toBe('2 of 3 AI outfits left today.');
    expect(generationsLine(PLANS.pro, allowanceOf(20, 7), NOW)).toBe(
      '13 of 20 AI outfits left today.',
    );
    expect(generationsLine(PLANS.free, allowanceOf(1, 1), NOW)).toBe(
      `No AI outfits left today on Free. More unlock ${resetLabel(NOW)}.`,
    );
  });
});

it('ranks tiers for upgrades only', () => {
  expect(isUpgrade('free', 'plus')).toBe(true);
  expect(isUpgrade('plus', 'pro')).toBe(true);
  expect(isUpgrade('pro', 'plus')).toBe(false);
  expect(isUpgrade('plus', 'plus')).toBe(false);
});

it('recognises the database closet-cap error in any error shape', () => {
  expect(isClosetFullError({ code: 'P0001', message: 'closet_full' })).toBe(true);
  expect(isClosetFullError(new Error('closet_full'))).toBe(true);
  expect(isClosetFullError(new Error('Network request failed'))).toBe(false);
  expect(isClosetFullError(null)).toBe(false);
});

it('describes renewal vs a cancelled plan', () => {
  expect(renewalText(null, true)).toBeNull();
  expect(renewalText('2026-11-16T12:00:00Z', true)).toMatch(/^Renews /);
  expect(renewalText('2026-11-16T12:00:00Z', false)).toMatch(/^Ends .+ — won't renew$/);
});
