// Database types for the Supabase client (supabase-js).
// Mirrors supabase/migrations/20260325000000_init.sql + docs/ARCHITECTURE.md §3.
// Regenerate from a linked project with:
//   supabase gen types typescript --linked > types/database.ts
// and keep these hand-written literals in sync afterwards.

export type Tier = 'free' | 'plus' | 'pro';
export type WardrobeCategory =
  | 'top'
  | 'bottom'
  | 'shoes'
  | 'outerwear'
  | 'accessory';
export type Formality = 'casual' | 'business' | 'formal' | 'athletic';

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  location_lat: number | null;
  location_lon: number | null;
  tier: Tier;
  created_at: string;
}

export interface AvatarRow {
  id: string;
  user_id: string;
  image_url: string;
  is_active: boolean;
  created_at: string;
}

export interface WardrobeItemRow {
  id: string;
  user_id: string;
  image_url: string;
  category: WardrobeCategory;
  colors: string[];
  formality: Formality;
  season: string[];
  created_at: string;
}

export interface OutfitRow {
  id: string;
  user_id: string;
  item_ids: string[];
  rendered_image_url: string | null;
  weather_summary: Record<string, unknown>;
  event_summary: string | null;
  mood: string | null;
  is_saved: boolean;
  created_at: string;
}

export interface SubscriptionRow {
  id: string;
  user_id: string;
  revenuecat_customer_id: string | null;
  status: string;
  expires_at: string | null;
  created_at: string;
}

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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
