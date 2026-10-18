// render-outfit — AI try-on imagery over Cloudflare Workers AI (issue #45).
// POST { outfitId?: string, items?: WardrobeItem[], ctx: OutfitContext, seed?: number }
//   -> { renderUrl, engine: 'cf-klein' | 'cf-flux', quality: 'standard' | 'hd', usage }
//    | 429 { capped: true, code: 'preview_limit', usage }
//    | 502 { error: 'render unavailable, try again', usage }
//
// Cloudflare is the only engine — no cross-provider fallback. Engine order:
// FLUX.2-klein-4b (garment references) → FLUX.1-schnell (text only).
// Output size follows the caller's tier (Pro = HD) — read server-side,
// never from the request (supabase/functions/_shared/tiers.ts).
//
// Free Cloudflare account → account ID + API token with Workers AI permission:
//   supabase secrets set CLOUDFLARE_ACCOUNT_ID=<id> CLOUDFLARE_API_TOKEN=<token>
// Deploy: supabase functions deploy render-outfit
//
// Renders upload to the private `outfits` bucket. When an `outfitId` is given
// the row stores the storage **path** (`renders/<user>/<uuid>.png`) so the app
// can re-sign it on read (issue #50); the response still carries a 7-day
// signed URL for immediate display (expo-image caches it). If no engine yields
// an image the function returns 502 `unavailable` — the app upsells, it does
// not fall back.

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';

import { planFor, RENDER_SIZE } from '../_shared/tiers.ts';
import { isOwnPath, isRemoteUrl } from '../_shared/wardrobeTags.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cloudflare Workers AI — genuinely free (10k neurons/day, no card).
// FLUX.1-schnell ≈ 90 neurons per 768x1024 render → 100+/day free.
const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';
// klein-4b: fixed 4-step, up to 4 binary image refs (<512px each).
const CF_KLEIN_MODEL = '@cf/black-forest-labs/flux-2-klein-4b';
const KLEIN_REF_PX = 400;

/** Shrink public (query-less) URLs under klein's 512px input limit. */
function kleinSrc(url: string): string {
  if (url.includes('?')) return url;
  return `https://images.weserv.nl/?url=${url.replace(/^https?:\/\//, '')}&w=${KLEIN_REF_PX}&output=jpg`;
}

interface RefBytes {
  bytes: ArrayBuffer;
  mime: string;
}

/**
 * Garment photos arrive either as http(s) URLs (seed data) or as
 * private-bucket paths (real uploads) — resolve both server-side with the
 * service role so renders never depend on client-side signing. Callers must
 * have checked path ownership first (see `ownRef`).
 */
async function resolveBytes(
  admin: SupabaseClient,
  imageRef: string,
): Promise<RefBytes | null> {
  try {
    if (isRemoteUrl(imageRef)) {
      const res = await fetch(kleinSrc(imageRef), {
        headers: { 'User-Agent': 'DailyPulse-render/1.0' },
      });
      if (!res.ok) {
        console.error('[render-outfit] ref download status', res.status, imageRef.slice(0, 90));
        return null;
      }
      return {
        bytes: await res.arrayBuffer(),
        mime: res.headers.get('content-type')?.split(';')[0] || 'image/jpeg',
      };
    }
    // Uploads are 1080px — over klein's input limit. Storage image
    // transformations shrink them; projects without that feature fall back
    // to the original (klein may then reject it and schnell takes over).
    const bucket = admin.storage.from('wardrobe');
    let { data, error } = await bucket.download(imageRef, {
      transform: { width: KLEIN_REF_PX, resize: 'contain' },
    });
    if (error || !data) ({ data, error } = await bucket.download(imageRef));
    if (error || !data) {
      console.error('[render-outfit] bucket download failed', error?.message, imageRef.slice(0, 90));
      return null;
    }
    return { bytes: await data.arrayBuffer(), mime: data.type || 'image/jpeg' };
  } catch (e) {
    console.error('[render-outfit] ref download error', String(e).slice(0, 160));
    return null;
  }
}

/**
 * Keeps a garment reference only if it's a public URL or the caller's own
 * storage path. The service role bypasses storage RLS, so without this any
 * signed-in user could render (and so read) another user's private photos.
 */
function ownRef(ref: string | undefined, userId: string): string | undefined {
  if (!ref) return undefined;
  return isRemoteUrl(ref) || isOwnPath(ref, userId) ? ref : undefined;
}

/**
 * Multi-reference render: garments go in as input_image_0..3, prompt names
 * them by index. Falls back to null (caller tries schnell) on any failure.
 */
