import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { Linking, Modal, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StatusNote } from '@/components/closet/StatusNote';
import { Button } from '@/components/ui/Button';
import {
  usePlan,
  usePlanOffers,
  usePurchasePlan,
  useRestorePurchases,
  type PlanChangeResult,
} from '@/hooks/useSubscription';
import { BRAND, useThemeTokens } from '@/hooks/useThemeTokens';
import {
  isBillingAvailable,
  isTestMode,
  managementUrl,
  type PlanOffer,
} from '@/services/purchases';
import { usePaywallStore } from '@/store/usePaywallStore';
import { PLANS, TIERS, type Plan, type Tier } from '@/supabase/functions/_shared/tiers';
import { friendlyError } from '@/utils/errors';
import { isUpgrade, paywallCopy } from '@/utils/subscription';

type Notice = { tone: 'success' | 'info' | 'error'; message: string };

const STORE_NAME = Platform.select({
  ios: 'App Store',
  android: 'Google Play',
  default: 'store',
});

function resultNotice(result: PlanChangeResult, restoring: boolean): Notice | null {
  if (!result.completed) return null;
  const tier = result.tier ?? 'free';
  if (tier === 'free') {
    return {
      tone: 'info',
      message: restoring
        ? `We didn't find an active plan on this ${STORE_NAME} account.`
        : 'Your purchase went through, but no plan was attached to it yet. Tap "Restore purchases" in a minute.',
    };
  }
  const name = PLANS[tier].name;
  if (!result.synced) {
    return {
      tone: 'info',
      message: `Payment received — your ${name} plan is activating. This usually takes under a minute.`,
    };
  }
  return {
    tone: 'success',
    message: restoring ? `Restored — you're on ${name}.` : `You're on ${name} now. Enjoy!`,
  };
}

/**
 * The app's single paywall (issue #17), opened through `usePaywallStore`
 * with a reason so the headline explains what just happened. Shows the
 * current plan plus every upgrade, with store-localized prices.
 *
 * A native page sheet: on iOS it can be dragged down to dismiss (which calls
 * `onRequestClose`); on Android it slides up full-screen and back closes it.
 */
export function Paywall() {
  const reason = usePaywallStore((s) => s.reason);
  const openCount = usePaywallStore((s) => s.openCount);
  const hide = usePaywallStore((s) => s.hide);
  const { tier } = usePlan();
  const copy = paywallCopy(reason ?? 'upgrade', tier);
  const tokens = useThemeTokens();
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={reason !== null}
      animationType="slide"
      presentationStyle="pageSheet"
      backdropColor={tokens.bg}
      onRequestClose={hide}>
      <ScrollView
        testID="paywall"
        className="flex-1 bg-bg"
        contentContainerClassName="w-full max-w-xl self-center px-6 pt-2"
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 16) + 8 }}
        keyboardShouldPersistTaps="handled">
        {/* Grabber (DESIGN.md §7 Sheet): hints the sheet can be dragged down. */}
        <View className="mb-4 h-1 w-9 self-center rounded-full bg-border" />
        <Text accessibilityRole="header" className="text-title-3 font-semibold text-text">
          {copy.title}
        </Text>
        <Text className="mb-5 mt-1 text-footnote text-text-muted">{copy.body}</Text>
        {/* Keyed per opening: no stale success / error from last time. */}
        {reason !== null && (
          <PaywallBody key={openCount} tier={tier} highlight={copy.highlight} onClose={hide} />
        )}
      </ScrollView>
    </Modal>
  );
}

