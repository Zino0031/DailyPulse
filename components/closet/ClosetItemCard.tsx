import { Image } from 'expo-image';
import { Shirt } from 'lucide-react-native';
import { memo, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { CATEGORY_LABEL, FORMALITY_LABEL } from '@/constants/wardrobe';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import type { ClosetItem } from '@/services/closet';
import { describeItem, toEditableTags } from '@/utils/closet';

import { ColorSwatch } from './ColorSwatch';

interface ClosetItemCardProps {
  item: ClosetItem;
  width: number;
  onPress: (item: ClosetItem) => void;
}

/**
 * Grid tile. Images are cached on disk by *storage path* (`cacheKey`), not
 * by URL: signed URLs rotate on every fetch, the photo doesn't — so scrolling
 * and offline launches never re-download (PRD §4 image caching).
 */
export const ClosetItemCard = memo(function ClosetItemCard({
  item,
  width,
  onPress,
}: ClosetItemCardProps) {
  const tokens = useThemeTokens();
  // Tracks the URI that failed, so a fresh signed URL gets a new attempt.
  const [failedUri, setFailedUri] = useState<string | null>(null);
  const failed = item.imageUri !== null && failedUri === item.imageUri;
  const { colors } = toEditableTags(item);
  const showImage = item.imageUri && !failed;

  return (
    <Pressable
      testID={`closet-item-${item.id}`}
      onPress={() => onPress(item)}
      disabled={item.pending}
      accessibilityRole="button"
      accessibilityLabel={`${describeItem(item)}${item.pending ? ', saving' : ''}`}
      accessibilityHint="Opens the item to edit its tags or delete it"
      accessibilityState={{ disabled: item.pending, busy: item.pending }}
      style={{ width }}
      className="overflow-hidden rounded-xl bg-surface shadow-md active:opacity-80">
      <View className="w-full bg-border/50" style={{ aspectRatio: 3 / 4 }}>
        {showImage ? (
          <Image
            source={{ uri: item.imageUri as string, cacheKey: item.image_url }}
            recyclingKey={item.id}
            cachePolicy="memory-disk"
            contentFit="cover"
            transition={200}
            priority="low"
            enforceEarlyResizing
            onError={() => setFailedUri(item.imageUri)}
            style={{ width: '100%', height: '100%' }}
            accessible={false}
          />
        ) : (
          <View className="flex-1 items-center justify-center gap-1">
            <Shirt size={28} strokeWidth={1.5} color={tokens.textSubtle} />
            <Text className="text-caption text-text-subtle">
              {failed ? 'Photo unavailable' : 'No photo'}
            </Text>
          </View>
        )}
        {item.pending && (
          <View className="absolute left-2 top-2 flex-row items-center gap-1 rounded-full bg-black/60 px-2 py-1">
            <ActivityIndicator size="small" color="#FFFFFF" />
            <Text className="text-caption font-medium text-white">Saving…</Text>
          </View>
        )}
      </View>
      <View className="gap-1 px-3 pb-3 pt-2">
        <Text numberOfLines={1} className="text-subhead font-semibold text-text">
          {CATEGORY_LABEL[item.category].one}
        </Text>
        <View className="flex-row items-center gap-2">
          <Text numberOfLines={1} className="shrink text-caption text-text-muted">
            {FORMALITY_LABEL[item.formality]}
          </Text>
          {colors.length > 0 && (
            <View className="flex-row gap-1">
              {colors.map((color) => (
                <ColorSwatch key={color} color={color} size={10} />
              ))}
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});
