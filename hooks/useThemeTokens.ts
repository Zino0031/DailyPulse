// Hex mirror of the neutral tokens in global.css (DESIGN.md §2) for the
// few props that can't take a className — icon `color`, RefreshControl
// tint, placeholder fills. Keep in sync with global.css.
const NEUTRALS = {
  bg: '#F5F7FA',
  surface: '#FFFFFF',
  border: '#E5E7EB',
  text: '#0A0C0F',
  textMuted: '#5B6472',
  textSubtle: '#9CA3AF',
};
export const BRAND = {
  primary: '#5B47FB',
  primaryTint: '#EDE9FE',
  danger: '#FF4D55',
  warning: '#FF9A3C',
  success: '#22C58B',
  white: '#FFFFFF',
} as const;

const TOKENS = { ...NEUTRALS, ...BRAND };

/** Light-mode only (app.json `userInterfaceStyle: "light"`). */
export function useThemeTokens() {
  return TOKENS;
}
