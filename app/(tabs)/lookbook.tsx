import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { FlatList, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { StatusNote } from '@/components/closet/StatusNote';
import { useTabBarInset } from '@/components/navigation/FabTabBar';
import { LookbookTile } from '@/components/outfit/LookbookTile';
import { ConfirmSheet } from '@/components/ui/Sheet';
import { useDeleteLookbookEntry, useLookbookEntries } from '@/hooks/useLookbook';
import { friendlyError } from '@/utils/errors';
import { GRID_GAP, GRID_GUTTER, gridMetrics } from '@/utils/grid';
import { prefetchImages } from '@/utils/image';

/**
 * Saved-lookbook grid (issue #16). Its own bottom tab (issue #50); virtualized
 * (issue #18) so a long history scrolls smoothly.
 */
export default function LookbookScreen() {
  const { data: entries = [], isPending, isError, error, refetch } = useLookbookEntries();
  const remove = useDeleteLookbookEntry();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridMetrics(width);
  const tabBarInset = useTabBarInset();

  // Warm the disk cache for permanent thumbnails (legacy remote renders) so
  // the grid never flashes while scrolling. New AI renders and private signed
  // photos cache on render keyed by storage path, so they are intentionally
  // skipped (utils/image.ts).
  useEffect(() => {
    prefetchImages(
      entries
        .filter((e) => e.thumbnailUrl !== null && e.thumbnailKey === e.thumbnailUrl)
        .map((e) => e.thumbnailUrl),
    );
  }, [entries]);

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="w-full max-w-[1200px] flex-row items-center gap-3 self-center px-6 pb-3 pt-4">
        <View className="flex-1">
          <Text accessibilityRole="header" className="text-title-1 font-bold text-text">
            Lookbook
          </Text>
          <Text className="mt-0.5 text-footnote text-text-muted">
            {entries.length === 0
              ? 'Looks you save will live here.'
              : `${entries.length} saved ${entries.length === 1 ? 'look' : 'looks'}`}
          </Text>
        </View>
      </View>

      {isError && (
        <View className="w-full max-w-[1200px] self-center px-6 pb-3">
          <StatusNote
            tone="error"
            message={friendlyError(error, "Couldn't load your lookbook.")}
            action={{ label: 'Retry', onPress: () => refetch(), hint: 'Reloads saved looks' }}
          />
        </View>
      )}

      <FlatList
        // numColumns can't change on the fly — remount when it does (rotation).
        key={`cols-${columns}`}
        testID="lookbook-grid"
        data={entries}
        keyExtractor={(item) => item.id}
        numColumns={columns}
        renderItem={({ item }) => (
          <LookbookTile
            entry={item}
            width={tileWidth}
            onOpen={(entry) => router.push(`/outfit/${entry.id}`)}
            onDelete={setPendingDelete}
          />
        )}
        columnWrapperStyle={{ gap: GRID_GAP }}
        contentContainerStyle={{
          gap: GRID_GAP,
          paddingHorizontal: GRID_GUTTER,
          paddingTop: 12,
          paddingBottom: tabBarInset + 32,
          width: '100%',
          maxWidth: 1200,
          alignSelf: 'center',
          flexGrow: 1,
        }}
        ListEmptyComponent={
          isPending ? (
            <LookbookSkeleton columns={columns} tileWidth={tileWidth} />
          ) : (
            <View className="flex-1 items-center justify-center px-6 py-12">
              <Text accessibilityRole="header" className="text-title-3 font-semibold text-text">
                No saved looks yet
              </Text>
              <Text className="mt-2 max-w-sm text-center text-callout text-text-muted">
                Generate an outfit from Today, then tap Save to pin it here.
              </Text>
            </View>
          )
        }
        initialNumToRender={columns * 6}
        maxToRenderPerBatch={columns * 4}
        updateCellsBatchingPeriod={50}
        windowSize={7}
        removeClippedSubviews
      />

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
    </SafeAreaView>
  );
}

/**
 * Loading placeholder matching the grid geometry (no layout jump). Rendered as
 * the list's empty component, so the list's content container already supplies
 * the gutter, top padding and max width — adding them here again squeezes the
 * row below two tiles and collapses it to one column.
 */
function LookbookSkeleton({ columns, tileWidth }: { columns: number; tileWidth: number }) {
  return (
    <View
      accessibilityLabel="Loading your lookbook"
      accessibilityRole="progressbar"
      className="w-full flex-row flex-wrap"
      style={{ gap: GRID_GAP }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View
          key={i}
          style={{ width: tileWidth }}
          className="rounded-xl bg-surface shadow-md">
          <View className="w-full rounded-t-xl bg-border" style={{ aspectRatio: 3 / 4 }} />
          {/* Same footer as the real card: bars sit in boxes the height of the
              subhead / caption lines they stand in for, so nothing jumps. */}
          <View className="gap-1 px-3 pb-3 pt-2">
            <View className="h-5 justify-center">
              <View className="h-3.5 w-2/3 rounded-md bg-border" />
            </View>
            <View className="h-4 justify-center">
              <View className="h-3 w-1/3 rounded-md bg-border" />
            </View>
          </View>
        </View>
      ))}
    </View>
  );
}
