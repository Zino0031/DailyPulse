# Mindmap — myOutfit Project Overview

Live Miro board: [https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359](https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359)

---

## 1. Navigation & Routing

- Expo Router (`src/app/`)
  - `_(tabs)` — main tab layout
  - `outfit/[id]` — detail / generate flow (`GenerateFlow`, `SavedOutfitView`)
  - `(tabs)` — home/closet/calendar/profile screens
- Layout files (`_layout.tsx`) define navigators
- Link component (`Link`) for internal navigation
- Tab bar: `components/navigation/FabTabBar.tsx` (floating, reduced motion)

---

## 2. Subscription & Billing

- RevenueCat (`react-native-purchases`)
  - `services/purchases.ts`: `revenueCatKey()`, `isBillingAvailable()`, `isTestMode()`, `identifyPurchaser()`
  - Paywall: `components/subscription/Paywall.tsx`
  - Plans: `supabase/functions/_shared/tiers.ts` (`Free` `1×1×1`, `Plus` `3×3×5`, `Pro` `20×3×20`)
- Tier clamping: server-side (`users.tier`) via `revenuecat-webhook` edge function
- Sandbox (`test_`) vs Production (`goog_`) keys
- Preview budget separate from outfit generation (`useAiRender`)
- Pro cap behavior: no upgrade CTA; neutral “Standard” copy

---

## 3. AI & Rendering

- Cloud AI: `generate-outfit` (Supabase Edge Function)
- On-device composer: `composeOutfits()` (`hooks/useOutfit.ts`)
- Render caching: `render-outfit` writes `outfits.rendered_image_url`
- Regenerate: `regenerate: true` sends fresh request; else reuses cached image
- AI switch: `EXPO_PUBLIC_AI_GENERATION` (`true` = cloud; `false` = on-device)
- Preview budget: `useAiRender` manages budget (separate from outfit allowance)

---

## 4. Build & Deployment

- EAS Build profiles (`eas.json`)
  - `development`: dev client
  - `preview`: internal build (`test_` key; sandbox with Play Internal Testing)
  - `production`: Play Store AAB (`goog_` key required)
  - `production-apk`: internal APK (test key — rejected by RevenueCat production endpoints)
  - `internal`: standalone APK (no RevenueCat key; graceful fallback)
- EAS environments: `development`, `preview`, `production`, `internal`
- Credentials: remote Android keystore (`Build Credentials L-nAmSU5Sp`)
- Release flow: `dev` → `main` PR (merge commit) → build from `main`
- Version: `appVersionSource: remote` + `autoIncrement: true`

---

## 5. Data Flow

- Client → Supabase DB (`users`, `outfits`, `generation_usage`)
- Client → Edge Functions (`generate-outfit`, `render-outfit`, `revenuecat-webhook`, `tag-item`)
- Client state: `useSubscription`, `usePlan`, `useGenerationUsage`
- Server clamp: `tier_limits` from `tier_limits` table / `_shared/tiers.ts`
- Migration (`20261020120000_pro_three_options.sql`): `create or replace` because `tier_limits` return values change

---

## 6. Design & Accessibility

- Design system: `docs/DESIGN.md` (soft iOS, light mode only, Inter typography)
- Touch targets: 44pt minimum (`h-11`, `min-w-[44px]`, `hitSlop={8}`)
- Reduced motion: `TabSceneFade`, `FabTabBar` animations
- Paywall: swipe dismiss, close button top-right, no backdrop color
- Skeleton inset (`components/subscription/Paywall.tsx`)
- Web color scheme: no `dark:` variants

---

## 7. Key Fixes (Issues / PRs)

- #48 — Preview path defects (cached renders, cold-profile clamp, Pro copy, preview budget, 3-option migration)
- #54 — UI pass (native headers, 44pt targets, reduced motion, tab bar, paywall, calendar, skeleton, web colors, tests)
- #55 — Fixes merged to `dev`
- #56 — Release PR (`dev` → `main`)
- #57 — Merge back to `dev`
- #58 — Android standalone build profiles (`production`, `production-apk`, `internal`)
- #61 (`feature/id-preview-access`) — Fix preview option touch target (`app/outfit/[id].tsx`)
