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

Apply the migrations **before** deploying the function. Every intent now
carries a client request id, recorded in `generation_requests`
(`20261018000000_generation_requests.sql`, issue #44) so a refresh, a
StrictMode double-effect or a retry replays the same generation instead of
spending a second one. A function that finds no such table logs
`idempotency unavailable` and generates without dedup.

Reservations are kept for two days, then cleaned up by
`20261018010000_generation_requests_retention.sql` (a `pg_cron` job when the
extension is available) **and** opportunistically by the function itself on
each call — so the table can't grow unbounded even without `pg_cron`.

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

## Subscriptions — RevenueCat paywall + tier gating (issue #17)

What enforces what:

| Limit | Free | Plus | Pro | Enforced by |
|---|---|---|---|---|
| Closet items | 50 | 250 | unlimited | `enforce_closet_limit` trigger (insert fails with `closet_full`) |
| AI outfits / day (UTC) | 1 | 5 | unlimited | `consume_generation()` in `generate-outfit` (429) |
| Regenerate | — | ✓ | ✓ | `generate-outfit` (403 `regenerate_locked`) |
| Preview quality | standard | standard | HD | `render-outfit` reads the tier |

`users.tier` is only writable by the service role (trigger
`users_guard_tier`), so the profile form can't self-upgrade anyone.

### 1. RevenueCat dashboard (owner)

1. Entitlements with these exact identifiers: **`plus`** and **`pro`**.
2. Products whose identifiers contain `plus` / `pro` as a word, e.g.
   `myoutfit_plus_monthly`, `myoutfit_pro_monthly` — the paywall matches
   packages to tiers by that word. Attach each product to its entitlement.
3. Put both packages in the **current** offering.
4. Project settings → Integrations → **Webhooks**: URL
   `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, and an
   Authorization header value (a long random string — same as below).

### 2. Deploy the webhook

```bash
supabase db push   # applies 20261016000000_subscriptions.sql
supabase secrets set REVENUECAT_SECRET_API_KEY=<sk_… secret API key>
supabase secrets set REVENUECAT_WEBHOOK_AUTH=<the header value from step 4>
# RevenueCat sends its own Authorization header, so skip gateway JWT checks;
# the function verifies the webhook secret or the user JWT itself.
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy generate-outfit
supabase functions deploy render-outfit
```

The function never trusts event fields: on every webhook (and when the app
calls it right after a purchase / restore) it re-reads the subscriber from
the RevenueCat REST API and writes `subscriptions` + `users.tier`. Retries
and out-of-order events converge; dashboard TEST events return 200 and
sync nothing.

### 3. Test mode — no real charges

1. RevenueCat → Project settings → API keys → copy the **Test Store** key (`test_…`).
   Create test products for it with the same ids / entitlements as above.
2. `.env`: `EXPO_PUBLIC_REVENUECAT_TEST_KEY=test_…` (wins over store keys).
3. Works in Expo Go, web and dev builds. The paywall shows a "Test mode —
   purchases are simulated" banner. Buy Plus → Profile shows Plus within
   seconds; "Restore purchases" on a fresh install restores it.
4. Verify server state in the SQL editor:
   `select tier from users where id = '<uid>';`
   `select * from subscriptions where user_id = '<uid>';`

Real store sandbox testing (App Store sandbox / Play license testers) needs
a development build (`eas build --profile development`) and the
`EXPO_PUBLIC_REVENUECAT_IOS_KEY` / `_ANDROID_KEY` keys instead.
