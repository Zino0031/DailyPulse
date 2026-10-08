// Open-Meteo weather service — free, keyless.
// Docs: https://open-meteo.com/en/docs
// Feeds the Daily Home screen + the outfit-picker prompt (PRD §3.3).

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Fallback until onboarding saves the profile location (Epic 1).
 * Callers should pass the user's stored coordinates when available.
 */
export const DEFAULT_COORDINATES: Coordinates = {
  latitude: 36.7538,
  longitude: 3.0588, // Algiers
};

export interface CurrentWeather {
  temperatureC: number;
  apparentTemperatureC: number;
  humidityPct: number;
  windSpeedKmh: number;
  weatherCode: number;
  isDay: boolean;
}

export interface DailyWeather {
  date: string;
  tempMaxC: number;
  tempMinC: number;
  precipitationProbabilityMaxPct: number | null;
  uvIndexMax: number | null;
  weatherCode: number;
}

export interface WeatherSummary {
  current: CurrentWeather;
  today: DailyWeather;
  timezone: string;
  fetchedAt: string;
}

interface OpenMeteoResponse {
  timezone: string;
  current: {
    temperature_2m: number;
    relative_humidity_2m: number;
    apparent_temperature: number;
    is_day: number;
    weather_code: number;
    wind_speed_10m: number;
  };
  daily: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
    uv_index_max: (number | null)[];
  };
}

const REQUEST_TIMEOUT_MS = 10_000;

export async function fetchWeather(
  coords: Coordinates,
  signal?: AbortSignal,
): Promise<WeatherSummary> {
  const params = new URLSearchParams({
    latitude: String(coords.latitude),
    longitude: String(coords.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max',
    timezone: 'auto',
    forecast_days: '1',
  });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`, {
      signal: signal ?? controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Open-Meteo request failed with status ${res.status}`);
    }
    const data = (await res.json()) as OpenMeteoResponse;
    return {
      current: {
        temperatureC: data.current.temperature_2m,
        apparentTemperatureC: data.current.apparent_temperature,
        humidityPct: data.current.relative_humidity_2m,
        windSpeedKmh: data.current.wind_speed_10m,
        weatherCode: data.current.weather_code,
        isDay: data.current.is_day === 1,
      },
      today: {
        date: data.daily.time[0],
        tempMaxC: data.daily.temperature_2m_max[0],
        tempMinC: data.daily.temperature_2m_min[0],
        precipitationProbabilityMaxPct:
          data.daily.precipitation_probability_max[0],
        uvIndexMax: data.daily.uv_index_max[0],
        weatherCode: data.daily.weather_code[0],
      },
      timezone: data.timezone,
      fetchedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timeout);
  }
}

/** Human label for a WMO weather code (https://open-meteo.com/en/docs). */
export function describeWeatherCode(code: number): string {
  if (code === 0) return 'Clear sky';
  if (code === 1) return 'Mainly clear';
  if (code === 2) return 'Partly cloudy';
  if (code === 3) return 'Overcast';
  if (code === 45 || code === 48) return 'Foggy';
  if (code >= 51 && code <= 57) return 'Drizzly';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82))
    return 'Rainy';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'Snowy';
  if (code >= 95) return 'Stormy';
  return 'Cloudy';
}
