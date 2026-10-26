import { Image } from 'expo-image';
import { Trash2 } from 'lucide-react-native';
import { Pressable, Text, View } from 'react-native';

import type { LookbookEntry } from '@/hooks/useLookbook';

function formatDate(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const day = (x: Date) => x.toDateString();
  if (day(d) === day(today)) return 'Today';
  if (day(d) === day(yesterday)) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

interface LookbookTileProps {
  entry: LookbookEntry;
  /** Fixed tile width for virtualized grids; omit to fill the parent. */
  width?: number;
  onOpen: (entry: LookbookEntry) => void;
  onDelete: (id: string) => void;
}

/**
 * One saved look (issue #16). Shared by the profile preview and the full
 * virtualized lookbook screen. Thumbnails cache by storage path (`cacheKey`)
 * so rotating signed URLs never re-download — same rule as the closet grid.
 */
export function LookbookTile({ entry, width, onOpen, onDelete }: LookbookTileProps) {
  return (
    // The delete control is a sibling, not a child, of the open action:
    // react-native-web renders `accessibilityRole="button"` as a real
    // <button>, and nesting one <button> inside another is invalid DOM
    // (React logs a hydration error on web).
    // Card anatomy matches LookbookSkeleton and the closet ClosetItemCard:
    // 3:4 photo on top, title + meta in a p-3 footer. The shadow sits on the
    // outer view; clipping is on an inner one (overflow-hidden on the
    // shadowed view would hide its iOS shadow).
    <View
      style={width === undefined ? undefined : { width }}
      className={`relative rounded-xl bg-surface shadow-md${width === undefined ? ' w-full' : ''}`}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Open saved look from ${formatDate(entry.createdAt)}`}
        onPress={() => onOpen(entry)}
        className="active:opacity-80">
        <View className="overflow-hidden rounded-xl">
          {entry.thumbnailUrl ? (
            <Image
              source={{ uri: entry.thumbnailUrl, cacheKey: entry.thumbnailKey ?? undefined }}
              recyclingKey={entry.id}
              style={{ width: '100%', aspectRatio: 3 / 4 }}
              cachePolicy="memory-disk"
              contentFit="cover"
              transition={200}
              priority="low"
              enforceEarlyResizing
            />
          ) : (
            <View
              className="items-center justify-center bg-border/50"
              style={{ width: '100%', aspectRatio: 3 / 4 }}>
              <Text className="text-caption text-text-subtle">No preview</Text>
            </View>
          )}
          <View className="gap-1 px-3 pb-3 pt-2">
            <Text numberOfLines={1} className="text-subhead font-semibold text-text">
              {formatDate(entry.createdAt)}
            </Text>
            <Text numberOfLines={1} className="text-caption capitalize text-text-muted">
              {[entry.mood, entry.dressCode].filter(Boolean).join(' · ') ||
                `${entry.itemCount} pieces`}
            </Text>
          </View>
        </View>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete this saved look"
        onPress={() => onDelete(entry.id)}
        hitSlop={8}
        className="absolute right-2 top-2 h-8 w-8 items-center justify-center rounded-full bg-danger shadow-sm">
        <Trash2 size={14} strokeWidth={2} color="#FFFFFF" />
      </Pressable>
    </View>
  );
}
