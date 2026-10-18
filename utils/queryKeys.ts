// TanStack Query key factories shared across hooks (issue #50).
//
// Dependency-free on purpose: hooks import these to *invalidate* each other's
// caches, and importing a hook module would drag in its side effects
// (services/closet → expo-image-manipulator) and break unit tests.

/** Saved-lookbook entries (`is_saved` outfits), newest first. */
export const lookbookKeys = {
  all: ['lookbook'] as const,
  entries: (userId: string | null) => ['lookbook', userId, 'entries'] as const,
};

/** A single saved/attached outfit row, keyed by id. */
export const savedOutfitKeys = {
  all: ['outfit-saved'] as const,
  one: (id: string) => ['outfit-saved', id] as const,
};
