import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, Text, View } from 'react-native';

import {
  MOODS,
  useUserPreferencesStore,
  type Mood,
} from '@/store/useUserPreferencesStore';
import { MoodFace } from './MoodFace';
import { MoodHalo } from './MoodHalo';

interface MoodSelectorProps {
  label?: string;
  sublabel?: string;
  onSelect?: (mood: Mood) => void;
}

const IDLE_CHIP =
  'h-8 flex-row items-center justify-center rounded-full border border-border bg-surface px-1 py-1.5 shadow-sm';

// One full literal per mood. Kept as complete strings in this scanned file
// so Tailwind generates every rule — runtime-interpolated fragments
// (e.g. `bg-mood-${id}`) never resolve. Neutral reuses the primary tint
// instead of inventing a new accent (DESIGN.md §2).
const ACTIVE_CHIP: Record<Mood, { chip: string; text: string }> = {
  neutral: {
    chip: 'h-8 flex-row items-center justify-center rounded-full border border-transparent bg-primary-tint px-1 py-1.5 shadow-sm',
    text: 'text-primary',
  },
  energetic: {
    chip: 'h-8 flex-row items-center justify-center rounded-full border border-transparent bg-mood-energetic px-1 py-1.5 shadow-sm',
    text: 'text-white',
  },
  professional: {
    chip: 'h-8 flex-row items-center justify-center rounded-full border border-transparent bg-mood-professional px-1 py-1.5 shadow-sm',
    text: 'text-white',
  },
  relaxed: {
    chip: 'h-8 flex-row items-center justify-center rounded-full border border-transparent bg-mood-relaxed px-1 py-1.5 shadow-sm',
    text: 'text-white',
  },
  creative: {
    chip: 'h-8 flex-row items-center justify-center rounded-full border border-transparent bg-mood-creative px-1 py-1.5 shadow-sm',
    text: 'text-white',
  },
};

// Width shares proportional to label length (text + padding), so every
// label renders in full on one line with no scroll, shrink, or truncation.
const CHIP_SHARE: Record<Mood, { flexGrow: number; flexBasis: 0 }> = {
  neutral: { flexGrow: 54, flexBasis: 0 },
  energetic: { flexGrow: 65, flexBasis: 0 },
  professional: { flexGrow: 85, flexBasis: 0 },
  relaxed: { flexGrow: 53, flexBasis: 0 },
  creative: { flexGrow: 60, flexBasis: 0 },
};

// Gradient washes sampled from each button's own accent (DESIGN.md §2):
// light tint melting into a deeper tint of the same hue. All washes stay
// light so the fixed dark title ink always reads; neutral stays clean.
const CARD_GRADIENT: Record<
  Mood,
  [string, string] | [string, string, string]
> = {
  neutral: ['#FFFFFF', '#F4F1FD', '#EDE9FE'],
  energetic: ['#FFF3EA', '#FFD9BE', '#FFAB8A'],
  professional: ['#F0F3FA', '#D5DEEF', '#B3C4E0'],
  relaxed: ['#E7FAF1', '#C6F0DA', '#93E3BC'],
  creative: ['#FCE9F2', '#F6B9D6', '#DFA9F0'],
};

/**
 * Mood hero card (DESIGN.md §7 Card + §10 mood-chip example): glossy face
 * with floating micro-icons, centered title, and five pill filters.
 * Store-backed and persisted — Epic 5 reads the stored mood straight into
 * the outfit generation request (neutral = no strong signal).
 */
export function MoodSelector({
  label = 'How are you feeling?',
  sublabel = "Your current vibe drives today's suggestions.",
  onSelect,
}: MoodSelectorProps) {
  // Legacy stored null (pre-neutral installs) falls back to the default.
  const mood = useUserPreferencesStore((s) => s.mood) ?? 'neutral';
  const setMood = useUserPreferencesStore((s) => s.setMood);

  return (
    
    <View className="radius-24  w-full  rounded-2xl shadow-lg">
      <LinearGradient
      colors={CARD_GRADIENT[mood]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ borderRadius: 24, paddingLeft: 16, paddingRight: 16, paddingBottom: 16 , boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)'}}
      >
      <View className="relative mb-4 h-[160] items-center justify-center">
        <MoodFace mood={mood} />
        <View className="absolute">
            <MoodHalo mood={mood} />
          </View>
      </View>
      <Text className="text-left text-title-3 font-semibold  text-[#0A0C0F]">
        {label}
      </Text>
      <Text className="mb-4 mt-1 text-left text-footnote text-[#5B6472]">
        {sublabel}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className="flex-row gap-1">
        {MOODS.map((option) => {
          const active = mood === option.id;
          const style = ACTIVE_CHIP[option.id];
          return (
            <Pressable
            key={option.id}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={option.label}
              onPress={() => {
                setMood(option.id);
                onSelect?.(option.id);
              }}
              style={CHIP_SHARE[option.id]}
              className={active ? style.chip : IDLE_CHIP}>
              <Text
                numberOfLines={1}
                className={`text-caption font-medium tracking-[-0.5px] ${
                  active ? style.text : 'text-text'
                }`}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </LinearGradient>
                  </View>
  );
}
