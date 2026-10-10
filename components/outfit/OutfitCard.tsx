import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import type { OutfitBoard } from '@/services/outfit';
import type { WardrobeItemRow } from '@/types/database';

function ItemPhoto({ item, size }: { item: WardrobeItemRow; size: number }) {
  return (
    <Image
      source={{ uri: item.image_url }}
      style={{ width: size, height: size, borderRadius: 12 }}
      cachePolicy="memory-disk"
      contentFit="cover"
      accessibilityLabel={`${item.category} in ${item.colors.join(', ') || 'unspecified colors'}`}
    />
  );
}

/**
 * Hero outfit board (DESIGN.md §7 Card): avatar wearing the pick, rendered
 * as the avatar + item photos with the why-it-works reasons. The AI image
 * render (#15 follow-up) swaps this body for generated imagery — the card
 * chrome and actions stay the same.
 */
export function OutfitCard({ board }: { board: OutfitBoard }) {
  const extras = [board.outerwear, board.accessory].filter(
    (item): item is WardrobeItemRow => item !== null,
  );
  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      <View className="flex-row items-center gap-4">
        <AvatarPreview size={64} />
        <View className="flex-1">
          <Text className="text-title-3 font-semibold text-text">
            Today&apos;s pick
          </Text>
          <Text className="mt-1 text-footnote text-text-muted">
            {board.reasons[0] ?? 'Styled for your day'}
          </Text>
        </View>
      </View>
      <View className="mt-4 flex-row gap-2">
        <ItemPhoto item={board.top} size={96} />
        <ItemPhoto item={board.bottom} size={96} />
        <ItemPhoto item={board.shoes} size={96} />
      </View>
      {extras.length > 0 && (
        <View className="mt-2 flex-row gap-2">
          {extras.map((item) => (
            <ItemPhoto key={item.id} item={item} size={64} />
          ))}
        </View>
      )}
      {board.reasons.length > 1 && (
        <View className="mt-4 gap-1">
          {board.reasons.slice(1).map((reason) => (
            <Text key={reason} className="text-footnote text-text-muted">
              · {reason}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}
