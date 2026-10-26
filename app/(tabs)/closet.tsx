import { router } from 'expo-router';
import { Plus, Shirt } from 'lucide-react-native';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AddItemSheet } from '@/components/closet/AddItemSheet';
import { CategoryFilter } from '@/components/closet/CategoryFilter';
import { ClosetGrid, ClosetGridSkeleton } from '@/components/closet/ClosetGrid';
import { ClosetMutationNotice } from '@/components/closet/ClosetMutationNotice';
import { useTabBarInset } from '@/components/navigation/FabTabBar';
import { StatusNote } from '@/components/closet/StatusNote';
import { Button } from '@/components/ui/Button';
import { CATEGORY_LABEL } from '@/constants/wardrobe';
import { useClosetItems } from '@/hooks/useCloset';
import { useClosetCapacity, usePlan } from '@/hooks/useSubscription';
import { BRAND } from '@/hooks/useThemeTokens';
import type { ClosetItem, LocalPhoto } from '@/services/closet';
import { useAuthStore } from '@/store/useAuthStore';
import { showPaywall } from '@/store/usePaywallStore';
import { countByCategory, filterItems, type CategoryFilter as Filter } from '@/utils/closet';
import { friendlyError, isNetworkError } from '@/utils/errors';
import { closetNotice } from '@/utils/subscription';

/** Digital wardrobe (PRD §3.2): browse, filter, add, edit, delete. */
export default function ClosetScreen() {
  const signedIn = useAuthStore((s) => s.user !== null);
  const { data, isPending, isError, error, refetch, isRefetching } = useClosetItems();
  const [filter, setFilter] = useState<Filter>('all');
  const [addOpen, setAddOpen] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);

  const items = useMemo(() => data ?? [], [data]);
  const counts = useMemo(() => countByCategory(items), [items]);
  const visible = useMemo(() => filterItems(items, filter), [items, filter]);
  const { plan } = usePlan();
  const tabBarInset = useTabBarInset();
  const capacity = useClosetCapacity();
  const capacityNote = data ? closetNotice(plan, items.length) : null;

  const openItem = useCallback((item: ClosetItem) => {
    router.push({ pathname: '/item/[id]', params: { id: item.id } });
  }, []);

  const onPicked = (photo: LocalPhoto) => {
    setPickError(null);
    router.push({
      pathname: '/item/new',
      params: { uri: photo.uri, width: String(photo.width), height: String(photo.height) },
    });
  };

  // At capacity the paywall explains why instead of a save that would fail.
  const openAdd = () => {
    setPickError(null);
    if (capacity.atLimit) {
      showPaywall('closet_full');
      return;
    }
    setAddOpen(true);
  };
  const addHint = capacity.atLimit
    ? `Your closet is full on ${plan.name} — shows plans with more room`
    : 'Take or choose a photo of a clothing item';

  const subtitle = !data
    ? 'Your digital wardrobe'
    : items.length === 0
      ? 'Add your first piece to get outfit ideas'
      : `${capacity.limit === null ? items.length : `${items.length} of ${capacity.limit}`} ${
          items.length === 1 && capacity.limit === null ? 'item' : 'items'
        }${
          filter === 'all' ? '' : ` · showing ${counts[filter]} ${CATEGORY_LABEL[filter].many.toLowerCase()}`
        }`;

  return (
    <SafeAreaView edges={['top']} className="flex-1 bg-bg">
      <View className="w-full max-w-[1200px] flex-row items-center gap-4 self-center px-6 pb-3 pt-4">
        <View className="flex-1">
          <Text accessibilityRole="header" className="text-title-1 font-bold text-text">
            Closet
          </Text>
          <Text className="mt-0.5 text-footnote text-text-muted">{subtitle}</Text>
        </View>
        {signedIn && (
          <Button
            testID="closet-add"
            label="Add item"
            icon={Plus}
            size="sm"
            onPress={openAdd}
            accessibilityHint={addHint}
          />
        )}
      </View>

      <View className="w-full max-w-[1200px] gap-2 self-center px-6">
        {pickError && (
          <StatusNote tone="error" message={pickError} onDismiss={() => setPickError(null)} />
        )}
        {isError && data && (
          <StatusNote
            tone={isNetworkError(error) ? 'offline' : 'error'}
            testID="closet-stale-notice"
            message={
              isNetworkError(error)
                ? "You're offline — showing your saved closet."
                : "Couldn't refresh your closet — showing what was saved."
            }
            action={{ label: 'Retry', onPress: () => refetch(), hint: 'Reloads your closet' }}
          />
        )}
        {capacityNote && (
          <StatusNote
            tone="warning"
            testID="closet-capacity-notice"
            message={capacityNote}
            action={{
              label: 'See plans',
              onPress: () => showPaywall(capacity.atLimit ? 'closet_full' : 'upgrade'),
              hint: 'Compares plans with more closet space',
            }}
          />
        )}
        <ClosetMutationNotice />
      </View>

      {!signedIn ? (
        <EmptyState
          title="Sign in to see your closet"
          body="Your wardrobe is saved to your account so it follows you across devices."
        />
      ) : isPending ? (
        <ClosetGridSkeleton />
      ) : isError && !data ? (
        <EmptyState
          title="Couldn't load your closet"
          body={friendlyError(error, 'Something went wrong on our side. Please try again.')}
          action={<Button label="Try again" variant="secondary" onPress={() => refetch()} />}
        />
      ) : (
        <>
          {items.length > 0 && (
            <View className="w-full max-w-[1200px] self-center">
              <CategoryFilter value={filter} counts={counts} onChange={setFilter} />
            </View>
          )}
          <ClosetGrid
            items={visible}
            onPressItem={openItem}
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            bottomInset={tabBarInset}
            ListEmptyComponent={
              items.length === 0 ? (
                <EmptyState
                  title="Your closet is empty"
                  body="Snap a photo of a top, shoes or anything you wear — we'll tag it for you so outfits can use it."
                  action={
                    <Button
                      testID="closet-empty-add"
                      label="Add your first item"
                      icon={Plus}
                      size="lg"
                      onPress={openAdd}
                    />
                  }
                />
              ) : filter !== 'all' ? (
                <EmptyState
                  title={`No ${CATEGORY_LABEL[filter].many.toLowerCase()} yet`}
                  body="Add one, or switch back to see everything."
                  action={
                    <View className="flex-row flex-wrap justify-center gap-3">
                      <Button label="Show all" variant="secondary" onPress={() => setFilter('all')} />
                      <Button label="Add item" icon={Plus} onPress={openAdd} />
                    </View>
                  }
                />
              ) : undefined
            }
          />
        </>
      )}

      <AddItemSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onPicked={onPicked}
        onError={setPickError}
      />
    </SafeAreaView>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View className="flex-1 items-center justify-center px-6 py-12">
      <View className="mb-4 h-16 w-16 items-center justify-center rounded-full bg-primary-tint">
        <Shirt size={28} strokeWidth={1.5} color={BRAND.primary} />
      </View>
      <Text accessibilityRole="header" className="text-center text-title-3 font-semibold text-text">
        {title}
      </Text>
      <Text className="mt-2 max-w-sm text-center text-callout text-text-muted">{body}</Text>
      {action ? <View className="mt-6">{action}</View> : null}
    </View>
  );
}
