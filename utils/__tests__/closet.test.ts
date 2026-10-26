import type { ClosetItem } from '@/services/closet';
import {
  EMPTY_TAGS,
  countByCategory,
  describeItem,
  filterItems,
  patchItem,
  prependItem,
  removeItem,
  replaceItem,
  tagsEqual,
  toEditableTags,
  toggleIn,
} from '@/utils/closet';

function makeItem(overrides: Partial<ClosetItem> = {}): ClosetItem {
  return {
    id: 'a',
    user_id: 'u1',
    image_url: 'u1/a.jpg',
    imageUri: 'https://cdn/a.jpg',
    category: 'top',
    colors: ['navy'],
    formality: 'business',
    season: ['spring'],
    fabric: 'cotton',
    pattern: 'solid',
    created_at: '2026-10-01T10:00:00.000Z',
    ...overrides,
  };
}

const top = makeItem({ id: 'top' });
const shoes = makeItem({ id: 'shoes', category: 'shoes' });
const coat = makeItem({ id: 'coat', category: 'outerwear' });

describe('filterItems / countByCategory', () => {
  it('returns a copy of everything for "all"', () => {
    const list = [top, shoes];
    const result = filterItems(list, 'all');
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });

  it('filters by category', () => {
    expect(filterItems([top, shoes, coat], 'shoes')).toEqual([shoes]);
  });

  it('counts every category, including empty ones', () => {
    expect(countByCategory([top, shoes, makeItem({ id: 't2' })])).toEqual({
      all: 3,
      top: 2,
      bottom: 0,
      shoes: 1,
      outerwear: 0,
      accessory: 0,
    });
  });
});

describe('cache helpers', () => {
  it('prependItem puts the item first and de-duplicates by id', () => {
    const updated = makeItem({ id: 'shoes', category: 'shoes', colors: ['red'] });
    expect(prependItem([top, shoes], updated).map((i) => i.id)).toEqual(['shoes', 'top']);
    expect(prependItem(undefined, top)).toEqual([top]);
  });

  it('replaceItem swaps a temp item for the server row in place', () => {
    const temp = makeItem({ id: 'temp-1', pending: true });
    const row = makeItem({ id: 'real-1' });
    expect(replaceItem([coat, temp, top], 'temp-1', row).map((i) => i.id)).toEqual([
      'coat',
      'real-1',
      'top',
    ]);
  });

  it('patchItem merges fields into one item only', () => {
    const result = patchItem([top, shoes], 'top', { formality: 'casual', pending: true });
    expect(result[0]).toMatchObject({ id: 'top', formality: 'casual', pending: true });
    expect(result[1]).toBe(shoes);
  });

  it('removeItem tolerates an empty cache', () => {
    expect(removeItem([top, shoes], 'top')).toEqual([shoes]);
    expect(removeItem(undefined, 'top')).toEqual([]);
  });
});

describe('tag editing', () => {
  it('toEditableTags drops values outside the vocabulary (legacy rows)', () => {
    expect(
      toEditableTags(makeItem({ colors: ['navy', 'teal'], season: ['winter', 'rainy'] })),
    ).toEqual({
      category: 'top',
      formality: 'business',
      colors: ['navy'],
      season: ['winter'],
      fabric: 'cotton',
      pattern: 'solid',
    });
  });

  it('toEditableTags treats unknown or missing fabric/pattern as unset', () => {
    expect(toEditableTags(makeItem({ fabric: 'velvet', pattern: '' }))).toMatchObject({
      fabric: '',
      pattern: '',
    });
    // Rows read before the item_details migration lack the columns entirely.
    const legacy = { ...makeItem(), fabric: undefined, pattern: undefined } as unknown as ClosetItem;
    expect(toEditableTags(legacy)).toMatchObject({ fabric: '', pattern: '' });
  });

  it('tagsEqual notices fabric and pattern changes', () => {
    const base = toEditableTags(top);
    expect(tagsEqual(base, { ...base, fabric: 'denim' })).toBe(false);
    expect(tagsEqual(base, { ...base, pattern: '' })).toBe(false);
  });

  it('tagsEqual ignores order in multi-select fields', () => {
    const a = { ...EMPTY_TAGS, category: 'top' as const, season: ['spring', 'winter'] as const };
    expect(tagsEqual({ ...a, season: ['spring', 'winter'] }, { ...a, season: ['winter', 'spring'] })).toBe(
      true,
    );
    expect(tagsEqual({ ...a, season: ['spring'] }, { ...a, season: ['spring', 'winter'] })).toBe(false);
    expect(tagsEqual(EMPTY_TAGS, { ...EMPTY_TAGS, category: 'shoes' })).toBe(false);
  });

  it('toggleIn keeps insertion order without an order list (dominant color first)', () => {
    expect(toggleIn(['red'], 'black')).toEqual(['red', 'black']);
    expect(toggleIn(['red', 'black'], 'red')).toEqual(['black']);
  });

  it('toggleIn follows the given order (seasons stay chronological)', () => {
    const order = ['spring', 'summer', 'autumn', 'winter'] as const;
    expect(toggleIn(['winter'], 'spring', order)).toEqual(['spring', 'winter']);
  });

  it('describeItem builds a readable label', () => {
    expect(describeItem(top)).toBe('Navy top, business');
    expect(describeItem(makeItem({ colors: [], category: 'accessory', formality: 'formal' }))).toBe(
      'Accessory, formal',
    );
  });
});
