import { PERSISTED_QUERY_ROOTS, shouldPersistQuery } from '@/utils/queryCache';

type Status = 'pending' | 'error' | 'success';
const query = (queryKey: readonly unknown[], status: Status = 'success') => ({
  queryKey,
  state: { status },
});

describe('shouldPersistQuery', () => {
  it('persists the offline-critical feeds', () => {
    expect(shouldPersistQuery(query(['closet', 'user-1', 'items']))).toBe(true);
    expect(shouldPersistQuery(query(['weather', 36.75, 3.06]))).toBe(true);
    expect(shouldPersistQuery(query(['outfit-last', 'user-1']))).toBe(true);
  });

  it('never persists volatile or unrelated queries', () => {
    expect(shouldPersistQuery(query(['profile', 'user-1', 'details']))).toBe(false);
    expect(shouldPersistQuery(query(['subscription', 'user-1', 'usage']))).toBe(false);
    expect(shouldPersistQuery(query(['lookbook', 'user-1', 'entries']))).toBe(false);
    expect(shouldPersistQuery(query([]))).toBe(false);
  });

  it('skips queries that are not successful', () => {
    expect(shouldPersistQuery(query(['closet'], 'pending'))).toBe(false);
    expect(shouldPersistQuery(query(['closet'], 'error'))).toBe(false);
  });

  it('keeps the persisted roots in sync with the docs', () => {
    expect([...PERSISTED_QUERY_ROOTS]).toEqual(['closet', 'weather', 'outfit-last']);
  });
});
