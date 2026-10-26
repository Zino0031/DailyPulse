import type { BottomTabBarProps } from 'expo-router/tabs';
import { useRouter } from 'expo-router';
import { Sparkles } from 'lucide-react-native';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type LayoutRectangle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { BRAND, useThemeTokens } from '@/hooks/useThemeTokens';

// DESIGN.md §7 Floating-FAB tab bar.
const BAR_HEIGHT = 72;
const FAB_SIZE = 56;
const FAB_LIFT = 24;
// Concave notch under the FAB: half-width at the bar edge, and depth.
const NOTCH_HALF = 46;
const NOTCH_DEPTH = 40;

const SPRING = { damping: 15 };

/**
 * Height the floating bar covers at the bottom of a tab screen. Tab screens
 * scroll underneath it (so content shows through the notch) and add this to
 * their bottom padding so the last row isn't hidden.
 */
export function useTabBarInset() {
  return BAR_HEIGHT + useSafeAreaInsets().bottom;
}

/** Top edge of the bar with a concave notch centred under the FAB. */
function topEdge(width: number) {
  const cx = width / 2;
  return [
    'M0 0',
    `H${cx - NOTCH_HALF}`,
    `C${cx - NOTCH_HALF + 18} 0 ${cx - 32} ${NOTCH_DEPTH} ${cx} ${NOTCH_DEPTH}`,
    `C${cx + 32} ${NOTCH_DEPTH} ${cx + NOTCH_HALF - 18} 0 ${cx + NOTCH_HALF} 0`,
    `H${width}`,
  ].join(' ');
}

/**
 * Replaces the stock bottom tabs: two tabs either side of a lifted
 * "Generate today's outfit" FAB, on a surface with a notch cut under it.
 */
export function FabTabBar({ state, descriptors, navigation, insets }: BottomTabBarProps) {
  const tokens = useThemeTokens();
  const [width, setWidth] = useState(0);
  // Where each tab and its dot slot sit, so one dot can travel between them.
  const [tabLayouts, setTabLayouts] = useState<Record<number, LayoutRectangle>>({});
  const [slotY, setSlotY] = useState<number | null>(null);

  const tabs = state.routes.map((route, index) => {
    const { options } = descriptors[route.key];
    const focused = state.index === index;
    const onPress = () => {
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name, route.params);
      }
    };
    const onLongPress = () => navigation.emit({ type: 'tabLongPress', target: route.key });
    return (
      <TabItem
        key={route.key}
        label={typeof options.title === 'string' ? options.title : route.name}
        accessibilityLabel={options.tabBarAccessibilityLabel}
        focused={focused}
        icon={options.tabBarIcon?.({
          focused,
          color: focused ? tokens.primary : tokens.textMuted,
          size: 24,
        })}
        onPress={onPress}
        onLongPress={onLongPress}
        onLayout={(layout) =>
          setTabLayouts((prev) => {
            const old = prev[index];
            return old && old.x === layout.x && old.width === layout.width && old.y === layout.y
              ? prev
              : { ...prev, [index]: layout };
          })
        }
        onSlotLayout={index === 0 ? setSlotY : undefined}
      />
    );
  });
  const half = Math.ceil(tabs.length / 2);
  const active = tabLayouts[state.index];

  return (
    // Floats over the screens with no fill of its own, so the notch is a real
    // see-through cut-out.
    <View
      accessibilityRole="tablist"
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: BAR_HEIGHT + insets.bottom }}>
      {width > 0 && (
        <Svg width={width} height={BAR_HEIGHT} style={{ position: 'absolute', top: 0 }}>
          <Path d={`${topEdge(width)} V${BAR_HEIGHT} H0 Z`} fill={tokens.surface} />
          {/* Hairline on the top edge only, so the sides and bottom stay clean. */}
          <Path d={topEdge(width)} fill="none" stroke={tokens.border} strokeWidth={1} />
        </Svg>
      )}
      {/* Fills the safe-area strip below the notched SVG. */}
      <View
        style={{ position: 'absolute', top: BAR_HEIGHT, left: 0, right: 0, bottom: 0 }}
        className="bg-surface"
      />
      <View style={{ height: BAR_HEIGHT }} className="flex-row items-center px-2">
        {tabs.slice(0, half)}
        <View style={{ width: NOTCH_HALF * 2 }} />
        {tabs.slice(half)}
        {active && slotY !== null && (
          <SlidingDot x={active.x + active.width / 2} y={active.y + slotY} />
        )}
      </View>
      <GenerateFab />
    </View>
  );
}

