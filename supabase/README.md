# Supabase backend — issue #2

Foundation per `docs/ARCHITECTURE.md` §3 (ERD).

## What's in this branch

- `supabase/migrations/20260325000000_init.sql` — tables (`users`, `avatars`,
  `wardrobe_items`, `outfits`, `subscriptions`), `handle_new_user` trigger,
  RLS policies (owner-only on every table, read-only `subscriptions`),
  storage buckets (`avatars` public / `wardrobe`, `outfits` private) + object policies.
- `types/database.ts` — hand-written `Database` type for supabase-js, mirrors the migration.
- `services/supabase.ts` — typed singleton client (anon key only, AsyncStorage session).
- `supabase/tests/verify-rls.sql` — two-user RLS check script.
- `.env.example` — required public env vars.

## Owner steps (need Supabase dashboard access — can't run from CI)

```bash
# 1. Create the project at supabase.com, then link it (one time):
npx supabase link --project-ref <project-ref>

# 2. Push the migration to the fresh project:
npx supabase db push

# 3. Point the app at it:
cp .env.example .env   # fill in URL + anon key from Settings -> API

# 4. Regenerate types from the live schema (overwrites types/database.ts):
npx supabase gen types typescript --linked > types/database.ts
```

Then verify RLS: create two auth users in the dashboard, replace the UUIDs in
`supabase/tests/verify-rls.sql`, run it in the SQL editor — user A must see
only A's rows, and the cross-user insert must fail with an RLS error.
