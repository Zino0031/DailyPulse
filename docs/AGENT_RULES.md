# OpenCode Execution Guidelines (`AGENT_RULES.md`)

## 1. Core Principles
- **Strict TypeScript:** All code must be fully typed. No implicit `any`. Use strict interfaces and types for all props, database models, and API responses.
- **Expo Router Conventions:** Use file-based routing inside `app/`. Group layouts with `_layout.tsx` and screens with descriptive names or dynamic routes (`[id].tsx`).
- **Modular Component Design:** Keep components small, reusable, and single-responsibility. Place shared UI primitives in `components/ui/` and feature components in `components/features/`.
- **State Management Separation:**
  - Client state, user preferences, and UI toggles belong in **Zustand** stores (`store/`).
  - Server data fetching, caching, and mutations belong in **TanStack Query** (`hooks/` or `services/`).

## 2. API & Security Standards
- **Zero Client-Side API Keys:** Never expose private API keys (Supabase service role, Gemini keys, Replicate tokens) on the client side. All external API calls requiring secret keys must be proxied through **Supabase Edge Functions**.
- **Row Level Security (RLS):** Every Supabase table must have RLS enabled with strict policies ensuring users can only read and write their own data (`auth.uid() = user_id`).
- **Environment Variables:** Use `expo-constants` and `.env` files with proper prefixing (`EXPO_PUBLIC_`).

## 3. Styling & UI Consistency
- Use **NativeWind v4** utility classes for styling. Maintain consistent spacing, typography scale, and color palettes matching the app branding.
- Support responsive layouts for both iOS and Android screen sizes.
