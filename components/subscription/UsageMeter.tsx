import { Text, View } from 'react-native';

import { usageText, type Allowance } from '@/utils/subscription';

interface UsageMeterProps {
  /** What is being counted, e.g. "Closet items". */
  label: string;
  allowance: Allowance;
  /** Plain-language line under the bar (reset time, what counts …). */
  hint?: string;
  testID?: string;
}

/**
 * Plan allowance bar. Color follows DESIGN.md: brand while there's room,
 * `warning` near the cap, `danger` at it — and the numbers are always
 * spelled out, never color alone.
 */
export function UsageMeter({ label, allowance, hint, testID }: UsageMeterProps) {
  const { used, limit, atLimit, nearLimit } = allowance;
  const ratio = limit === null || limit === 0 ? 0 : Math.min(1, used / limit);
  const fill = atLimit ? 'bg-danger' : nearLimit ? 'bg-warning' : 'bg-primary';
  const value = limit === null ? `${usageText(allowance)} · Unlimited` : usageText(allowance);

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole={limit === null ? 'text' : 'progressbar'}
      accessibilityLabel={label}
      accessibilityValue={
        limit === null
          ? { text: `${used}, unlimited` }
          : { min: 0, max: limit, now: Math.min(used, limit), text: `${used} of ${limit}` }
      }
      className="gap-1.5">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text className="shrink text-callout text-text" numberOfLines={1}>
          {label}
        </Text>
        <Text
          className={`text-footnote font-semibold ${atLimit ? 'text-danger' : 'text-text-muted'}`}
          numberOfLines={1}>
          {value}
        </Text>
      </View>
      {limit !== null && (
        <View className="h-1.5 w-full overflow-hidden rounded-full bg-border">
          <View className={`h-full rounded-full ${fill}`} style={{ width: `${ratio * 100}%` }} />
        </View>
      )}
      {hint ? <Text className="text-caption text-text-muted">{hint}</Text> : null}
    </View>
  );
}
