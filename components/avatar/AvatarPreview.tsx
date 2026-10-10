import { useQuery } from '@tanstack/react-query';
import { User } from 'lucide-react-native';
import { Image } from 'expo-image';
import { Text, View } from 'react-native';

import { getSupabase, isSupabaseConfigured } from '@/services/supabase';

/**
 * Read-only active-avatar preview. Epic 2 (capture pipeline) builds the
 * write side; this only renders today's face for outfit boards.
 */
export function AvatarPreview({ size = 64 }: { size?: number }) {
  const { data: imageUrl } = useQuery({
    queryKey: ['active-avatar'],
    queryFn: async (): Promise<string | null> => {
      if (!isSupabaseConfigured()) return null;
      const supabase = getSupabase();
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return null;
      const { data: avatar } = await supabase
        .from('avatars')
        .select('image_url')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return avatar?.image_url ?? null;
    },
    staleTime: 10 * 60 * 1000,
    retry: 1,
    refetchOnWindowFocus: false,
  });

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
