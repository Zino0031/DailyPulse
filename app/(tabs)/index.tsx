import { Linking, ScrollView, Text, View } from 'react-native';

import { WeatherWidget } from '@/components/home/WeatherWidget';
import { MoodSelector } from '@/components/home/MoodSelector';
import { SchedulePreview } from '@/components/home/SchedulePreview';
import { useDeviceLocation } from '@/hooks/useLocation';
import { DEFAULT_COORDINATES } from '@/services/weather';

// TODO (Epic 5 — Daily Home): replace with the full morning-workflow layout
// (weather + top event + mood selector + Generate CTA). This minimal screen
// only proves the weather service + widget render end to end.
export default function HomeScreen() {
  const { coordinates, placeLabel, status, blocked, retry } = useDeviceLocation();
  const effective = coordinates ?? DEFAULT_COORDINATES;
  const usingGps = status === 'granted';

  return (
    <ScrollView
      className="flex-1 bg-bg"
      contentContainerClassName="px-6 pb-8 pt-12">
      <Text className="text-title-1 font-bold text-text">Today</Text>
      <Text className="mb-8 mt-1 text-footnote text-text-muted">
        {usingGps
          ? 'Weather for your current location.'
          : 'Default area — tap the target icon for live GPS.'}
      </Text>
      <WeatherWidget
        coordinates={effective}
        placeLabel={
          usingGps ? (placeLabel ?? 'GPS location') : 'Default area'
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
    </ScrollView>
  );
}
