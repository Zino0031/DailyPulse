// App-side view of the wardrobe tag vocabulary. Values come from the shared
// module the `tag-item` edge function also validates against, so AI output,
// filters and the DB CHECK constraints can never drift apart.
import type { Formality, WardrobeCategory } from '@/types/database';
import {
  CATEGORIES,
  COLORS,
  FABRICS,
  FORMALITIES,
  PATTERNS,
  SEASONS,
  type Category,
  type ColorTag,
  type Fabric,
  type FormalityTag,
  type Pattern,
  type Season,
} from '@/supabase/functions/_shared/wardrobeTags';

export { CATEGORIES, COLORS, FABRICS, FORMALITIES, PATTERNS, SEASONS };
export type { Category, ColorTag, Fabric, FormalityTag, Pattern, Season };

// Compile-time guard: the shared vocabulary must match types/database.ts.
type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
const categoriesMatchDb: Same<Category, WardrobeCategory> = true;
const formalitiesMatchDb: Same<FormalityTag, Formality> = true;
void categoriesMatchDb;
void formalitiesMatchDb;

export const CATEGORY_LABEL: Record<Category, { one: string; many: string }> = {
  top: { one: 'Top', many: 'Tops' },
  bottom: { one: 'Bottom', many: 'Bottoms' },
  shoes: { one: 'Shoes', many: 'Shoes' },
  outerwear: { one: 'Outerwear', many: 'Outerwear' },
  accessory: { one: 'Accessory', many: 'Accessories' },
};

export const FORMALITY_LABEL: Record<FormalityTag, string> = {
  casual: 'Casual',
  business: 'Business',
  formal: 'Formal',
  athletic: 'Athletic',
};

/** One-line explanations surfaced as hints so nobody has to guess. */
export const FORMALITY_HINT: Record<FormalityTag, string> = {
  casual: 'Everyday, relaxed wear',
  business: 'Office and meetings',
  formal: 'Weddings, galas, black tie',
  athletic: 'Gym, sport and outdoors',
};

export const SEASON_LABEL: Record<Season, string> = {
  spring: 'Spring',
  summer: 'Summer',
  autumn: 'Autumn',
  winter: 'Winter',
};

export const FABRIC_LABEL: Record<Fabric, string> = {
  cotton: 'Cotton',
  denim: 'Denim',
  linen: 'Linen',
  wool: 'Wool',
  silk: 'Silk',
  polyester: 'Polyester',
  leather: 'Leather',
  knit: 'Knit',
};

export const PATTERN_LABEL: Record<Pattern, string> = {
  solid: 'Solid',
  striped: 'Striped',
  plaid: 'Plaid',
  floral: 'Floral',
  graphic: 'Graphic',
  'polka-dot': 'Polka dot',
  colorblock: 'Color block',
  distressed: 'Distressed',
};

export const COLOR_LABEL: Record<ColorTag, string> = {
  black: 'Black',
  white: 'White',
  gray: 'Gray',
  beige: 'Beige',
  brown: 'Brown',
  navy: 'Navy',
  blue: 'Blue',
  green: 'Green',
  red: 'Red',
  pink: 'Pink',
  purple: 'Purple',
  yellow: 'Yellow',
  orange: 'Orange',
  multicolor: 'Multicolor',
};

/**
 * Swatch fills. Raw hex is intentional: these depict garment colors, not UI
 * tokens, so they must not flip with the theme (DESIGN.md §2 covers UI only).
 * `null` = rendered as a rainbow ring (multicolor).
 */
export const COLOR_SWATCH: Record<ColorTag, string | null> = {
  black: '#111111',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  beige: '#E8D9B5',
  brown: '#8B5A2B',
  navy: '#1E2A4A',
  blue: '#3B82F6',
  green: '#22A05B',
  red: '#E53935',
  pink: '#F48FB1',
  purple: '#8E44AD',
  yellow: '#FACC15',
  orange: '#FB8C00',
  multicolor: null,
};

/** Light swatches need a hairline so they don't vanish on white cards. */
export const LIGHT_SWATCHES: readonly ColorTag[] = ['white', 'beige', 'yellow'];
