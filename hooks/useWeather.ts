import { useQuery } from '@tanstack/react-query';

import {
  DEFAULT_COORDINATES,
  fetchWeather,
  type Coordinates,
} from '@/services/weather';

/**
 * Live weather for the given coordinates (defaults to DEFAULT_COORDINATES
 * until Epic 1 persists the profile location). Cached 15 min —
 * stale-while-revalidate, so Home renders instantly on repeat visits.
 */
export function useWeather(coords: Coordinates = DEFAULT_COORDINATES) {
  return useQuery({
    queryKey: ['weather', coords.latitude, coords.longitude],
    queryFn: () => fetchWeather(coords),
    staleTime: 15 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
    retry: 2,
    refetchOnWindowFocus: false,
  });
}