function PaywallBody({
  tier,
  highlight,
  onClose,
}: {
  tier: Tier;
  highlight: Tier | null;
  onClose: () => void;
}) {
  const billing = isBillingAvailable();
  const offers = usePlanOffers(true);
  const purchase = usePurchasePlan();
  const restore = useRestorePurchases();
  const [buying, setBuying] = useState<Tier | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  const busy = purchase.isPending || restore.isPending;
  const shown = TIERS.filter((t) => t === tier || isUpgrade(tier, t));

  const onBuy = (offer: PlanOffer) => {
    setNotice(null);
    setBuying(offer.tier);
    purchase.mutate(offer, {
      onSuccess: (result) => setNotice(resultNotice(result, false)),
      onError: (error) =>
        setNotice({
          tone: 'error',
          message: friendlyError(error, "Couldn't complete the purchase."),
        }),
      onSettled: () => setBuying(null),
    });
  };

  const onRestore = () => {
    setNotice(null);
    restore.mutate(undefined, {
      onSuccess: (result) => setNotice(resultNotice(result, true)),
      onError: (error) =>
        setNotice({ tone: 'error', message: friendlyError(error, "Couldn't restore purchases.") }),
    });
  };

  const onManage = async () => {
    const url = await managementUrl();
    if (url) {
      void Linking.openURL(url);
    } else {
      setNotice({
        tone: 'info',
        message: `Manage or cancel your plan in your ${STORE_NAME} subscription settings.`,
      });
    }
  };

  return (
    <View className="gap-3">
      {notice && <StatusNote tone={notice.tone} message={notice.message} testID="paywall-notice" />}
      {billing && isTestMode() && (
        <StatusNote
          tone="info"
          testID="paywall-test-mode"
          message="Test mode — purchases are simulated and nothing is charged."
        />
      )}
      {!billing && (
        <StatusNote
          tone="info"
          testID="paywall-unavailable"
          message={
            Platform.OS === 'web'
              ? 'Plans can be bought in the myOutfit app for iPhone or Android. Your current plan keeps working here.'
              : "Purchases aren't set up in this build yet. Your current plan keeps working."
          }
        />
      )}
      {billing && offers.isError && (
        <StatusNote
          tone="error"
          message={friendlyError(offers.error, "Couldn't load plan prices.")}
          action={{
            label: 'Retry',
            onPress: () => offers.refetch(),
            hint: 'Loads plan prices again',
          }}
        />
      )}

      {shown.map((t) => (
        <PlanCard
          key={t}
          plan={PLANS[t]}
          current={t === tier}
          highlighted={t === highlight}
          offer={offers.data?.find((o) => o.tier === t)}
          pricesLoading={billing && offers.isPending}
          pricesFailed={billing && offers.isError}
          billing={billing}
          buying={buying === t}
          disabled={busy}
          onBuy={onBuy}
        />
      ))}

      <View className="mt-1 gap-2">
        {billing && (
          <Button
            testID="paywall-restore"
            label="Restore purchases"
            variant="ghost"
            loading={restore.isPending}
            disabled={busy}
            onPress={onRestore}
            accessibilityHint={`Unlocks a plan you already bought with this ${STORE_NAME} account`}
          />
        )}
        {billing && tier !== 'free' && (
          <Button
            label="Manage subscription"
            variant="ghost"
            disabled={busy}
            onPress={() => void onManage()}
            accessibilityHint={`Opens your ${STORE_NAME} subscription settings to change or cancel`}
          />
        )}
        <Button
          testID="paywall-close"
          label={notice?.tone === 'success' ? 'Done' : tier === 'pro' ? 'Close' : 'Not now'}
          variant="secondary"
          size="lg"
          onPress={onClose}
        />
      </View>

      {billing && (
        <Text className="pb-1 text-center text-caption text-text-subtle">
          Plans renew automatically until cancelled. Cancel any time in your {STORE_NAME} account
          settings, at least 24 hours before renewal to avoid the next charge.
        </Text>
      )}
    </View>
  );
}

interface PlanCardProps {
  plan: Plan;
  current: boolean;
  highlighted: boolean;
  offer: PlanOffer | undefined;
  pricesLoading: boolean;
  pricesFailed: boolean;
  billing: boolean;
  buying: boolean;
  disabled: boolean;
  onBuy: (offer: PlanOffer) => void;
}

function PlanCard({
  plan,
  current,
  highlighted,
  offer,
  pricesLoading,
  pricesFailed,
  billing,
  buying,
  disabled,
  onBuy,
}: PlanCardProps) {
  const paid = plan.id !== 'free';
  const priceLine = !paid
    ? 'Free forever'
    : offer
      ? `${offer.price}${offer.period ? ` / ${offer.period}` : ''}`
      : pricesLoading
        ? 'Loading price…'
        : pricesFailed
          ? "Price didn't load"
          : billing
            ? 'Not available yet'
            : null;

  return (
    <View
      testID={`paywall-plan-${plan.id}`}
      className={`gap-3 rounded-lg border p-4 ${
        highlighted && !current ? 'border-primary bg-primary/5' : 'border-border bg-surface'
      }`}>
      <View className="gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text className="text-headline font-semibold text-text">{plan.name}</Text>
          {current && (
            <View className="rounded-full bg-border px-2.5 py-0.5">
              <Text className="text-caption font-semibold text-text-muted">Your plan</Text>
            </View>
          )}
          {highlighted && !current && (
            <View className="rounded-full bg-primary px-2.5 py-0.5">
              <Text className="text-caption font-semibold text-white">Recommended</Text>
            </View>
          )}
        </View>
        <Text className="text-footnote text-text-muted">{plan.tagline}</Text>
        {priceLine && (
          <Text
            testID={`paywall-price-${plan.id}`}
            className={`text-callout font-semibold ${offer || !paid ? 'text-text' : 'text-text-subtle'}`}>
            {priceLine}
          </Text>
        )}
      </View>

      <View className="gap-1.5">
        {plan.perks.map((perk) => (
          <View key={perk} className="flex-row items-start gap-2">
            <View className="pt-0.5">
              <Check size={16} strokeWidth={2} color={BRAND.success} />
            </View>
            <Text className="flex-1 text-footnote text-text">{perk}</Text>
          </View>
        ))}
      </View>

      {paid && !current && billing && (
        <Button
          testID={`paywall-buy-${plan.id}`}
          label={`Upgrade to ${plan.name}`}
          variant={highlighted ? 'primary' : 'secondary'}
          loading={buying}
          disabled={disabled || !offer}
          onPress={() => offer && onBuy(offer)}
          accessibilityHint={
            offer
              ? `Opens the ${STORE_NAME} to subscribe for ${offer.price}${offer.period ? ` per ${offer.period}` : ''}`
              : pricesFailed
                ? "Prices didn't load — use Retry above"
                : 'This plan has no price in the store yet'
          }
        />
      )}
    </View>
  );
}
