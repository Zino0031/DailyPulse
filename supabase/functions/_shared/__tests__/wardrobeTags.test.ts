import { MAX_COLORS, isOwnPath, parseTagSuggestion } from '../wardrobeTags';

describe('parseTagSuggestion', () => {
  const valid = {
    category: 'top',
    colors: ['navy', 'white'],
    formality: 'business',
    season: ['spring', 'autumn'],
    fabric: 'cotton',
    pattern: 'striped',
    face: null,
  };

  it('accepts a well-formed object', () => {
    expect(parseTagSuggestion(valid)).toEqual(valid);
  });

  it('accepts the raw JSON string the model returns', () => {
    expect(parseTagSuggestion(JSON.stringify(valid))).toEqual(valid);
  });

  it('normalizes case and whitespace instead of rejecting', () => {
    expect(
      parseTagSuggestion({
        category: ' Shoes ',
        colors: ['BLACK'],
        formality: 'Casual',
        season: ['Winter'],
      }),
    ).toEqual({
      category: 'shoes',
      colors: ['black'],
      formality: 'casual',
      season: ['winter'],
      fabric: '',
      pattern: '',
      face: null,
    });
  });

  it.each([
    ['malformed JSON', '{"category": "top",'],
    ['a JSON array', '[]'],
    ['null', null],
    ['a number', 42],
    ['an unknown category', { ...valid, category: 'hat' }],
    ['a missing category', { ...valid, category: undefined }],
    ['an unknown formality', { ...valid, formality: 'smart-casual' }],
    ['a non-string category', { ...valid, category: ['top'] }],
  ])('rejects %s', (_label, input) => {
    expect(parseTagSuggestion(input)).toBeNull();
  });

  it('drops unknown, duplicate and non-string array entries but keeps order', () => {
    expect(
      parseTagSuggestion({
        ...valid,
        colors: ['red', 'teal', 'red', 7, 'black'],
        season: ['summer', 'monsoon', 'summer'],
      }),
    ).toMatchObject({ colors: ['red', 'black'], season: ['summer'] });
  });

  it(`caps colors at ${MAX_COLORS}, keeping the most dominant first`, () => {
    const result = parseTagSuggestion({
      ...valid,
      colors: ['black', 'white', 'gray', 'red', 'blue'],
    });
    expect(result?.colors).toEqual(['black', 'white', 'gray']);
  });

  it('treats non-array colors/season as empty rather than failing', () => {
    expect(parseTagSuggestion({ ...valid, colors: 'navy', season: null })).toMatchObject({
      colors: [],
      season: [],
    });
  });

  it('never guesses fabric or pattern: unknown or missing becomes ""', () => {
    expect(parseTagSuggestion({ ...valid, fabric: 'velvet', pattern: undefined })).toMatchObject({
      fabric: '',
      pattern: '',
    });
    expect(parseTagSuggestion({ ...valid, fabric: ' Denim ', pattern: 'POLKA-DOT' })).toMatchObject({
      fabric: 'denim',
      pattern: 'polka-dot',
    });
  });

  it('accepts the legacy "seasons" key the old prompt produced', () => {
    expect(parseTagSuggestion({ ...valid, season: undefined, seasons: ['summer'] })?.season).toEqual([
      'summer',
    ]);
  });

  it('never stores placeholder colors like "unknown"', () => {
    expect(parseTagSuggestion({ ...valid, colors: ['unknown'] })?.colors).toEqual([]);
  });

  describe('face', () => {
    it('accepts a valid normalized box', () => {
      expect(
        parseTagSuggestion({ ...valid, face: { x: 100, y: 50, w: 200, h: 250 } })?.face,
      ).toEqual({ x: 100, y: 50, w: 200, h: 250 });
    });

    it.each([
      ['missing', undefined],
      ['null', null],
      ['a string', 'no face'],
      ['zero width', { x: 1, y: 1, w: 0, h: 5 }],
      ['NaN', { x: NaN, y: 1, w: 2, h: 3 }],
      ['an array', [1, 2, 3, 4]],
    ])('returns null for %s', (_label, face) => {
      expect(parseTagSuggestion({ ...valid, face })?.face).toBeNull();
    });

    it('clamps out-of-range coordinates', () => {
      expect(
        parseTagSuggestion({ ...valid, face: { x: -5, y: 10, w: 2000, h: 50 } })?.face,
      ).toEqual({ x: 0, y: 10, w: 1000, h: 50 });
    });
  });
});

describe('isOwnPath', () => {
  const me = '8f0c2b1e-aaaa-bbbb-cccc-1234567890ab';

  it.each([`${me}/x.jpg`, `${me}/tmp/x.jpg`])('allows %s', (path) => {
    expect(isOwnPath(path, me)).toBe(true);
  });

  it.each([
    ['another user', 'someone-else/x.jpg'],
    ['a prefix collision', `${me}-evil/x.jpg`],
    ['parent traversal', `${me}/../someone-else/x.jpg`],
    ['current-dir segment', `${me}/./x.jpg`],
    ['empty segment', `${me}//x.jpg`],
    ['trailing slash', `${me}/`],
    ['the bare folder', me],
    ['a leading slash', `/${me}/x.jpg`],
  ])('rejects %s', (_label, path) => {
    expect(isOwnPath(path, me)).toBe(false);
  });

  it('rejects everything for an empty user id', () => {
    expect(isOwnPath('/x.jpg', '')).toBe(false);
  });
});
