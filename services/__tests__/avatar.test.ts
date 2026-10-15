import { ImageManipulator } from 'expo-image-manipulator';

import {
  avatarFittedDims,
  avatarPublicUrlToPath,
  deleteAvatar,
  fetchActiveAvatar,
  setActiveAvatar,
  uploadAvatarPhoto,
} from '@/services/avatar';
import { getSupabase } from '@/services/supabase';
import type { AvatarRow } from '@/types/database';

jest.mock('@/services/supabase', () => ({ getSupabase: jest.fn() }));

jest.mock('expo-image-manipulator', () => {
  const manipulate = jest.fn((_source: unknown) => {
    const context: {
      resize: (target: { width: number; height: number }) => typeof context;
      renderAsync: () => Promise<{ saveAsync: () => Promise<{ uri: string }> }>;
    } = {
      resize: () => context,
      renderAsync: async () => ({
        saveAsync: async () => ({ uri: 'file://avatar-out.jpg' }),
      }),
    };
    return context;
  });
  return { ImageManipulator: { manipulate }, SaveFormat: { JPEG: 'jpeg' } };
});

const row: AvatarRow = {
  id: 'avatar-1',
  user_id: 'user-1',
  image_url: 'https://proj.supabase.co/storage/v1/object/public/avatars/user-1/a.jpg',
  is_active: true,
  created_at: '2026-10-14T00:00:00Z',
};

describe('avatarFittedDims', () => {
  it.each([
    [[3024, 4032], [768, 1024]],
    [[4032, 3024], [1024, 768]],
    [[800, 600], [800, 600]],
    [[1024, 1024], [1024, 1024]],
    [[0, 0], [0, 0]],
  ])('%j → %j', ([w, h], [ew, eh]) => {
    expect(avatarFittedDims(w, h)).toEqual({ width: ew, height: eh });
  });
});

describe('avatarPublicUrlToPath', () => {
  it('extracts the storage path from a public avatar URL', () => {
    expect(
      avatarPublicUrlToPath(
        'https://proj.supabase.co/storage/v1/object/public/avatars/user-1/a.jpg',
      ),
    ).toBe('user-1/a.jpg');
  });

  it('strips query params and decodes the path', () => {
    expect(
      avatarPublicUrlToPath(
        'https://proj.supabase.co/storage/v1/object/public/avatars/user-1/a%20b.jpg?x=1',
      ),
    ).toBe('user-1/a b.jpg');
  });

  it('returns null for foreign URLs', () => {
    expect(avatarPublicUrlToPath('https://example.com/face.jpg')).toBeNull();
  });
});

describe('uploadAvatarPhoto', () => {
  const upload = jest.fn();
  const getPublicUrl = jest.fn();

  beforeEach(() => {
    upload.mockReset().mockResolvedValue({ error: null });
    getPublicUrl
      .mockReset()
      .mockImplementation((path: string) => ({
        data: { publicUrl: `https://cdn.test/avatars/${path}` },
      }));
    (getSupabase as jest.Mock).mockReturnValue({
      storage: { from: () => ({ upload, getPublicUrl }) },
    });
    globalThis.fetch = jest.fn(async () => ({
      arrayBuffer: async () => new ArrayBuffer(4),
    })) as never;
    (ImageManipulator.manipulate as jest.Mock).mockClear();
  });

  it('downscales, uploads as JPEG under the user folder, and returns the public URL', async () => {
    const url = await uploadAvatarPhoto('user-1', {
      uri: 'file://selfie.jpg',
      width: 3024,
      height: 4032,
    });

    expect(ImageManipulator.manipulate).toHaveBeenCalledWith('file://selfie.jpg');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^user-1\/\d+-[a-z0-9]+\.jpg$/),
      expect.any(ArrayBuffer),
      { contentType: 'image/jpeg', upsert: false },
    );
    expect(url).toMatch(/^https:\/\/cdn\.test\/avatars\/user-1\//);
  });

  it('throws when the upload fails (no phantom row can follow)', async () => {
    upload.mockResolvedValue({ error: new Error('quota') });
    await expect(
      uploadAvatarPhoto('user-1', { uri: 'file://selfie.jpg', width: 800, height: 600 }),
    ).rejects.toThrow('quota');
  });
});

describe('fetchActiveAvatar', () => {
  it('returns the newest active row (or null)', async () => {
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const chain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle,
    };
    (getSupabase as jest.Mock).mockReturnValue({ from: () => chain });

    await expect(fetchActiveAvatar('user-1')).resolves.toEqual(row);
    expect(chain.eq).toHaveBeenNthCalledWith(1, 'user_id', 'user-1');
    expect(chain.eq).toHaveBeenNthCalledWith(2, 'is_active', true);
  });
});

describe('setActiveAvatar', () => {
  it('deactivates the old row before inserting (partial unique index)', async () => {
    const calls: string[] = [];
    const updateEq2 = jest.fn((_key: string, _value: unknown) => {
      calls.push('deactivate');
      return Promise.resolve({ error: null });
    });
    const updateEq1 = jest.fn(
      (_key: string, _value: unknown): { eq: typeof updateEq2 } => ({ eq: updateEq2 }),
    );
    const single = jest.fn(() => Promise.resolve({ data: row, error: null }));
    const select = jest.fn(() => ({ single }));
    const insert = jest.fn(() => {
      calls.push('insert');
      return { select };
    });
    (getSupabase as jest.Mock).mockReturnValue({
      from: () => ({
        update: jest.fn(() => ({ eq: updateEq1 })),
        insert,
      }),
    });

    await expect(
      setActiveAvatar('user-1', 'https://cdn.test/avatars/user-1/b.jpg'),
    ).resolves.toEqual(row);
    expect(calls).toEqual(['deactivate', 'insert']);
    expect(updateEq1).toHaveBeenCalledWith('user_id', 'user-1');
    expect(updateEq2).toHaveBeenCalledWith('is_active', true);
    expect(insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      image_url: 'https://cdn.test/avatars/user-1/b.jpg',
      is_active: true,
    });
  });
});

describe('deleteAvatar', () => {
  it('deletes the row, then removes the storage object', async () => {
    const remove = jest.fn().mockResolvedValue({ error: null });
    (getSupabase as jest.Mock).mockReturnValue({
      from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      storage: { from: () => ({ remove }) },
    });

    await deleteAvatar(row);
    expect(remove).toHaveBeenCalledWith(['user-1/a.jpg']);
  });

  it('still succeeds when the file cleanup throws', async () => {
    (getSupabase as jest.Mock).mockReturnValue({
      from: () => ({ delete: () => ({ eq: () => Promise.resolve({ error: null }) }) }),
      storage: {
        from: () => ({
          remove: jest.fn().mockRejectedValue(new Error('gone')),
        }),
      },
    });

    await expect(deleteAvatar(row)).resolves.toBeUndefined();
  });
});
