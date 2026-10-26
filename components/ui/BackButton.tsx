import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { useThemeTokens } from "@/hooks/useThemeTokens";

interface BackButtonProps {
  /** Override the default `router.back()` behaviour. */
  onPress?: () => void;
  /** iOS-style chevron size inside the circle. Defaults to 22. */
  size?: number;
  /** Extra classes merged onto the root (e.g. positioning utilities). */
  className?: string;
}

/**
 * Circular white tap target used in screen headers. Falls back to `router.back()` unless an
 * `onPress` handler is provided.
 */
export function BackButton({ onPress, size = 28, className }: BackButtonProps) {
  const router = useRouter();
  const { text: iconColor } = useThemeTokens();

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      className={`h-11 w-11 items-center justify-center rounded-full bg-surface active:bg-primary-tint ${
        className ?? ""
      }`}
    >
      <MaterialCommunityIcons
        name="chevron-left"
        color={iconColor}
        size={size}
      />
    </Pressable>
  );
}
