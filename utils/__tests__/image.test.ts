import { Image } from 'expo-image';

import { prefetchImages } from '@/utils/image';

jest.mock('expo-image', () => ({
  Image: { prefetch: jest.fn(async () => true) },
}));

const prefetch = Image.prefetch as jest.Mock;

beforeEach(() => jest.clearAllMocks());

describe('prefetchImages', () => {
  it('prefetches unique, non-empty URLs with a disk-backed policy', () => {
    prefetchImages(['https://a/1.jpg', 'https://a/2.jpg', 'https://a/1.jpg', null, undefined]);
    expect(prefetch).toHaveBeenCalledTimes(1);
    expect(prefetch).toHaveBeenCalledWith(['https://a/1.jpg', 'https://a/2.jpg'], 'memory-disk');
  });

  it('is a no-op when there is nothing to warm', () => {
    prefetchImages([null, undefined]);
    expect(prefetch).not.toHaveBeenCalled();
  });
});
