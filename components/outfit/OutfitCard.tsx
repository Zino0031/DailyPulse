import { Image } from 'expo-image';
import { Sparkles } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import { useAiRender } from '@/hooks/useAiRender';
import { useClosetItem } from '@/hooks/useCloset';
import { showPaywall } from '@/store/usePaywallStore';
import { isRemoteUrl } from '@/services/closet';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import type { WardrobeItemRow } from '@/types/database';

/** `size` = fixed square; omitted = fills its share of the row (no overflow on narrow phones). */
function ItemPhoto({ item, size }: { item: WardrobeItemRow; size?: number }) {
  // `image_url` is a private storage path for uploaded items; the closet
  // cache holds the signed URL (also covers saved outfits read from the DB).
  const { item: cached } = useClosetItem(item.id);
  const uri = cached?.imageUri ?? (isRemoteUrl(item.image_url) ? item.image_url : null);
  return (
    <Image
      source={uri ? { uri, cacheKey: item.image_url } : null}
      style={
        size === undefined
          ? { flex: 1, aspectRatio: 1, maxWidth: 120, borderRadius: 12 }
          : { width: size, height: size, borderRadius: 12 }
      }
      className="bg-border"
      cachePolicy="memory-disk"
      contentFit="cover"
      // Hero tile: reset the view on id change (option switch) and give it
      // load priority over the surrounding chrome.
      recyclingKey={item.id}
      priority="high"
      transition={200}
      enforceEarlyResizing
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
      {render.previewCapped && !render.url && (
        <View className="mb-4">
          <Text className="text-center text-footnote text-text-muted">
            Daily previews used — photo board it is. More tomorrow.
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
              recyclingKey={board.key}
              priority="high"
              transition={250}
              enforceEarlyResizing
              onLoad={render.onLoad}
              onError={render.onError}
              accessibilityLabel="AI style preview of this outfit"
            />
          </View>
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <View className="rounded-full bg-primary-tint px-2 py-0.5">
              <Text className="text-caption font-medium text-primary">
                AI preview · illustrative
              </Text>
            </View>
            {render.quality === 'hd' ? (
              <View className="rounded-full bg-primary px-2 py-0.5">
                <Text className="text-caption font-semibold text-white">HD</Text>
              </View>
            ) : (
              <Pressable
                testID="outfit-hd-upsell"
                onPress={() => showPaywall('hd')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Standard quality. Get HD previews with Pro"
                accessibilityHint="Shows the Pro plan"
                className="rounded-full border border-border px-2 py-0.5">
                <Text className="text-caption font-medium text-text-muted">
                  Standard · <Text className="text-primary">HD with Pro</Text>
                </Text>
              </Pressable>
            )}
            {render.isLoading && (
              <Text className="ml-auto text-caption text-text-subtle">
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
        <ItemPhoto item={board.top} />
        <ItemPhoto item={board.bottom} />
        <ItemPhoto item={board.shoes} />
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
