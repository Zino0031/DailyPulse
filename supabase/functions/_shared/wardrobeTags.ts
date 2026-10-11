// Wardrobe tag vocabulary + validator — single source of truth for the
// `tag-item` edge function (Deno) and the app (Epic 3 closet client).
// Keep this file dependency-free so both runtimes can import it.
// Mirrors the CHECK constraints in supabase/migrations.

export const CATEGORIES = [
  'top',
  'bottom',
  'shoes',
  'outerwear',
  'accessory',
] as const;

export const FORMALITIES = ['casual', 'business', 'formal', 'athletic'] as const;

export const SEASONS = ['spring', 'summer', 'autumn', 'winter'] as const;

/** Closed palette so AI output, filters and swatches always line up. */
export const COLORS = [
  'black',
  'white',
  'gray',
  'beige',
  'brown',
  'navy',
  'blue',
  'green',
  'red',
  'pink',
  'purple',
  'yellow',
  'orange',
  'multicolor',
] as const;

export const FABRICS = [
  'cotton',
  'denim',
  'linen',
  'wool',
  'silk',
  'polyester',
  'leather',
  'knit',
] as const;

export const PATTERNS = [
  'solid',
  'striped',
  'plaid',
  'floral',
  'graphic',
  'polka-dot',
  'colorblock',
  'distressed',
] as const;

export type Category = (typeof CATEGORIES)[number];
export type FormalityTag = (typeof FORMALITIES)[number];
export type Season = (typeof SEASONS)[number];
export type ColorTag = (typeof COLORS)[number];
export type Fabric = (typeof FABRICS)[number];
export type Pattern = (typeof PATTERNS)[number];

/**
 * Normalized 0–1000 face box for privacy cropping (top-left origin).
 * Null when no visible face — the photo is stored untouched.
 */
export interface FaceBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface TagSuggestion {
  category: Category;
  colors: ColorTag[];
  formality: FormalityTag;
  season: Season[];
  /** '' when the model can't tell — never a guess. */
  fabric: Fabric | '';
  pattern: Pattern | '';
  /** Face to crop for privacy; null = store the photo as-is. */
  face: FaceBox | null;
}

/** Upper bound so a chatty model can't flood the color chips. */
export const MAX_COLORS = 3;

function isMember<T extends string>(
  list: readonly T[],
  value: unknown,
): value is T {
  return typeof value === 'string' && (list as readonly string[]).includes(value);
}

function normalize(value: unknown): unknown {
  return typeof value === 'string' ? value.trim().toLowerCase() : value;
}

/** Keeps known values only, lower-cased and de-duplicated, in input order. */
function pickMany<T extends string>(list: readonly T[], value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  const out: T[] = [];
  for (const raw of value) {
    const item = normalize(raw);
    if (isMember(list, item) && !out.includes(item)) out.push(item);
  }
  return out;
}

function pickOptional<T extends string>(list: readonly T[], value: unknown): T | '' {
  const item = normalize(value);
  return isMember(list, item) ? item : '';
}

function pickFace(value: unknown): FaceBox | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  const raw = value as Record<string, unknown>;
  const num = (v: unknown): number | null =>
    typeof v === 'number' && Number.isFinite(v)
      ? Math.max(0, Math.min(1000, v))
      : null;
  const x = num(raw.x);
  const y = num(raw.y);
  const w = num(raw.w);
  const h = num(raw.h);
  if (x === null || y === null || w === null || h === null || w <= 0 || h <= 0) {
    return null;
  }
  return { x, y, w, h };
}

/**
 * Strictly validates a model response (issue #9: "Invalid JSON safely
 * rejected"). Returns `null` — caller logs + rejects — when the input isn't
 * a JSON object or the required single-value fields (category, formality)
 * are missing or outside the vocabulary. Those are never replaced with a
 * guessed default: a wrong suggestion shown as "AI suggested" is worse than
 * none. Unknown array entries and unknown fabric/pattern are dropped, since
 * the user reviews every tag before saving.
 */
export function parseTagSuggestion(input: unknown): TagSuggestion | null {
  if (typeof input === 'string') {
    try {
      return parseTagSuggestion(JSON.parse(input));
    } catch {
      return null;
    }
  }
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const category = normalize(raw.category);
  const formality = normalize(raw.formality);
  if (!isMember(CATEGORIES, category) || !isMember(FORMALITIES, formality)) {
    return null;
  }
  return {
    category,
    formality,
    colors: pickMany(COLORS, raw.colors).slice(0, MAX_COLORS),
    season: pickMany(SEASONS, raw.season ?? raw.seasons),
    fabric: pickOptional(FABRICS, raw.fabric),
    pattern: pickOptional(PATTERNS, raw.pattern),
    face: pickFace(raw.face ?? raw.faceBox),
  };
}

/**
 * Storage-path ownership: first segment is the user's id and no segment is
 * empty or a traversal (`me/../them/x.jpg`, `me//x.jpg`). Defense in depth on
 * top of storage RLS.
 */
export function isOwnPath(path: string, userId: string): boolean {
  const segments = path.split('/');
  return (
    userId.length > 0 &&
    segments[0] === userId &&
    segments.length > 1 &&
    segments.every((s) => s !== '' && s !== '.' && s !== '..')
  );
}
