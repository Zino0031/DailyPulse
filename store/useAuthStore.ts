import type { Session, User } from '@supabase/supabase-js';
import { create } from 'zustand';

interface AuthState {
  session: Session | null;
  user: User | null;
  /** True until the initial session restore finishes. */
  isLoading: boolean;
  /**
   * True while handling a password-recovery deep link. The auth gate must
   * leave the user on `/reset-password` instead of redirecting them to the
   * tabs just because the recovery session was set.
   */
  isRecovering: boolean;
  setSession: (session: Session | null) => void;
  setRecovering: (value: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  session: null,
  user: null,
  isLoading: true,
  isRecovering: false,
  setSession: (session) =>
    set({ session, user: session?.user ?? null, isLoading: false }),
  setRecovering: (value) => set({ isRecovering: value }),
  reset: () =>
    set({ session: null, user: null, isLoading: false, isRecovering: false }),
}));
