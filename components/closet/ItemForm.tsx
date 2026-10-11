import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface ItemFormProps {
  /** Displayable image URI. */
  imageUri: string | null;
  /** Stable disk-cache key (storage path) when the image is remote. */
  cacheKey?: string;
  imageLabel: string;
  /** Status line under the photo (upload / AI progress, errors). */
  status?: ReactNode;
  children: ReactNode;
  /** Sticky action bar. */
  footer: ReactNode;
}

/** Shared layout for the add + edit modals: photo, status, tags, actions. */
export function ItemForm({ imageUri, cacheKey, imageLabel, status, children, footer }: ItemFormProps) {
  const insets = useSafeAreaInsets();
  return (
    <View className="flex-1 bg-bg">
      <ScrollView
        contentContainerClassName="w-full max-w-xl self-center px-6 pb-8 pt-4"
        keyboardShouldPersistTaps="handled">
        <View className="w-full max-w-xs self-center overflow-hidden rounded-xl bg-border/50 shadow-md">
          {imageUri ? (
            <Image
              source={{ uri: imageUri, cacheKey }}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={150}
              accessibilityLabel={imageLabel}
              style={{ width: '100%', aspectRatio: 3 / 4 }}
            />
          ) : (
            <View style={{ width: '100%', aspectRatio: 3 / 4 }} />
          )}
        </View>
        {status ? <View className="mt-4">{status}</View> : null}
        <View className="mt-6">{children}</View>
      </ScrollView>
      <View
        className="border-t border-border bg-surface px-6 pt-3"
        style={{ paddingBottom: Math.max(insets.bottom, 12) }}>
        <View className="w-full max-w-xl flex-row gap-3 self-center">{footer}</View>
      </View>
    </View>
  );
}
