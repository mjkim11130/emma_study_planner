import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabaseClient'
import { AuthContext, type AuthState } from './AuthContext'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ isLoading: true, session: null, user: null })

  useEffect(() => {
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        const session = data.session ?? null
        setState({ isLoading: false, session, user: session?.user ?? null })
      })
      .catch(() => {
        if (!mounted) return
        setState({ isLoading: false, session: null, user: null })
      })

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({ isLoading: false, session: session ?? null, user: session?.user ?? null })
    })

    return () => {
      mounted = false
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
