import { router } from 'expo-router';
import { CloudSun, Shirt, Sparkles, type LucideIcon } from 'lucide-react-native';
import { ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusNote } from '@/components/closet/StatusNote';
import { Button } from '@/components/ui/Button';
import { useSkipOnboarding } from '@/hooks/useProfile';
import { BRAND } from '@/hooks/useThemeTokens';
import { useAuthStore } from '@/store/useAuthStore';
import { useDraftFor } from '@/store/useOnboardingDraftStore';
import { friendlyError } from '@/utils/errors';

/**
 * Onboarding entry (issue #5). The auth gate lands new accounts here until
 * `users.onboarded_at` is set by finishing the form or skipping.
 */
export default function OnboardingScreen() {
  const userId = useAuthStore((s) => s.user?.id ?? null);
  const draft = useDraftFor(userId);
  const skip = useSkipOnboarding();

  const onSkip = () => {
    skip.mutate(undefined, { onSuccess: () => router.replace('/(tabs)') });
  };

  return (
    <SafeAreaView edges={['top', 'bottom']} className="flex-1 bg-bg">
      <ScrollView contentContainerClassName="flex-grow w-full max-w-[640px] self-center px-6 pb-8 pt-12">
        <Text accessibilityRole="header" className="text-display font-bold text-text">
          Let&apos;s get you dressed
        </Text>
        <Text className="mt-3 text-body text-text-muted">
          A few quick answers so every outfit fits your style and your weather.
        </Text>

        <View className="mt-8 gap-6">
          <Step icon={Sparkles} title="Your style" body="Pick the looks you reach for most." />
          <Step icon={CloudSun} title="Your weather" body="Your city lets us dress you for the forecast." />
          <Step icon={Shirt} title="Your avatar" body="An optional selfie so outfit previews look like you." />
        </View>

        <View className="flex-1" />

        {skip.isError && (
          <View className="mb-4">
            <StatusNote
              tone="error"
              message={friendlyError(skip.error, "Couldn't skip right now — please try again.")}
            />
          </View>
        )}

        <View className="mt-8 gap-3">
          <Button
            testID="onboarding-start"
            label={draft ? 'Continue where you left off' : 'Get started'}
            size="lg"
            onPress={() => router.push('/onboarding/profile-form')}
            accessibilityHint="Opens the profile form"
          />
          <Button
            testID="onboarding-skip"
            label="Skip for now"
            variant="ghost"
            loading={skip.isPending}
            onPress={onSkip}
            accessibilityHint="You can finish your profile later from the Profile tab"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Step({ icon: Icon, title, body }: { icon: LucideIcon; title: string; body: string }) {
  return (
    <View className="flex-row items-start gap-4">
      <View className="h-12 w-12 items-center justify-center rounded-full bg-primary-tint">
        <Icon size={22} strokeWidth={1.75} color={BRAND.primary} />
      </View>
      <View className="flex-1">
        <Text className="text-headline font-semibold text-text">{title}</Text>
        <Text className="mt-0.5 text-callout text-text-muted">{body}</Text>
      </View>
    </View>
  );
}
