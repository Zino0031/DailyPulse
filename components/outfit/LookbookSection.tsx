import { router } from 'expo-router';
import { Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { StatusNote } from '@/components/closet/StatusNote';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useDeleteLookbookEntry, useLookbookEntries } from '@/hooks/useLookbook';
import { friendlyError } from '@/utils/errors';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(today)) return 'Today';
  if (day(d) === day(yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

/**
 * Weekly lookbook (issue #16): saved outfits grid on the profile screen.
 * Tap opens the existing saved outfit view; trash deletes with confirm.
 */
export function LookbookSection() {
  const { data: entries = [], isPending, isError, error, refetch } = useLookbookEntries();
  const remove = useDeleteLookbookEntry();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  return (
    <View className="mt-8">
      <Text accessibilityRole="header" className="text-title-3 font-semibold text-text">
        Your lookbook
      </Text>
      <Text className="mt-1 text-footnote text-text-muted">
        {entries.length === 0
          ? 'Looks you save will live here.'
          : `${entries.length} saved ${entries.length === 1 ? 'look' : 'looks'}`}
      </Text>

      {isPending && (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {[0, 1, 2, 3].map((i) => (
            <View key={i} className="h-44 w-[48%] rounded-xl bg-border" />
          ))}
        </View>
      )}

      {!isPending && isError && (
        <View className="mt-4">
          <StatusNote
            tone="error"
            message={friendlyError(error, "Couldn't load your lookbook.")}
            action={{ label: 'Retry', onPress: () => refetch(), hint: 'Reloads saved looks' }}
          />
        </View>
      )}

      {!isPending && !isError && entries.length === 0 && (
        <View className="mt-4 rounded-xl border border-border bg-surface p-5">
          <Text className="text-callout text-text">No saved looks yet</Text>
          <Text className="mt-1 text-footnote text-text-muted">
            Generate an outfit from Today, then tap Save to pin it here.
          </Text>
        </View>
      )}

      {!isPending && !isError && entries.length > 0 && (
        <View className="mt-4 flex-row flex-wrap gap-2">
          {entries.map((entry) => (
            <Pressable
              key={entry.id}
              accessibilityRole="button"
              accessibilityLabel={`Open saved look from ${formatDate(entry.createdAt)}`}
              onPress={() => router.push(`/outfit/${entry.id}`)}
              className="relative mb-2 w-[48%]">
              {entry.thumbnailUrl ? (
                <Image
                  source={{ uri: entry.thumbnailUrl, cacheKey: entry.thumbnailKey ?? undefined }}
                  style={{ width: '100%', aspectRatio: 3 / 4, borderRadius: 12 }}
                  cachePolicy="memory-disk"
                  contentFit="cover"
                />
              ) : (
                <View
                  className="items-center justify-center rounded-xl bg-border"
                  style={{ width: '100%', aspectRatio: 3 / 4 }}>
                  <Text className="text-footnote text-text-muted">No preview</Text>
                </View>
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Delete this saved look"
                onPress={() => setPendingDelete(entry.id)}
                className="absolute right-1 top-1 h-8 w-8 items-center justify-center rounded-full bg-danger shadow-sm">
                <Trash2 size={14} strokeWidth={2} color="#FFFFFF" />
              </Pressable>
              <Text className="mt-1 text-footnote font-medium text-text">
                {formatDate(entry.createdAt)}
              </Text>
              <Text numberOfLines={1} className="text-caption text-text-muted">
                {[entry.mood, entry.dressCode].filter(Boolean).join(' · ') ||
                  `${entry.itemCount} pieces`}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      <ConfirmSheet
        visible={pendingDelete !== null}
        title="Delete this look?"
        message="It's removed from your lookbook for good."
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (pendingDelete) remove.mutate(pendingDelete);
          setPendingDelete(null);
        }}
        onCancel={() => setPendingDelete(null)}
      />
    </View>
  );
}
