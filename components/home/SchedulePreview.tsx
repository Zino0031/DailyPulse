import { Platform, Pressable, Text, View } from 'react-native';

import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import type { DressCode } from '@/services/calendar';

// Full literals so Tailwind generates every rule (never interpolate).
const TAG_DOT: Record<DressCode, string> = {
  formal: 'bg-mood-professional',
  business: 'bg-primary',
  romantic: 'bg-mood-creative',
  athletic: 'bg-mood-energetic',
  casual: 'bg-border',
};

function formatTime(date: Date): string {
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * Compact "next up" preview for Home (full list lives on the Calendar tab).
 * Always rendered — permission, loading, error and empty states all show
 * inline so the section never mysteriously disappears.
 */
export function SchedulePreview() {
  const { granted, unsupported, requestPermission, events, isLoading, isError, refetch } =
    useCalendarEvents();

  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      <View className="mb-3">
        <Text className="text-title-3 font-semibold text-text">
          Today&apos;s schedule
        </Text>
      </View>

      {isLoading && !unsupported && (
        <View>
          <View className="h-4 w-full rounded-md bg-border" />
          <View className="mt-2 h-4 w-2/3 rounded-md bg-border" />
        </View>
      )}

      {unsupported && (
        <Text className="text-footnote text-text-muted">
          Calendar sync needs a development build — Expo Go can&apos;t read
          calendars.
        </Text>
      )}

      {!isLoading && !unsupported && !granted && (
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-footnote text-text-muted">
            {Platform.OS === 'web'
              ? 'Calendar sync needs a real device — open this app in Expo Go to connect it.'
              : 'Connect your calendar to match outfits to your day.'}
          </Text>
          {Platform.OS !== 'web' && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Allow calendar access"
              onPress={() => requestPermission()}
              hitSlop={4}
              className="h-9 items-center justify-center rounded-full bg-primary px-4 active:bg-primary-pressed">
              <Text className="text-footnote font-medium text-white">Enable</Text>
            </Pressable>
          )}
        </View>
      )}

      {!isLoading && granted && isError && (
        <View className="flex-row items-center justify-between gap-2">
          <Text className="flex-1 text-footnote text-text-muted">
            Couldn&apos;t read your calendar.
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading events"
            onPress={() => refetch()}
            hitSlop={4}
            className="h-9 justify-center rounded-full px-3 active:bg-primary-tint">
            <Text className="text-footnote font-medium text-primary">
              Retry
            </Text>
          </Pressable>
        </View>
      )}

      {!isLoading && granted && !isError && events.length === 0 && (
        <Text className="text-footnote text-text-muted">
          Nothing scheduled — a free day.
        </Text>
      )}

      {!isLoading && granted && !isError && events.length > 0 && (
        <View className="gap-3">
          {events.slice(0, 3).map((event) => (
            <View key={event.id} className="flex-row items-center gap-2">
              <Text className="w-24 text-footnote text-text-muted">
                {event.allDay ? 'All day' : formatTime(event.startDate)}
              </Text>
              <View className={`h-2 w-2 rounded-full ${TAG_DOT[event.dressCode]}`} />
              <Text numberOfLines={1} className="flex-1 text-callout text-text">
                {event.title}
              </Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
