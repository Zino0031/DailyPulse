// tryon-render — true virtual try-on over Gemini image models (free tier).
// POST { outfitId: string } -> { renderUrl, engine: 'gemini-tryon' }
//
// Feeds the user's ACTIVE AVATAR photo + the outfit's garment photos as
// image references plus a styling prompt, so the render wears the actual
// clothes (not descriptions). Needs only the existing GEMINI_API_KEY:
//   supabase secrets set GEMINI_API_KEY=<key from https://aistudio.google.com>
// Deploy: supabase functions deploy tryon-render
//
// Model fallback chain (first 2xx carrying image bytes wins); failures log
// model + status. Uploads to the private `outfits` bucket, stamps
// rendered_image_url, returns a 7-day signed URL.

import { createClient } from 'jsr:@supabase/supabase-js@2';

const IMAGE_MODELS = ['gemini-2.5-flash-image'];
const RENDER_TIMEOUT_MS = 55000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function download(
  supabaseUrl: string,
  serviceKey: string,
  imageUrl: string,
): Promise<{ bytes: ArrayBuffer; mime: string } | null> {
  try {
    // Storage URLs (private buckets) resolve to bucket/path after /object/.
    const marker = '/storage/v1/object/';
    let bytes: ArrayBuffer;
    let mime = 'image/jpeg';
    if (imageUrl.includes(marker)) {
      const [, tail] = imageUrl.split(marker);
      const slash = tail.indexOf('/');
      const bucket = tail.slice(0, slash);
      let path = tail.slice(slash + 1).split('?')[0];
      try {
        path = decodeURIComponent(path);
      } catch {
        // keep raw path
      }
      const admin = createClient(supabaseUrl, serviceKey);
      const { data, error } = await admin.storage.from(bucket).download(path);
      if (error || !data) return null;
      bytes = await data.arrayBuffer();
      mime = data.type || mime;
    } else {
      const res = await fetch(imageUrl);
      if (!res.ok) return null;
      bytes = await res.arrayBuffer();
      mime = res.headers.get('content-type')?.split(';')[0] || mime;
    }
    return { bytes, mime };
  } catch {
    return null;
  }
}