const DOT = 4;
// Dot travel: eased, no overshoot, slightly longer than the 250ms base so a
// long jump still reads as a glide.
const DOT_TRAVEL_MS = 350;
const DOT_EASING = Easing.inOut(Easing.cubic);

const styles = StyleSheet.create({
  // Inline: NativeWind classes don't reach Reanimated's Animated.View.
  dot: {
    position: 'absolute',
    left: 0,
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: BRAND.primary,
  },
});

/**
 * The active-tab dot. Glides to the new tab's centre and stretches a little
 * mid-travel, so it reads as one dot following the selection.
 */
function SlidingDot({ x, y }: { x: number; y: number }) {
  const translateX = useSharedValue(x - DOT / 2);
  const stretch = useSharedValue(1);
  const placed = useRef(false);
  useEffect(() => {
    const target = x - DOT / 2;
    if (!placed.current) {
      placed.current = true;
      translateX.set(target);
      return;
    }
    translateX.set(withTiming(target, { duration: DOT_TRAVEL_MS, easing: DOT_EASING }));
    stretch.set(
      withSequence(
        withTiming(2, { duration: DOT_TRAVEL_MS / 2, easing: DOT_EASING }),
        withTiming(1, { duration: DOT_TRAVEL_MS / 2, easing: DOT_EASING }),
      ),
    );
  }, [x, translateX, stretch]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scaleX: stretch.value }],
  }));

  return <Animated.View style={[styles.dot, { top: y, pointerEvents: 'none' }, style]} />;
}

function TabItem({
  label,
  accessibilityLabel,
  focused,
  icon,
  onPress,
  onLongPress,
  onLayout,
  onSlotLayout,
}: {
  label: string;
  accessibilityLabel?: string;
  focused: boolean;
  icon: ReactNode;
  onPress: () => void;
  onLongPress: () => void;
  onLayout: (layout: LayoutRectangle) => void;
  onSlotLayout?: (y: number) => void;
}) {
  const lift = useSharedValue(focused ? 1 : 0);
  const pop = useSharedValue(1);
  const mounted = useRef(false);
  useEffect(() => {
    lift.set(withSpring(focused ? 1 : 0, SPRING));
    // Pop only on a real switch, not when the bar first mounts.
    if (focused && mounted.current) {
      pop.set(withSequence(withTiming(1.15, { duration: 120 }), withSpring(1, SPRING)));
    }
    mounted.current = true;
  }, [focused, lift, pop]);
  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -2 * lift.value }, { scale: pop.value }],
  }));

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={accessibilityLabel ?? label}
      onLayout={(e) => onLayout(e.nativeEvent.layout)}
      className="h-16 flex-1 items-center justify-center gap-1">
      <Animated.View style={iconStyle}>{icon}</Animated.View>
      <Text
        numberOfLines={1}
        className={`text-caption ${focused ? 'font-semibold text-primary' : 'font-medium text-text-muted'}`}>
        {label}
      </Text>
      {/* Holds the dot's spot; the shared SlidingDot draws over it. */}
      <View
        style={{ width: DOT, height: DOT }}
        onLayout={onSlotLayout && ((e) => onSlotLayout(e.nativeEvent.layout.y))}
      />
    </Pressable>
  );
}

function GenerateFab() {
  const router = useRouter();
  const scale = useSharedValue(1);
  const scaleStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  return (
    <View
      style={{ position: 'absolute', top: -FAB_LIFT, left: 0, right: 0, pointerEvents: 'box-none' }}
      className="items-center">
      <Animated.View style={scaleStyle}>
        <Pressable
          onPress={() => router.push('/outfit/new')}
          onPressIn={() => {
            scale.set(withSpring(0.96, SPRING));
          }}
          onPressOut={() => {
            scale.set(withSpring(1, SPRING));
          }}
          accessibilityRole="button"
          accessibilityLabel="Generate today's outfit"
          style={{ width: FAB_SIZE, height: FAB_SIZE }}
          className="items-center justify-center rounded-full bg-primary shadow-lg active:bg-primary-pressed">
          <Sparkles size={26} strokeWidth={1.75} color="#FFFFFF" />
        </Pressable>
      </Animated.View>
    </View>
  );
}
