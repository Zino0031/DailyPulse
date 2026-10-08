import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

export type Mood =
  | 'neutral'
  | 'energetic'
  | 'professional'
  | 'relaxed'
  | 'creative';

export interface MoodOption {
  id: Mood;
  label: string;
}

/** Extendable mood catalogue (PRD §3.3). Styling lives in MoodSelector. */
export const MOODS: readonly MoodOption[] = [
  { id: 'neutral', label: 'Neutral' },
  { id: 'energetic', label: 'Energetic' },
  { id: 'professional', label: 'Professional' },
  { id: 'relaxed', label: 'Relaxed' },
  { id: 'creative', label: 'Creative' },
] as const;

interface UserPreferencesState {
  /**
   * Defaults to neutral. Persisted across restarts. Epic 5 treats neutral
   * as "no strong signal" in the outfit generation request.
   */
  mood: Mood;
  setMood: (mood: Mood) => void;
  clearMood: () => void;
}

export const useUserPreferencesStore = create<UserPreferencesState>()(
  persist(
    (set) => ({
      mood: 'neutral',
      setMood: (mood) => set({ mood }),
      clearMood: () => set({ mood: 'neutral' }),
    }),
    {
      name: 'myoutfit-preferences',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({ mood: state.mood }),
    },
  ),
);
