import { Text, View } from 'react-native';

import { PLANS, type Tier } from '@/supabase/functions/_shared/tiers';

// Full literals so Tailwind generates every rule.
const SURFACE: Record<Tier, string> = {
  free: 'bg-border',
  plus: 'bg-primary-tint',
  pro: 'bg-primary',
};
const LABEL: Record<Tier, string> = {
  free: 'text-text-muted',
  plus: 'text-primary',
  pro: 'text-white',
};

/** Small pill naming a plan ("Free", "Plus", "Pro"). */
export function PlanBadge({ tier, suffix }: { tier: Tier; suffix?: string }) {
  const text = suffix ? `${PLANS[tier].name} · ${suffix}` : PLANS[tier].name;
  return (
    <View className={`self-start rounded-full px-2.5 py-0.5 ${SURFACE[tier]}`}>
      <Text numberOfLines={1} className={`text-caption font-semibold ${LABEL[tier]}`}>
        {text}
      </Text>
    </View>
  );
}
