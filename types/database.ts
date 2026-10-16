// Database types for the Supabase client (supabase-js).
// Mirrors supabase/migrations/*.sql + docs/ARCHITECTURE.md §3.
// Regenerate from a linked project with:
//   supabase gen types typescript --linked > types/database.ts
// and keep these hand-written literals in sync afterwards.
//
// NOTE: rows must stay `type` literals, never `interface` — postgrest-js
// infers through `Row extends Record<string, unknown>` and interfaces
// silently collapse single()/maybeSingle() results to `never`.

import type { Tier } from '@/supabase/functions/_shared/tiers';

export type { Tier };
export type WardrobeCategory =
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'outerwear'
  | 'accessory';
export type Formality = 'casual' | 'business' | 'formal' | 'athletic';

export type UserRow = {
  id: string;
  email: string | null;
  full_name: string;
  location_lat: number | null;
  location_lon: number | null;
  tier: Tier;
  gender: string;
  style_prefs: string[];
  location_name: string | null;
  onboarded_at: string | null;
  created_at: string;
};

export type AvatarRow = {
  id: string;
  user_id: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
};

export type WardrobeItemRow = {
  id: string;
  user_id: string;
  image_url: string;
  category: WardrobeCategory;
  colors: string[];
  formality: Formality;
  season: string[];
  fabric: string;
  pattern: string;
  created_at: string;
};

export type OutfitRow = {
  id: string;
  user_id: string;
  item_ids: string[];
  rendered_image_url: string | null;
  weather_summary: Record<string, unknown>;
  event_summary: string | null;
  mood: string | null;
  is_saved: boolean;
  created_at: string;
};

export type SubscriptionRow = {
  id: string;
  user_id: string;
  revenuecat_customer_id: string | null;
  tier: Tier;
  status: 'active' | 'expired' | 'none';
  product_id: string | null;
  store: string | null;
  environment: 'sandbox' | 'production' | null;
  will_renew: boolean;
  expires_at: string | null;
  updated_at: string;
  created_at: string;
};

/** Daily AI generation counter (UTC `day`); written by edge functions only. */
export type GenerationUsageRow = {
  user_id: string;
  day: string;
  used: number;
};

export interface Database {
  public: {
    Tables: {
      users: {
        Row: UserRow;
        Insert: Partial<UserRow> & Pick<UserRow, 'id'>;
        Update: Partial<UserRow>;
        Relationships: [];
      };
      avatars: {
        Row: AvatarRow;
        Insert: Partial<AvatarRow> & Pick<AvatarRow, 'user_id' | 'image_url'>;
        Update: Partial<AvatarRow>;
        Relationships: [];
      };
      wardrobe_items: {
        Row: WardrobeItemRow;
        Insert: Partial<WardrobeItemRow> &
          Pick<WardrobeItemRow, 'user_id' | 'image_url' | 'category'>;
        Update: Partial<WardrobeItemRow>;
        Relationships: [];
      };
      outfits: {
        Row: OutfitRow;
        Insert: Partial<OutfitRow> & Pick<OutfitRow, 'user_id'>;
        Update: Partial<OutfitRow>;
        Relationships: [];
      };
      subscriptions: {
        Row: SubscriptionRow;
        Insert: Partial<SubscriptionRow> & Pick<SubscriptionRow, 'user_id'>;
        Update: Partial<SubscriptionRow>;
        Relationships: [];
      };
      generation_usage: {
        Row: GenerationUsageRow;
        Insert: GenerationUsageRow;
        Update: Partial<GenerationUsageRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
