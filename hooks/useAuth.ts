import { useEffect } from 'react';
import type { AuthError } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { getSupabase } from '@/services/supabase';
import { useAuthStore } from '@/store/useAuthStore';

// Required on web so the OAuth popup can post back to the opener.
WebBrowser.maybeCompleteAuthSession();

export type AuthResult = { error: AuthError | Error | null };

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
  const isRecovering = useAuthStore((s) => s.isRecovering);

  useEffect(() => {
    let mounted = true;
    const { setSession, setRecovering } = useAuthStore.getState();

    if (!hasSupabaseEnv()) {
      setSession(null);
      return;
    }

    getSupabase()
      .auth.getSession()
      .then(({ data }) => {
        if (mounted) setSession(data.session);
      });

    const { data: listener } = getSupabase().auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;
        if (event === 'PASSWORD_RECOVERY') setRecovering(true);
        setSession(nextSession);
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
    isRecovering,
    signIn: async (email: string, password: string): Promise<AuthResult> => {
      if (!hasSupabaseEnv()) return { error: missingEnvError() };
      const { error } = await getSupabase().auth.signInWithPassword({
        email,
        password,
      });
      return { error };
    },
    signUp: async (
      email: string,
      password: string,
      metadata?: Record<string, unknown>,
    ): Promise<AuthResult> => {
      if (!hasSupabaseEnv()) return { error: missingEnvError() };
      const { error } = await getSupabase().auth.signUp({
        email,
        password,
        options: metadata ? { data: metadata } : undefined,
      });
      return { error };
    },
    signInWithGoogle: async (): Promise<AuthResult> => {
      if (!hasSupabaseEnv()) return { error: missingEnvError() };
      try {
        const redirectTo = Linking.createURL('/');
        const { data, error } = await getSupabase().auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            skipBrowserRedirect: true,
            queryParams: {
              access_type: 'offline',
              prompt: 'consent',
            },
          },
        });
        if (error) return { error };
        if (!data?.url) {
          return { error: new Error('Google sign-in URL was not returned.') };
        }

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          redirectTo,
        );
        if (result.type === 'cancel' || result.type === 'dismiss') {
          return { error: new Error('Google sign-in was cancelled.') };
        }
        if (result.type !== 'success' || !result.url) {
          return { error: new Error('Google sign-in failed.') };
        }

        const tokens = parseAuthRedirectUrl(result.url);
        if (!tokens.access_token || !tokens.refresh_token) {
          return {
            error: new Error('No session returned from Google sign-in.'),
          };
        }

        const { error: sessionError } = await getSupabase().auth.setSession({
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
        });
        return { error: sessionError };
      } catch (err) {
        return { error: err instanceof Error ? err : new Error(String(err)) };
      }
    },
    resetPassword: async (email: string): Promise<AuthResult> => {
      if (!hasSupabaseEnv()) return { error: missingEnvError() };
      const redirectTo = Linking.createURL('/reset-password');
      const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
        redirectTo,
      });
      return { error };
    },
    /**
     * Called by the reset-password screen with the full deep-link URL. If the
     * URL carries a recovery token, flips the store into "recovering" mode
     * (keeping the auth gate on this screen) and establishes the recovery
     * session so `updatePassword` can succeed.
     */
    startRecoveryFromUrl: async (
      url: string,
    ): Promise<AuthResult & { isRecoveryUrl: boolean }> => {
      const tokens = parseAuthRedirectUrl(url);
      if (
        tokens.type !== 'recovery' ||
        !tokens.access_token ||
        !tokens.refresh_token
      ) {
        return { error: null, isRecoveryUrl: false };
      }
      if (!hasSupabaseEnv()) {
        return { error: missingEnvError(), isRecoveryUrl: true };
      }
      useAuthStore.getState().setRecovering(true);
      const { error } = await getSupabase().auth.setSession({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
      });
      if (error) useAuthStore.getState().setRecovering(false);
      return { error, isRecoveryUrl: true };
    },
    updatePassword: async (password: string): Promise<AuthResult> => {
      if (!hasSupabaseEnv()) return { error: missingEnvError() };
      const { error } = await getSupabase().auth.updateUser({ password });
      return { error };
    },
    /**
     * Clears the recovery flag so the auth gate stops pinning the user on
     * `/reset-password`. Call after the success screen's Continue tap.
     */
    completeRecovery: () => {
      useAuthStore.getState().setRecovering(false);
    },
    signOut: async () => {
      if (hasSupabaseEnv()) {
        await getSupabase().auth.signOut();
      }
      useAuthStore.getState().reset();
    },
  };
}

/**
 * Supabase delivers OAuth and recovery tokens in the URL fragment, e.g.
 * `myoutfit://reset-password#access_token=...&refresh_token=...&type=recovery`.
 * `Linking.parse` only reads query params, so parse the fragment manually.
 */
function parseAuthRedirectUrl(url: string) {
  const hashIndex = url.indexOf('#');
  const queryIndex = url.indexOf('?');
  const fragment = hashIndex >= 0 ? url.slice(hashIndex + 1) : '';
  const query =
    queryIndex >= 0
      ? hashIndex >= 0
        ? url.slice(queryIndex + 1, hashIndex)
        : url.slice(queryIndex + 1)
      : '';
  const params = new URLSearchParams(fragment || query);
  return {
    access_token: params.get('access_token'),
    refresh_token: params.get('refresh_token'),
    type: params.get('type'),
  };
}

function hasSupabaseEnv(): boolean {
  return Boolean(
    process.env.EXPO_PUBLIC_SUPABASE_URL &&
      process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  );
}

function missingEnvError(): Error {
  return new Error(
    'Auth is not configured. Copy .env.example to .env and fill in your Supabase project values.',
  );
}
