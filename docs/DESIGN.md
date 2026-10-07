# DailyPulse — Design System

**Status:** v1 — baseline tokens for all screens. Owner: design system ticket (Epic 0 #20).
**Reach:** every feature screen built from this point forward reads from these tokens. Do not hardcode colors, spacings, or font sizes outside this file; add a new token here instead.

> **Deprecation note:** `constants/Colors.ts` and `components/Themed.tsx` are leftover from the Expo tabs template and are **deprecated**. They remain in-tree only so the scaffold screens (`app/(tabs)/index.tsx`, `app/(tabs)/two.tsx`, `app/modal.tsx`, `app/+not-found.tsx`) stay runnable until each is rewritten in its feature ticket. **Do not use them in new code** — use Tailwind/NativeWind classes against the tokens below.

---

## 1. Aesthetic direction

Soft iOS: a vivid indigo brand on a cool-neutral canvas, oversized rounded cards that float above a light surface, thin-stroke icons, generous whitespace. Minimalist chrome; expressive moments reserved for hero cards, mood accents and the primary CTA.

Reference set lives in `mock-ups/` — the Fabrx guide (Typography/Icons/Guides screens) is the structural backbone; the product-page and welcome-card screens drive the surface treatment and the floating-FAB tab bar.

---

## 2. Color tokens

Colors are defined once as CSS variables in `global.css` and consumed via Tailwind utility classes declared in `tailwind.config.js`. Dark mode flips the variables; the class names (`bg-bg`, `text-text`, `border-border`) stay identical in both schemes.

### Neutrals (theme-aware)

| Token | Class | Light | Dark | Use |
|---|---|---|---|---|
| `bg` | `bg-bg` | `#F5F7FA` | `#0B0D10` | App background |
| `surface` | `bg-surface` | `#FFFFFF` | `#15181C` | Default card / sheet |
| `surface-elevated` | `bg-surface-elevated` | `#FFFFFF` | `#1C2026` | Floating / stacked card |
| `border` | `border-border` | `#E5E7EB` | `#262B33` | Hairline divider, input outline |
| `text` | `text-text` | `#0A0C0F` | `#F5F7FA` | Primary text |
| `text-muted` | `text-text-muted` | `#5B6472` | `#9BA3AF` | Secondary text |
| `text-subtle` | `text-text-subtle` | `#9CA3AF` | `#6B7280` | Captions, placeholders |

### Brand & semantic (constant across themes)

| Token | Class | Hex | Use |
|---|---|---|---|
| `primary` | `bg-primary` | `#5B47FB` | Primary CTA, FAB, active tab, links |
| `primary-pressed` | `bg-primary-pressed` | `#4A38D4` | Pressed state of primary |
| `primary-tint` | `bg-primary-tint` | `#EDE9FE` | Soft primary background (hero cards, chips) |
| `success` | `bg-success` | `#22C58B` | Confirmations, saved outfit toast |
| `warning` | `bg-warning` | `#FF9A3C` | Caution, tier-limit near-cap |
| `danger` | `bg-danger` | `#FF4D55` | Destructive actions, validation errors |
| `accent-mint` | `bg-accent-mint` | `#5DE4C7` | Decorative accents (section markers, celebratory ticks) |

### Mood accents

Each mood maps to a dedicated accent used for the mood chip and the Daily Home background wash. All four are distinct from `primary` so the UI doesn't collapse into one color.

| Mood | Class | Hex | Rationale |
|---|---|---|---|
| Energetic | `bg-mood-energetic` | `#FF7A4D` | Warm coral — matches Onboarding 04 |
| Professional | `bg-mood-professional` | `#1E2A4A` | Deep navy — authority without clashing with indigo primary |
| Relaxed | `bg-mood-relaxed` | `#22C58B` | Mint — calm/natural, reuses `success` hue |
| Creative | `bg-mood-creative` | `#E85D9E` | Magenta-pink — pulls away from indigo |

### Palette rules

- The brand indigo (`primary`) is the **only** color used for the primary CTA. Never use `success`/`warning`/`danger` as a brand accent.
- Mood accents are allowed as hero-card backgrounds, chip fills, and subtle background washes — **not** as text colors. Pair them with white or near-white text (contrast ratio ≥ 4.5:1).
- Dark mode shadows are also softened by using `surface-elevated` for depth rather than relying on shadow alone.

---

## 3. Typography

### Font strategy

- **iOS**: SF Pro Display is available via `className="font-system"` (resolves to `'System'`, which iOS maps to SF Pro Display).
- **All platforms (default)**: **Inter 4** loaded via `@expo-google-fonts/inter`. Default `className="font-sans"` resolves to `Inter_400Regular`. Inter was designed as a close SF-alike and reads as iOS-native on iPhone while giving us consistent typography on Android and web.

Weight → family mapping (each weight is its own loaded family in RN):

| Weight | Class | Family |
|---|---|---|
| Regular 400 | `font-sans` | `Inter_400Regular` |
| Medium 500 | `font-medium` | `Inter_500Medium` |
| SemiBold 600 | `font-semibold` | `Inter_600SemiBold` |
| Bold 700 | `font-bold` | `Inter_700Bold` |

### Type scale (mobile-tuned)

Sized for iPhone and translated down from the Fabrx guide — the 80px/60px display sizes don't survive on a 390pt viewport.

| Token | Class | Size / Line | Weight | Use |
|---|---|---|---|---|
| `display` | `text-display` | 34 / 41 | Bold | Onboarding hero titles |
| `title-1` | `text-title-1` | 28 / 34 | Bold | Screen titles |
| `title-2` | `text-title-2` | 22 / 28 | SemiBold | Section titles |
| `title-3` | `text-title-3` | 20 / 25 | SemiBold | Card titles |
| `headline` | `text-headline` | 17 / 22 | SemiBold | Emphasis, button labels |
| `body` | `text-body` | 17 / 22 | Regular | Default body text |
| `callout` | `text-callout` | 16 / 21 | Regular | Secondary body |
| `subhead` | `text-subhead` | 15 / 20 | Regular | Form labels |
| `footnote` | `text-footnote` | 13 / 18 | Regular | Metadata, timestamps |
| `caption` | `text-caption` | 12 / 16 | Regular | Image captions, chip labels |

### Typography rules

- Combine the size token with the weight class: `className="text-title-1 font-bold text-text"`.
- Avoid letter-spacing overrides; Inter and SF Pro are both metrics-tuned for their size.
- Line height is set in the size token; don't override with `leading-*` unless there is a specific reason.
- Numeric content (prices, counts) can use `font-medium` to keep rhythm with surrounding `font-sans`.

---

## 4. Spacing — 8pt grid

Strict 8pt grid, with 4pt allowed for intra-component rhythm (e.g. chip padding, badge insets). Tailwind spacing scale is unchanged; use these values:

```
0 · 1 (4) · 2 (8) · 3 (12) · 4 (16) · 5 (20) · 6 (24) · 7 (28) · 8 (32) · 10 (40) · 12 (48) · 14 (56) · 16 (64) · 20 (80) · 24 (96)
```

Standards for every screen:

| Context | Spacing | Class |
|---|---|---|
| Screen horizontal padding | 24 | `px-6` |
| Section vertical rhythm | 32 | `gap-8` or `mb-8` |
| Card inner padding | 16–20 | `p-4` to `p-5` |
| Stack between inputs | 16 | `gap-4` |
| Chip padding (horizontal) | 12 | `px-3` |
| Icon ↔ label gap | 8 | `gap-2` |

---

## 5. Radius

| Token | Value | Class | Use |
|---|---|---|---|
| `sm` | 8 | `rounded-sm` | Small badges |
| `md` | 12 | `rounded-md` | Inputs, chips |
| `lg` | 16 | `rounded-lg` | Buttons, small cards |
| `xl` | 24 | `rounded-xl` | Default content cards |
| `2xl` | 32 | `rounded-2xl` | Bottom sheets, hero-reveal panels (top corners only) |
| `full` | 9999 | `rounded-full` | Pills, avatars, FAB |

---

## 6. Shadow

Single-layer soft shadows, no harsh offsets. In dark mode, rely on `surface-elevated` for depth rather than heavier shadows.

| Token | Class | Value |
|---|---|---|
| `sm` | `shadow-sm` | `0 1px 2px rgb(0 0 0 / 0.04)` |
| `md` | `shadow-md` | `0 4px 16px rgb(0 0 0 / 0.08)` — default card |
| `lg` | `shadow-lg` | `0 12px 32px rgb(0 0 0 / 0.12)` — floating sheet, FAB |

---

## 7. Component anatomy

Each entry defines the minimum rules every implementation must follow. Actual components (`components/ui/*`) will be rebuilt against these specs in follow-up tickets.

### Button

| Property | Rule |
|---|---|
| Heights | `sm` 36 · `md` 44 · `lg` 52 |
| Radius | `rounded-full` (pill) default; `rounded-lg` for secondary square buttons |
| Minimum touch target | 44pt (iOS HIG) |
| Primary | `bg-primary` + `text-white`; pressed → `bg-primary-pressed` |
| Secondary | `border border-border` + `text-text`; pressed → `bg-primary-tint` |
| Ghost | `text-primary` only; pressed → `bg-primary-tint` |
| Icon-only | 44×44 square with `rounded-full` for circular, `rounded-lg` for square |

### Chip (filter / mood)

| Property | Rule |
|---|---|
| Height | 32 |
| Radius | `rounded-full` |
| Idle | `border border-border` + `text-text` |
| Active | Mood-matched fill (e.g. `bg-mood-energetic`) + `text-white`; outline removed |
| Padding | `px-3 py-1.5` |

### Card

| Property | Rule |
|---|---|
| Background | `bg-surface` (default) or `bg-surface-elevated` when stacked |
| Radius | `rounded-xl` |
| Shadow | `shadow-md` |
| Padding | `p-4` to `p-5` |
| Hero card variant | Fill with `bg-primary` or `bg-mood-*`, use `text-white`, add decorative confetti/illustration as `absolute` children |

### Sheet (bottom sheet, hero-reveal panel)

| Property | Rule |
|---|---|
| Radius | `rounded-t-2xl` (top corners only) |
| Shadow | `shadow-lg` |
| Grabber (if any) | 36×4, `rounded-full`, `bg-border`, centered 8pt from top |

### Input

| Property | Rule |
|---|---|
| Height | 48 |
| Radius | `rounded-lg` |
| Background | `bg-surface` |
| Border | `border border-border`; focused → `border-primary` |
| Icon slot | Right-aligned, 20pt icon, `pr-3` |
| Placeholder | `text-text-subtle` |

### Icons

- Default size 24; dense 20; large 28.
- Thin stroke (1.5pt).
- iOS: prefer `expo-symbols` (SF Symbols) via `SymbolView`.
- Android / web / cross-platform: use `lucide-react-native` (thin-stroke set that pairs with SF Symbols visually).

### Floating-FAB tab bar

The signature navigation pattern. Reference: `mock-ups/` welcome card screenshot (gift-card app with purple hero and center FAB).

| Property | Rule |
|---|---|
| Bar height | 72pt + safe-area bottom inset |
| Bar background | `bg-surface` with a concave SVG notch under the FAB |
| Layout | 2 side tab items ↔ center FAB ↔ 2 side tab items (max 4 side items, min 2) |
| Center FAB | 56pt circle, `bg-primary`, white icon, `shadow-lg`, lifted ~24pt above the bar |
| Primary action | "Generate today's outfit" → routes to `app/outfit/[id].tsx` |
| Motion | FAB press scales `0.96` → `1.0` on a `withSpring({ damping: 15 })`; tab switch fades the active indicator at 250ms |
| Accessibility | FAB `accessibilityLabel="Generate today's outfit"`, 56pt satisfies 44pt minimum |
| Implementation note | Build the notch as a thin custom `react-native-svg` component — avoids a heavy third-party bar dep. Spec'd here; actual component lands in the shell ticket. |

---

## 8. Motion

- Baseline animation lib: `react-native-reanimated` (already installed).
- Transitions: 250ms ease-out for most state changes; 350ms for sheets.
- Press feedback: scale `0.96` → `1.0` on spring; opacity `0.6` on `Pressable` fallback.
- **Mood background wash**: on the Daily Home screen, apply a subtle animated gradient tied to the active mood. Reanimated shared value, ~8s loop, ±4% saturation shift. Spec only here; implementation lands with the Daily Home ticket.

---

## 9. Dark mode

- Day one. `app.json` sets `userInterfaceStyle: "automatic"`, so the OS drives the scheme.
- Implemented via CSS variables in `global.css`: `.dark { … }` block overrides the `:root` block.
- NativeWind v4 toggles the `.dark` class automatically based on `useColorScheme()`.
- Every token class flips: `bg-bg`, `text-text`, `border-border`, `bg-surface`, etc.
- Brand and mood accents are intentionally constant across schemes.

---

## 10. Usage examples

### Welcome hero card (indigo)

```tsx
<View className="rounded-xl bg-primary p-5 shadow-md">
  <Text className="text-headline text-white opacity-80">Today is</Text>
  <Text className="text-title-1 font-bold text-white">Nola Tjan's Birthday</Text>
  <Text className="text-footnote text-white opacity-70">on April 16</Text>
</View>
```

### Mood chip (active = Relaxed)

```tsx
<Pressable className="rounded-full bg-mood-relaxed px-3 py-1.5">
  <Text className="text-caption font-medium text-white">Relaxed</Text>
</Pressable>
```

### Secondary button

```tsx
<Pressable className="h-11 items-center justify-center rounded-full border border-border bg-surface px-6">
  <Text className="text-headline text-text">View Full Wishlist</Text>
</Pressable>
```

### Themed body text (auto light/dark)

```tsx
<Text className="text-body text-text">Readable in both schemes.</Text>
<Text className="text-footnote text-text-muted">Secondary metadata.</Text>
```

---

## 11. What this ticket does NOT change

Scope-protected so this stays reviewable:

- **No scaffold component rewrites.** `components/ui/{Button,Card,Input}.tsx`, `WeatherWidget`, `ClosetGrid`, `AvatarPreview` stay as stubs; they adopt the tokens in their own feature tickets.
- **No animated-background component.** Spec'd above; implementation ships with the Daily Home ticket.
- **No icon library adoption.** Spec'd above; adopted as screens are rebuilt.
- **No tab bar implementation.** Spec'd above; built in the shell/navigation ticket.
- **No scaffold cleanup.** `Themed.tsx`, `Colors.ts`, `useColorScheme` helpers stay in place until each scaffold screen is replaced.

---

## 12. Changelog

- **v1 (2026-10-07)** — Initial design system. Palette, type scale, spacing, radius, shadow, mood accents, floating-FAB tab bar spec.
