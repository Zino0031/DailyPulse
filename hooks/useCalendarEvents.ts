import * as Calendar from 'expo-calendar';
import Constants from 'expo-constants';
import { useQuery } from '@tanstack/react-query';
import { Platform } from 'react-native';

import {
  dominantDressCode,
  tagEvent,
  type DressCode,
  type TaggedEvent,
} from '@/services/calendar';

function dayBounds(now: Date): { start: Date; end: Date } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

async function fetchTodayEvents(): Promise<TaggedEvent[]> {
  const { start, end } = dayBounds(new Date());
  const calendars = await Calendar.getCalendars();
  if (calendars.length === 0) return [];
  const ids = calendars.map((calendar) => calendar.id);
  const raw = await Calendar.listEvents(ids, start, end);
  return raw
    .map((event, index) => ({
      id: event.id ?? `event-${index}`,
      title: event.title?.trim() || 'Untitled event',
      startDate: new Date(event.startDate),
      endDate: new Date(event.endDate),
      location: event.location ?? null,
      allDay: event.allDay ?? false,
      dressCode: tagEvent(event.title ?? '', event.location),
    }))
    .sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
}

/**
 * Today's device calendar events with dress-code tags. Permission is
 * requested explicitly (never silently); denial and platform gaps
 * (web/Expo Go stubs) surface as states the screen renders.
 */
export function useCalendarEvents() {
  const [permission, requestPermission] = Calendar.useCalendarPermissions();
  const granted = permission?.granted ?? false;
  // SDK 57's calendar API is stubbed inside Expo Go (every method throws),
  // so no permission or event state can ever resolve there.
  const unsupported =
    Constants.appOwnership === 'expo' && Platform.OS !== 'web';

  const eventsQuery = useQuery({
    queryKey: ['calendar-events-today'],
    queryFn: fetchTodayEvents,
    enabled: granted && !unsupported,
    staleTime: 5 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

  return {
    permissionStatus: permission?.status ?? 'undetermined',
    granted,
    unsupported,
    requestPermission,
    events: eventsQuery.data ?? [],
    isLoading: (!permission || eventsQuery.isLoading) && !unsupported,
    isError: eventsQuery.isError,
    refetch: eventsQuery.refetch,
  };
}

/** Day-level tag for the outfit-picker prompt builder (Epic 5). */
export function useDominantDressCode(): DressCode | null {
  const { granted, events, isLoading } = useCalendarEvents();
  if (!granted || isLoading || events.length === 0) return null;
  return dominantDressCode(events);
}
