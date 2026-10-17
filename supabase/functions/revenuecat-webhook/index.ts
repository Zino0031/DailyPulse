// revenuecat-webhook — keeps `users.tier` + `subscriptions` in sync with
// RevenueCat (issue #17). Two callers, one code path:
//
//   1. RevenueCat webhook  POST <event JSON>, Authorization: <webhook secret>
//      -> 200 { synced: n }        (non-200 makes RevenueCat retry)
//   2. The app, right after a purchase / restore, with the user's JWT
//      -> 200 { tier, status, expiresAt }
//
// Either way the function re-reads the subscriber from the RevenueCat REST
// API instead of trusting event fields — RevenueCat's recommended pattern,
// so retries and out-of-order events always converge on the truth.
//
// Secrets (see supabase/README.md):
//   supabase secrets set REVENUECAT_SECRET_API_KEY=<sk_… secret key>
//   supabase secrets set REVENUECAT_WEBHOOK_AUTH=<long random string>
// Deploy WITHOUT gateway JWT checks (RevenueCat sends its own header):
//   supabase functions deploy revenuecat-webhook --no-verify-jwt

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import {
  isAccountId,
  subscriptionStateFrom,
  type RcSubscriber,
  type SubscriptionState,
} from '../_shared/tiers.ts';

const RC_API = 'https://api.revenuecat.com/v1/subscribers';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RcEvent {
  type?: string;
  app_user_id?: string;
  original_app_user_id?: string;
  aliases?: string[];
  transferred_from?: string[];
  transferred_to?: string[];
}

/** Length-independent comparison so the secret can't be guessed by timing. */
function safeEqual(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** Every account id an event touches (TRANSFER moves between two users). */
function accountIdsOf(event: RcEvent): string[] {
  const ids =
    event.type === 'TRANSFER'
      ? [...(event.transferred_from ?? []), ...(event.transferred_to ?? [])]
      : [event.app_user_id, event.original_app_user_id, ...(event.aliases ?? [])];
  return [...new Set(ids.filter(isAccountId))];
}

async function fetchSubscriber(appUserId: string, secretKey: string): Promise<RcSubscriber> {
  const res = await fetch(`${RC_API}/${encodeURIComponent(appUserId)}`, {
    headers: { Authorization: `Bearer ${secretKey}`, Accept: 'application/json' },
  });
  if (!res.ok) {
    throw new Error(`RevenueCat subscriber lookup failed (${res.status})`);
  }
  const body = (await res.json()) as { subscriber?: RcSubscriber };
  return body.subscriber ?? {};
}

/** Writes the subscriber's current state. Returns null for unknown users. */
async function syncUser(
  admin: SupabaseClient,
  userId: string,
  secretKey: string,
): Promise<SubscriptionState | null> {
  const { data: user, error: userError } = await admin
    .from('users')
    .select('id,tier')
    .eq('id', userId)
    .maybeSingle();
  if (userError) throw userError;
  if (!user) return null;
  const previousTier = (user as { tier?: string }).tier ?? 'free';

  const state = subscriptionStateFrom(await fetchSubscriber(userId, secretKey));

  const { error: subError } = await admin.from('subscriptions').upsert(
    {
      user_id: userId,
      revenuecat_customer_id: userId,
      tier: state.tier,
      status: state.status,
      product_id: state.productId,
      store: state.store,
      environment: state.environment,
      will_renew: state.willRenew,
      expires_at: state.expiresAt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (subError) throw subError;

  const { error: tierError } = await admin
    .from('users')
    .update({ tier: state.tier })
    .eq('id', userId);
  if (tierError) throw tierError;

  // Fresh budgets on plan change: a user who upgrades mid-day starts
  // clean instead of inheriting the old plan's spent counters.
  if (state.tier !== previousTier) {
    const today = new Date().toISOString().slice(0, 10);
    const { error: resetError } = await admin
      .from('generation_usage')
      .delete()
      .eq('user_id', userId)
      .eq('day', today);
    if (resetError) throw resetError;
    const { error: previewResetError } = await admin
      .from('preview_usage')
      .delete()
      .eq('user_id', userId)
      .eq('day', today);
    if (previewResetError) throw previewResetError;
  }
  return state;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  const secretKey = Deno.env.get('REVENUECAT_SECRET_API_KEY');
  if (!secretKey) return json({ error: 'subscriptions not configured' }, 503);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const authHeader = req.headers.get('Authorization') ?? '';
    const webhookAuth = Deno.env.get('REVENUECAT_WEBHOOK_AUTH');

    // 1. RevenueCat webhook.
    if (webhookAuth && safeEqual(authHeader, webhookAuth)) {
      const body = (await req.json().catch(() => null)) as { event?: RcEvent } | null;
      const ids = body?.event ? accountIdsOf(body.event) : [];
      let synced = 0;
      for (const id of ids) {
        if (await syncUser(admin, id, secretKey)) synced++;
      }
      // Dashboard TEST events and anonymous ids sync nothing — still a 200,
      // otherwise RevenueCat retries an event we can never apply.
      return json({ synced });
    }

    // 2. Signed-in app user refreshing their own plan.
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'sign in required' }, 401);

    const state = await syncUser(admin, user.id, secretKey);
    if (!state) return json({ error: 'profile not found' }, 404);
    return json({ tier: state.tier, status: state.status, expiresAt: state.expiresAt });
  } catch (e) {
    console.error('[revenuecat-webhook]', e);
    return json({ error: 'could not sync your plan, try again' }, 500);
  }
});
