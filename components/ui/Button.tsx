import type { LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { BRAND, useThemeTokens } from '@/hooks/useThemeTokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  size?: Size;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  /** Read by screen readers after the label — say what will happen. */
  accessibilityHint?: string;
  /** Extra classes on the root (layout only, e.g. `flex-1`, `mt-4`). */
  className?: string;
  testID?: string;
}

// Full literals per DESIGN.md §7 Button so Tailwind generates every rule.
const ROOT: Record<Variant, string> = {
  primary: 'bg-primary active:bg-primary-pressed',
  secondary: 'border border-border bg-surface active:bg-primary-tint',
  ghost: 'active:bg-primary-tint',
  danger: 'border border-danger/40 bg-surface active:bg-danger/10',
};
const LABEL: Record<Variant, string> = {
  primary: 'text-white',
  secondary: 'text-text',
  ghost: 'text-primary',
  danger: 'text-danger',
};
const HEIGHT: Record<Size, string> = { sm: 'h-9 px-4', md: 'h-11 px-5', lg: 'h-[52px] px-6' };
const TEXT: Record<Size, string> = { sm: 'text-footnote', md: 'text-callout', lg: 'text-headline' };

/** Pill button (DESIGN.md §7). Disabled state stays legible, never hidden. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  disabled = false,
  accessibilityHint,
  className = '',
  testID,
}: ButtonProps) {
  const tokens = useThemeTokens();
  const inactive = disabled || loading;
  const iconColor =
    variant === 'primary'
      ? BRAND.white
      : variant === 'danger'
        ? BRAND.danger
        : variant === 'ghost'
          ? BRAND.primary
          : tokens.text;

  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={size === 'sm' ? 6 : 0}
      className={`flex-row items-center justify-center gap-2 rounded-full ${HEIGHT[size]} ${ROOT[variant]} ${
        inactive ? 'opacity-50' : ''
      } ${className}`}>
      {loading ? (
        <ActivityIndicator size="small" color={iconColor} />
      ) : (
        Icon && <Icon size={size === 'sm' ? 16 : 20} strokeWidth={1.75} color={iconColor} />
      )}
      <View className="shrink">
        <Text numberOfLines={1} className={`${TEXT[size]} font-semibold ${LABEL[variant]}`}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}
