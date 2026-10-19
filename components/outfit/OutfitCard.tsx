import { Image } from 'expo-image';
import { Sparkles } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { AvatarPreview } from '@/components/avatar/AvatarPreview';
import { Button } from '@/components/ui/Button';
import { useAiRender } from '@/hooks/useAiRender';
import { useClosetItem } from '@/hooks/useCloset';
import { usePlan, usePreviewUsage } from '@/hooks/useSubscription';
import { BRAND } from '@/hooks/useThemeTokens';
import { isRemoteUrl } from '@/services/closet';
import type { OutfitBoard, OutfitContext } from '@/services/outfit';
import { showPaywall } from '@/store/usePaywallStore';
import type { WardrobeItemRow } from '@/types/database';
import { allowanceOf, paywallCopy, previewsLine } from '@/utils/subscription';

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

/** Live-region alert: the boxes below appear without the user tapping anything. */
function Notice({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={`mb-4 gap-2 rounded-xl bg-border px-4 py-3 ${className}`}>
      {children}
    </View>
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
  onPreviewPersisted,
}: {
  board: OutfitBoard;
  ctx: OutfitContext;
  /** Called with the outfit row a preview attached to, so Save reuses it. */
  onPreviewPersisted?: (outfitId: string) => void;
}) {
  const render = useAiRender(board, ctx, onPreviewPersisted);
  const { plan, tier } = usePlan();
  const previews = usePreviewUsage();
  // A next plan exists only for Free → Plus and Plus → Pro. Pro has nothing
  // to buy, so it must never be shown an upgrade CTA (issue #46).
  const canUpgrade = paywallCopy('preview', tier).highlight !== null;
  const extras = [board.outerwear, board.accessory].filter(
    (item): item is WardrobeItemRow => item !== null,
  );
  return (
    <View className="rounded-xl bg-surface p-5 shadow-md">
      {!render.started && (
        <View className="mb-4 gap-1">
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Generate AI preview"
            onPress={() => render.generate()}
            className="h-11 flex-row items-center justify-center gap-2 rounded-full border border-border bg-surface px-6 active:bg-primary-tint">
            <Sparkles size={18} strokeWidth={1.5} color={BRAND.primary} />
            <Text className="text-headline text-primary">Preview with AI</Text>
          </Pressable>
          <Text testID="outfit-preview-allowance" className="text-center text-caption text-text-subtle">
            {previewsLine(plan, previews)}
          </Text>
        </View>
      )}
      {render.started && render.isLoading && !render.url && (
        <View className="mb-4 flex-row items-center justify-center gap-3 rounded-xl bg-border px-6 py-4">
          <ActivityIndicator size="small" color={BRAND.primary} />
          <View>
            <Text className="text-footnote text-text-muted">Rendering your preview…</Text>
            <Text className="text-caption text-text-subtle">Can take up to a minute.</Text>
          </View>
        </View>
      )}
      {render.previewCapped && !render.url && (
        <Notice>
          <Text className="text-center text-footnote text-text-muted">
            {paywallCopy('preview', tier).title}
          </Text>
          <Text className="text-center text-caption text-text-subtle">
            {previewsLine(
              plan,
              allowanceOf(
                plan.dailyPreviews,
                render.previewUsage?.used ?? plan.dailyPreviews ?? 0,
              ),
            )}
          </Text>
          {canUpgrade && (
            <Button
              testID="outfit-preview-upgrade"
              label="Get more previews"
              accessibilityHint="Shows the plans"
              onPress={() => showPaywall('preview')}
            />
          )}
        </Notice>
      )}
      {render.failure === 'engine' && !render.url && (
        <Notice>
          <Text className="text-center text-footnote text-text-muted">
            AI preview is unavailable right now.
          </Text>
          <Text className="text-center text-caption text-text-subtle">
            Your preview wasn&apos;t counted — try again in a moment.
          </Text>
          <View className="flex-row flex-wrap justify-center gap-2">
            <Button
              testID="outfit-preview-retry"
              label="Try again"
              accessibilityHint="Tries the AI preview again"
              onPress={render.retry}
              className="flex-1"
            />
            {canUpgrade && (
              <Button
                testID="outfit-preview-see-plans"
                label="See plans"
                variant="secondary"
                accessibilityHint="Shows the plans"
                onPress={() => showPaywall('preview')}
                className="flex-1"
              />
            )}
          </View>
        </Notice>
      )}
      {render.failure === 'sign_in' && !render.url && (
        <Notice>
          <Text className="text-center text-footnote text-text-muted">
            Sign in to preview this outfit with AI.
          </Text>
        </Notice>
      )}
      {render.failure === 'outfit' && !render.url && (
        <Notice>
          <Text className="text-center text-footnote text-text-muted">
            This outfit can&apos;t be previewed right now.
          </Text>
        </Notice>
      )}
      {render.url && render.imageFailed && (
        <Notice>
          <Text className="text-center text-footnote text-text-muted">
            Your preview was generated, but the image didn&apos;t load.
          </Text>
          <Button
            testID="outfit-preview-reload"
            label="Reload image"
            variant="secondary"
            accessibilityHint="Loads the preview again without using another preview"
            onPress={render.reloadImage}
          />
        </Notice>
      )}
      {render.url && !render.imageFailed && (
        <View className="mb-4">
          <View className="overflow-hidden rounded-lg bg-border">
            <Image
              key={render.imageRetryKey}
              source={{ uri: render.url }}
              style={{ width: '100%', aspectRatio: 3 / 4 }}
              cachePolicy={render.imageRetryKey > 0 ? 'none' : 'memory-disk'}
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
            ) : plan.renderQuality !== 'hd' ? (
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
            ) : (
              // Pro render that fell back to schnell: neutral chip, never an
              // upsell to a plan the user already owns.
              <View className="rounded-full border border-border px-2 py-0.5">
                <Text
                  accessibilityLabel="Standard quality. HD wasn't available for this render."
                  className="text-caption font-medium text-text-muted">
                  Standard
                </Text>
              </View>
            )}
            {render.isLoading && (
              <Text className="ml-auto text-caption text-text-subtle">Rendering…</Text>
            )}
          </View>
          {!render.isLoading && (
            <Pressable
              testID="outfit-preview-regenerate"
              accessibilityRole="button"
              accessibilityLabel="Regenerate AI preview"
              accessibilityHint="Renders a new preview and replaces the saved image"
              onPress={() => render.generate()}
              className="mt-2 self-start rounded-full px-3 py-1.5">
              <Text className="text-callout font-medium text-primary">
                Regenerate preview
              </Text>
            </Pressable>
          )}
        </View>
      )}
      <View className="flex-row items-center gap-4">
        <AvatarPreview size={64} />
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-title-3 font-semibold text-text">Today&apos;s pick</Text>
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
