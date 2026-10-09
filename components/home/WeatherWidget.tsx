import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudMoon,
  CloudRain,
  CloudSnow,
  CloudSun,
  Cloudy,
  LocateFixed,
  MapPin,
  Moon,
  Sun,
} from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { useWeather } from '@/hooks/useWeather';
import {
  DEFAULT_COORDINATES,
  describeWeatherCode,
  type Coordinates,
} from '@/services/weather';

interface WeatherWidgetProps {
  coordinates?: Coordinates;
  /** e.g. "Algiers, Algeria". Falls back to raw coordinates. */
  placeLabel?: string | null;
  /** GPS action for the in-card locate button; hidden when omitted. */
  locationAction?: {
    active: boolean;
    label: string;
    onPress: () => void;
  } | null;
}

/**
 * Current-conditions hero card (DESIGN.md §7 Card + §10 examples).
 * Loading skeleton and error+retry states included so Home never blanks.
 */
export function WeatherWidget({
  coordinates = DEFAULT_COORDINATES,
  placeLabel = null,
  locationAction = null,
}: WeatherWidgetProps) {
  const { data, isLoading, isError, refetch, isFetching } =
    useWeather(coordinates);

  if (isLoading) {
    return (
      <View
        accessibilityLabel="Loading weather"
        className="rounded-xl bg-surface p-5 shadow-md">
        <View className="flex-row items-center gap-4">
          <View className="h-14 w-14 rounded-full bg-border" />
          <View className="flex-1 gap-2">
            <View className="h-7 w-24 rounded-md bg-border" />
            <View className="h-4 w-32 rounded-md bg-border" />
          </View>
        </View>
        <View className="mt-4 h-4 w-full rounded-md bg-border" />
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View className="rounded-xl bg-surface p-5 shadow-md">
        <Text className="text-headline text-text">
          Couldn&apos;t load the weather
        </Text>
        <Text className="mt-1 text-footnote text-text-muted">
          Check your connection and try again.
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Retry loading weather"
          onPress={() => refetch()}
          disabled={isFetching}
          className="mt-3 self-start rounded-full px-3 py-1.5">
          <Text className="text-callout font-medium text-primary">
            {isFetching ? 'Retrying…' : 'Try again'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { current, today } = data;
  const rain = today.precipitationProbabilityMaxPct;

  return (
    <View
      accessibilityLabel={`Weather: ${describeWeatherCode(current.weatherCode)}, ${Math.round(current.temperatureC)} degrees`}
      className="rounded-xl bg-surface p-5 shadow-md">
      <View className="flex-row items-center gap-4">
        <View className="h-14 w-14 items-center justify-center rounded-full bg-primary-tint">
          <WeatherIcon code={current.weatherCode} isDay={current.isDay} />
        </View>
        <View className="flex-1">
          <Text className="text-title-1 font-bold text-text">
            {Math.round(current.temperatureC)}°
          </Text>
          <Text className="text-callout text-text-muted">
            {describeWeatherCode(current.weatherCode)} · Feels{' '}
            {Math.round(current.apparentTemperatureC)}°
          </Text>
        </View>
        {locationAction && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={locationAction.label}
            disabled={locationAction.active}
            onPress={locationAction.onPress}
            className={`h-9 w-9 items-center justify-center rounded-full border ${
              locationAction.active
                ? 'border-transparent bg-primary-tint'
                : 'border-border bg-surface'
            }`}>
            <LocateFixed
              size={16}
              strokeWidth={1.5}
              color={locationAction.active ? '#5B47FB' : '#9CA3AF'}
            />
          </Pressable>
        )}
      </View>
      <View className="mt-4 flex-row items-center gap-2">
        <MapPin size={14} strokeWidth={1.5} color="#9CA3AF" />
        <Text className="text-footnote text-text-subtle">
          {placeLabel ??
            `${coordinates.latitude.toFixed(2)}, ${coordinates.longitude.toFixed(2)}`}
        </Text>
      </View>
      <View className="mt-4 flex-row gap-4">
        <Text className="text-footnote text-text-muted">
          H {Math.round(today.tempMaxC)}° · L {Math.round(today.tempMinC)}°
        </Text>
        <Text className="text-footnote text-text-muted">
          Rain {rain === null ? '—' : `${rain}%`}
        </Text>
        <Text className="text-footnote text-text-muted">
          Wind {Math.round(current.windSpeedKmh)} km/h
        </Text>
      </View>
    </View>
  );
}

function WeatherIcon({ code, isDay }: { code: number; isDay: boolean }) {
  if (code === 0) return isDay ? <Sun {...iconProps} /> : <Moon {...iconProps} />;
  if (code === 1 || code === 2)
    return isDay ? <CloudSun {...iconProps} /> : <CloudMoon {...iconProps} />;
  if (code === 3) return <Cloudy {...iconProps} />;
  if (code === 45 || code === 48) return <CloudFog {...iconProps} />;
  if (code >= 51 && code <= 57) return <CloudDrizzle {...iconProps} />;
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return <CloudRain {...iconProps} />;
  if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    return <CloudSnow {...iconProps} />;
  if (code >= 95) return <CloudLightning {...iconProps} />;
  return <Cloud {...iconProps} />;
}

const iconProps = { size: 28, strokeWidth: 1.5, color: '#5B47FB' } as const;
