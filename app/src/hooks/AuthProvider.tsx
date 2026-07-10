import { useEffect, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { AuthContext, type AuthState, type Profile } from './auth-context'

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
  if (error) {
    return null
  }
  return data
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ session: null, profile: null, loading: true })

  useEffect(() => {
    let cancelled = false

    async function syncSession(session: Session | null) {
      if (!session) {
        if (!cancelled) setState({ session: null, profile: null, loading: false })
        return
      }
      const profile = await fetchProfile(session.user.id)
      if (!cancelled) setState({ session, profile, loading: false })
    }

    supabase.auth.getSession().then(({ data }) => {
      void syncSession(data.session)
    })

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncSession(session)
    })

    return () => {
      cancelled = true
      subscription.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
