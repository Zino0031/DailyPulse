import { useIsFocused } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * Fades a tab screen in when it gains focus. Used instead of the tab
 * navigator's built-in `animation: 'fade'`, which can leave a screen stuck
 * invisible when tabs are switched quickly. Every focus animates to 1, so an
 * interrupted fade always finishes visible.
 */
export function TabSceneFade({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const opacity = useSharedValue(1);
  useEffect(() => {
    if (!focused) return;
    opacity.set(0);
    opacity.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [focused, opacity]);
  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
