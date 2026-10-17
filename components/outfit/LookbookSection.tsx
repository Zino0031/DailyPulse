import { router, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { StatusNote } from '@/components/closet/StatusNote';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useDeleteLookbookEntry, useLookbookEntries } from '@/hooks/useLookbook';
import { friendlyError } from '@/utils/errors';

import { LookbookTile } from './LookbookTile';

/** Profile shows a short preview; the full grid lives on /lookbook (virtualized). */
const PREVIEW_COUNT = 4;

/**
 * Weekly lookbook (issue #16) preview on the profile screen. Keeps the profile
 * ScrollView light — the full, virtualized grid is one tap away (issue #18).
 */
export function LookbookSection() {
  const { data: entries = [], isPending, isError, error, refetch } = useLookbookEntries();
  const remove = useDeleteLookbookEntry();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  const preview = entries.slice(0, PREVIEW_COUNT);
  const remaining = entries.length - preview.length;

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
        <>
          <View className="mt-4 flex-row flex-wrap gap-2">
            {preview.map((entry) => (
              <View key={entry.id} className="mb-2 w-[48%]">
                <LookbookTile
                  entry={entry}
                  onOpen={() => router.push(`/outfit/${entry.id}`)}
                  onDelete={setPendingDelete}
                />
              </View>
            ))}
          </View>
          {remaining > 0 && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`View all ${entries.length} saved looks`}
              onPress={() => router.push('/lookbook' as Href)}
              className="mt-2 h-11 items-center justify-center rounded-full border border-border bg-surface px-6">
              <Text className="text-headline text-text">View all ({entries.length})</Text>
            </Pressable>
          )}
        </>
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
