// Query-cache persistence policy (PRD §4 NFR, issue #18).
//
// Only the three "must work offline" feeds are rehydrated from AsyncStorage:
// the wardrobe, the last weather reading and the last generated outfit. They
// are small, serialisable, and let an airplane-mode cold start render the
// closet + today's look instead of an empty shell. Everything else (calendar,
// profile, usage…) is cheap to refetch and goes stale fast.
//
// Pure and dependency-free so the policy is unit-tested in isolation
// (utils/__tests__/queryCache.test.ts).

/** First key segment of a query whose data survives a restart. */
export const PERSISTED_QUERY_ROOTS = ['closet', 'weather', 'outfit-last'] as const;

export type PersistedQueryRoot = (typeof PERSISTED_QUERY_ROOTS)[number];

/**
 * Bump when the persisted payload shape changes so a stale blob from a
 * previous release is discarded instead of rehydrated into new code.
 */
export const PERSIST_BUSTER = 'offline-cache-v2';

/** The slice of a TanStack Query this policy reads (keeps it testable). */
export interface PersistableQuery {
  queryKey: readonly unknown[];
  state: { status: 'pending' | 'error' | 'success' };
}

/**
 * True only for successfully-fetched queries under a persisted root. Failed
 * and still-loading queries are never written: a restart must not resurrect
 * an error or a half-filled list.
 */
export function shouldPersistQuery(query: PersistableQuery): boolean {
  if (query.state.status !== 'success') return false;
  return (PERSISTED_QUERY_ROOTS as readonly unknown[]).includes(query.queryKey[0]);
}
