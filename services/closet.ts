// Closet data access — Supabase table `wardrobe_items` + private `wardrobe`
// storage bucket (PRD §3.2). `image_url` stores the storage *path*
// (`<user-id>/<file>.jpg`); readable URLs are short-lived signed URLs
// minted per fetch. The UI caches images by path so new signatures never
// re-download a photo (see components/closet/ClosetItemCard.tsx).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getSupabase } from '@/services/supabase';
import type { WardrobeItemRow } from '@/types/database';

const BUCKET = 'wardrobe';
const SIGNED_URL_TTL_S = 60 * 60 * 24 * 7;
/** Long edge after resize: sharp on a 3-column grid, fast to upload + tag. */
const MAX_EDGE_PX = 1080;

export type ItemTags = Pick<
  WardrobeItemRow,
  'category' | 'colors' | 'formality' | 'season' | 'fabric' | 'pattern'
>;

export interface ClosetItem extends WardrobeItemRow {
  /** Displayable URL (signed, or a local file URI while saving). */
  imageUri: string | null;
  /** True while an optimistic create/update hasn't been confirmed. */
  pending?: boolean;
}

/** Seed/demo rows store full URLs; user uploads store storage paths. */
export function isRemoteUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

export async function fetchClosetItems(userId: string): Promise<ClosetItem[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('wardrobe_items')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw error;

  const paths = data.map((row) => row.image_url).filter((p) => !isRemoteUrl(p));
  const signed = new Map<string, string>();
  if (paths.length > 0) {
    const { data: urls, error: signError } = await supabase.storage
      .from(BUCKET)
      .createSignedUrls(paths, SIGNED_URL_TTL_S);
    if (signError) throw signError;
    for (const entry of urls) {
      if (entry.path && entry.signedUrl) signed.set(entry.path, entry.signedUrl);
    }
  }

  return data.map((row) => ({
    ...row,
    imageUri: isRemoteUrl(row.image_url)
      ? row.image_url
      : (signed.get(row.image_url) ?? null),
  }));
}

/**
 * Downscales + re-encodes the picked photo, then uploads it. Returns the
 * storage path to persist in `image_url` and hand to the tagger.
 */
export interface LocalPhoto {
  uri: string;
  width: number;
  height: number;
}

export async function uploadClosetPhoto(
  userId: string,
  photo: LocalPhoto,
): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  if (Math.max(photo.width, photo.height) > MAX_EDGE_PX) {
    context.resize(
      photo.width >= photo.height ? { width: MAX_EDGE_PX } : { height: MAX_EDGE_PX },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });

  const body = await (await fetch(saved.uri)).arrayBuffer();
  const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/** Best-effort cleanup (abandoned drafts, deleted items). Never throws. */
export async function removeClosetPhoto(path: string): Promise<void> {
  if (isRemoteUrl(path)) return;
  try {
    await getSupabase().storage.from(BUCKET).remove([path]);
  } catch {
    // An orphaned object only costs storage; never block the user on it.
  }
}

export async function insertClosetItem(
  userId: string,
  imagePath: string,
  tags: ItemTags,
): Promise<WardrobeItemRow> {
  const { data, error } = await getSupabase()
    .from('wardrobe_items')
    .insert({ user_id: userId, image_url: imagePath, ...tags })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateClosetItem(
  id: string,
  tags: Partial<ItemTags>,
): Promise<WardrobeItemRow> {
  const { data, error } = await getSupabase()
    .from('wardrobe_items')
    .update(tags)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteClosetItem(item: WardrobeItemRow): Promise<void> {
  const { error } = await getSupabase()
    .from('wardrobe_items')
    .delete()
    .eq('id', item.id);
  if (error) throw error;
  await removeClosetPhoto(item.image_url);
}
