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

`EXPO_PUBLIC_AI_GENERATION=false` forces that on-device composer (useful for
offline dev and for testing the daily allowance without spending Gemini
budget). The look is still metered: the app spends it through
`consume_my_generation()` (`20261019130000_consume_my_generation.sql`), which
scopes `consume_generation()` to `auth.uid()`. So Plus gets the same 3
generation actions a day (1 look + Regenerate) with or without AI. Push the
migration before flipping the switch:

```bash
supabase db push
```

## render-outfit edge function (AI try-on imagery)

Cloudflare Workers AI only (issue #45) — no cross-provider fallback.
Engine order: FLUX.2-klein-4b (garment references) → FLUX.1-schnell
(text only). One-time setup:

```bash
# 1. Free Workers AI account (no card). Account ID + an API token with the
#    "Workers AI" permission — https://dash.cloudflare.com/profile/api-tokens
supabase secrets set CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token>

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

Every render spends one AI preview (`consume_preview`, 429 `preview_limit`
once spent; failures refund). If no engine yields an image the function
returns 502 `unavailable` — the app shows the upgrade path, never a
fallback render.

### Persisted preview renders (issue #50)

When the request carries an `outfitId`, the function stores the render's
**storage path** (`renders/<user>/<uuid>.png`) in `outfits.rendered_image_url`
and the app re-signs it on read (`services/renders.ts`) — so saved-look
thumbnails outlive the 7-day signature. The object is uploaded with the
caller's JWT, so `storage.objects.owner` is the app user and the generic
owner-read policy can sign it; the fallback service-role upload (and older
objects) is covered by the path-based policy in
`20261019000000_outfit_render_read_access.sql`. `20261019120000_…_owner_backfill.sql`
repairs ownership on renders written before the JWT upload. Push both before
exercising the Lookbook:

```bash
supabase db push                                # read policy + owner backfill
supabase functions deploy render-outfit         # persists the path (not the URL)
```

The app sends `outfitId` for AI/saved boards and creates an unsaved draft row
for on-device boards on first preview (`is_saved` stays false until Save).

## tryon-render edge function (true virtual try-on — NEEDS BILLING)

Photorealistic try-on over Gemini image models: avatar photo + garment
photos go in as image references. Verified working, BUT Google gives image
output a free-tier limit of **0** — do not rely on it without billing:

```bash
supabase functions deploy tryon-render
```

The app intentionally does NOT call it; renders come from `render-outfit`
(Cloudflare) with the item-photo board as the non-AI fallback. Revisit when
there's render budget (natural Pro-tier perk: try-on costs per render).

## Subscriptions — RevenueCat paywall + tier gating (issue #17)

What enforces what:

| Limit | Free | Plus | Pro | Enforced by |
|---|---|---|---|---|
| Closet items | 50 | 250 | unlimited | `enforce_closet_limit` trigger (insert fails with `closet_full`) |
| AI outfits / day (UTC) | 1 | 3 | 20 | `consume_generation()` in `generate-outfit`, `consume_my_generation()` for on-device |
| Outfit options / generation | 1 | 3 | 5 | `generate-outfit` clamps `count` to the plan |
| AI previews / day (UTC) | 1 | 5 | 20 | `consume_preview()` in `render-outfit` (429 `preview_limit`) |
| Regenerate | locked (paywall) | ✓ | ✓ | `generate-outfit` + app gate (403 `regenerate_locked`) |
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