async function renderViaKlein(
  admin: SupabaseClient,
  accountId: string,
  apiToken: string,
  items: RenderItem[],
  ctx: RenderCtx,
  size: { width: number; height: number },
): Promise<ArrayBuffer | null> {
  const refs: { bytes: ArrayBuffer; mime: string; label: string }[] = [];
  console.log(
    '[render-outfit] klein input items:',
    items.map((i) => ({ hasUrl: Boolean(i.image_url), category: i.category })),
  );
  for (const item of items.slice(0, 4)) {
    if (!item.image_url) continue;
    const dl = await resolveBytes(admin, item.image_url);
    if (dl) {
      refs.push({
        ...dl,
        label: `${(item.colors ?? []).join(' and ') || ''} ${item.category}`.trim(),
      });
    }
  }
  console.log('[render-outfit] klein refs attached:', refs.length);
  if (refs.length === 0) return null;
  const light =
    ctx.tempC >= 20 ? 'bright daylight' : ctx.tempC >= 10 ? 'soft daylight' : 'overcast daylight';
  const garmentRefs = refs.map((r, i) => `image ${i} (${r.label})`).join(', ');
  // Mannequin framing (not a person) to stay clear of safety filters while
  // keeping the full outfit visible head to shoes.
  const prompt =
    `Full-body vector fashion illustration on a faceless tailor's mannequin, entire figure visible head to shoes in frame, standing in a cozy bedroom with an open wardrobe closet full of clothes behind, mannequin dressed in ${garmentRefs}, ${ctx.mood} mood styling, ${ctx.dress} dress code, ${light} from a window, flat colors, clean vector shapes, no photo, no realism, no cropped body, no real people`;
  try {
    const form = new FormData();
    form.append('prompt', prompt);
    form.append('width', String(size.width));
    form.append('height', String(size.height));
    refs.forEach((ref, i) => {
      form.append(
        `input_image_${i}`,
        new Blob([ref.bytes], { type: ref.mime }),
        `ref${i}.jpg`,
      );
    });
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_KLEIN_MODEL}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiToken}` },
        body: form,
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[render-outfit] klein error', res.status, detail.slice(0, 300));
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('image')) return await res.arrayBuffer();
    const data = (await res.json()) as { result?: { image?: string } };
    const b64 = data.result?.image;
    if (typeof b64 === 'string' && b64.length > 0) {
      return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)).buffer as ArrayBuffer;
    }
    return null;
  } catch (e) {
    console.error('[render-outfit] klein transport error', e);
    return null;
  }
}

async function renderViaCloudflare(
  prompt: string,
  seed: number,
): Promise<ArrayBuffer | null> {
  const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
  const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
  if (!accountId || !apiToken) return null;
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${CF_MODEL}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiToken}`,
          'Content-Type': 'application/json',
        },
        // NOTE: schnell's schema allows prompt only — num_steps/seed are
        // rejected as unevaluated properties. Variety comes from the caller
        // re-rolling (each call diffuses fresh).
        body: JSON.stringify({ prompt }),
      },
    );
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[render-outfit] CF error', res.status, detail.slice(0, 300));
      return null;
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('image')) {
      return await res.arrayBuffer();
    }
    // Workers AI REST wraps some models as JSON: { result: { image } }.
    try {
      const data = (await res.json()) as {
        success?: boolean;
        result?: { image?: string };
      };
      const b64 = data.result?.image;
      if (typeof b64 === 'string' && b64.length > 0) {
        const binary = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return binary.buffer as ArrayBuffer;
      }
    } catch {
      // fall through to null
    }
    console.error('[render-outfit] CF non-image reply', contentType);
    return null;
  } catch (e) {
    console.error('[render-outfit] CF transport error', e);
    return null;
  }
}

interface RenderItem {
  category: string;
  colors: string[];
  formality: string;
  image_url?: string;
}

interface CatalogRow extends RenderItem {
  id: string;
}

interface RenderCtx {
  tempC: number;
  dress: string;
  mood: string;
}

function describeItems(items: RenderItem[]): string {
  const part = (item: RenderItem) =>
    `${item.colors.join(' and ') || ''} ${item.category} (${item.formality})`.trim();
  return items.map(part).join(', ');
}

