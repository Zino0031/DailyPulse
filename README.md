# myOutfit — Smart Daily Outfit Planner

A cross-platform mobile app (Expo / React Native) that plans daily outfits from a user’s wardrobe, powered by an AI stylist or an on-device composer, with tiered usage limits, cached previews, and a server-owned subscription model.

---

## Project Purpose

- Generate styled outfit boards using wardrobe items.
- Support both cloud AI (`generate-outfit`) and on-device (`composeOutfits`) rendering.
- Cache preview images (`outfits.rendered_image_url`) and allow explicit regeneration.
- Enforce tier budgets (Free: `1×1×1`, Plus: `3×3×5`, Pro: `20×3×20`) server-side.
- Keep Pro users free of upgrade CTAs when capped; show neutral “Standard” copy.
- Provide standalone APK/AAB builds via EAS without requiring `npx expo start`.

---

## Architecture

| Layer | Technology | Key Files |
|---|---|---|
| Mobile client | Expo SDK 57, React Native, Expo Router | `src/app/`, `components/` |
| Hooks / state | TanStack Query, Zustand | `hooks/useOutfit.ts`, `store/` |
| Services | Supabase (DB + Edge Functions) | `supabase/` |
| AI / render | Supabase Edge Functions (`generate-outfit`, `render-outfit`) | `supabase/functions/` |
| Subscriptions | RevenueCat (`react-native-purchases`) | `services/purchases.ts` |
| Build / deploy | EAS Build (`eas.json`) | `eas.json`, `.env` |

Navigation is handled by **Expo Router** (`src/app/`); non-route code lives outside `src/app/`.

---

## Design System

Full design spec: `docs/DESIGN.md`.

- **Aesthetic:** soft iOS, light mode only (`#F5F7FA` bg, indigo `#5B47FB` brand), oversized rounded cards (`rounded-xl`, `shadow-md`), generous whitespace.
- **Typography:** Inter (loaded via `@expo-google-fonts/inter`), mobile-tuned scale from `caption` (12pt) to `title-1` (28pt).
- **Components:** floating FAB tab bar (`components/navigation/FabTabBar.tsx`), sheet modals (`PageSheet`), 44pt minimum touch targets (`h-11` / `min-w-[44px]` + `hitSlop`), reduced-motion support (`TabSceneFade`), skeleton inset states.

---

## Tier System & Budgets

| Tier | Outfit Options | Regenerations / Option | Preview Budget | Behavior at Cap |
|---|---|---|---|---|
| Free | 1 | 1 | 1 | Blocked; show “Standard” for Pro |
| Plus | 3 | 3 | 5 | Blocked; plan info only |
| Pro | 20 | 3 | 20 | Blocked; neutral copy, no upgrade CTA |

- Server owns tier clamping (`supabase/functions/_shared/tiers.ts`).
- Client sends `regenerate: true` for explicit regeneration; cached renders reuse `outfits.rendered_image_url`.
- Preview allowance is a separate budget from outfit generations (`useAiRender.ts`).

---

## Environment Variables (`.env` / EAS)

| Variable | Required | Notes |
|---|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Yes | Public URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `EXPO_PUBLIC_AI_GENERATION` | Yes | `true` = cloud AI; `false` = on-device only |
| `EXPO_PUBLIC_REVENUECAT_TEST_KEY` | Only for internal/test builds | `test_…`; rejected by production endpoints |
| `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` | Production Android billing | `goog_…`; do not set `test_` here |

Never commit `.env`. Production EAS variables are set via `eas env:set` (`preview` / `production` / `internal`).

---

## Build Profiles (`eas.json`)

| Profile | Output | Distribution | EAS Env | RevenueCat Key |
|---|---|---|---|---|
| `development` | Development client | Internal | — | — |
| `preview` (new) | Internal APK/AAB for quick install | Internal | `preview` | `test_…` (sandbox only with Play Internal Testing) |
| `production` | Play Store AAB | Store | `production` | Real `goog_…` key required |
| `production-apk` | Internal APK (standalone) | Internal | `preview` | `test_…` (rejected; use only if you accept the error) |
| `internal` (recommended) | Internal APK (standalone, no server) | Internal | `internal` | None — graceful fallback |

**Standalone without server:** build with `--profile internal --platform android`. The app runs fully (Supabase + AI off), and billing shows the neutral “Purchases aren’t set up” message.

---

## Gitflow Workflow

