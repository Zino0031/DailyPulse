// tag-item — Epic 3 vision auto-tagging (#9).
// POST { imagePath } (private `wardrobe` bucket path, e.g. userId/tmp/x.jpg)
//   200 -> { category, colors, formality, season, fabric, pattern }
//   4xx/5xx -> { error } — a short, human-readable message
//
// Gemini Flash (free tier, same key as the picker — no new secret):
//   supabase secrets set GEMINI_API_KEY=<key>
//   supabase secrets set GEMINI_MODEL=<model>   # optional override
// Deploy: supabase functions deploy tag-item
//
// Strict-JSON contract: the model is constrained by a response schema, and
// output with a missing/unknown category or formality is rejected (422) and
// logged — never replaced by a guessed default. The client then lets the
// user tag manually.

import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  CATEGORIES,
  COLORS,
  FABRICS,
  FORMALITIES,
  MAX_COLORS,
  PATTERNS,
  SEASONS,
  isOwnPath,
  parseTagSuggestion,
} from '../_shared/wardrobeTags.ts';

const DEFAULT_MODEL = 'gemini-3.5-flash';
// Lite first when available (fast, generous free quota), full model as the
// fallback. Unknown IDs 404 out harmlessly via the 4xx break below.
const TAG_MODELS = ['gemini-3.5-flash', DEFAULT_MODEL];
const TAG_ATTEMPT_MS = 25_000;
const TAG_MAX_TRIES = 2;
// PRD NFR: tagging < 3s p95. Two budgeted attempts keep the worst case near
// the client timeout; the client falls back to manual tagging on 504.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TAG_PROMPT = `Describe the single clothing item in this photo for a wardrobe app.
- category: the garment type.
- colors: up to ${MAX_COLORS} dominant colors, most dominant first. Use "multicolor" only for busy prints.
- formality: base it on cut and fabric (t-shirt/jeans/sneakers = casual; shirt/trousers/loafers = business; suit/gown = formal; leggings/jersey = athletic).
- season: every season the item is comfortable in.
- fabric: best guess from look and drape; omit if unsure.
- pattern: the dominant surface pattern; omit if unsure.
- face: if a person's face is visible, its bounding box as 0-1000 normalized {x, y, w, h} (top-left origin); omit entirely when no face is visible.`;

// Structured output: Gemini can only answer with these enums.
const RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    category: { type: 'STRING', enum: [...CATEGORIES] },
    colors: {
      type: 'ARRAY',
      items: { type: 'STRING', enum: [...COLORS] },
      maxItems: MAX_COLORS,
    },
    formality: { type: 'STRING', enum: [...FORMALITIES] },
    season: { type: 'ARRAY', items: { type: 'STRING', enum: [...SEASONS] } },
    fabric: { type: 'STRING', enum: [...FABRICS] },
    pattern: { type: 'STRING', enum: [...PATTERNS] },
    face: {
      type: 'OBJECT',
      properties: {
        x: { type: 'NUMBER' },
        y: { type: 'NUMBER' },
        w: { type: 'NUMBER' },
        h: { type: 'NUMBER' },
      },
    },
  },
  // fabric/pattern optional: omitted when unsure, returned to clients as ''.
  required: ['category', 'colors', 'formality', 'season'],
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Logs every rejection with its status so failures are traceable. */
const fail = (status: number, error: string, detail?: unknown) => {
  console.error('[tag-item]', status, error, detail ?? '');
  return json({ error }, status);
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') return fail(405, 'use POST');

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    // User-scoped client only: storage RLS (owner-only on `wardrobe`) is
    // enforced on the download, so no service-role key is needed here.
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await userClient.auth.getUser();
    const user = userData.user;
    if (!user) return fail(401, 'sign in required');

    let imagePath: unknown;
    try {
      ({ imagePath } = (await req.json()) as { imagePath?: unknown });
    } catch {
      return fail(400, 'request body must be JSON');
    }
    if (typeof imagePath !== 'string' || imagePath.length === 0) {
      return fail(400, 'imagePath is required');
    }
    // Users may only tag their own uploads.
    if (!isOwnPath(imagePath, user.id)) {
      return fail(403, 'not your photo', imagePath);
    }

    const { data: blob, error: dlError } = await userClient.storage
      .from('wardrobe')
      .download(imagePath);
    if (dlError || !blob) return fail(404, 'photo not found', dlError?.message);
    const bytes = await blob.arrayBuffer();
    if (bytes.byteLength === 0) return fail(422, 'empty photo');
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return fail(413, 'photo too large (4MB max)', bytes.byteLength);
    }

    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return fail(503, 'tagging unavailable, fill in manually', 'GEMINI_API_KEY not set');

    const bin = new Uint8Array(bytes);
    // Single btoa at the end: per-chunk encoding would break 3-byte
    // alignment and corrupt the payload (seen live as raw JFIF bytes).
    let binary = '';
    const CHUNK = 0x8000;
    for (let i = 0; i < bin.length; i += CHUNK) {
      binary += String.fromCharCode(...bin.subarray(i, i + CHUNK));
    }
    const b64 = btoa(binary);

    const override = Deno.env.get('GEMINI_MODEL');
    const models = override ? [override] : TAG_MODELS;
    const started = Date.now();
    let res: Response | null = null;
    let lastError = '';
    let usedModel = models[0];
      for (const model of models) {
      for (let attemptNo = 1; attemptNo <= TAG_MAX_TRIES; attemptNo++) {
        try {
          const attempt = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
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
                generationConfig: {
                  responseMimeType: 'application/json',
                  responseSchema: RESPONSE_SCHEMA,
                  temperature: 0.2,
                },
              }),
              signal: AbortSignal.timeout(TAG_ATTEMPT_MS),
            },
          );
          if (!attempt.ok) {
            const detail = await attempt.text().catch(() => '');
            console.error('[tag-item] model error', model, attempt.status, detail.slice(0, 200));
            lastError = `${model} ${attempt.status}`;
            // 4xx (except 429) won't heal on retry — stop, don't burn quota.
            if (attempt.status !== 429 && attempt.status < 500) break;
            continue;
          }
          res = attempt;
          usedModel = model;
          break;
        } catch (e) {
          const timedOut = e instanceof DOMException && e.name === 'TimeoutError';
          console.error('[tag-item] model timeout', model);
          lastError = `${model} >${TAG_ATTEMPT_MS}ms`;
          if (!timedOut) {
            return fail(502, 'tagging unavailable, fill in manually', String(e));
          }
        }
      }
    }
    if (!res) {
      const timedOut = lastError.includes('>');
      return timedOut
        ? fail(504, 'tagging took too long, fill in manually', lastError)
        : fail(502, 'tagging unavailable, fill in manually', lastError);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return res.status === 429
        ? fail(429, 'tagging is busy, try again in a minute', detail.slice(0, 300))
        : fail(502, 'tagging unavailable, fill in manually', `${res.status} ${detail.slice(0, 300)}`);
    }

    const data = await res.json().catch(() => null);
    const text: unknown = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    const tags = parseTagSuggestion(text);
    if (!tags) {
      return fail(422, 'tagging unclear, fill in manually', String(text).slice(0, 300));
    }
    console.log('[tag-item] ok', JSON.stringify({ model: usedModel, ms: Date.now() - started }));
    return json(tags);
  } catch (e) {
    return fail(500, 'something went wrong', e instanceof Error ? e.message : String(e));
  }
});
