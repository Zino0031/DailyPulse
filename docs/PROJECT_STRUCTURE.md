# Project Structure (`PROJECT_STRUCTURE.md`)

```tree
myOutfit/
├── app/                      # Expo Router file-based routing
│   ├── (auth)/               # Authentication group (Sign in, Sign up)
│   │   ├── sign-in.tsx
│   │   └── sign-up.tsx
│   ├── (tabs)/               # Main tab navigator group
│   │   ├── _layout.tsx       # Tab bar configuration
│   │   ├── index.tsx         # Daily Outfit Home / Morning Workflow
│   │   ├── closet.tsx        # Digital Wardrobe Grid & Management
│   │   ├── calendar.tsx      # Calendar Sync & Events view
│   │   └── profile.tsx       # User Profile & Subscription / Paywall
│   ├── onboarding/           # Onboarding & Avatar creation flow
│   │   ├── index.tsx
│   │   ├── profile-form.tsx
│   │   └── avatar-capture.tsx
│   ├── outfit/               # Detailed outfit view & regeneration
│   │   └── [id].tsx
│   └── _layout.tsx           # Root layout (Providers: Query, Auth, RevenueCat)
├── assets/                   # Images, fonts, icons
├── components/               # React Native components
│   ├── ui/                   # Reusable UI primitives (Button, Card, Input)
│   ├── closet/               # Closet grid, item card, filter chips
│   ├── home/                 # Daily outfit card, weather widget, mood selector
│   └── avatar/               # Avatar preview & capture components
├── hooks/                    # Custom React hooks (useAuth, useWeather, useCloset)
├── services/                 # API clients & Supabase Edge Function wrappers
├── store/                    # Zustand stores (useAuthStore, useUserPreferencesStore)
├── supabase/                 # Supabase configuration & Edge Functions
│   ├── functions/            # Edge functions (tag-item, generate-outfit)
│   └── migrations/           # PostgreSQL migration SQL files
├── types/                    # TypeScript type definitions and database types
├── utils/                    # Helper functions and formatters
├── app.json                  # Expo configuration
├── package.json              # Dependencies
└── tailwind.config.js        # NativeWind configuration
```

## Module Responsibilities
- **`app/`**: Handles navigation and screen layouts using Expo Router.
- **`components/`**: Houses all presentational and container components grouped by feature domain.
- **`hooks/`**: Encapsulates React Query mutations, queries, and reusable device APIs (camera, calendar).
- **`services/`**: Abstracts backend communication with Supabase and third-party APIs.
- **`store/`**: Manages lightweight global client state.
- **`supabase/`**: Contains database schema migrations and secure serverless edge functions.
