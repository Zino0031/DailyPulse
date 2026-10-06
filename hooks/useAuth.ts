import { useEffect } from 'react';

import { getSupabase } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';

/**
 * Restores the Supabase session once and keeps the Zustand auth store
 * in sync. Safe to call in the root layout: the client is only touched
 * inside effects / event handlers, so static web export works without
 * `.env` configured.
 */
export function useAuth() {
  const session = useAuthStore((s) => s.session);
  const user = useAuthStore((s) => s.user);
  const isLoading = useAuthStore((s) => s.isLoading);

  useEffect(() => {
    let mounted = true;
    const { setSession } = useAuthStore.getState();

    if (!hasSupabaseEnv()) {
      // Backend not configured yet (fresh clone without .env): treat as
      // signed out so the shell still renders.
      setSession(null);
      return;
    }

    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      });

    const { data: listener } = getSupabase().auth.onAuthStateChange(
      (_event, nextSession) => {
        if (mounted) setSession(nextSession);
      },
    );

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  return {
    session,
    user,
    isLoading,
    signOut: async () => {
      if (hasSupabaseEnv()) {
        await getSupabase().auth.signOut();
      }
      useAuthStore.getState().reset();
    },
  };
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
}
