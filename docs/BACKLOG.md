# Team Backlog — grab-and-work cards (generated from docs)

Source of truth for humans: this file. Source of truth for automation: `.github/backlog.json`
Seeded to GitHub via `scripts/seed-github-backlog.sh`. Workflow: `.github/workflows/add-to-project.yml`.

Board columns: **Todo → In Progress → In Review → Done**.
Rule: one card = one assignee. Move your card to In Progress when you start.

## Epic 0 — Setup & Backend
- [ ] **[task] App shell, providers, NativeWind, lint/typecheck** `epic:setup` `priority:high`
- [ ] **[task] Supabase project, migrations, RLS, Storage buckets** `epic:setup` `priority:high`
- [ ] **[task] CI workflow (lint, typecheck, expo-doctor)** `epic:setup` `priority:medium`

## Epic 1 — Auth & Onboarding (PRD §3.1)
- [ ] **[feat] Auth flow + session store** `epic:auth` `priority:high`
- [ ] **[feat] Onboarding profile form** `epic:auth` `priority:high`

## Epic 2 — Avatar (PRD §3.1, ARCH §4)
- [ ] **[feat] Avatar capture + upload + active avatar** `epic:avatar` `priority:high`

## Epic 3 — Closet (PRD §3.2, ARCH §4)
- [ ] **[feat] Closet grid UI + CRUD** `epic:closet` `priority:high` `good first issue`
- [ ] **[task] Background removal (free tier)** `epic:closet` `priority:medium`
- [ ] **[task] Vision auto-tagging edge function (Gemini Flash)** `epic:closet` `priority:high`

## Epic 4 — Context Engine (PRD §3.3)
- [ ] **[feat] Weather service + widget (Open-Meteo)** `epic:context` `priority:high` `good first issue`
- [ ] **[feat] Calendar sync + event tagging** `epic:context` `priority:medium`
- [ ] **[feat] Mood selector + store** `epic:context` `priority:medium` `good first issue`

## Epic 5 — AI Composer (PRD §3.4, ARCH §4)
- [ ] **[feat] Daily Home / morning workflow** `epic:ai-composer` `priority:high`
- [ ] **[task] Outfit picker edge function** `epic:ai-composer` `priority:high`
- [ ] **[feat] Outfit detail + AI render + regenerate** `epic:ai-composer` `priority:high`
- [ ] **[feat] Saved lookbook / history** `epic:ai-composer` `priority:low`

## Epic 6 — Subscriptions (PRD §3.5)
- [ ] **[feat] RevenueCat paywall + tier gating** `epic:subscriptions` `priority:high`

## Epic 7 — Infra & Polish (PRD §4 NFR)
- [ ] **[task] Offline cache + image performance** `epic:infra` `priority:medium`

Total: 18 cards. Good first issues for newcomers: Closet grid, Weather widget, Mood selector.
