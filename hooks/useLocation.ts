import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import type { Coordinates } from '@/services/weather';

export type LocationStatus =
  | 'loading'
  | 'granted'
  | 'denied'
  | 'unavailable'
  | 'error';

export interface DeviceLocation {
  coordinates: Coordinates | null;
  /** "City, Country" from reverse-geocode; null when unavailable. */
  placeLabel: string | null;
  status: LocationStatus;
  /** True when the OS won't show the prompt again — send user to Settings. */
  blocked: boolean;
  retry: () => void;
}

/**
 * One-shot GPS fix via expo-location (foreground only — no background
 * tracking, so no background permission dance). Returns null coordinates
 * when permission is denied / services off / fix fails; callers fall back
 * to DEFAULT_COORDINATES so the UI never blanks.
 */
export function useDeviceLocation(): DeviceLocation {
  const [coordinates, setCoordinates] = useState<Coordinates | null>(null);
  const [placeLabel, setPlaceLabel] = useState<string | null>(null);
  const [status, setStatus] = useState<LocationStatus>('loading');
  const [blocked, setBlocked] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Explicit retries (tap) may turn services on via the OS dialog;
        // the passive first run never interrupts the user.
        if (attempt > 0 && Platform.OS === 'android') {
          try {
            await Location.enableNetworkProviderAsync();
          } catch {
            // Declined — continue, the fix may still succeed.
          }
        }
        const servicesOn = await Location.hasServicesEnabledAsync();
        if (!servicesOn) {
          if (mounted) setStatus('unavailable');
          return;
        }
        const permission = await Location.requestForegroundPermissionsAsync();
        if (mounted) {
          setBlocked(!permission.granted && !permission.canAskAgain);
        }
        if (permission.status !== 'granted') {
          if (mounted) setStatus('denied');
          return;
        }
        const fix = await Location.getCurrentPositionAsync({
          // High for the one-shot fix: coarse fixes can land outside the
          // city polygon (e.g. in the bay), where even city-level
          // reverse-geocode has no city to return.
          accuracy: Location.Accuracy.High,
        });
        if (mounted) {
          setCoordinates({
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
          });
          setStatus('granted');
        }
        // Best-effort place name — never blocks the weather.
        if (mounted) {
          const label = await resolvePlaceLabel({
            latitude: fix.coords.latitude,
            longitude: fix.coords.longitude,
          });
          if (mounted && label) setPlaceLabel(label);
        }
      } catch {
        if (mounted) setStatus('error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [attempt]);

  const retry = useCallback(() => {
    setBlocked(false);
    setStatus('loading');
    setAttempt((n) => n + 1);
  }, []);

  return { coordinates, placeLabel, status, blocked, retry };
}

/**
 * "City, Country" for a fix. Native uses the OS geocoder; other platforms
 * (and native misses) fall back to keyless Nominatim. Null when unknown.
 */
export async function resolvePlaceLabel(coords: Coordinates): Promise<string | null> {
  let label: string | null = null;
  if (Platform.OS !== 'web') {
    try {
      const places = await Location.reverseGeocodeAsync(coords);
      const first = places[0];
      label = first
        ? [first.city ?? first.district ?? first.region, first.country]
            .filter(Boolean)
            .join(', ')
        : null;
    } catch {
      label = null;
    }
  }
  return label || reverseGeocodeWeb(coords);
}

export type LocateResult =
  | { ok: true; coordinates: Coordinates; label: string | null }
  | { ok: false; reason: 'denied' | 'blocked' | 'unavailable' | 'error' };

/**
 * One tap-triggered GPS fix + place name (onboarding location picker).
 * Unlike `useDeviceLocation`, nothing runs until the user asks.
 */
export async function locateOnce(): Promise<LocateResult> {
  try {
    if (Platform.OS === 'android') {
      try {
        await Location.enableNetworkProviderAsync();
      } catch {
        // Declined — the fix may still succeed.
      }
    }
    if (!(await Location.hasServicesEnabledAsync())) {
      return { ok: false, reason: 'unavailable' };
    }
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') {
      return { ok: false, reason: permission.canAskAgain ? 'denied' : 'blocked' };
    }
    const fix = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    const coordinates = { latitude: fix.coords.latitude, longitude: fix.coords.longitude };
    return { ok: true, coordinates, label: await resolvePlaceLabel(coordinates) };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

/**
 * Keyless web reverse-geocode (OpenStreetMap Nominatim, one occasional
 * request per GPS fix — within usage policy). Suburb zoom carries the
 * parent `city` even for coarse fixes near (or just outside) a city
 * polygon. Returns "City, Country" or null — display falls back to
 * raw coordinates.
 */
async function reverseGeocodeWeb(coords: Coordinates): Promise<string | null> {
  return reverseGeocodeAtZoom(coords, '14');
}

async function reverseGeocodeAtZoom(
  coords: Coordinates,
  zoom: string,
): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const params = new URLSearchParams({
      lat: String(coords.latitude),
      lon: String(coords.longitude),
      format: 'jsonv2',
      'accept-language': 'en',
      zoom,
    });
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      { signal: controller.signal },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      address?: {
        city?: string;
        town?: string;
        village?: string;
        suburb?: string;
        county?: string;
        state?: string;
        country?: string;
      };
    };
    // County/state last: covers land fixes outside any city polygon
    // (their wilaya/province usually names the metro area, e.g. Oran).
    const place =
      data.address?.city ||
      data.address?.town ||
      data.address?.village ||
      data.address?.suburb ||
      data.address?.county ||
      data.address?.state ||
      null;
    const label = [place, data.address?.country || null]
      .filter(Boolean)
      .join(', ');
    return label || null;
  } catch (error) {
    if (__DEV__) console.warn('[location] reverse-geocode failed:', error);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
