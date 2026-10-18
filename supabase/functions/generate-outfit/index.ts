// generate-outfit — Epic 5 outfit picker (#14), budgets per issue #42.
// POST { weather: { tempC, rainPct }, dress, mood, count?: number, excludeTopIds?: string[], regenerate?: boolean, requestId?: string }
//   -> { outfits: [{ outfitId, itemIds, reasoning }], usage: { used, limit } }
//    | 202 { pending: true, code: 'generation_pending' }  (another invocation owns this intent)
//    | 429 { capped: true, code: 'daily_limit', usage }
//    | 403 { locked: true, code: 'regenerate_locked' }
// `count` is clamped to the caller's plan.outfitOptions (Free 1, Plus 3,
// Pro 5). One consume_generation spend per request, refunded on failure.
//
// Auth: caller JWT (anon key). Gemini key lives in function secrets:
//   supabase secrets set GEMINI_API_KEY=<key from https://aistudio.google.com>
// Deploy: supabase functions deploy generate-outfit
//
// Free-tier design: one Gemini Flash call per generation (~1-2s). The
// on-device composer (services/outfit.ts) stays as the offline fallback.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { claimRequest, type IntentStore } from '../_shared/intent.ts';
import { LIMIT_ERRORS, planFor } from '../_shared/tiers.ts';

const GEMINI_MODEL = 'gemini-3.8-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Row returned by public.consume_generation(). */
interface SpendRow {
  allowed: boolean;
  used: number;
  daily_limit: number | null;
  tier: string;
}

interface WardrobeRow {
  id: string;
  image_url: string;
  category: string;
  colors: string[];
  formality: string;
  season: string[];
}

// Loosely typed: the function runs against the service role and the schema is
// generated ad hoc, so pinning the Database generic here buys nothing.
type AdminClient = SupabaseClient<any, 'public', any>;

