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
      // Set session + loading:true synchronously, before awaiting the
      // profile fetch below. Without this, a route guard reading state
      // during that await sees a stale loading:false/session:null (left
      // over from the initial unauthenticated resolution) and redirects to
      // /sign-in despite a session having just been established — a real
      // race, not just a test artifact (caught via e2e/global-setup.ts
      // driving a real sign-up through a real browser).
      if (!cancelled) setState((prev) => ({ ...prev, session, loading: true }))
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
