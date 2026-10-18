import { resolveRenderUrls } from '@/services/renders';

const mockCreateSignedUrls = jest.fn();
jest.mock('@/services/supabase', () => ({
  getSupabase: () => ({
    storage: { from: () => ({ createSignedUrls: mockCreateSignedUrls }) },
  }),
}));

beforeEach(() => jest.clearAllMocks());

it('passes legacy remote URLs through untouched', async () => {
  const urls = await resolveRenderUrls(['https://cdn/legacy.png']);
  expect(urls.get('https://cdn/legacy.png')).toBe('https://cdn/legacy.png');
  expect(mockCreateSignedUrls).not.toHaveBeenCalled();
});

it('signs storage paths in one batch', async () => {
  mockCreateSignedUrls.mockResolvedValue({
    data: [
      { path: 'renders/u1/a.png', signedUrl: 'https://signed/a.png' },
      { path: 'renders/u1/b.png', signedUrl: 'https://signed/b.png' },
    ],
  });

  const urls = await resolveRenderUrls(['renders/u1/a.png', 'renders/u1/b.png', null]);

  expect(urls.get('renders/u1/a.png')).toBe('https://signed/a.png');
  expect(urls.get('renders/u1/b.png')).toBe('https://signed/b.png');
  expect(mockCreateSignedUrls).toHaveBeenCalledWith(
    ['renders/u1/a.png', 'renders/u1/b.png'],
    expect.any(Number),
  );
});

it('does not hit storage when there is nothing to sign', async () => {
  const urls = await resolveRenderUrls([null, undefined, '']);
  expect(urls.size).toBe(0);
  expect(mockCreateSignedUrls).not.toHaveBeenCalled();
});
