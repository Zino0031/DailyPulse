// Pure closet helpers — no React, no I/O — so cache math and filtering are
// unit-tested in isolation (utils/__tests__/closet.test.ts).
import {
  CATEGORIES,
  CATEGORY_LABEL,
  COLOR_LABEL,
  COLORS,
  FABRICS,
  FORMALITY_LABEL,
  PATTERNS,
  SEASONS,
  type Category,
  type ColorTag,
  type Fabric,
  type FormalityTag,
  type Pattern,
  type Season,
} from '@/constants/wardrobe';
import type { ClosetItem } from '@/services/closet';

export type CategoryFilter = Category | 'all';

export interface EditableTags {
  category: Category | null;
  colors: ColorTag[];
  formality: FormalityTag;
  season: Season[];
  /** '' = not set (optional fields). */
  fabric: Fabric | '';
  pattern: Pattern | '';
}

export const EMPTY_TAGS: EditableTags = {
  category: null,
  colors: [],
  formality: 'casual',
  season: [],
  fabric: '',
  pattern: '',
};

function oneOf<T extends string>(list: readonly T[], value: string): T | '' {
  return (list as readonly string[]).includes(value) ? (value as T) : '';
}

export function filterItems<T extends Pick<ClosetItem, 'category'>>(
  items: readonly T[],
  filter: CategoryFilter,
): T[] {
  return filter === 'all' ? [...items] : items.filter((i) => i.category === filter);
}

export function countByCategory(
  items: readonly Pick<ClosetItem, 'category'>[],
): Record<CategoryFilter, number> {
  const counts = { all: items.length } as Record<CategoryFilter, number>;
  for (const category of CATEGORIES) counts[category] = 0;
  for (const item of items) counts[item.category] += 1;
  return counts;
}

export function prependItem(list: readonly ClosetItem[] | undefined, item: ClosetItem): ClosetItem[] {
  return [item, ...(list ?? []).filter((i) => i.id !== item.id)];
}

export function replaceItem(
  list: readonly ClosetItem[] | undefined,
  id: string,
  next: ClosetItem,
): ClosetItem[] {
  return (list ?? []).map((i) => (i.id === id ? next : i));
}

export function patchItem(
  list: readonly ClosetItem[] | undefined,
  id: string,
  patch: Partial<ClosetItem>,
): ClosetItem[] {
  return (list ?? []).map((i) => (i.id === id ? { ...i, ...patch } : i));
}

export function removeItem(list: readonly ClosetItem[] | undefined, id: string): ClosetItem[] {
  return (list ?? []).filter((i) => i.id !== id);
}

/** Narrows DB strings to the known vocabulary for the tag editor. */
export function toEditableTags(
  item: Pick<ClosetItem, 'category' | 'colors' | 'formality' | 'season' | 'fabric' | 'pattern'>,
): EditableTags {
  return {
    category: item.category,
    formality: item.formality,
    fabric: oneOf(FABRICS, item.fabric ?? ''),
    pattern: oneOf(PATTERNS, item.pattern ?? ''),
    colors: item.colors.filter((c): c is ColorTag => (COLORS as readonly string[]).includes(c)),
    season: item.season.filter((s): s is Season => (SEASONS as readonly string[]).includes(s)),
  };
}

function sameSet<T>(a: readonly T[], b: readonly T[]): boolean {
  return a.length === b.length && a.every((v) => b.includes(v));
}

export function tagsEqual(a: EditableTags, b: EditableTags): boolean {
  return (
    a.category === b.category &&
    a.formality === b.formality &&
    a.fabric === b.fabric &&
    a.pattern === b.pattern &&
    sameSet(a.colors, b.colors) &&
    sameSet(a.season, b.season)
  );
}

/**
 * Toggles a value in a list. With `order`, the result follows that order
 * (seasons); without it, insertion order is kept (colors: dominant first).
 */
export function toggleIn<T extends string>(
  list: readonly T[],
  value: T,
  order?: readonly T[],
): T[] {
  const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  return order ? order.filter((v) => next.includes(v)) : next;
}

/** "Navy top, business" — screen-reader label for a grid tile. */
export function describeItem(
  item: Pick<ClosetItem, 'category' | 'colors' | 'formality'>,
): string {
  const [color] = toEditableTags({ ...item, season: [], fabric: '', pattern: '' }).colors;
  const noun = CATEGORY_LABEL[item.category].one;
  const head = color ? `${COLOR_LABEL[color]} ${noun.toLowerCase()}` : noun;
  return `${head}, ${FORMALITY_LABEL[item.formality].toLowerCase()}`;
}
