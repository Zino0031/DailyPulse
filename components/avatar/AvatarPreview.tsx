import { User } from 'lucide-react-native';
import { Image } from 'expo-image';
import { View } from 'react-native';

import { useActiveAvatar } from '@/hooks/useAvatar';

/**
 * Active-avatar preview (Epic 2, issue #6). Reads the shared `useActiveAvatar`
 * query, so Home, onboarding, and (later) Profile never refetch the face.
 * Empty state follows DESIGN.md §7: circular, primary-tint fill.
 */
export function AvatarPreview({ size = 64 }: { size?: number }) {
  const { data: avatar } = useActiveAvatar();
  const imageUrl = avatar?.image_url ?? null;

  if (!imageUrl) {
    return (
      <View
        accessibilityRole="image"
        accessibilityLabel="No avatar yet"
        style={{ width: size, height: size }}
        className="items-center justify-center rounded-full bg-primary-tint">
        <User size={size * 0.45} strokeWidth={1.5} color="#5B47FB" />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={{ width: size, height: size, borderRadius: size / 2 }}
      cachePolicy="memory-disk"
      contentFit="cover"
      accessibilityLabel="Your avatar"
    />
  );
}
