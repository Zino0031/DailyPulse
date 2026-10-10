import '../global.css';
import { useFonts } from 'expo-font';
import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import {
  DarkTheme,
  DefaultTheme,
  Stack,
  ThemeProvider,
  useRouter,
  useSegments,
  type Href,
} from 'expo-router';
// Welcome lives at /welcome inside the (auth) group — typed-routes won't
// know about it until the next `expo start`, so we cast when navigating.
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { QueryClient } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { useEffect, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { useColorScheme } from '@/components/useColorScheme';
import { useAuth } from '@/hooks/useAuth';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
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

// Offline-readable cache (PRD §4): only the closet is persisted — weather
// and calendar are cheap to refetch and go stale fast.
const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'myoutfit-query-cache',
});
const PERSIST_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const colorScheme = useColorScheme();

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
          // Bump when the persisted ClosetItem shape changes.
          buster: 'closet-v1',
          dehydrateOptions: {
            shouldDehydrateQuery: (query) =>
              query.queryKey[0] === 'closet' && query.state.status === 'success',
          },
        }}>
        <ThemeProvider
          value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <BootGate fontsLoaded={fontsLoaded}>
            <Stack>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="(auth)" options={{ headerShown: false }} />
              <Stack.Screen
                name="onboarding"
                options={{ headerShown: false }}
              />
              <Stack.Screen name="outfit" options={{ headerShown: false }} />
              <Stack.Screen
                name="item/new"
                options={{ presentation: 'modal', title: 'New item' }}
              />
              <Stack.Screen
                name="item/[id]"
                options={{ presentation: 'modal', title: 'Edit item' }}
              />
              <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
            </Stack>
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
 * signed-out users live in `(auth)`, signed-in users are sent to `(tabs)`.
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

  const ready = fontsLoaded && !isLoading;

  useEffect(() => {
    if (ready) {
      SplashScreen.hideAsync();
    }
  }, [ready]);

  useEffect(() => {
    if (!ready) return;
    // While handling a password-recovery deep link, let the reset-password
    // screen stay mounted even though a (recovery) session exists.
    if (isRecovering) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) {
      router.replace('/welcome' as Href);
    } else if (session && inAuthGroup) {
      router.replace('/(tabs)');
    }
  }, [ready, session, segments, router, isRecovering]);

  if (!ready) return null;
  return <>{children}</>;
}