function toBase64(bytes: ArrayBuffer): string {
  const bin = new Uint8Array(bytes);
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bin.length; i += CHUNK) {
    s += String.fromCharCode(...bin.subarray(i, i + CHUNK));
  }
  return btoa(s);
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

  // Set once a preview is spent (below); any later failure gives it back.
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

    const { outfitId, items: bodyItems, ctx: bodyCtx } = (await req.json()) as {
      outfitId?: unknown;
      items?: unknown;
      ctx?: unknown;
    };

    let garmentRefs: { image_url: string; category: string; colors: string[] }[] = [];
    let promptMood = 'neutral';
    let promptDress = 'casual';
    let promptGender = 'prefer_not_to_say';
    let promptTemp = 20;
    let outfitRowId: string | null = null;

    const admin = createClient(supabaseUrl, serviceKey);

    if (typeof outfitId === 'string') {
      const { data: outfit, error: outfitError } = await admin
        .from('outfits')
        .select('item_ids,weather_summary,event_summary,mood')
        .eq('id', outfitId)
        .eq('user_id', user.id)
        .maybeSingle();
      if (outfitError || !outfit) return json({ error: 'outfit not found' }, 404);
      outfitRowId = outfitId;

      const ids = ((outfit as { item_ids?: unknown }).item_ids ?? []) as string[];
      const { data: garments } = await admin
        .from('wardrobe_items')
        .select('id,image_url,category,colors,formality')
        .in('id', ids.length > 0 ? ids : ['00000000-0000-0000-0000-000000000000']);
      garmentRefs = ((garments ?? []) as {
        image_url: string;
        category: string;
        colors: string[];
      }[]).filter((g) => typeof g.image_url === 'string');
      const weather = ((outfit as { weather_summary?: unknown }).weather_summary ?? {}) as {
        tempC?: number;
      };
      if (typeof weather.tempC === 'number') promptTemp = weather.tempC;
      if (typeof (outfit as { mood?: unknown }).mood === 'string') {
        promptMood = (outfit as { mood?: string }).mood as string;
      }
      if (typeof (outfit as { event_summary?: unknown }).event_summary === 'string') {
        promptDress = (outfit as { event_summary?: string }).event_summary as string;
      }
    } else if (
      Array.isArray(bodyItems) &&
      bodyItems.length > 0 &&
      bodyCtx !== null &&
      typeof bodyCtx === 'object'
    ) {
      garmentRefs = (bodyItems as unknown[]).filter(
        (g): g is { image_url: string; category: string; colors: string[] } =>
          Boolean(g) &&
          typeof (g as { image_url?: unknown }).image_url === 'string',
      );
      const c = bodyCtx as { tempC?: unknown; dress?: unknown; mood?: unknown; gender?: unknown };
      if (typeof c.tempC === 'number') promptTemp = c.tempC;
      if (typeof c.dress === 'string') promptDress = c.dress;
      if (typeof c.mood === 'string') promptMood = c.mood;
      if (typeof c.gender === 'string') promptGender = c.gender;
    } else {
      return json({ error: 'outfitId or items+ctx are required' }, 400);
    }

    const { data: preview, error: previewError } = await admin
      .rpc('consume_preview', { p_user: user.id })
      .single<{ allowed: boolean; used: number; daily_limit: number | null; tier: string }>();
    if (previewError || !preview) throw previewError ?? new Error('preview check failed');
    if (!preview.allowed) {
      return json(
        { capped: true, code: 'preview_limit', error: 'daily preview limit reached' },
        429,
      );
    }
    let previewRefunded = false;
    refundPreview = async () => {
      if (previewRefunded) return;
      previewRefunded = true;
      await admin.rpc('refund_preview', { p_user: user.id });
    };

    const { data: avatar } = await admin
      .from('avatars')
      .select('image_url')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: profile } = await admin
      .from('users')
      .select('gender')
      .eq('id', user.id)
      .maybeSingle();
    const profileGender = (profile as { gender?: unknown } | null)?.gender;
    if (typeof profileGender === 'string') promptGender = profileGender;

    const refs: { label: string; bytes: ArrayBuffer; mime: string }[] = [];
    const avatarUrl = (avatar as { image_url?: string } | null)?.image_url;
    if (avatarUrl) {
      const dl = await download(supabaseUrl, serviceKey, avatarUrl);
      if (dl) refs.push({ label: 'the person', ...dl });
    }
    for (const g of garmentRefs) {
      const dl = await download(supabaseUrl, serviceKey, g.image_url);
      if (dl) {
        refs.push({
          label: `${(g.colors ?? []).join(' and ') || ''} ${g.category}`.trim(),
          ...dl,
        });
      }
      if (refs.length >= 5) break;
    }
    if (refs.length === 0) {
      return json({ error: 'no reference photos available' }, 422);
    }

    const garmentList = refs
      .slice(1)
      .map((r) => r.label)
      .join(', ');
    const wearer =
      promptGender === 'female' || promptGender === 'male'
        ? ` Keep the person's ${promptGender === 'female' ? "woman's" : "man's"} features and fit the garments accordingly.`
        : '';
    const prompt =
      `Photorealistic full-body virtual try-on: dress the person from the first reference photo in ${garmentList || 'the attached garments'}` +
      `, ${promptMood} mood styling, ${promptDress} dress code` +
      `.${wearer} Keep the person's face, pose natural standing, entire body head to shoes in frame, clean neutral studio background, natural daylight.`;

    const parts: unknown[] = [{ text: prompt }];
    for (const ref of refs) {
      parts.push({
        inlineData: { mimeType: ref.mime, data: toBase64(ref.bytes) },
      });
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ engine: 'unavailable' }, 503);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), RENDER_TIMEOUT_MS);
    let imageB64: string | null = null;
    try {
      for (const model of IMAGE_MODELS) {
        try {
          const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': geminiKey,
              },
              body: JSON.stringify({
                contents: [{ parts }],
                generationConfig: { responseModalities: ['IMAGE'], temperature: 0.8 },
              }),
              signal: controller.signal,
            },
          );
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            console.error('[tryon-render] model error', model, res.status, detail.slice(0, 300));
            continue;
          }
          const data = await res.json();
          const returned = data.candidates?.[0]?.content?.parts ?? [];
          const img = (returned as { inlineData?: { data?: string } }[]).find(
            (p) => typeof p.inlineData?.data === 'string',
          );
          if (img?.inlineData?.data) {
            console.error('[tryon-render] rendered with', model);
            imageB64 = img.inlineData.data;
            break;
          }
          console.error('[tryon-render] no image bytes from', model);
        } catch (e) {
          if ((e as Error)?.name === 'AbortError') throw e;
          console.error('[tryon-render] transport error', model, e);
        }
      }
    } finally {
      clearTimeout(timeout);
    }
    if (!imageB64) {
      await refundPreview();
      return json({ error: 'render unavailable, try again' }, 502);
    }

    const binary = Uint8Array.from(atob(imageB64), (c) => c.charCodeAt(0));
    const path = `renders/${user.id}/${crypto.randomUUID()}.png`;
    const { error: uploadError } = await admin.storage
      .from('outfits')
      .upload(path, binary, { contentType: 'image/png', upsert: false });
    if (uploadError) throw uploadError;
    const { data: signed, error: signError } = await admin.storage
      .from('outfits')
      .createSignedUrl(path, 7 * 24 * 3600);
    if (signError || !signed) throw signError ?? new Error('sign failed');

    if (outfitRowId) {
      await admin
        .from('outfits')
        .update({ rendered_image_url: signed.signedUrl })
        .eq('id', outfitRowId)
        .eq('user_id', user.id);
    }

    return json({ renderUrl: signed.signedUrl, engine: 'gemini-tryon' });
  } catch (e) {
    console.error('[tryon-render]', e);
    await refundPreview().catch(() => {});
    return new Response(JSON.stringify({ error: 'something went wrong' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