function buildPrompt(items: RenderItem[], ctx: RenderCtx): string {
  const light =
    ctx.tempC >= 20 ? 'bright daylight' : ctx.tempC >= 10 ? 'soft daylight' : 'overcast daylight';
  return `Full-body vector illustration, entire person visible head to shoes in frame, faceless person with blank face and no facial features, standing in a cozy bedroom with an open wardrobe closet full of clothes behind, wearing ${describeItems(items)}, ${ctx.mood} mood styling, ${ctx.dress} dress code, ${light} from a window, flat colors, clean vector shapes, minimalist fashion illustration, no photo, no realism, no cropped body`;
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

  // Set once a preview is spent; any later failure gives it back.
  let refundPreview: () => Promise<unknown> = async () => {};

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

    const admin = createClient(supabaseUrl, serviceKey);
    const { outfitId, items: bodyItems, ctx, seed = 1 } = await req.json();
    let items: RenderItem[] = Array.isArray(bodyItems)
      ? (bodyItems as RenderItem[]).map((i) => ({ ...i, image_url: ownRef(i.image_url, user.id) }))
      : [];
    let promptCtx: RenderCtx = ctx;
    if (typeof outfitId === 'string') {
      const { data: row, error } = await admin
        .from('outfits')
        .select('item_ids,weather_summary,event_summary,mood')
        .eq('id', outfitId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (error || !row) return json({ error: 'outfit not found' }, 404);
      const { data: found } = await admin
        .from('wardrobe_items')
        .select('id,category,colors,formality,image_url')
        .in('id', row.item_ids)
        .eq('user_id', user.id);
      const byId = new Map(
        ((found ?? []) as CatalogRow[]).map((i) => [i.id, i]),
      );
      const ids = (row.item_ids ?? []) as string[];
      items = ids
        .map((id) => byId.get(id))
        .filter((i): i is CatalogRow => Boolean(i));
      const weather = (row.weather_summary ?? {}) as { tempC?: number };
      promptCtx = {
        tempC: typeof weather.tempC === 'number' ? weather.tempC : 20,
        dress: typeof row.event_summary === 'string' ? row.event_summary : 'casual',
        mood: typeof row.mood === 'string' ? row.mood : 'neutral',
      };
    }
    if (items.length === 0 || !promptCtx) {
      return json({ error: 'items and ctx (or outfitId) are required' }, 400);
    }

    // Preview budget: one spend per fresh render, refunded on failure.
    // Cached signed URLs never reach here, so re-views don't double-spend.
    const { data: preview, error: previewError } = await admin
      .rpc('consume_preview', { p_user: user.id })
      .single<{ allowed: boolean; used: number; daily_limit: number | null; tier: string }>();
    if (previewError || !preview) throw previewError ?? new Error('preview check failed');
    const previewUsage = { used: preview.used, limit: preview.daily_limit };
    if (!preview.allowed) {
      return json(
        { capped: true, code: 'preview_limit', usage: previewUsage, error: 'daily preview limit reached' },
        429,
      );
    }
    let previewRefunded = false;
    let previewSpent = false;
    refundPreview = async () => {
      if (previewRefunded || !previewSpent) return;
      previewRefunded = true;
      await admin.rpc('refund_preview', { p_user: user.id });
    };
    previewSpent = true;

    const { data: profile } = await admin
      .from('users')
      .select('tier')
      .eq('id', user.id)
      .maybeSingle();
    const quality = planFor(profile?.tier).renderQuality;

    const prompt = buildPrompt(items, promptCtx);
    // Cloudflare only: klein multi-reference → schnell text. Whichever
    // yields an image wins; otherwise the caller gets `unavailable`.
    const accountId = Deno.env.get('CLOUDFLARE_ACCOUNT_ID');
    const apiToken = Deno.env.get('CLOUDFLARE_API_TOKEN');
    let imageBytes: ArrayBuffer | null = null;
    let engine = 'cf-klein';
    if (accountId && apiToken) {
      imageBytes = await renderViaKlein(admin, accountId, apiToken, items, promptCtx, RENDER_SIZE[quality]);
    }
    if (!imageBytes) {
      imageBytes = await renderViaCloudflare(prompt, seed);
      engine = 'cf-flux';
    }
    if (!imageBytes) {
      await refundPreview();
      return json(
        { error: 'render unavailable, try again', usage: previewUsage },
        502,
      );
    }
    console.log('[render-outfit] rendered via', engine);

    const path = `renders/${user.id}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage
      .from('outfits')
      .upload(path, imageBytes, { contentType: 'image/png', upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signError } = await admin.storage
      .from('outfits')
      .createSignedUrl(path, 7 * 24 * 3600);
    if (signError || !signed) throw signError ?? new Error('sign failed');

    if (typeof outfitId === 'string') {
      // Persist the *path*, not the signed URL: the app re-signs on read so
      // saved-look thumbnails outlive the 7-day signature (issue #50).
      await admin
        .from('outfits')
        .update({ rendered_image_url: path })
        .eq('id', outfitId)
        .eq('user_id', user.id);
    }
    // schnell ignores size params — report what was actually delivered.
    return json({
      renderUrl: signed.signedUrl,
      engine,
      quality: engine === 'cf-flux' ? 'standard' : quality,
      usage: previewUsage,
    });
  } catch (e) {
    console.error('[render-outfit]', e);
    await refundPreview().catch(() => {});
    return new Response(JSON.stringify({ error: 'something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
