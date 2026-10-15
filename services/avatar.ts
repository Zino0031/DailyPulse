// Avatar data access — Supabase table `avatars` + public `avatars`
// storage bucket (PRD §3.1, ARCH §4 pipeline 1).
//
// `image_url` stores the bucket's *public URL* (stable, no expiry — unlike
// signed URLs). That keeps every reader simple: `AvatarPreview` renders it
// directly, and the `tryon-render` edge function fetches it as a remote URL.
// Free path only: no paid stylization runs here (see `stylizeAvatar` stub).
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

import { getSupabase } from '@/services/supabase';
import type { AvatarRow } from '@/types/database';

export const AVATAR_BUCKET = 'avatars';
/** Long edge after resize: crisp on a 120px hero, fast to upload + render. */
const MAX_EDGE_PX = 1024;

export interface LocalPhoto {
  uri: string;
  width: number;
  height: number;
}

/** Pixel dims a selfie will have after the upload downscale (pure math). */
export function avatarFittedDims(
  width: number,
  height: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width, height };
  if (Math.max(width, height) <= MAX_EDGE_PX) return { width, height };
  const scale = MAX_EDGE_PX / Math.max(width, height);
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

function newFileName(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.jpg`;
}

/**
 * Downscales + re-encodes the picked selfie, uploads it to
 * `<userId>/<file>.jpg`, and returns the public URL to persist in
 * `avatars.image_url`.
 */
export async function uploadAvatarPhoto(
  userId: string,
  photo: LocalPhoto,
): Promise<string> {
  const context = ImageManipulator.manipulate(photo.uri);
  const fitted = avatarFittedDims(photo.width, photo.height);
  if (fitted.width !== photo.width || fitted.height !== photo.height) {
    context.resize({ width: fitted.width, height: fitted.height });
  }
  const image = await context.renderAsync();
  const saved = await image.saveAsync({ compress: 0.85, format: SaveFormat.JPEG });

  const path = `${userId}/${newFileName()}`;
  const body = await (await fetch(saved.uri)).arrayBuffer();
  const supabase = getSupabase();
  const { error } = await supabase
    .storage.from(AVATAR_BUCKET)
    .upload(path, body, { contentType: 'image/jpeg', upsert: false });
  if (error) throw error;

  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

/** Newest active avatar for a user, or null when they have none. */
export async function fetchActiveAvatar(userId: string): Promise<AvatarRow | null> {
  const { data, error } = await getSupabase()
    .from('avatars')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/**
 * Makes `imageUrl` the user's active avatar. Deactivates the previous row
 * first — the partial unique index `avatars_one_active_per_user` rejects
 * two active rows, so insert-then-flip is not an option.
 */
export async function setActiveAvatar(
  userId: string,
  imageUrl: string,
): Promise<AvatarRow> {
  const supabase = getSupabase();
  const { error: offError } = await supabase
    .from('avatars')
    .update({ is_active: false })
    .eq('user_id', userId)
    .eq('is_active', true);
  if (offError) throw offError;

  const { data, error } = await supabase
    .from('avatars')
    .insert({ user_id: userId, image_url: imageUrl, is_active: true })
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Storage path inside `image_url`'s public URL (`<userId>/<file>.jpg`), or
 * null for foreign URLs. Pure string math — safe to unit test.
 */
export function avatarPublicUrlToPath(publicUrl: string): string | null {
  const marker = `/object/public/${AVATAR_BUCKET}/`;
  const at = publicUrl.indexOf(marker);
  if (at === -1) return null;
  try {
    return decodeURIComponent(publicUrl.slice(at + marker.length).split('?')[0]);
  } catch {
    return publicUrl.slice(at + marker.length).split('?')[0];
  }
}

/**
 * Deletes an avatar row and its storage object. Best-effort on the file:
 * an orphaned object only costs storage, never blocks the user.
 */
export async function deleteAvatar(avatar: AvatarRow): Promise<void> {
  const { error } = await getSupabase().from('avatars').delete().eq('id', avatar.id);
  if (error) throw error;
  const path = avatarPublicUrlToPath(avatar.image_url);
  if (!path) return;
  try {
    await getSupabase().storage.from(AVATAR_BUCKET).remove([path]);
  } catch {
    // Orphaned object only — never fail the delete over it.
  }
}

/**
 * AI-stylization entry point (PRD §3.1 avatar pipeline). Stubbed on purpose:
 * the free path ships the user's real photo everywhere, and stylized
 * renders stay behind a Supabase Edge Function (secrets must never reach
 * the client — AGENT_RULES §2). A later ticket wires this to that function.
 */
export async function stylizeAvatar(_avatarId: string): Promise<never> {
  throw new Error(
    'AI avatar stylization is not available yet — your photo works everywhere today.',
  );
}
