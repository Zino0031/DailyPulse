/**
 * AI generation switch (#50 follow-up). `EXPO_PUBLIC_AI_GENERATION=false`
 * composes outfits on-device instead of calling `generate-outfit` — handy for
 * offline development, for free-tier testing, and for exercising the daily
 * generation/regenerate accounting without spending AI budget. Defaults to AI.
 *
 * Must stay a static `process.env.EXPO_PUBLIC_…` reference: Expo inlines it at
 * build time (see docs.expo.dev/guides/environment-variables).
 */
export function aiGenerationEnabled(): boolean {
  return process.env.EXPO_PUBLIC_AI_GENERATION !== 'false';
}
