import { saveProfile, searchPlaces, skipOnboarding } from '@/services/profile';
import { getSupabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({ getSupabase: jest.fn() }));

const upsert = jest.fn();
(getSupabase as jest.Mock).mockReturnValue({ from: () => ({ upsert }) });

const fetchMock = jest.fn();
globalThis.fetch = fetchMock as unknown as typeof fetch;

beforeEach(() => {
  upsert.mockReset().mockResolvedValue({ error: null });
  fetchMock.mockReset();
});

const draft = {
  fullName: '  Sam Rivera ',
  gender: 'female' as const,
  location: { latitude: 35.7, longitude: -0.63, label: 'Oran, Algeria' },
  styles: ['casual' as const],
};

describe('saveProfile', () => {
  it('upserts the trimmed row and stamps onboarded_at when completing', async () => {
    await saveProfile('u1', 'sam@example.com', draft, { completeOnboarding: true });
    const row = upsert.mock.calls[0][0];
    expect(row).toMatchObject({
      id: 'u1',
      email: 'sam@example.com',
      full_name: 'Sam Rivera',
      gender: 'female',
      location_lat: 35.7,
      location_lon: -0.63,
      location_name: 'Oran, Algeria',
      style_prefs: ['casual'],
    });
    expect(typeof row.onboarded_at).toBe('string');
  });

  it('leaves onboarded_at untouched on later edits', async () => {
    await saveProfile('u1', null, draft, { completeOnboarding: false });
    expect(upsert.mock.calls[0][0]).not.toHaveProperty('onboarded_at');
  });

  it('throws the Supabase error', async () => {
    upsert.mockResolvedValue({ error: new Error('boom') });
    await expect(saveProfile('u1', null, draft, { completeOnboarding: true })).rejects.toThrow(
      'boom',
    );
  });
});

describe('skipOnboarding', () => {
  it('only stamps onboarded_at', async () => {
    await skipOnboarding('u1', null);
    expect(Object.keys(upsert.mock.calls[0][0]).sort()).toEqual(['email', 'id', 'onboarded_at']);
  });
});

describe('searchPlaces', () => {
  it('skips the network for short queries', async () => {
    expect(await searchPlaces(' o ')).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps Open-Meteo results and dedupes repeated name parts', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 1, name: 'Oran', admin1: 'Oran', country: 'Algeria', latitude: 35.69, longitude: -0.64 },
        ],
      }),
    });
    const [place] = await searchPlaces('Oran');
    expect(fetchMock.mock.calls[0][0]).toContain('geocoding-api.open-meteo.com/v1/search?name=Oran');
    expect(place).toEqual({
      id: 1,
      latitude: 35.69,
      longitude: -0.64,
      label: 'Oran, Algeria',
      shortLabel: 'Oran, Algeria',
    });
  });

  it('returns an empty list when nothing matches', async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    expect(await searchPlaces('Zzzz')).toEqual([]);
  });

  it('throws a human message on HTTP errors', async () => {
    fetchMock.mockResolvedValue({ ok: false });
    await expect(searchPlaces('Oran')).rejects.toThrow("Couldn't search places right now.");
  });
});
