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

## generate-outfit edge function (issue #14)

Free-tier Gemini Flash picker. One-time setup (owner):

```bash
# 1. Free key from https://aistudio.google.com (no billing needed)
supabase secrets set GEMINI_API_KEY=<paste-key>

# 2. Deploy
supabase functions deploy generate-outfit
```

Verify (expect `capped`/`outfitId`, never a stack trace):

```bash
# sign in as the tester to grab a JWT, then:
curl -X POST https://<ref>.supabase.co/functions/v1/generate-outfit \
  -H "Authorization: Bearer <tester-jwt>" \
  -H 'Content-Type: application/json' \
  -d '{"weather":{"tempC":22,"rainPct":10},"dress":"casual","mood":"relaxed"}'
```

Locally typechecked with `deno check` (no tsc — functions are excluded
from the app tsconfig and run on Deno). Until deployed, the app
transparently falls back to the on-device composer — the "AI styled" vs
"On-device" badge on each board shows which engine answered.

## render-outfit edge function (AI try-on imagery)

FLUX.1-schnell over Hugging Face Inference Providers. One-time setup:

```bash
# 1. Free token: https://huggingface.co/settings/tokens
#    (fine-grained, "Make calls to Inference Providers" permission)
supabase secrets set HF_TOKEN=<paste-token>

# 2. Deploy
supabase functions deploy render-outfit
```

Verify (needs a signed-in tester JWT; renders upload to the private
`outfits` bucket and return a 7-day signed URL):

```bash
curl -X POST https://<ref>.supabase.co/functions/v1/render-outfit \
  -H "Authorization: Bearer <tester-jwt>" -H 'Content-Type: application/json' \
  -d '{"items":[{"category":"top","colors":["white"],"formality":"casual"}],"ctx":{"tempC":22,"dress":"casual","mood":"relaxed"},"seed":7}'
```

Without the secret the function 503s and the app falls back to the
keyless Pollinations render, then to the photo board — nothing breaks.

## tryon-render edge function (true virtual try-on — NEEDS BILLING)

Photorealistic try-on over Gemini image models: avatar photo + garment
photos go in as image references. Verified working, BUT Google gives image
output a free-tier limit of **0** — do not rely on it without billing:

```bash
supabase functions deploy tryon-render
```

The app intentionally does NOT call it; renders come from the keyless
Pollinations engine with photo-board fallback. Revisit when there's render
budget (natural Pro-tier perk: try-on costs per render).
