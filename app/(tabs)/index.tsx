import { Link } from 'expo-router';
import { Linking, Pressable, ScrollView, Text, View } from 'react-native';

import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import { WeatherWidget } from '@/components/home/WeatherWidget';
import { MoodSelector } from '@/components/home/MoodSelector';
import { SchedulePreview } from '@/components/home/SchedulePreview';
import { useDeviceLocation } from '@/hooks/useLocation';
import { useProfileDetails } from '@/hooks/useProfile';
import { useGenerationUsage, usePlan } from '@/hooks/useSubscription';
import { DEFAULT_COORDINATES } from '@/services/weather';
import { generationsLine } from '@/utils/subscription';

// TODO (Epic 5 — Daily Home): replace with the full morning-workflow layout
// (weather + top event + mood selector + Generate CTA). This minimal screen
// only proves the weather service + widget render end to end.
export default function HomeScreen() {
  const { coordinates, placeLabel, status, blocked, retry } = useDeviceLocation();
  const { data: profile } = useProfileDetails();
  // GPS first, then the location saved in onboarding, then the default.
  const saved =
    profile?.location_lat != null && profile.location_lon != null
      ? { latitude: Number(profile.location_lat), longitude: Number(profile.location_lon) }
      : null;
  const effective = coordinates ?? saved ?? DEFAULT_COORDINATES;
  const usingGps = status === 'granted';
  const { plan } = usePlan();
  const usage = useGenerationUsage();

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pb-8 pt-12">
      <View className="flex-row items-center justify-between">
        <View className="flex-1">
          <Text className="text-title-1 font-bold text-text">Today</Text>
        </View>
        <Link href="/onboarding/avatar-capture" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your avatar"
            accessibilityHint="Opens the avatar setup">
            <AvatarPreview size={48} />
          </Pressable>
        </Link>
      </View>
      <Text className="mb-8 mt-1 text-footnote text-text-muted">
        {usingGps
          ? 'Weather for your current location.'
          : saved
            ? 'Weather for your saved location — tap the target icon for live GPS.'
            : 'Default area — tap the target icon for live GPS.'}
      </Text>
      <WeatherWidget
        coordinates={effective}
        placeLabel={
          usingGps
            ? (placeLabel ?? 'GPS location')
            : saved
              ? (profile?.location_name ?? 'Saved location')
              : 'Default area'
        }
        locationAction={
          status === 'loading'
            ? null
            : {
                active: usingGps,
                label: usingGps
                  ? 'Location active'
                  : blocked
                    ? 'Open location settings'
                    : 'Enable location',
                onPress: () => (blocked ? Linking.openSettings() : retry()),
              }
        }
      />
      <View className="mt-8">
        <MoodSelector />
      </View>
      <View className="mt-8">
        <SchedulePreview />
      </View>
      <View className="mb-8 mt-8 gap-2">
        <Link href="/outfit/new" asChild>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generate today's outfits"
            accessibilityHint={generationsLine(plan, usage)}
            className="h-[52px] items-center justify-center rounded-full bg-primary px-6 shadow-md">
            <Text className="text-headline text-white">
              Generate today&apos;s outfits
            </Text>
          </Pressable>
        </Link>
        <Text testID="home-generation-usage" className="text-center text-caption text-text-muted">
          {generationsLine(plan, usage)}
        </Text>
      </View>
    </ScrollView>
  );
}
