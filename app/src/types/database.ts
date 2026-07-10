// Hand-authored interim types matching supabase/migrations/20260710124353_create_profiles.sql.
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
      }
    }
    Enums: {
      user_role: UserRole
    }
  }
}
