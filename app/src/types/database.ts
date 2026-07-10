// Hand-authored interim types matching supabase/migrations/20260710124353_create_profiles.sql,
// 20260710130555_create_warehouses.sql, and 20260710130605_create_products.sql.
// Regenerate with `pnpm db:types` once local/hosted Supabase is reachable —
// this file only exists so the app can typecheck against the schema before that.

export type UserRole = 'brand' | 'provider' | 'admin'

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
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: {
      user_role: UserRole
    }
    CompositeTypes: Record<string, never>
  }
}
