import { useEffect } from 'react';
import Animated, {
  FadeIn,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  Armchair,
  BookOpen,
  Briefcase,
  Brush,
  Calendar,
  Camera,
  Clock,
  Coffee,
  FileText,
  Flame,
  Footprints,
  Headphones,
  Leaf,
  Mail,
  Moon,
  Music,
  Newspaper,
  Palette,
  Star,
  Sun,
  Timer,
  TrendingUp,
  Waves,
  Zap,
  type LucideIcon,
} from 'lucide-react-native';

import type { Mood } from '@/store/useUserPreferencesStore';

interface HaloIcon {
  Icon: LucideIcon;
  left?: number;
  right?: number;
  top: number;
}

interface HaloSet {
  color: string;
  icons: HaloIcon[];
}

// Six-slot ring around the centered 88pt face inside a 160pt stage
// (content ~302pt wide): corners + mid-sides + bottom flanks. Every slot
// clears the face box (x 107–195, y 36–124) with margin to spare.
const SLOTS = {
  topLeft: { left: 56, top: 46 },
  topRight: { right: 59, top: 16 },
  midLeft: { left: 66, top: 23 },
  midRight: { right: 66, top: 13 },
  bottomLeft: { left: 64, top: 8 },
  bottomRight: { right: 34, top: -10 },
} as const;

const HALO: Record<Mood, HaloSet> = {
  neutral: {
    color: '#5B47FB',
    icons: [
      { Icon: Coffee, ...SLOTS.topLeft },
      { Icon: BookOpen, ...SLOTS.topRight },
      { Icon: Headphones, ...SLOTS.midLeft },
      { Icon: Leaf, ...SLOTS.midRight },
      { Icon: Music, ...SLOTS.bottomLeft },
      { Icon: Newspaper, ...SLOTS.bottomRight },
    ],
  },
  energetic: {
    color: '#FF7A4D',
    icons: [
      { Icon: Zap, ...SLOTS.topLeft },
      { Icon: Flame, ...SLOTS.topRight },
      { Icon: Sun, ...SLOTS.midLeft },
      { Icon: Music, ...SLOTS.midRight },
      { Icon: Timer, ...SLOTS.bottomLeft },
      { Icon: Star, ...SLOTS.bottomRight },
    ],
  },
  professional: {
    color: '#1E2A4A',
    icons: [
      { Icon: Briefcase, ...SLOTS.topLeft },
      { Icon: Calendar, ...SLOTS.topRight },
      { Icon: Clock, ...SLOTS.midLeft },
      { Icon: FileText, ...SLOTS.midRight },
      { Icon: Mail, ...SLOTS.bottomLeft },
      { Icon: TrendingUp, ...SLOTS.bottomRight },
    ],
  },
  relaxed: {
    color: '#22C58B',
    icons: [
      { Icon: Armchair, ...SLOTS.topLeft },
      { Icon: Moon, ...SLOTS.topRight },
      { Icon: Leaf, ...SLOTS.midLeft },
      { Icon: Waves, ...SLOTS.midRight },
      { Icon: Headphones, ...SLOTS.bottomLeft },
      { Icon: Coffee, ...SLOTS.bottomRight },
    ],
  },
  creative: {
    color: '#E85D9E',
    icons: [
      { Icon: Palette, ...SLOTS.topLeft },
      { Icon: Brush, ...SLOTS.topRight },
      { Icon: BookOpen, ...SLOTS.midLeft },
      { Icon: Coffee, ...SLOTS.midRight },
      { Icon: Footprints, ...SLOTS.bottomLeft },
      { Icon: Camera, ...SLOTS.bottomRight },
    ],
  },
};

/** Subtle float loop — staggered durations feel organic. */
function FloatingIcon({
  Icon,
  color,
  slot,
  index,
}: {
  Icon: LucideIcon;
  color: string;
  slot: { left?: number; right?: number; top: number };
  index: number;
}) {
  const y = useSharedValue(0);

  useEffect(() => {
    y.value = withRepeat(
      withTiming(-6, { duration: 1500 + (index % 4) * 300 }),
      -1,
      true,
    );
  }, [y, index]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: y.value }],
  }));

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      style={[slot, animatedStyle, { padding: 4 }]}
      className="  shadow-lg">
      <Icon size={24} strokeWidth={1.5} color={color} />
    </Animated.View>
  );
}

/** Ring of floating micro-icons — render inside the relative face stage. */
export function MoodHalo({ mood }: { mood: Mood }) {
  const set = HALO[mood];
  return (
    <>
      {set.icons.map(({ Icon, ...slot }, index) => (
        <FloatingIcon
          key={`${mood}-${index}`}
          Icon={Icon}
          color={set.color}
          slot={slot}
          index={index}
        />
      ))}
    </>
  );
}
