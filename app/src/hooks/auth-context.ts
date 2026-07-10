import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'
import type { Database } from '../types/database'

export type Profile = Database['public']['Tables']['profiles']['Row']

export interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
}

export const AuthContext = createContext<AuthState | undefined>(undefined)
