import { Sparkles } from 'lucide-react-native';
import { Text, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import {
  useClosetCapacity,
  useGenerationUsage,
  usePlan,
  useSubscriptionRow,
} from '@/hooks/useSubscription';
import { showPaywall } from '@/store/usePaywallStore';
import { renewalText, resetLabel } from '@/utils/subscription';

import { PlanBadge } from './PlanBadge';
import { UsageMeter } from './UsageMeter';

/**
 * Profile's plan card (issue #17): which plan you're on, what it allows,
 * how much of it you've used, and the way to change it.
 */
export function PlanSection() {
  const { tier, plan, isLoading } = usePlan();
  const closet = useClosetCapacity();
  const generations = useGenerationUsage();
  const { data: subscription } = useSubscriptionRow();
  const renewal =
    tier !== 'free' && subscription
      ? renewalText(subscription.expires_at, subscription.will_renew)
      : null;

  return (
    <View
      testID="profile-plan"
      className="mt-8 gap-4 rounded-xl bg-surface p-5 shadow-md">
      <View className="flex-row items-start justify-between gap-3">
        <View className="flex-1 gap-1">
          <Text accessibilityRole="header" className="text-headline font-semibold text-text">
            Your plan
          </Text>
          <Text className="text-footnote text-text-muted">
            {isLoading ? 'Loading your plan…' : plan.tagline}
          </Text>
          {renewal ? <Text className="text-caption text-text-subtle">{renewal}</Text> : null}
        </View>
        {!isLoading && <PlanBadge tier={tier} />}
      </View>

      <UsageMeter
        testID="profile-closet-meter"
        label="Closet items"
        allowance={closet}
        hint={closet.atLimit ? 'Full — upgrade to add more. Nothing gets deleted.' : undefined}
      />
      <UsageMeter
        testID="profile-outfit-meter"
        label="AI outfits today"
        allowance={generations}
        hint={
          generations.limit === null
            ? undefined
            : `Resets ${resetLabel()}. Saving or reopening a look doesn't count.`
        }
      />

      <Button
        testID="profile-plans"
        label={tier === 'free' ? 'Upgrade' : tier === 'plus' ? 'Change plan' : 'Manage plan'}
        icon={tier === 'pro' ? undefined : Sparkles}
        variant={tier === 'free' ? 'primary' : 'secondary'}
        onPress={() => showPaywall('upgrade')}
        accessibilityHint="Compares plans, restores purchases and manages your subscription"
      />
    </View>
  );
}
