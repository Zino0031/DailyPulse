import type { WardrobeItemRow } from '@/types/database';
import type { Mood } from '@/store/useUserPreferencesStore';
import type { DressCode } from '@/services/calendar';

export interface OutfitContext {
  tempC: number;
  rainPct: number;
  dress: DressCode;
  mood: Mood;
  /** Wearer pronouns for cuts/fits; prefer_not_to_say = ungendered. */
  gender: string;
}

export interface OutfitBoard {
  key: string;
  top: WardrobeItemRow;
  bottom: WardrobeItemRow;
  shoes: WardrobeItemRow;
  outerwear: WardrobeItemRow | null;
  accessory: WardrobeItemRow | null;
  score: number;
  reasons: string[];
  /** Which engine styled it — shown as a badge for honesty. */
  source: 'local' | 'ai';
  /** `outfits` row the AI pick already created (saving flips is_saved). */
  outfitId?: string;
}

// Formality compatibility: exact match scores highest.
const DRESS_FORMALITY: Record<DressCode, string[]> = {
  formal: ['formal', 'business'],
  business: ['business', 'formal', 'casual'],
  romantic: ['formal', 'business', 'casual'],
  casual: ['casual', 'athletic', 'business'],
  athletic: ['athletic', 'casual'],
};

const MOOD_HUES: Record<Mood, string[]> = {
  neutral: [],
  energetic: ['red', 'orange', 'yellow', 'pink', 'coral'],
  professional: ['black', 'white', 'grey', 'gray', 'navy', 'blue'],
  relaxed: ['green', 'beige', 'brown', 'white', 'olive', 'cream'],
  creative: ['purple', 'pink', 'magenta', 'teal', 'violet'],
};

function seasonForTemp(tempC: number): string {
  if (tempC >= 25) return 'summer';
  if (tempC >= 15) return 'spring';
  if (tempC >= 8) return 'autumn';
  return 'winter';
}

function colorHit(item: WardrobeItemRow, hues: string[]): boolean {
  if (hues.length === 0) return false;
  return item.colors.some((c) =>
    hues.some((h) => c.toLowerCase().includes(h)),
  );
}

function scoreItem(
  item: WardrobeItemRow,
  ctx: OutfitContext,
  season: string,
  slot: 'core' | 'outerwear',
): { score: number; notes: string[] } {
  let score = 10;
  const notes: string[] = [];
  const wanted = DRESS_FORMALITY[ctx.dress];
  if (wanted[0] === item.formality) {
    score += 6;
    notes.push(`matches the ${ctx.dress} dress code`);
  } else if (wanted.includes(item.formality)) {
    score += 2;
  } else {
    score -= 3;
  }
  if (item.season.length > 0) {
    if (item.season.some((s) => s.toLowerCase().includes(season))) {
      score += 3;
      notes.push(`fits ${season} weather`);
    } else {
      score -= slot === 'outerwear' ? 1 : 4;
    }
  }
  if (slot === 'core' && colorHit(item, MOOD_HUES[ctx.mood])) {
    score += 2;
    notes.push(`echoes your ${ctx.mood} mood`);
  }
  return { score, notes };
}

function pickBest(
  pool: WardrobeItemRow[],
  ctx: OutfitContext,
  season: string,
  slot: 'core' | 'outerwear',
  exclude: Set<string>,
  offset: number,
): WardrobeItemRow | null {
  const ranked = pool
    .filter((item) => !exclude.has(item.id))
    .map((item) => ({ item, ...scoreItem(item, ctx, season, slot) }))
    .sort((a, b) => b.score - a.score);
  if (ranked.length === 0) return null;
  return ranked[offset % ranked.length].item;
}

function buildBoard(
  items: WardrobeItemRow[],
  ctx: OutfitContext,
  seed: number,
): OutfitBoard | null {
  const season = seasonForTemp(ctx.tempC);
  const byCat = (cat: string) =>
    items.filter((i) => i.category === cat);
  const used = new Set<string>();
  const reasons: string[] = [];
  let score = 0;

  const take = (
    cat: string,
    slot: 'core' | 'outerwear',
    offset: number,
  ): WardrobeItemRow | null => {
    const item = pickBest(byCat(cat), ctx, season, slot, used, offset);
    if (!item) return null;
    used.add(item.id);
    return item;
  };

  const top = take('top', 'core', seed);
  const bottom = take('bottom', 'core', seed);
  const shoes = take('shoes', 'core', seed);
  if (!top || !bottom || !shoes) return null;

  for (const item of [top, bottom, shoes]) {
    const s = scoreItem(item, ctx, season, 'core');
    score += s.score;
    reasons.push(...s.notes);
  }

  let outerwear: WardrobeItemRow | null = null;
  if (ctx.tempC < 18 || ctx.rainPct > 40) {
    outerwear = take('outerwear', 'outerwear', seed);
    if (outerwear) {
      score += 4;
      reasons.push(
        ctx.rainPct > 40 ? 'layered against the rain' : 'layered for the chill',
      );
    }
  }
  const accessory = take('accessory', 'core', seed + 1);

  reasons.unshift(
    `${Math.round(ctx.tempC)}° and ${ctx.dress} dress code`,
  );
  return {
    key: `${top.id}-${bottom.id}-${shoes.id}-${seed}`,
    top,
    bottom,
    shoes,
    outerwear,
    accessory,
    score,
    reasons: [...new Set(reasons)].slice(0, 4),
    source: 'local',
  };
}

/**
 * Free on-device composer: 1 hero + 2 alternates with distinct heroes.
 * The generate-outfit edge function (#14) will replace this behind the
 * same board shape when it lands — callers don't change.
 */
export function composeOutfits(
  items: WardrobeItemRow[],
  ctx: OutfitContext,
  offset = 0,
): OutfitBoard[] {
  const boards: OutfitBoard[] = [];
  for (
    let seed = offset;
    seed < offset + items.length + 2 && boards.length < 3;
    seed++
  ) {
    const board = buildBoard(items, ctx, seed);
    if (
      board &&
      !boards.some((b) => b.top.id === board.top.id)
    ) {
      boards.push(board);
    }
  }
  return boards;
}