- Integration branch: `dev`
- Feature branches: `feature/<issue-number>-<slug>`
- Every PR must reference an issue and include `Fixes #N` in at least one commit message.
- Commit messages must describe what was done (e.g., `Fixes #48: reuse cached renders`).
- Merge to `dev` only with passing CI (`lint`, `tsc --noEmit`, `expo-doctor`, web smoke test).
- Production release: open `dev` → `main` PR, merge with a **merge commit** (not squash), build from `main`.

---

## Key Fixes & Decisions

- **Issue #48 (Preview Path Defects):** cached render reuse (`rendered_image_url`), cold-profile clamp removal, top exclusion, Pro copy/CTA rules, preview budget display (`useAiRender`), 3-option catalog/migration.
- **PR #54 (UI Pass):** native headers, 44pt targets, reduced motion (`TabSceneFade`), tab bar dot offset, paywall close/dismiss, `ProfileForm` hydration/retry, calendar integration, skeleton inset, web color scheme, tests.
- **Release PR (#56):** promoted `dev` → `main`; `main` rebuilt from `dev` (`#57`); `dev` updated.

---

## Release Process

1. Create `release` PR: `dev` → `main`; merge with **merge commit**.
2. Configure EAS production environment (`env:set`) without exposing test keys to production builds.
3. From `main`, run `npx eas-cli build --profile production --platform android` (AAB) or `--profile internal` (APK, no server).
4. Submit AAB to Play Store via EAS Submit when ready.

---

## Mindmap (Project Overview)

Link to live Miro board: [https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359](https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359)

The board maps:
- **Navigation** → Routes, layout files (`_layout.tsx`), tab bar, FAB.
- **Subscription & Billing** → RevenueCat integration, tier limits, paywall, webhook mapping (`revenuecat-webhook`), sandbox vs production.
- **AI & Rendering** → `generate-outfit`, `render-outfit`, cached previews, on-device fallback (`AI_GENERATION=false`), preview budget.
- **Build & Deployment** → EAS profiles (`development`, `preview`, `production`, `production-apk`, `internal`), EAS environment variables, keystore/credentials, release PR (`dev` → `main`).
- **Data Flow** → Supabase DB (`users`, `outfits`), edge functions (`_shared/tiers.ts`), client state (`useSubscription`, `usePlan`).

---

## Quick Commands

```bash
# Development
npx expo start

# Typecheck / lint
npx tsc --noEmit
npx expo lint

# Fix SDK drift
npx expo install --fix
npx expo-doctor

# EAS builds
npx eas-cli build --profile internal --platform android
npx eas-cli build --profile production --platform android

# Build list
npx eas-cli build:list --platform android --limit 3
```

---

## File Index

| Path | Purpose |
|---|---|
| `src/app/` | Expo Router screens |
| `components/` | Reusable UI (cards, sheets, buttons, tab bar) |
| `hooks/` | State logic (`useOutfit`, `useSubscription`, `useThemeTokens`) |
| `services/` | API clients (`purchases`, `supabase`, `avatar`, `closet`, `weather`, `ai`) |
| `store/` | Zustand stores (`usePaywallStore`, `useAuthStore`, etc.) |
| `supabase/` | DB migrations (`migrations/`), edge functions (`functions/`), shared types |
| `docs/` | Requirements (`PRD.md`), architecture (`ARCHITECTURE.md`), backlog (`BACKLOG.md`), design (`DESIGN.md`), agent rules (`AGENT_RULES.md`) |
| `.env`, `.env.example` | Local environment variables |
| `eas.json` | EAS build profiles and submit config |
| `app.json` | Expo config (bundle ID missing `ios.bundleIdentifier` — add before iOS release) |

---

## Known Limitations / Blockers

- **iOS bundle identifier:** `app.json` is missing `ios.bundleIdentifier`; add before any iOS production build.
- **RevenueCat production Android key (`goog_…`):** required for real billing; not configured in `production` EAS env yet.
- **Supabase migrations/functions:** must be deployed remotely before production builds that rely on backend AI/previews/paywall sync.
- **Android standalone build (`test_` key):** rejected by RevenueCat production endpoints; use `internal` profile for standalone APK without billing errors.
- **Play Store Internal Testing:** required for `test_` sandbox purchases on Android sideloaded builds; not required for `internal` profile.

---

## Credits & References

- Design direction: `docs/DESIGN.md` (soft iOS, Inter, 44pt targets, reduced motion)
- Design references: `mock-ups/` (Fabrx guide, product page, welcome card)
- Issue tracking: `docs/BACKLOG.md`, PR #48, PR #54, PR #55, PR #56, PR #57
- Miro board: [https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359](https://miro.com/app/board/uXjVHiRH7Hg=/?share_link_id=345865142359)
