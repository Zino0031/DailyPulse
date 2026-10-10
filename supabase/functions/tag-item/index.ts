// tag-item — Epic 3 vision auto-tagging (#9).
// POST { imagePath } (private `wardrobe` bucket path, e.g. userId/tmp/x.jpg)
//   -> { category, colors, formality, season }
//
// Gemini Flash (free tier, same key as the picker — no new secret):
//   supabase secrets set GEMINI_API_KEY=<key>
// Deploy: supabase functions deploy tag-item
//
// Strict-JSON contract: unknown categories/formalities fall back to safe
// defaults and get logged; the client always lets the user override.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const GEMINI_MODEL = 'gemini-3.8-flash';
const TAG_TIMEOUT_MS = 50000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CATEGORIES = ['top', 'bottom', 'shoes', 'outerwear', 'accessory'] as const;
const FORMALITIES = ['casual', 'business', 'formal', 'athletic'] as const;

type Category = (typeof CATEGORIES)[number];
type Formality = (typeof FORMALITIES)[number];

export interface ItemTags {
  category: Category;
  colors: string[];
  formality: Formality;
  season: string[];
  fabric: string;
  pattern: string;
}

const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const FABRICS = [
  'cotton',
  'denim',
  'linen',
  'wool',
  'silk',
  'polyester',
  'leather',
  'knit',
];
const PATTERNS = [
  'solid',
  'striped',
  'plaid',
  'floral',
  'graphic',
  'polka-dot',
  'colorblock',
  'distressed',
];

function sanitize(raw: unknown): ItemTags {
  const r = (raw ?? {}) as Record<string, unknown>;
  const pick = (value: unknown, allowed: readonly string[], fallback: string): string =>
    typeof value === 'string' && (allowed as readonly string[]).includes(value.toLowerCase())
      ? value.toLowerCase()
      : fallback;
  const strList = (value: unknown, allowed?: readonly string[]): string[] => {
    if (!Array.isArray(value)) return [];
    const out: string[] = [];
    for (const v of value) {
      if (typeof v !== 'string') continue;
      const clean = v.toLowerCase().trim();
      if (!clean) continue;
      if (allowed && !(allowed as readonly string[]).includes(clean)) continue;
      if (!out.includes(clean)) out.push(clean);
      if (out.length >= 4) break;
    }
    return out;
  };
  const colors = strList(r.colors);
  const fabric =
    typeof r.fabric === 'string' &&
    (FABRICS as readonly string[]).includes(r.fabric.toLowerCase())
      ? r.fabric.toLowerCase()
      : '';
  const pattern =
    typeof r.pattern === 'string' &&
    (PATTERNS as readonly string[]).includes(r.pattern.toLowerCase())
      ? r.pattern.toLowerCase()
      : '';
  return {
    category: pick(r.category, CATEGORIES, 'top') as Category,
    colors: colors.length > 0 ? colors : ['unknown'],
    formality: pick(r.formality, FORMALITIES, 'casual') as Formality,
    season: strList(r.season ?? r.seasons, SEASONS),
    fabric,
    pattern,
  };
}

const TAG_PROMPT = `Describe the single clothing item in this photo for a wardrobe app. Reply with JSON only, exactly this shape: {"category": "top|bottom|shoes|outerwear|accessory", "colors": ["up to 4 simple lowercase color names, dominant first"], "formality": "casual|business|formal|athletic", "season": ["subset of spring, summer, autumn, winter"], "fabric": "one of cotton, denim, linen, wool, silk, polyester, leather, knit (best guess from look and drape, empty string if unsure)", "pattern": "one of solid, striped, plaid, floral, graphic, polka-dot, colorblock, distressed"}. Base formality on cut and fabric (t-shirt/jeans/sneakers = casual; shirt/trousers/loafers = business; suit/gown = formal; leggings/jersey = athletic). No other text.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

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

    const { imagePath } = (await req.json()) as { imagePath?: unknown };
    if (typeof imagePath !== 'string' || imagePath.length === 0) {
      return json({ error: 'imagePath is required' }, 400);
    }
    // Users may only tag their own uploads.
    if (!imagePath.startsWith(`${user.id}/`)) {
      return json({ error: 'not your photo' }, 403);
    }

    const admin = createClient(supabaseUrl, serviceKey);
    const { data: blob, error: dlError } = await admin.storage
      .from('wardrobe')
      .download(imagePath);
    if (dlError || !blob) return json({ error: 'photo not found' }, 404);
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength === 0) return json({ error: 'empty photo' }, 422);
    if (bytes.byteLength > 4 * 1024 * 1024) {
      return json({ error: 'photo too large (4MB max)' }, 413);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ engine: 'unavailable' }, 503);

    const bin = new Uint8Array(bytes);
    // Single btoa at the end: per-chunk encoding would break 3-byte
    // alignment and corrupt the payload (seen live as raw JFIF bytes).
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bin.length; i += CHUNK) {
      binary += String.fromCharCode(...bin.subarray(i, i + CHUNK));
    }
    const b64 = btoa(binary);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), TAG_TIMEOUT_MS);
    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': geminiKey,
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: TAG_PROMPT },
                  { inlineData: { mimeType: blob.type || 'image/jpeg', data: b64 } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
          }),
          signal: controller.signal,
        },
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        console.error('[tag-item] Gemini error', res.status, detail.slice(0, 300));
        return json({ error: 'tagging unavailable, fill in manually' }, 502);
      }
      const data = await res.json();
      const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {
        console.error('[tag-item] bad JSON', text.slice(0, 300));
      }
      if (!parsed || typeof parsed !== 'object') {
        return json({ error: 'tagging unclear, fill in manually' }, 502);
      }
      return json(sanitize(parsed));
    } finally {
      clearTimeout(timeout);
    }
  } catch (e) {
    console.error('[tag-item]', e);
    return new Response(JSON.stringify({ error: 'something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
