# Product Requirements Document (PRD): my Outfit

## 1. Product Vision & Goals

### 1.1 Core Proposition
**my Outfit** is an AI-powered daily outfit planner mobile application designed to eliminate decision fatigue by intelligently curating daily clothing combinations. The app synthesizes real-time weather conditions, calendar events, personal mood, and the user's actual digital wardrobe, presenting the final look visually on a personalized digital avatar.

### 1.2 Core Value Proposition
- **Zero Decision Fatigue:** Instant, contextual outfit recommendations every morning.
- **Maximized Wardrobe Utility:** Rediscover forgotten items in the digital closet through smart AI pairing.
- **Personalized Visualization:** See outfits rendered on an avatar that reflects the user's likeness.
- **Cost-Effective Architecture:** Designed around robust free and generous free-tier APIs to ensure low running costs and high scalability.

### 1.3 Success Metrics (KPIs)
- **Daily Active Usage (DAU/MAU):** Percentage of users opening the app for morning recommendations.
- **Wardrobe Engagement:** Average number of clothing items uploaded per active user.
- **Conversion Rate:** Free-to-Paid subscription conversion within the first 14 days.
- **Recommendation Acceptance Rate:** Percentage of generated outfits saved or selected by users.

---

## 2. User Personas & User Journeys

### 2.1 Persona 1: The Busy Professional (Alex, 32)
- **Pain Points:** Rushed mornings, high-stakes meetings requiring specific dress codes, tired of wearing the same 5 outfits.
- **Goals:** Quick, reliable outfit selection aligned with schedule and weather within 30 seconds.
- **Workflow:** Wakes up $\rightarrow$ Opens app $\rightarrow$ App checks calendar (Board meeting at 10 AM, flight at 4 PM) $\rightarrow$ Checks weather (Chilly & raining) $\rightarrow$ User selects "Stressed/Formal" mood $\rightarrow$ App suggests a sharp trench coat, tailored trousers, and professional loafers rendered on avatar $\rightarrow$ Accepts look and gets dressed.

### 2.2 Persona 2: The Fashion Enthusiast (Jordan, 24)
- **Pain Points:** Wants creative combinations, cares deeply about aesthetics, wants to experiment with capsule wardrobes.
- **Goals:** Explore diverse styles, use custom style prompts, generate high-res visualizations, track outfit history.
- **Workflow:** Opens app $\rightarrow$ Selects "Creative/Happy" mood $\rightarrow$ Requests alternative suggestions via AI slider $\rightarrow$ Fine-tunes recommendations with custom prompt tweaks $\rightarrow$ Saves look to weekly lookbook.

---

## 3. Comprehensive Feature Specifications

### 3.1 Onboarding & Face-to-Avatar Pipeline
- **User Profile Setup:** Simple form collecting Name, Location (for weather coordinates), and style preferences.
- **Avatar Generation:**
  - User takes or uploads a clear selfie.
  - Image processed via an open-source/free-tier image-to-image or LoRA avatar generation pipeline (or styled Bitmoji-style 2D vector avatar via free avatar generation libraries, with AI-rendered try-on in higher tiers).
  - Generates a reusable base avatar asset stored in Supabase Storage and referenced in the user profile.

### 3.2 Closet Management & Vision AI Auto-Tagging
- **Upload & Background Removal:** Users snap photos of clothes hanging or flat-lay. Free-tier background removal (e.g., lightweight client-side ONNX models or free serverless functions) strips backgrounds.
- **Vision AI Auto-Tagging:** Integration with lightweight Vision LLMs (e.g., Gemini Flash free tier) to automatically categorize items into:
  - Category (Top, Bottom, Shoes, Outerwear, Accessories)
  - Color, Pattern, Fabric
  - Season/Temperature suitability
  - Formality Level (Casual, Business, Formal, Athletic)

### 3.3 Context Engine
- **Meteo Integration:** Real-time weather fetched via **Open-Meteo API** (free, no API key required for non-commercial/generous tiers). Fetches temperature, precipitation, wind speed, and UV index.
- **Calendar Integration:** Device calendar sync via Expo Calendar API or secure OAuth calendar plugins (Google/Apple Calendar) to detect event tags (e.g., "gym", "meeting", "date night", "casual").
- **Mood Input:** Quick 3-tap mood selector on the home dashboard (e.g., Energetic ⚡, Professional 💼, Relaxed 🛋️, Creative ✨).

### 3.4 AI Image Outfit Composer
- **Prompt Engineering Pipeline:** Combines wardrobe item metadata + weather attributes + calendar formality + user mood into structured prompts.
- **Image Generation / Composition:**
  - Uses free or open-source image generation/composition APIs (e.g., Stable Diffusion via free-tier Hugging Face Serverless Inference APIs or Replicate pay-as-you-go with free credits, combined with lightweight overlay compositing for zero-cost base options).
  - Renders 3–5 outfit options showing the user's avatar wearing the selected items.

### 3.5 3-Tier Subscription & Paywall Logic
- **Free Tier:**
  - Wardrobe Capacity: Up to 50 items.
  - Daily AI Outfit Generations: 1 generation per day.
  - Resolution: Standard preview resolution.
- **Plus Tier ($X/mo):**
  - Wardrobe Capacity: Up to 250 items.
  - Daily AI Generations: 3 generations per day + "Regenerate" options.
  - Custom mood and style parameter tuning.
- **Pro Tier ($Y/mo):**
  - Unlimited wardrobe capacity & 20 AI generations a day (3 options each).
  - High-res cinematic avatar renders.
  - Advanced calendar auto-sync and packing list generator.
- **Paywall Management:** Integrated via **RevenueCat** SDK with Expo.

---

## 4. Non-Functional Requirements
- **Latency Targets:** Weather sync < 1s; Closet item auto-tagging < 3s; Outfit generation < 8-12s.
- **Offline Capabilities:** Cached wardrobe items and last-known weather available offline using local SQLite / WatermelonDB or MMKV.
- **Image Caching:** Fast local image caching via Expo Image to ensure smooth scrolling through large digital closets.
