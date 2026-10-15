import { Stack, router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { Pressable } from 'react-native';

import { useThemeTokens } from '@/hooks/useThemeTokens';

/** Onboarding flow (issue #5): intro → profile form → avatar (issue #6). */
export default function OnboardingLayout() {
  const tokens = useThemeTokens();
  return (
    <Stack
      screenOptions={({ navigation }) => ({
        // Opened directly from Home / Profile (first screen in this stack):
        // the native back button only knows this stack, so go back to the
        // parent route ourselves.
        headerLeft:
          navigation.getState().index === 0 && router.canGoBack()
            ? () => (
                <Pressable
                  onPress={() => router.back()}
                  hitSlop={8}
                  accessibilityRole="button"
                  accessibilityLabel="Go back">
                  <ChevronLeft size={26} strokeWidth={1.75} color={tokens.text} />
                </Pressable>
              )
            : undefined,
      })}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="profile-form" options={{ title: 'Your profile' }} />
      <Stack.Screen name="avatar-capture" options={{ title: 'Your avatar' }} />
    </Stack>
  );
}
