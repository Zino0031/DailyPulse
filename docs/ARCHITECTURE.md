# Technical Blueprint & Architecture: my Outfit

## 1. Recommended Tech Stack (Free & Free-Tier Focused)
- **Framework & Routing:** Expo (React Native) with **Expo Router** (file-based routing, native navigation).
- **Styling:** **NativeWind v4** (Tailwind CSS for React Native) for rapid, consistent UI design.
- **Backend & Database:** **Supabase** (PostgreSQL, Row Level Security, Auth, Edge Functions, Storage) – generous free tier.
- **State Management & Data Fetching:** **Zustand** (client state, user preferences, active outfit) + **TanStack Query (React Query)** (server state, wardrobe items, caching).
- **In-App Purchases & Paywall:** **RevenueCat SDK** (handles subscriptions across iOS/Android with free testing tiers).
- **Weather API:** **Open-Meteo API** (completely free, open-source weather data, zero API keys required).
- **Calendar Integration:** `expo-calendar` (native calendar events access).
- **AI / LLM & Image Generation:**
  - **Text Reasoning / Tagging:** Google Gemini API (Gemini Flash free tier via Google AI Studio).
  - **Image Generation / Try-On:** Replicate API (Free trial credits / Open-source Flux / Stable Diffusion models) or Hugging Face Serverless Inference API (Free tier).

---

## 2. System Architecture Diagram

```ascii
+-----------------------------------------------------------------+
|                        Expo Mobile App                          |
|  (Expo Router, NativeWind, Zustand, TanStack Query, RevenueCat) |
+--------------------------------+--------------------------------+
                                 |
           +---------------------+---------------------+
           |                                           |
           v                                           v
+-----------------------+                   +---------------------+
|  Supabase Auth & DB   |                   | External Free APIs  |
| (PostgreSQL, Storage) |                   | - Open-Meteo Weather|
+----------+------------+                   | - Google Gemini LLM |
           ^                                | - Replicate / HF AI |
           |                                +---------------------+
+----------+------------+
| Supabase Edge Functions|
| (Secure AI & Webhooks) |
+-----------------------+
```

---

## 3. Database Schema (ERD)

### 3.1 Tables
- **`users`**
  - `id` (uuid, PK, references auth.users)
  - `email` (text)
  - `full_name` (text)
  - `location_lat` (numeric)
  - `location_lon` (numeric)
  - `tier` (text: 'free', 'plus', 'pro')
  - `created_at` (timestamptz)

- **`avatars`**
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to users.id)
  - `image_url` (text)
  - `is_active` (boolean)
  - `created_at` (timestamptz)

- **`wardrobe_items`**
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to users.id)
  - `image_url` (text)
  - `category` (text: 'top', 'bottom', 'shoes', 'outerwear', 'accessory')
  - `colors` (text[])
  - `formality` (text: 'casual', 'business', 'formal', 'athletic')
  - `season` (text[])
  - `created_at` (timestamptz)

- **`outfits`**
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to users.id)
  - `item_ids` (uuid[])
  - `rendered_image_url` (text)
  - `weather_summary` (jsonb)
  - `event_summary` (text)
  - `mood` (text)
  - `is_saved` (boolean)
  - `created_at` (timestamptz)

- **`subscriptions`** (written only by the `revenuecat-webhook` function)
  - `id` (uuid, PK)
  - `user_id` (uuid, FK to users.id, unique)
  - `revenuecat_customer_id` (text)
  - `tier` (text: 'free', 'plus', 'pro')
  - `status` (text: 'active', 'expired', 'none')
  - `product_id`, `store`, `environment` ('sandbox' | 'production'), `will_renew`
  - `expires_at`, `updated_at` (timestamptz)

- **`generation_usage`** (daily AI generation counter, UTC days)
  - `user_id` (uuid, FK to users.id), `day` (date) — composite PK
  - `used` (int) — spent atomically by `consume_generation()`

Tier limits (Free 50 items · 1/day, Plus 250 · 5/day + regenerate, Pro
unlimited + HD) live in `supabase/functions/_shared/tiers.ts`, mirrored in SQL
by `public.tier_limits()`. `users.tier` is server-owned: a trigger ignores
client writes to it.

---

## 4. AI Pipeline Specification

1. **Avatar Processing Pipeline:**
   - User selfie uploaded to Supabase Storage $\rightarrow$ Supabase Edge Function calls background removal & face normalization tool $\rightarrow$ Stores standardized avatar asset.
2. **Wardrobe Tagging Pipeline:**
   - Image uploaded $\rightarrow$ Edge Function sends image to Google Gemini 1.5 Flash $\rightarrow$ Structured JSON returned with category, color, formality, and season tags $\rightarrow$ Saved to PostgreSQL.
3. **Daily Outfit Composition Pipeline:**
   - Client triggers morning recommendation $\rightarrow$ Edge Function fetches current weather (Open-Meteo), calendar events (`expo-calendar`), and user mood $\rightarrow$ LLM selects best combination of item IDs from `wardrobe_items` $\rightarrow$ Image generation API (or compositing engine) merges user avatar with selected clothing items $\rightarrow$ Returns preview URLs to client.