function buildPrompt(
  items: WardrobeRow[],
  weather: { tempC: number; rainPct: number },
  dress: string,
  mood: string,
  excludeTopIds: string[],
  gender: string,
  count: number,
): string {
  const catalogue = items
    .map(
      (i) =>
        `- ${i.id} | ${i.category} | colors: ${i.colors.join('/') || 'unknown'} | ${i.formality} | seasons: ${i.season.join('/') || 'any'}`,
    )
    .join('\n');
  const wearer =
    gender === 'female' || gender === 'male'
      ? ` The wearer is a ${gender === 'female' ? 'woman' : 'man'} — prefer cuts and fits suited to them.`
      : '';
  return `You are a practical fashion stylist. Pick ${count} DISTINCT outfits from the catalogue below${count > 1 ? ' — different hero tops so the options feel genuinely different' : ''}.

Context: ${weather.tempC}C, rain ${weather.rainPct}%, dress code ${dress}, mood ${mood}.${wearer}
${excludeTopIds.length ? `Avoid reusing these top IDs: ${excludeTopIds.join(', ')}.` : ''}
Rules: exactly one top, one bottom, one pair of shoes (required). Add outerwear if under 18C or rain over 40%. Accessories optional (max one). Every id must come from the catalogue. Match formality to the dress code, respect the weather, echo the mood in color or vibe.

Catalogue:
${catalogue}

Reply with JSON only: {"outfits": [{"top": "id", "bottom": "id", "shoes": "id", "outerwear": "id|null", "accessory": "id|null", "reasoning": ["short reason 1", "short reason 2"]}]}`;
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

  // Set once a generation is spent; any later failure gives it back.
  let refund: (() => Promise<unknown>) | null = null;
  // Dropped when this invocation owns an idempotency reservation that must not
  // outlive a failure (issue #44).
  let cleanupIntent: (() => Promise<unknown>) | null = null;

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const authHeader = req.headers.get('Authorization') ?? '';
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: 'sign in required' }, 401);

    const {
      weather,
      dress,
      mood,
      gender = 'prefer_not_to_say',
      excludeTopIds = [],
      regenerate = false,
      count: requestedCount,
      requestId,
    } = await req.json();
    if (typeof weather?.tempC !== 'number' || typeof dress !== 'string' || typeof mood !== 'string') {
      return json({ error: 'weather.tempC, dress and mood are required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

    // Idempotency (issue #44). The client resends the same request id when a
    // mount resumes a generation that was in flight, so refresh / StrictMode /
    // retry collapse into the one generation the user actually asked for. The
    // reservation is claimed below, right before the generation is spent.
    const idempotencyKey =
      typeof requestId === 'string' && requestId.length >= 8 && requestId.length <= 128
        ? requestId
        : null;

    const { data: profile } = await admin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .maybeSingle();
    const plan = planFor(profile?.tier);
    if (regenerate === true && !plan.canRegenerate) {
      return json(
        { locked: true, code: LIMIT_ERRORS.regenerateLocked, tier: plan.id, error: 'regenerate needs Plus or Pro' },
        403,
      );
    }
    // Never trust the client count — the plan caps the options served.
    const count = Math.min(
      Math.max(typeof requestedCount === 'number' ? Math.floor(requestedCount) : plan.outfitOptions, 1),
      plan.outfitOptions,
    );

    const { data: items, error: itemsError } = await admin
      .from('wardrobe_items')
      .select('id,image_url,category,colors,formality,season')
      .eq('user_id', user.id);
    if (itemsError) throw itemsError;
    const pool = (items ?? []) as WardrobeRow[];
    const hasAllSlots =
      ['top', 'bottom', 'shoes'].every((slot) => pool.some((i) => i.category === slot));
    if (!hasAllSlots) {
      return json({ error: 'not enough wardrobe items (need top, bottom, shoes)' }, 422);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'AI not configured' }, 503);

    // Claim the intent before spending: a duplicate that arrives mid-flight
    // replays / waits here instead of charging a second generation (#44).
    if (idempotencyKey) {
      const claim = await claimRequest(admin as unknown as IntentStore, user.id, idempotencyKey);
      if (claim.recorded) {
        console.log('[generate-outfit] replay', idempotencyKey);
        return json(claim.recorded);
      }
      if (claim.unavailable) {
        console.warn('[generate-outfit] idempotency unavailable — generating without dedup');
      } else if (!claim.claimed) {
        // The owner is still generating; the client keeps its intent and
        // retries on the next mount rather than being charged for a second one.
        console.log('[generate-outfit] intent in flight', idempotencyKey);
        return json({ pending: true, code: 'generation_pending' }, 202);
      } else {
        cleanupIntent = async () => {
          await admin
            .from('generation_requests')
            .delete()
            .eq('user_id', user.id)
            .eq('request_id', idempotencyKey);
        };
      }
    }

    // Atomic check-and-spend (supabase/migrations/20261016000000_subscriptions.sql).
    // Anything failing after this point refunds the generation.
    const { data: spend, error: spendError } = await admin
      .rpc('consume_generation', { p_user: user.id })
      .single<SpendRow>();
    if (spendError || !spend) throw spendError ?? new Error('usage check failed');
    const usage = { used: spend.used, limit: spend.daily_limit };
    if (!spend.allowed) {
      await cleanupIntent?.();
      cleanupIntent = null;
      return json(
        { capped: true, code: LIMIT_ERRORS.dailyLimit, tier: plan.id, usage, error: 'daily generation limit reached' },
        429,
      );
    }
    refund = async () => {
      await admin.rpc('refund_generation', { p_user: user.id });
    };
    // Record that the generation is now spent so a reservation left behind by
    // a dead invocation can be refunded when it is taken over (#44).
    if (cleanupIntent) {
      const { error: spendMarkError } = await admin
        .from('generation_requests')
        .update({ spent: true })
        .eq('user_id', user.id)
        .eq('request_id', idempotencyKey);
      if (spendMarkError) console.error('[generate-outfit] mark spent', spendMarkError);
    }
    const fail = async (body: unknown, status: number) => {
      await refund?.();
      refund = null;
      await cleanupIntent?.();
      cleanupIntent = null;
      return json(body, status);
    };

    const prompt = buildPrompt(pool, weather, dress, mood, excludeTopIds, gender, count);
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': geminiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.7 },
        }),
      },
    );
    if (!geminiRes.ok) {
      return fail({ error: 'stylist unavailable, try again' }, 502);
    }
    const gemini = await geminiRes.json();
    const text: string = gemini.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    let rawPicks: unknown;
    try {
      rawPicks = JSON.parse(text);
    } catch {
      return fail({ error: 'stylist returned a bad pick, try again' }, 502);
    }
    const candidates: Record<string, string | null>[] = Array.isArray(
      (rawPicks as { outfits?: unknown }).outfits,
    )
      ? (rawPicks as { outfits: Record<string, string | null>[] }).outfits
      : [];

    const byId = new Map(pool.map((i) => [i.id, i]));
    const need: [slot: string, category: string, required: boolean][] = [
      ['top', 'top', true],
      ['bottom', 'bottom', true],
      ['shoes', 'shoes', true],
      ['outerwear', 'outerwear', false],
      ['accessory', 'accessory', false],
    ];
    const seenTops = new Set<string>();
    const outfits: { outfitId: string; itemIds: string[]; reasoning: string[] }[] = [];
    for (const picks of candidates) {
      if (outfits.length >= count) break;
      const itemIds: string[] = [];
      let valid = true;
      for (const [slot, category, required] of need) {
        const id = picks[slot];
        if (typeof id === 'string' && byId.get(id)?.category === category) {
          itemIds.push(id);
        } else if (required) {
          valid = false;
          break;
        }
      }
      const topId = itemIds[0];
      if (!valid || seenTops.has(topId)) continue;
      seenTops.add(topId);
      const reasoning = Array.isArray(picks.reasoning)
        ? picks.reasoning.filter((r): r is string => typeof r === 'string').slice(0, 4)
        : ['Styled for your day'];
      const { data: outfit, error: insertError } = await admin
        .from('outfits')
        .insert({
          user_id: user.id,
          item_ids: itemIds,
          weather_summary: weather,
          event_summary: dress,
          mood,
          is_saved: false,
        })
        .select('id')
        .single();
      if (insertError || !outfit) {
        console.error('[generate-outfit] insert', insertError);
        return fail({ error: 'something went wrong' }, 500);
      }
      outfits.push({ outfitId: outfit.id, itemIds, reasoning });
    }
    if (outfits.length === 0) {
      return fail({ error: 'stylist returned a bad pick, try again' }, 502);
    }

    const payload = { outfits, usage };
    if (idempotencyKey && cleanupIntent) {
      // Record the result on the reservation so a remount replays it for free.
      const { error: recordError } = await admin
        .from('generation_requests')
        .update({ response: payload })
        .eq('user_id', user.id)
        .eq('request_id', idempotencyKey);
      if (recordError) console.error('[generate-outfit] record request', recordError);
      cleanupIntent = null; // settled: leave the reservation in place
    }

    return json(payload);
  } catch (e) {
    console.error('[generate-outfit]', e);
    await refund?.().catch((refundError) => console.error('[generate-outfit] refund', refundError));
    await cleanupIntent?.().catch((cleanupError) =>
      console.error('[generate-outfit] cleanup', cleanupError),
    );
    return new Response(JSON.stringify({ error: 'something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
