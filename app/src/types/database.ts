// Hand-authored interim types matching supabase/migrations/20260710124353_create_profiles.sql,
// 20260710130555_create_warehouses.sql, 20260710130605_create_products.sql,
// 20260710133050_extend_directory_visibility.sql (RLS-only, no shape change),
// 20260710133104_create_booking_requests.sql, 20260710133106_create_inventory.sql,
// 20260710135941_create_sku_mappings.sql, and 20260710161735_create_shopify_tables.sql.
// Regenerate with `pnpm db:types` once local/hosted Supabase is reachable —
// this file only exists so the app can typecheck against the schema before that.

export type UserRole = 'brand' | 'provider' | 'admin'
export type BookingStatus = 'pending' | 'approved' | 'rejected'
export type MarketplacePlatform = 'amazon' | 'tiktok' | 'ebay' | 'walmart' | 'shopify'
export type PlatformOrderStatus = 'pending' | 'resolved' | 'unmapped'

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          role: UserRole
          display_name: string
          company_name: string | null
          created_at: string
        }
        Insert: {
          id: string
          role: UserRole
          display_name: string
          company_name?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          role?: UserRole
          display_name?: string
          company_name?: string | null
          created_at?: string
        }
        Relationships: []
      }
      warehouses: {
        Row: {
          id: string
          provider_id: string
          name: string
          address_line1: string
          city: string
          state: string | null
          postal_code: string
          country: string
          created_at: string
        }
        Insert: {
          id?: string
          provider_id: string
          name: string
          address_line1: string
          city: string
          state?: string | null
          postal_code: string
          country: string
          created_at?: string
        }
        Update: {
          id?: string
          provider_id?: string
          name?: string
          address_line1?: string
          city?: string
          state?: string | null
          postal_code?: string
          country?: string
          created_at?: string
        }
        Relationships: []
      }
      warehouse_services: {
        Row: {
          id: string
          warehouse_id: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      storage_spaces: {
        Row: {
          id: string
          warehouse_id: string
          name: string
          unit_type: string
          capacity_units: number
          created_at: string
        }
        Insert: {
          id?: string
          warehouse_id: string
          name: string
          unit_type: string
          capacity_units: number
          created_at?: string
        }
        Update: {
          id?: string
          warehouse_id?: string
          name?: string
          unit_type?: string
          capacity_units?: number
          created_at?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          id: string
          brand_id: string
          master_sku: string
          name: string
          description: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          master_sku: string
          name: string
          description?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          master_sku?: string
          name?: string
          description?: string | null
          created_at?: string
        }
        Relationships: []
      }
      booking_requests: {
        Row: {
          id: string
          brand_id: string
          provider_id: string
          storage_space_id: string
          status: BookingStatus
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          provider_id?: string
          storage_space_id: string
          status?: BookingStatus
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          provider_id?: string
          storage_space_id?: string
          status?: BookingStatus
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory: {
        Row: {
          id: string
          product_id: string
          warehouse_id: string
          quantity: number
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          warehouse_id: string
          quantity?: number
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          warehouse_id?: string
          quantity?: number
          created_at?: string
        }
        Relationships: []
      }
      sku_mappings: {
        Row: {
          id: string
          product_id: string
          brand_id: string
          platform: MarketplacePlatform
          platform_sku: string
          created_at: string
        }
        Insert: {
          id?: string
          product_id: string
          brand_id?: string
          platform: MarketplacePlatform
          platform_sku: string
          created_at?: string
        }
        Update: {
          id?: string
          product_id?: string
          brand_id?: string
          platform?: MarketplacePlatform
          platform_sku?: string
          created_at?: string
        }
        Relationships: []
      }
      shopify_tokens: {
        Row: {
          id: string
          brand_id: string
          shop_domain: string
          access_token: string
          scope: string
          last_synced_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          shop_domain: string
          access_token: string
          scope: string
          last_synced_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          shop_domain?: string
          access_token?: string
          scope?: string
          last_synced_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      tiktok_tokens: {
        Row: {
          id: string
          brand_id: string
          shop_id: string
          access_token: string
          refresh_token: string
          access_token_expires_at: string
          last_synced_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          shop_id: string
          access_token: string
          refresh_token: string
          access_token_expires_at: string
          last_synced_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          shop_id?: string
          access_token?: string
          refresh_token?: string
          access_token_expires_at?: string
          last_synced_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      platform_orders: {
        Row: {
          id: string
          brand_id: string
          platform: MarketplacePlatform
          platform_order_id: string
          raw_data: unknown
          resolved_master_sku: string | null
          status: PlatformOrderStatus
          created_at: string
        }
        Insert: {
          id?: string
          brand_id: string
          platform: MarketplacePlatform
          platform_order_id: string
          raw_data: unknown
          resolved_master_sku?: string | null
          status?: PlatformOrderStatus
          created_at?: string
        }
        Update: {
          id?: string
          brand_id?: string
          platform?: MarketplacePlatform
          platform_order_id?: string
          raw_data?: unknown
          resolved_master_sku?: string | null
          status?: PlatformOrderStatus
          created_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
      booking_status: BookingStatus
      marketplace_platform: MarketplacePlatform
      platform_order_status: PlatformOrderStatus
    }
    CompositeTypes: Record<string, never>
  }
}
