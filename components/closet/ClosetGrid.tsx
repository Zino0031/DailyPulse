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
  /** Extra bottom padding, e.g. for a tab bar floating over the grid. */
  bottomInset?: number;
}

/** Responsive, virtualized closet grid with pull-to-refresh. */
export function ClosetGrid({
  items,
  onPressItem,
  refreshing,
  onRefresh,
  ListEmptyComponent,
  bottomInset = 0,
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
        paddingBottom: bottomInset + 32,
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
export function ClosetGridSkeleton({ bottomInset = 0 }: { bottomInset?: number }) {
  const { width } = useWindowDimensions();
  const { columns, tileWidth } = gridMetrics(width);
  return (
    <View
      accessibilityLabel="Loading your closet"
      accessibilityRole="progressbar"
      className="w-full flex-row flex-wrap self-center"
      style={{
        gap: GAP,
        paddingHorizontal: GUTTER,
        paddingTop: 12,
        paddingBottom: bottomInset + 32,
        maxWidth: MAX_CONTENT,
      }}>
      {Array.from({ length: columns * 2 }, (_, i) => (
        <View key={i} style={{ width: tileWidth }} className="rounded-xl bg-surface shadow-md">
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
