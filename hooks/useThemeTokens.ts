import { useColorScheme } from '@/components/useColorScheme';

// Hex mirror of the theme-aware tokens in global.css (DESIGN.md §2) for the
// few props that can't take a className — icon `color`, RefreshControl
// tint, placeholder fills. Keep in sync with global.css.
const LIGHT = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#0A0C0F',
  textMuted: '#5B6472',
  textSubtle: '#9CA3AF',
};
const DARK: typeof LIGHT = {
  bg: '#0B0D10',
  surface: '#15181C',
  border: '#262B33',
  text: '#F5F7FA',
  textMuted: '#9BA3AF',
  textSubtle: '#6B7280',
};
export const BRAND = {
  primary: '#5B47FB',
  primaryTint: '#EDE9FE',
  danger: '#FF4D55',
  warning: '#FF9A3C',
  success: '#22C58B',
  white: '#FFFFFF',
} as const;

export function useThemeTokens() {
  const scheme = useColorScheme();
  return { ...(scheme === 'dark' ? DARK : LIGHT), ...BRAND, scheme };
}
