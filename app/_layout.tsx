import '../global.css';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
// Welcome lives at /welcome inside the (auth) group — typed-routes won't
// know about it until the next `expo start`, so we cast when navigating.
import { getFocusedRouteNameFromRoute } from 'expo-router/react-navigation';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient, useIsRestoring } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, useRef, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Paywall } from '@/components/subscription/Paywall';
import { useAuth } from '@/hooks/useAuth';
import { useProfileDetails } from '@/hooks/useProfile';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { usePurchasesIdentity } from '@/hooks/useSubscription';
import { perfMark, perfMeasure } from '@/utils/perf';
import { PERSIST_BUSTER, shouldPersistQuery } from '@/utils/queryCache';

// Module-eval timestamp for the dev cold-start log (utils/perf.ts).
perfMark('boot');

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Deep links into a stacked route keep the tabs underneath for back.
  initialRouteName: '(tabs)',
};

// Route name → title for the tab group (see the `(tabs)` screen below).
const TAB_TITLES: Record<string, string> = {
  index: 'Today',
  closet: 'Closet',
  lookbook: 'Lookbook',
  profile: 'Profile',
};

// Prevent the splash screen from auto-hiding before fonts + session restore.
SplashScreen.preventAutoHideAsync();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: 2,
    },
  },
});

const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// Queries with no live observer between mounts are garbage-collected on the
// 5-minute default, and that removal is itself persisted — evicting an intent
// the persister keeps for 7 days and breaking the resume path (#44). Hold the
// two outfit keys for at least as long as the persisted blob.
queryClient.setQueryDefaults(['outfit-pending'], { gcTime: PERSIST_MAX_AGE_MS });
queryClient.setQueryDefaults(['outfit-last'], { gcTime: PERSIST_MAX_AGE_MS });

// Offline-readable cache (PRD §4): wardrobe + last weather + last outfit are
// persisted (see utils/queryCache.ts), plus the in-flight generation intent so
// a refresh mid-generation can resume instead of spending twice (#44).
// Calendar, profile and usage are cheap to refetch and go stale fast, so they
// stay in memory only.
//
// The persister throttles writes (~1s by default), so a refresh within about a
// second of the tap can still miss the intent. That's acceptable given the
// stylist's latency, but it isn't a guarantee (#44).
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'myoutfit-query-cache',
});

export default function RootLayout() {
  const tokens = useThemeTokens();
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (fontError) throw fontError;
  }, [fontError]);

  return (
    <SafeAreaProvider>
      <PersistQueryClientProvider
        client={queryClient}
        persistOptions={{
          persister,
          maxAge: PERSIST_MAX_AGE_MS,
          // Bump when a persisted payload shape changes.
          buster: PERSIST_BUSTER,
          dehydrateOptions: {
            shouldDehydrateQuery: shouldPersistQuery,
          },
        }}>
        {/* Page colour behind screens, so tab cross-fades don't flash grey. */}
        <ThemeProvider
          value={{
            ...DefaultTheme,
            colors: { ...DefaultTheme.colors, background: tokens.bg },
          }}>
          <BootGate fontsLoaded={fontsLoaded}>
            <Stack>
              <Stack.Screen
                name="(tabs)"
                // Title = the active tab, so iOS's back-button long-press menu
                // reads "Today" / "Closet"… instead of "(tabs)".
                options={({ route }) => ({
                  headerShown: false,
                  title: TAB_TITLES[getFocusedRouteNameFromRoute(route) ?? 'index'] ?? 'Today',
                })}
              />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false }}
              />
              {/* Bare back chevron on the page colour; the screen draws its own title. */}
              <Stack.Screen
                name="outfit/[id]"
                options={{
                  title: '',
                  headerBackButtonDisplayMode: 'minimal',
                  headerShadowVisible: false,
                  headerStyle: { backgroundColor: tokens.bg },
                }}
              />
              <Stack.Screen
                name="edit-profile"
                options={{
                  presentation: 'modal',
                  title: 'Edit profile',
                  headerShadowVisible: false,
                  headerStyle: { backgroundColor: tokens.bg },
                }}
              />
              <Stack.Screen
                name="item/new"
                options={{ presentation: 'modal', title: 'New item' }}
              />
              <Stack.Screen
                name="item/[id]"
                options={{ presentation: 'modal', title: 'Edit item' }}
              />
            </Stack>
            {/* One app-wide paywall; screens open it via usePaywallStore. */}
            <Paywall />
          </BootGate>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </SafeAreaProvider>
  );
}

/**
 * Dev-only escape hatch for previewing protected screens before Epic 1
 * lands real auth. Set EXPO_PUBLIC_BYPASS_AUTH=true in your local .env
 * (never commit .env). Absent/false = normal gate behavior.
 */
const DEV_BYPASS_AUTH = process.env.EXPO_PUBLIC_BYPASS_AUTH === 'true';

/**
 * Holds the splash screen until boot finishes, then enforces the auth gate:
 * signed-out users live in `(auth)`, signed-in users are sent to `(tabs)` —
 * or to `onboarding` until `users.onboarded_at` is set (issue #5).
 */
function BootGate({
  fontsLoaded,
  children,
}: {
  fontsLoaded: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const segments = useSegments();
  const { session, isLoading, isRecovering } = useAuth();
  const profile = useProfileDetails();
  // Persisted caches (incl. the in-flight generation intent) restore
  // asynchronously in v5. Rendering the tree before that would let the outfit
  // hook mint a fresh id and spend a second generation (#44).
  const isRestoring = useIsRestoring();
  usePurchasesIdentity();

  const ready = fontsLoaded && !isLoading && !isRestoring;
  // A failed read (offline, missing migration) never traps the user in
  // onboarding — only a loaded row without `onboarded_at` sends them there.
  const profileLoading = Boolean(session) && profile.isLoading;
  const needsOnboarding =
    Boolean(session) && profile.isSuccess && !profile.data?.onboarded_at;

  // Dev-only cold-start log (docs/PERFORMANCE.md).
  const bootLogged = useRef(false);

  useEffect(() => {
    if (ready && !profileLoading) {
      SplashScreen.hideAsync();
      if (!bootLogged.current) {
        bootLogged.current = true;
        perfMeasure('boot (module eval → first frame)', 'boot');
      }
    }
  }, [ready, profileLoading]);

  useEffect(() => {
    if (!ready) return;
    // While handling a password-recovery deep link, let the reset-password
    // screen stay mounted even though a (recovery) session exists.
    if (isRecovering) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session) {
      if (!inAuthGroup) router.replace('/welcome' as Href);
      return;
    }
    // Stay put (sign-in screen / splash) until we know where to send them.
    if (profileLoading) return;
    if (needsOnboarding && segments[0] !== 'onboarding') {
      router.replace('/onboarding');
    } else if (!needsOnboarding && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [ready, session, segments, router, isRecovering, profileLoading, needsOnboarding]);

  if (!ready) return null;
  return <>{children}</>;
}
