import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { ProfileDraft } from '@/utils/profile';

interface OnboardingDraftState {
  /** Owner of the draft — a draft never leaks to another account. */
  userId: string | null;
  draft: ProfileDraft | null;
  saveDraft: (userId: string, draft: ProfileDraft) => void;
  clearDraft: () => void;
}

/**
 * Unsaved onboarding answers, persisted so closing the app mid-flow
 * resumes where the user left off (issue #5).
 */
export const useOnboardingDraftStore = create<OnboardingDraftState>()(
  persist(
    (set) => ({
      userId: null,
      draft: null,
      saveDraft: (userId, draft) => set({ userId, draft }),
      clearDraft: () => set({ userId: null, draft: null }),
    }),
    {
      name: 'myoutfit-onboarding-draft',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ userId: state.userId, draft: state.draft }),
    },
  ),
);

/** The draft for this user, or null if none / it belongs to someone else. */
export function useDraftFor(userId: string | null): ProfileDraft | null {
  return useOnboardingDraftStore((s) => (userId && s.userId === userId ? s.draft : null));
}

/** False until the persisted draft has been read back from AsyncStorage. */
export function useDraftHydrated(): boolean {
  const [hydrated, setHydrated] = useState(() => useOnboardingDraftStore.persist.hasHydrated());
  useEffect(() => {
    if (hydrated) return;
    const unsub = useOnboardingDraftStore.persist.onFinishHydration(() => setHydrated(true));
    // Covers hydration finishing between the initial state read and subscribing.
    if (useOnboardingDraftStore.persist.hasHydrated()) setHydrated(true);
    return unsub;
  }, [hydrated]);
  return hydrated;
}
