import { friendlyError, isNetworkError } from '@/utils/errors';

describe('isNetworkError', () => {
  it.each(['Network request failed', 'TypeError: Failed to fetch', 'Load failed', 'Request timed out'])(
    'detects "%s"',
    (message) => {
      expect(isNetworkError(new Error(message))).toBe(true);
    },
  );

  it('ignores other failures', () => {
    expect(isNetworkError(new Error('Row not found'))).toBe(false);
    expect(isNetworkError(undefined)).toBe(false);
  });
});

describe('friendlyError', () => {
  const fallback = 'Something went wrong.';

  it('explains offline failures', () => {
    expect(friendlyError(new Error('Network request failed'), fallback)).toMatch(/offline/i);
  });

  it('passes through messages we wrote for humans', () => {
    expect(friendlyError(new Error('Auto-tagging is busy — try again in a minute.'), fallback)).toBe(
      'Auto-tagging is busy — try again in a minute.',
    );
  });

  it('hides database / policy internals', () => {
    expect(
      friendlyError(new Error('new row violates row-level security policy for table "wardrobe_items"'), fallback),
    ).toBe(fallback);
  });

  it('hides non-Error values and library error classes', () => {
    class PostgrestError extends Error {
      name = 'PostgrestError';
    }
    expect(friendlyError({ code: '42P01' }, fallback)).toBe(fallback);
    expect(friendlyError(new PostgrestError('Relation missing'), fallback)).toBe(fallback);
  });
});
