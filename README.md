# myOutfit

Smart daily outfit planner (Expo / React Native). See `docs/PRD.md`,
`docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, and `docs/AGENT_RULES.md`.

## Prerequisites

- Node 20+
- The Expo Go app (mobile) or a simulator

## Setup

```bash
npm install
cp .env.example .env   # fill in your Supabase project URL + anon key
```

## Run

```bash
npx expo start      # dev server — scan the QR with Expo Go
npx expo start -w   # web
npx expo start -a   # android emulator
npx expo start -i   # iOS simulator (macOS only)
```

## Checks (required green before every PR — enforced by CI)

```bash
npx expo lint       # ESLint (expo config)
npx tsc --noEmit    # strict typecheck
npx expo-doctor     # SDK / dependency diagnosis
npx expo install --fix   # fix SDK version drift when doctor complains
```

CI also runs a web smoke test: `npx expo export --platform web`.

## Workflow

- `dev` is the integration branch. Never push feature work directly to it.
- One GitHub issue = one branch: `feature/<issue-number>-<slug>`
  (e.g. `feature/1-app-shell`), opened as a PR back into `dev`.
- `dev` requires passing status checks before merge (repo Settings → Branches).
