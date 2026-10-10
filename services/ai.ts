// Client wrappers for AI edge functions. No keys here — the functions hold
// them server-side (docs/AGENT_RULES.md §2).
import { FunctionsHttpError } from '@supabase/supabase-js';

import { getSupabase } from '@/services/supabase';
import {
  parseTagSuggestion,
  type TagSuggestion,
} from '@/supabase/functions/_shared/wardrobeTags';

/** Client-side ceiling; the function itself aborts Gemini at 10s. */
const TAG_TIMEOUT_MS = 15_000;

/**
 * Asks `tag-item` for suggested tags for an uploaded closet photo.
 * Throws an Error whose message is safe to show the user.
 */
export async function suggestItemTags(imagePath: string): Promise<TagSuggestion> {
  // Contract: supabase/functions/tag-item — POST { imagePath } → flat tags.
  const { data, error } = await getSupabase().functions.invoke<unknown>('tag-item', {
    body: { imagePath },
    timeout: TAG_TIMEOUT_MS,
  });

  if (error) {
    let message = "Couldn't auto-tag this photo.";
    if (error instanceof FunctionsHttpError) {
      const body = await error.context.json().catch(() => null);
      if (typeof body?.error === 'string') message = toSentence(body.error);
    }
    throw new Error(message);
  }

  // Defense in depth: the function validates too, but never trust the wire.
  const suggestion = parseTagSuggestion(data);
  if (!suggestion) throw new Error("Couldn't read the suggested tags.");
  return suggestion;
}

/**
 * "tagging unclear, fill in manually" → "Tagging unclear." The screen
 * already offers manual tagging right below, so that tail is dropped.
 */
export function toSentence(serverMessage: string): string {
  const core = serverMessage.replace(/,?\s*fill in manually\.?$/i, '').trim();
  if (!core) return "Couldn't auto-tag this photo.";
  const sentence = core[0].toUpperCase() + core.slice(1);
  return /[.!?]$/.test(sentence) ? sentence : `${sentence}.`;
}
