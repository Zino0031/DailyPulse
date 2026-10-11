import { ImageManipulator } from 'expo-image-manipulator';

import {
  cropFaceFromPhoto,
  faceCropRect,
  fittedDims,
  replaceClosetPhoto,
} from '@/services/closet';
import { getSupabase } from '@/services/supabase';

jest.mock('@/services/supabase', () => ({ getSupabase: jest.fn() }));

// Records every manipulator chain: what it was opened on, and which ops ran.
const mockChains: { source: unknown; ops: [string, unknown][] }[] = [];
jest.mock('expo-image-manipulator', () => {
  let rendered = { width: 0, height: 0 };
  const manipulate = jest.fn((source: unknown) => {
    const chain = { source, ops: [] as [string, unknown][] };
    mockChains.push(chain);
    let size = typeof source === 'string' ? rendered : (source as typeof rendered);
    const context = {
      crop: (rect: { width: number; height: number }) => {
        chain.ops.push(['crop', rect]);
        size = { width: rect.width, height: rect.height };
        return context;
      },
      resize: (target: { width: number }) => {
        chain.ops.push(['resize', target]);
        size = {
          width: target.width,
          height: Math.round((size.height * target.width) / size.width),
        };
        return context;
      },
      renderAsync: async () => ({
        ...size,
        saveAsync: async () => ({ uri: `file://out-${mockChains.length}.jpg`, ...size }),
      }),
    };
    return context;
  });
  return {
    ImageManipulator: {
      manipulate,
      // Test hook: dimensions of the decoded source image.
      __setSourceSize: (s: typeof rendered) => (rendered = s),
    },
    SaveFormat: { JPEG: 'jpeg' },
  };
});
const setSourceSize = (
  ImageManipulator as unknown as { __setSourceSize: (s: { width: number; height: number }) => void }
).__setSourceSize;

beforeEach(() => {
  mockChains.length = 0;
});

describe('fittedDims', () => {
  it.each([
    [[3024, 4032], [810, 1080]],
    [[4032, 3024], [1080, 810]],
    [[800, 600], [800, 600]],
    [[1080, 1080], [1080, 1080]],
    [[0, 0], [0, 0]],
  ])('%j → %j', ([w, h], [ew, eh]) => {
    expect(fittedDims(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe('faceCropRect', () => {
  it('keeps everything below the face plus a small margin, full width', () => {
    // Face ends at 30% height; 2% margin → crop starts at 32%.
    expect(faceCropRect({ x: 300, y: 50, w: 400, h: 250 }, 900, 1200)).toEqual({
      originX: 0,
      originY: 384,
      width: 900,
      height: 816,
    });
  });

  it('is resolution independent (same fractions on a full-res photo)', () => {
    const rect = faceCropRect({ x: 300, y: 50, w: 400, h: 250 }, 3024, 4032);
    expect(rect?.originY).toBe(1291); // ceil(32% of 4032)
    expect(rect?.width).toBe(3024);
  });

  it('skips faces that end below the top band (would cut the garment)', () => {
    expect(faceCropRect({ x: 0, y: 300, w: 200, h: 200 }, 900, 1200)).toBeNull();
  });

  it('accepts a face ending exactly at the band edge and still keeps over half the photo', () => {
    const rect = faceCropRect({ x: 0, y: 200, w: 100, h: 250 }, 1000, 1000);
    expect(rect).toEqual({ originX: 0, originY: 470, width: 1000, height: 530 });
  });

  it('never crops a face-filled photo to nothing', () => {
    expect(faceCropRect({ x: 0, y: 0, w: 1000, h: 1000 }, 900, 1200)).toBeNull();
  });

  it('rejects empty images', () => {
    expect(faceCropRect({ x: 0, y: 0, w: 10, h: 10 }, 0, 0)).toBeNull();
  });
});

describe('cropFaceFromPhoto', () => {
  const face = { x: 300, y: 50, w: 400, h: 250 };

  it('crops in the decoded image’s own pixel space, then downscales for upload', async () => {
    setSourceSize({ width: 3024, height: 4032 });
    const result = await cropFaceFromPhoto('file://picked.jpg', face);

    const crop = mockChains[1].ops.find(([op]) => op === 'crop')?.[1];
    // Full-res rect — not the 1080px "fitted" one, which would grab the
    // top-left corner (i.e. the face) of a full-res photo.
    expect(crop).toEqual({ originX: 0, originY: 1291, width: 3024, height: 2741 });
    expect(mockChains[1].ops).toContainEqual(['resize', { width: 1080, height: null }]);
    expect(result).toEqual({ uri: expect.any(String), width: 1080, height: 979 });
  });

  it('does not resize an already small photo', async () => {
    setSourceSize({ width: 600, height: 800 });
    await cropFaceFromPhoto('file://picked.jpg', face);
    expect(mockChains[1].ops.map(([op]) => op)).toEqual(['crop']);
  });

  it('returns null (no file written) when no crop applies', async () => {
    setSourceSize({ width: 600, height: 800 });
    expect(await cropFaceFromPhoto('file://picked.jpg', { x: 0, y: 600, w: 100, h: 100 })).toBeNull();
    expect(mockChains).toHaveLength(1); // decode only
  });
});

describe('replaceClosetPhoto', () => {
  const upload = jest.fn();
  const remove = jest.fn();

  beforeEach(() => {
    upload.mockReset().mockResolvedValue({ error: null });
    remove.mockReset().mockResolvedValue({ error: null });
    (getSupabase as jest.Mock).mockReturnValue({
      storage: { from: () => ({ upload, remove }) },
    });
    globalThis.fetch = jest.fn(async () => ({ arrayBuffer: async () => new ArrayBuffer(4) })) as never;
  });

  it('uploads to a new path in the same folder (no CDN-stale overwrite), then removes the old one', async () => {
    const path = await replaceClosetPhoto('user-1/old.jpg', 'file://cropped.jpg');

    expect(path).toMatch(/^user-1\/\d+-[a-z0-9]+\.jpg$/);
    expect(path).not.toBe('user-1/old.jpg');
    expect(upload).toHaveBeenCalledWith(path, expect.any(ArrayBuffer), {
      contentType: 'image/jpeg',
      upsert: false,
    });
    expect(remove).toHaveBeenCalledWith(['user-1/old.jpg']);
  });

  it('keeps the old photo when the upload fails', async () => {
    upload.mockResolvedValue({ error: new Error('quota') });
    await expect(replaceClosetPhoto('user-1/old.jpg', 'file://cropped.jpg')).rejects.toThrow('quota');
    expect(remove).not.toHaveBeenCalled();
  });
});
