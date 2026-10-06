import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the initial session restore finishes. */
  isLoading: boolean;
  setSession: (session: Session | null) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  isLoading: true,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),
  reset: () => set({ session: null, user: null, isLoading: false }),
}));
