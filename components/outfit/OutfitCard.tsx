import { Image } from 'expo-image';
import { Sparkles } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import { useAiRender } from '@/hooks/useAiRender';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
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
export function OutfitCard({
  board,
  ctx,
}: {
  board: OutfitBoard;
  ctx: OutfitContext;
}) {
  const render = useAiRender(board, ctx);
  const extras = [board.outerwear, board.accessory].filter(
    (item): item is WardrobeItemRow => item !== null,
  );
  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      {!render.started && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Generate AI preview"
          onPress={() => render.generate()}
          className="mb-4 h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-surface px-6">
          <Sparkles size={18} strokeWidth={1.5} color="#5B47FB" />
          <Text className="text-headline text-primary">Preview with AI</Text>
        </Pressable>
      )}
      {render.started && !render.url && (
        <View className="mb-4 flex-row items-center justify-center gap-2 rounded-xl bg-border px-6 py-4">
          <Text className="text-footnote text-text-muted">
            Rendering your preview…
          </Text>
        </View>
      )}
      {render.url && (
        <View className="mb-4">
          <View className="overflow-hidden rounded-lg bg-border">
            <Image
              source={{ uri: render.url }}
              style={{ width: '100%', aspectRatio: 3 / 4 }}
              cachePolicy="memory-disk"
              contentFit="cover"
              onLoad={render.onLoad}
              onError={render.onError}
              accessibilityLabel="AI style preview of this outfit"
            />
          </View>
          <View className="mt-2 flex-row items-center justify-between">
            <View className="rounded-full bg-primary-tint px-2 py-0.5">
              <Text className="text-caption font-medium text-primary">
                AI preview · illustrative
              </Text>
            </View>
            {render.isLoading && (
              <Text className="text-caption text-text-subtle">
                Rendering…
              </Text>
            )}
          </View>
        </View>
      )}
      <View className="flex-row items-center gap-4">
        <AvatarPreview size={64} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-title-3 font-semibold text-text">
              Today&apos;s pick
            </Text>
            <View
              className={`rounded-full px-2 py-0.5 ${
                board.source === 'ai' ? 'bg-primary-tint' : 'bg-border'
              }`}>
              <Text
                className={`text-caption font-medium ${
                  board.source === 'ai' ? 'text-primary' : 'text-text-muted'
                }`}>
                {board.source === 'ai' ? 'AI styled' : 'On-device'}
              </Text>
            </View>
          </View>
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
