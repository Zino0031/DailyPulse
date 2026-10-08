import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Pressable } from "react-native";

import { useColorScheme } from "@/components/useColorScheme";

interface BackButtonProps {
  /** Override the default `router.back()` behaviour. */
  onPress?: () => void;
  /** iOS-style chevron size inside the circle. Defaults to 22. */
  size?: number;
  /** Extra classes merged onto the root (e.g. positioning utilities). */
  className?: string;
}

/**
 * Circular tap target used in screen headers. Lavender-tinted in light mode,
 * elevated-surface in dark mode. Falls back to `router.back()` unless an
 * `onPress` handler is provided.
 */
export function BackButton({ onPress, size = 28, className }: BackButtonProps) {
  const router = useRouter();
  const scheme = useColorScheme();
  const iconColor = scheme === "dark" ? "#F5F7FA" : "#0A0C0F";

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      accessibilityRole="button"
      accessibilityLabel="Go back"
      hitSlop={8}
      className={`h-12 w-12 items-center justify-center rounded-full bg-white dark:bg-surface active:opacity-80 ${
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
