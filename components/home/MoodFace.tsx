import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Defs, Ellipse, G, Path, RadialGradient, Stop } from 'react-native-svg';

import type { Mood } from '@/store/useUserPreferencesStore';

const AnimEllipse = Animated.createAnimatedComponent(Ellipse);

// DESIGN.md §2 mood accents (SVG takes raw hex, not classes). Fills stay
// constant across schemes, features are white per the hero-card rule.
const NEUTRAL_FEATURE = '#5B47FB';
const FEATURE_WHITE = '#FFFFFF';

// Glossy 3D-style head: radial light from the top-left + specular shine.
const GLOSS: Record<string, { base: string; shine: string }> = {
  none: { base: '#EDE9FE', shine: '#FFFFFF' },
  energetic: { base: '#FF7A4D', shine: '#FFD9C4' },
  professional: { base: '#1E2A4A', shine: '#6B7FA6' },
  relaxed: { base: '#22C58B', shine: '#C2F5E2' },
  creative: { base: '#E85D9E', shine: '#F9C6DF' },
};

type PoseKey = Exclude<Mood, 'neutral'> | 'none';

interface Pose {
  roll: number;
  leftEye: { rx: number; ry: number };
  rightEye: { rx: number; ry: number };
  mouth: { d: string; width: number; open: boolean };
}

const POSE: Record<PoseKey, Pose> = {
  none: {
    roll: 0,
    leftEye: { rx: 6, ry: 6 },
    rightEye: { rx: 6, ry: 6 },
    mouth: { d: 'M-10 0 Q0 6 10 0', width: 5, open: false },
  },
  energetic: {
    roll: -8,
    leftEye: { rx: 7, ry: 7 },
    rightEye: { rx: 7, ry: 7 },
    mouth: { d: 'M-20 -6 Q0 22 20 -6 Q0 6 -20 -6 Z', width: 0, open: true },
  },
  professional: {
    roll: 0,
    leftEye: { rx: 6, ry: 6 },
    rightEye: { rx: 6, ry: 6 },
    mouth: { d: 'M-14 1 H14', width: 5, open: false },
  },
  relaxed: {
    roll: 7,
    leftEye: { rx: 6, ry: 2 },
    rightEye: { rx: 6, ry: 2 },
    mouth: { d: 'M-12 -1 Q0 7 12 -1', width: 5, open: false },
  },
  creative: {
    roll: -12,
    leftEye: { rx: 6, ry: 6 },
    rightEye: { rx: 6, ry: 1 },
    mouth: { d: 'M-15 -1 Q2 8 15 -7', width: 5, open: false },
  },
};

/**
 * Static mood head + a features layer that rolls and pops into each mood.
 * Reanimated drives the wrapping View's transform plus the eyes' rx/ry —
 * all valid SVG attributes, so nothing can leak an invalid prop to the DOM
 * on web. The mouth path swaps per mood, masked by the pop.
 */
export function MoodFace({ mood }: { mood: Mood | null }) {
  const key: PoseKey = !mood || mood === 'neutral' ? 'none' : mood;
  const pose = POSE[key];

  const pop = useSharedValue(1);
  const roll = useSharedValue(0);
  const leftRx = useSharedValue(6);
  const leftRy = useSharedValue(6);
  const rightRx = useSharedValue(6);
  const rightRy = useSharedValue(6);

  useEffect(() => {
    // Barely-there settle scale — felt, not seen.
    pop.value = 0.96;
    pop.value = withSpring(1, { damping: 14, stiffness: 200 });
    roll.value = withSequence(
      withTiming(pose.roll === 0 ? 0 : pose.roll * 1.6, { duration: 140 }),
      withSpring(pose.roll, { damping: 11, stiffness: 150 }),
    );
    // Eyelids morph smoothly — closed ↔ open visibly animates.
    const eyelid = { damping: 14, stiffness: 170 };
    leftRx.value = withSpring(pose.leftEye.rx, eyelid);
    leftRy.value = withSpring(pose.leftEye.ry, eyelid);
    rightRx.value = withSpring(pose.rightEye.rx, eyelid);
    rightRy.value = withSpring(pose.rightEye.ry, eyelid);
  }, [key, pop, roll, leftRx, leftRy, rightRx, rightRy, pose]);

  const featuresStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pop.value }, { rotate: `${roll.value}deg` }],
  }));

  // rx/ry are real SVG attributes, so animating them is safe on every
  // platform — unlike transform props, nothing leaks to the DOM on web.
  const leftEyeProps = useAnimatedProps(() => ({
    rx: leftRx.value,
    ry: leftRy.value,
  }));
  const rightEyeProps = useAnimatedProps(() => ({
    rx: rightRx.value,
    ry: rightRy.value,
  }));

  const ink = key === 'none' ? NEUTRAL_FEATURE : FEATURE_WHITE;
  const gloss = GLOSS[key];

  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={
        mood && mood !== 'neutral' ? `Current mood: ${mood}` : 'Mood: neutral'
      }
      className="h-[88px] w-[88px]">
      {/* Static glossy head — never animated. */}
      <Svg width={88} height={88} viewBox="0 0 96 96">
        <Defs>
          <RadialGradient id="faceGloss" cx="35%" cy="28%" r="85%">
            <Stop offset="0%" stopColor={gloss.shine} />
            <Stop offset="60%" stopColor={gloss.base} />
            <Stop offset="100%" stopColor={gloss.base} />
          </RadialGradient>
        </Defs>
        <Circle cx={48} cy={48} r={44} fill="url(#faceGloss)" />
        <Ellipse cx={33} cy={24} rx={14} ry={7} fill="#FFFFFF" opacity={0.5} />
      </Svg>
      {/* Features layer — the only animated element, via View transform. */}
      <Animated.View style={[{ position: 'absolute', inset: 0 }, featuresStyle]}>
        <Svg width={88} height={88} viewBox="0 0 96 96">
          <G x={48} y={48}>
            <AnimEllipse cx={-14} cy={-12} fill={ink} animatedProps={leftEyeProps} />
            <AnimEllipse cx={14} cy={-12} fill={ink} animatedProps={rightEyeProps} />
            <G x={0} y={14}>
              <Path
                d={pose.mouth.d}
                stroke={ink}
                strokeWidth={pose.mouth.width}
                strokeLinecap="round"
                fill={pose.mouth.open ? ink : 'none'}
              />
            </G>
          </G>
        </Svg>
      </Animated.View>
    </View>
  );
}
