import type { ReactNode } from 'react';
import { Pressable, Text } from 'react-native';

interface ChipProps {
  label: string;
  selected: boolean;
  onPress: () => void;
  /** Optional leading visual (color swatch, icon). */
  leading?: ReactNode;
  /** Shown after the label, muted, e.g. an item count. */
  count?: number;
  /** `radio` for single-choice groups, `checkbox` for multi-select. */
  role?: 'radio' | 'checkbox';
  accessibilityHint?: string;
  testID?: string;
}

/**
 * Filter / tag chip (DESIGN.md §7 Chip). 32pt tall with a hit slop up to the
 * 44pt touch minimum. Selected = brand fill; the selection state is exposed
 * to screen readers, not just shown with color.
 */
export function Chip({
  label,
  selected,
  onPress,
  leading,
  count,
  role = 'checkbox',
  accessibilityHint,
  testID,
}: ChipProps) {
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      hitSlop={6}
      accessibilityRole={role}
      accessibilityLabel={
        count === undefined ? label : `${label}, ${count} ${count === 1 ? 'item' : 'items'}`
      }
      accessibilityHint={accessibilityHint}
      accessibilityState={role === 'radio' ? { selected } : { checked: selected }}
      className={`h-8 flex-row items-center gap-1.5 rounded-full px-3 ${
        selected
          ? 'border border-transparent bg-primary active:bg-primary-pressed'
          : 'border border-border bg-surface active:bg-primary-tint'
      }`}>
      {leading}
      <Text
        numberOfLines={1}
        className={`text-caption font-medium ${selected ? 'text-white' : 'text-text'}`}>
        {label}
      </Text>
      {count !== undefined && (
        <Text className={`text-caption ${selected ? 'text-white/80' : 'text-text-subtle'}`}>
          {count}
        </Text>
      )}
    </Pressable>
  );
}
