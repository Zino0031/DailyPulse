import { useIsFocused } from 'expo-router';
import { useEffect, type ReactNode } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * Fades a tab screen in when it gains focus. Used instead of the tab
 * navigator's built-in `animation: 'fade'`, which can leave a screen stuck
 * invisible when tabs are switched quickly. Every focus animates to 1, so an
 * interrupted fade always finishes visible.
 *
 * The shared value starts at 0 and is reset to 0 on blur, so a screen is
 * never painted at full opacity for a frame before its fade begins.
 */
export function TabSceneFade({ children }: { children: ReactNode }) {
  const focused = useIsFocused();
  const reducedMotion = useReducedMotion();
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!focused || reducedMotion) {
      opacity.set(reducedMotion ? 1 : 0);
      return;
    }
    opacity.set(withTiming(1, { duration: 220, easing: Easing.out(Easing.cubic) }));
  }, [focused, opacity, reducedMotion]);
  const style = useAnimatedStyle(() => ({ flex: 1, opacity: opacity.value }));

  return <Animated.View style={style}>{children}</Animated.View>;
}
