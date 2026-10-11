// Closet data access — Supabase table `wardrobe_items` + private `wardrobe`
// storage bucket (PRD §3.2). `image_url` stores the storage *path*
// (`<user-id>/<file>.jpg`); readable URLs are short-lived signed URLs
// minted per fetch. The UI caches images by path so new signatures never
// re-download a photo (see components/closet/ClosetItemCard.tsx).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getSupabase } from '@/services/supabase';
import {
  isRemoteUrl,
  type FaceBox,
} from '@/supabase/functions/_shared/wardrobeTags';
import type { WardrobeItemRow } from '@/types/database';

export { isRemoteUrl };

const BUCKET = 'wardrobe';
const SIGNED_URL_TTL_S = 60 * 60 * 24 * 7;
/** Long edge after resize: sharp on a 3-column grid, fast to upload + tag. */
const MAX_EDGE_PX = 1080;
/**
 * Privacy crop only when the face ends in this top band of the photo (in
 * the box's 0–1000 units) — which always leaves ≥ 53% of it, the garment,
 * after the margin below.
 */
const FACE_BAND = 450;
/** Gap left below the chin so no jawline survives the crop. */
const FACE_MARGIN = 20;

/** Pixel dims a photo will have after the upload downscale (pure math). */
export function fittedDims(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  if (Math.max(width, height) <= MAX_EDGE_PX) return { width, height };
  const scale = MAX_EDGE_PX / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

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
  const fitted = fittedDims(photo.width, photo.height);
  if (fitted.width !== photo.width || fitted.height !== photo.height) {
    context.resize(
      photo.width >= photo.height
        ? { width: fitted.width }
        : { height: fitted.height },
    );
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return uploadJpeg(`${userId}/${newFileName()}`, saved.uri);
}

function newFileName(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

async function uploadJpeg(path: string, localUri: string): Promise<string> {
  const body = await (await fetch(localUri)).arrayBuffer();
  const { error } = await getSupabase()
    .storage.from(BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;
  return path;
}

/**
 * Pixel rect that keeps everything below a detected face, or `null` when the
 * face isn't in the top band (cropping would cut the garment). Pure math on the
 * normalized 0–1000 box, so it works at any resolution.
 */
export function faceCropRect(
  face: FaceBox,
  width: number,
  height: number,
): { originX: number; originY: number; width: number; height: number } | null {
  if (width <= 0 || height <= 0) return null;
  // Integer per-mille math: no float drift moving the cut by a pixel.
  const faceBottom = Math.min(1000, face.y + face.h);
  if (faceBottom > FACE_BAND) return null;
  const originY = Math.ceil(((faceBottom + FACE_MARGIN) * height) / 1000);
  return { originX: 0, originY, width, height: height - originY };
}

/**
 * Crops a detected face out of the picked photo and returns the cropped,
 * upload-sized file — or `null` when no crop applies (see `faceCropRect`).
 * Dimensions come from the decoded image itself, never from picker
 * metadata, so the crop always lands where the model saw the face.
 */
export async function cropFaceFromPhoto(
  localUri: string,
  face: FaceBox,
): Promise<LocalPhoto | null> {
  const source = await ImageManipulator.manipulate(localUri).renderAsync();
  const rect = faceCropRect(face, source.width, source.height);
  if (!rect) return null;
  const fitted = fittedDims(rect.width, rect.height);
  const context = ImageManipulator.manipulate(source).crop(rect);
  if (fitted.width !== rect.width) context.resize({ width: fitted.width, height: null });
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.8, format: SaveFormat.JPEG });
  return { uri: saved.uri, width: saved.width, height: saved.height };
}

/**
 * Swaps an uploaded draft photo for a new file. Uploads to a *new* path,
 * then removes the old one: Supabase's CDN can keep serving an overwritten
 * object, which for a privacy crop would mean the face lingers. Returns the
 * new path; if the upload fails the old photo stays untouched.
 */
export async function replaceClosetPhoto(oldPath: string, localUri: string): Promise<string> {
  const folder = oldPath.slice(0, oldPath.lastIndexOf('/') + 1);
  const path = await uploadJpeg(`${folder}${newFileName()}`, localUri);
  await removeClosetPhoto(oldPath);
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
