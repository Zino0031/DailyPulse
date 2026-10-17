import type { ReactElement } from 'react';
import { FlatList, RefreshControl, View, useWindowDimensions } from 'react-native';

import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { ClosetItem } from '@/services/closet';
import { GRID_GAP as GAP, GRID_GUTTER as GUTTER, gridMetrics } from '@/utils/grid';

import { ClosetItemCard } from './ClosetItemCard';

const MAX_CONTENT = 1200; // keeps tiles sane on desktop web / tablets

interface ClosetGridProps {
  items: ClosetItem[];
  onPressItem: (item: ClosetItem) => void;
  refreshing: boolean;
  onRefresh: () => void;
  ListEmptyComponent?: ReactElement;
}

/** Responsive, virtualized closet grid with pull-to-refresh. */
export function ClosetGrid({
  items,
  onPressItem,
  refreshing,
  onRefresh,
  ListEmptyComponent,
}: ClosetGridProps) {
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridMetrics(width);
  const tokens = useThemeTokens();

  return (
    <FlatList
      // numColumns can't change on the fly — remount when it does (rotation).
      key={`cols-${columns}`}
      testID="closet-grid"
      data={items}
      keyExtractor={(item) => item.id}
      numColumns={columns}
      renderItem={({ item }) => (
        <ClosetItemCard item={item} width={tileWidth} onPress={onPressItem} />
      )}
      columnWrapperStyle={{ gap: GAP }}
      contentContainerStyle={{
        gap: GAP,
        paddingHorizontal: GUTTER,
        paddingTop: 12,
        paddingBottom: 32,
        width: '100%',
        maxWidth: MAX_CONTENT,
        alignSelf: 'center',
        flexGrow: 1,
      }}
      ListEmptyComponent={ListEmptyComponent}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={tokens.primary}
          colors={[tokens.primary]}
          title="Refreshing closet"
        />
      }
      initialNumToRender={columns * 6}
      maxToRenderPerBatch={columns * 4}
      updateCellsBatchingPeriod={50}
      windowSize={7}
      removeClippedSubviews
    />
  );
}

/** Loading placeholder matching the real grid's geometry (no layout jump). */
export function ClosetGridSkeleton() {
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridMetrics(width);
  return (
    <View
      accessibilityLabel="Loading your closet"
      accessibilityRole="progressbar"
      className="w-full flex-row flex-wrap self-center"
      style={{ gap: GAP, paddingHorizontal: GUTTER, paddingTop: 12, maxWidth: MAX_CONTENT }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: tileWidth }} className="overflow-hidden rounded-xl bg-surface shadow-md">
          <View className="w-full bg-border" style={{ aspectRatio: 3 / 4 }} />
          <View className="gap-2 p-3">
            <View className="h-3.5 w-2/3 rounded-md bg-border" />
            <View className="h-3 w-1/3 rounded-md bg-border" />
          </View>
        </View>
      ))}
    </View>
  );
}
