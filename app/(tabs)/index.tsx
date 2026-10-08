import { Text, View } from 'react-native';

import { WeatherWidget } from '@/components/home/WeatherWidget';
import { useDeviceLocation } from '@/hooks/useLocation';
import { DEFAULT_COORDINATES } from '@/services/weather';

// TODO (Epic 5 — Daily Home): replace with the full morning-workflow layout
// (weather + top event + mood selector + Generate CTA). This minimal screen
// only proves the weather service + widget render end to end.
export default function HomeScreen() {
  const { coordinates, placeLabel, status } = useDeviceLocation();
  const effective = coordinates ?? DEFAULT_COORDINATES;
  const usingGps = status === 'granted';

  return (
    <View className="flex-1 bg-bg px-6 pt-12">
      <Text className="text-title-1 font-bold text-text">Today</Text>
      <Text className="mb-8 mt-1 text-footnote text-text-muted">
        {usingGps
          ? 'Weather for your current location.'
          : 'Weather for the default area — enable location for GPS.'}
      </Text>
      <WeatherWidget
        coordinates={effective}
        placeLabel={
          usingGps ? (placeLabel ?? 'GPS location') : 'Default area'
        }
      />
    </View>
  );
}
