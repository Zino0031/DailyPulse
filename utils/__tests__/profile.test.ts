import {
  EMPTY_DRAFT,
  formatLocation,
  hasErrors,
  toggleStyle,
  validateProfile,
  type ProfileDraft,
} from '@/utils/profile';

const valid: ProfileDraft = {
  fullName: 'Sam Rivera',
  gender: 'nonbinary',
  location: { latitude: 35.7, longitude: -0.63, label: 'Oran, Algeria' },
  styles: ['casual', 'minimal'],
};

describe('validateProfile', () => {
  it('accepts a complete profile', () => {
    expect(validateProfile(valid)).toEqual({});
  });

  it('flags every missing field on an empty draft', () => {
    const errors = validateProfile(EMPTY_DRAFT);
    expect(Object.keys(errors).sort()).toEqual(['fullName', 'location', 'styles']);
    expect(hasErrors(errors)).toBe(true);
  });

  it('treats a whitespace-only name as missing', () => {
    expect(validateProfile({ ...valid, fullName: '   ' }).fullName).toBeDefined();
  });

  it('rejects names over the limit', () => {
    expect(validateProfile({ ...valid, fullName: 'x'.repeat(81) }).fullName).toMatch(/under 80/);
  });

  it('rejects out-of-range or non-finite coordinates', () => {
    for (const location of [
      { latitude: 91, longitude: 0, label: null },
      { latitude: 0, longitude: -181, label: null },
      { latitude: Number.NaN, longitude: 0, label: null },
    ]) {
      expect(validateProfile({ ...valid, location }).location).toBeDefined();
    }
  });

  it('rejects genders and styles outside the catalogue', () => {
    const bad = { ...valid, gender: 'other', styles: ['goth'] } as unknown as ProfileDraft;
    const errors = validateProfile(bad);
    expect(errors.gender).toBeDefined();
    expect(errors.styles).toBeDefined();
  });
});

describe('toggleStyle', () => {
  it('adds and removes while keeping catalogue order', () => {
    expect(toggleStyle(['streetwear'], 'casual')).toEqual(['casual', 'streetwear']);
    expect(toggleStyle(['casual', 'streetwear'], 'casual')).toEqual(['streetwear']);
  });
});

describe('formatLocation', () => {
  it('prefers the place label, else rounded coordinates', () => {
    expect(formatLocation(valid.location!)).toBe('Oran, Algeria');
    expect(formatLocation({ latitude: 35.6971, longitude: -0.6308, label: null })).toBe(
      '35.70, -0.63',
    );
  });
});
