import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import {
  COLOR_SWATCH,
  LIGHT_SWATCHES,
  type ColorTag,
} from '@/constants/wardrobe';

const RAINBOW = ['#E53935', '#FACC15', '#22A05B', '#3B82F6', '#8E44AD'] as const;

/** Decorative garment-color dot; the label lives on the parent control. */
export function ColorSwatch({ color, size = 12 }: { color: ColorTag; size?: number }) {
  const fill = COLOR_SWATCH[color];
  const style = { width: size, height: size, borderRadius: size / 2 };
  if (fill === null) {
    return (
      <LinearGradient
        colors={RAINBOW}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={style}
        accessibilityElementsHidden
        importantForAccessibility="no"
      />
    );
  }
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      className={LIGHT_SWATCHES.includes(color) ? 'border border-border' : ''}
      style={[style, { backgroundColor: fill }]}
    />
  );
}
