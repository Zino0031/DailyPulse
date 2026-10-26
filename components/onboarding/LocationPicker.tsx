import { useQuery } from '@tanstack/react-query';
import { LocateFixed, MapPin, Search, X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, Text, TextInput, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { locateOnce } from '@/hooks/useLocation';
import { BRAND, useThemeTokens } from '@/hooks/useThemeTokens';
import { searchPlaces, type PlaceResult } from '@/services/profile';
import { formatLocation, type ProfileLocation } from '@/utils/profile';

interface LocationPickerProps {
  value: ProfileLocation | null;
  onChange: (location: ProfileLocation | null) => void;
  error?: string;
}

const LOCATE_ERROR: Record<'denied' | 'blocked' | 'unavailable' | 'error', string> = {
  denied: 'Location permission was declined — search for your city instead.',
  blocked: 'Location is turned off for this app. Enable it in Settings or search for your city.',
  unavailable: 'Location services are off — turn them on or search for your city.',
  error: "Couldn't get a GPS fix — search for your city instead.",
};

/**
 * Stores lat/lon for Open-Meteo (issue #5): one-tap GPS, or a keyless
 * city search when the user would rather not share their position.
 */
export function LocationPicker({ value, onChange, error }: LocationPickerProps) {
  const tokens = useThemeTokens();
  const [query, setQuery] = useState('');
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<{ message: string; blocked: boolean } | null>(
    null,
  );
  const debounced = useDebounced(query.trim(), 350);

  const places = useQuery({
    queryKey: ['places', debounced],
    queryFn: ({ signal }) => searchPlaces(debounced, signal),
    enabled: debounced.length >= 2,
    staleTime: 60 * 60 * 1000,
    retry: 1,
  });

  const locate = async () => {
    setLocating(true);
    setLocateError(null);
    const result = await locateOnce();
    setLocating(false);
    if (result.ok) {
      onChange({ ...result.coordinates, label: result.label });
      setQuery('');
    } else {
      setLocateError({ message: LOCATE_ERROR[result.reason], blocked: result.reason === 'blocked' });
    }
  };

  const pick = (place: PlaceResult) => {
    onChange({ latitude: place.latitude, longitude: place.longitude, label: place.shortLabel });
    setQuery('');
    setLocateError(null);
  };

  if (value) {
    return (
      <View
        testID="location-selected"
        className="h-14 flex-row items-center gap-3 rounded-full border border-border bg-surface pl-5 pr-2">
        <MapPin size={20} strokeWidth={1.75} color={BRAND.primary} />
        <Text className="flex-1 text-body text-text" numberOfLines={1}>
          {formatLocation(value)}
        </Text>
        <Pressable
          onPress={() => onChange(null)}
          hitSlop={6}
          accessibilityRole="button"
          accessibilityLabel="Change location"
          className="h-11 w-11 items-center justify-center rounded-full active:bg-primary-tint">
          <X size={18} strokeWidth={1.75} color={tokens.textMuted} />
        </Pressable>
      </View>
    );
  }

  const results = places.data ?? [];
  const searching = debounced.length >= 2;

  return (
    <View className="gap-3">
      <Button
        testID="location-use-gps"
        label={locating ? 'Finding you…' : 'Use my current location'}
        icon={LocateFixed}
        variant="secondary"
        loading={locating}
        onPress={locate}
        accessibilityHint="Asks for location permission once and saves your city"
      />

      <View
        className={`h-14 flex-row items-center rounded-full border bg-surface px-5 ${
          error ? 'border-danger' : 'border-border'
        }`}>
        <Search size={20} strokeWidth={1.75} color={tokens.textMuted} />
        <TextInput
          testID="location-search"
          value={query}
          onChangeText={setQuery}
          placeholder="Or search for your city"
          placeholderTextColor={tokens.textMuted}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search for your city"
          className="ml-3 flex-1 text-body text-text"
        />
        {places.isFetching && <ActivityIndicator size="small" color={BRAND.primary} />}
      </View>

      {searching && !places.isFetching && (
        <View className="overflow-hidden rounded-2xl border border-border bg-surface">
          {places.isError ? (
            <Text className="px-4 py-3.5 text-callout text-danger">
              Couldn&apos;t search right now — check your connection.
            </Text>
          ) : results.length === 0 ? (
            <Text className="px-4 py-3.5 text-callout text-text-muted">
              No places match “{debounced}”.
            </Text>
          ) : (
            results.map((place, i) => (
              <Pressable
                key={place.id}
                testID={`location-result-${i}`}
                onPress={() => pick(place)}
                accessibilityRole="button"
                accessibilityLabel={place.label}
                className={`flex-row items-center gap-3 px-4 py-3.5 active:bg-primary-tint ${
                  i < results.length - 1 ? 'border-b border-border' : ''
                }`}>
                <MapPin size={16} strokeWidth={1.75} color={tokens.textMuted} />
                <Text className="flex-1 text-callout text-text" numberOfLines={1}>
                  {place.label}
                </Text>
              </Pressable>
            ))
          )}
        </View>
      )}

      {locateError && (
        <View className="flex-row flex-wrap items-center gap-x-2">
          <Text className="text-footnote text-text-muted">{locateError.message}</Text>
          {locateError.blocked && (
            <Pressable onPress={() => Linking.openSettings()} accessibilityRole="link" hitSlop={6}>
              <Text className="text-footnote font-semibold text-primary">Open Settings</Text>
            </Pressable>
          )}
        </View>
      )}
      {error && !locateError && <Text className="text-footnote text-danger">{error}</Text>}
    </View>
  );
}

function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}
