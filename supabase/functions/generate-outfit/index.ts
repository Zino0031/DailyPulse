// generate-outfit — Epic 5 outfit picker (#14).
// POST { weather: { tempC, rainPct }, dress, mood, excludeTopIds?: string[], regenerate?: boolean }
//   -> { outfitId, itemIds, reasoning, usage: { used, limit } }
//    | 429 { capped: true, code: 'daily_limit', usage }
//    | 403 { locked: true, code: 'regenerate_locked' }
//
// Auth: caller JWT (anon key). Gemini key lives in function secrets:
//   supabase secrets set GEMINI_API_KEY=<key from https://aistudio.google.com>
// Deploy: supabase functions deploy generate-outfit
//
// Free-tier design: one Gemini Flash call per generation (~1-2s). The
// on-device composer (services/outfit.ts) stays as the offline fallback.

import { createClient } from 'jsr:@supabase/supabase-js@2';

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

function buildPrompt(
  items: WardrobeRow[],
  weather: { tempC: number; rainPct: number },
  dress: string,
  mood: string,
  excludeTopIds: string[],
  gender: string,
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
  return `You are a practical fashion stylist. Pick ONE outfit from the catalogue below.

Context: ${weather.tempC}C, rain ${weather.rainPct}%, dress code ${dress}, mood ${mood}.${wearer}
${excludeTopIds.length ? `Avoid reusing these top IDs: ${excludeTopIds.join(', ')}.` : ''}
Rules: exactly one top, one bottom, one pair of shoes (required). Add outerwear if under 18C or rain over 40%. Accessories optional (max one). Every id must come from the catalogue. Match formality to the dress code, respect the weather, echo the mood in color or vibe.

Catalogue:
${catalogue}

Reply with JSON only: {"top": "id", "bottom": "id", "shoes": "id", "outerwear": "id|null", "accessory": "id|null", "reasoning": ["short reason 1", "short reason 2", "short reason 3"]}`;
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
    } = await req.json();
    if (typeof weather?.tempC !== 'number' || typeof dress !== 'string' || typeof mood !== 'string') {
      return json({ error: 'weather.tempC, dress and mood are required' }, 400);
    }

    const admin = createClient(supabaseUrl, serviceKey);

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

    // Atomic check-and-spend (supabase/migrations/20261016000000_subscriptions.sql).
    // Anything failing after this point refunds the generation.
    const { data: spend, error: spendError } = await admin
      .rpc('consume_generation', { p_user: user.id })
      .single<SpendRow>();
    if (spendError || !spend) throw spendError ?? new Error('usage check failed');
    const usage = { used: spend.used, limit: spend.daily_limit };
    if (!spend.allowed) {
      return json(
        { capped: true, code: LIMIT_ERRORS.dailyLimit, tier: plan.id, usage, error: 'daily generation limit reached' },
        429,
      );
    }
    refund = async () => {
      await admin.rpc('refund_generation', { p_user: user.id });
    };
    const fail = async (body: unknown, status: number) => {
      await refund?.();
      refund = null;
      return json(body, status);
    };

    const prompt = buildPrompt(pool, weather, dress, mood, excludeTopIds, gender);
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
    let picks: Record<string, string | null>;
    try {
      picks = JSON.parse(text);
    } catch {
      return fail({ error: 'stylist returned a bad pick, try again' }, 502);
    }

    const byId = new Map(pool.map((i) => [i.id, i]));
    const need: [slot: string, category: string, required: boolean][] = [
      ['top', 'top', true],
      ['bottom', 'bottom', true],
      ['shoes', 'shoes', true],
      ['outerwear', 'outerwear', false],
      ['accessory', 'accessory', false],
    ];
    const itemIds: string[] = [];
    for (const [slot, category, required] of need) {
      const id = picks[slot];
      if (typeof id === 'string' && byId.get(id)?.category === category) {
        itemIds.push(id);
      } else if (required) {
        return fail({ error: 'stylist returned a bad pick, try again' }, 502);
      }
    }
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

    return json({ outfitId: outfit.id, itemIds, reasoning, usage });
  } catch (e) {
    console.error('[generate-outfit]', e);
    await refund?.().catch((refundError) => console.error('[generate-outfit] refund', refundError));
    return new Response(JSON.stringify({ error: 'something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
