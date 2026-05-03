import { useEffect, useRef, useState, type ReactNode } from 'react'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { AuthContext, type AuthState } from './AuthContext'
import { startPlannerSync, type SyncHandle } from '../sync/plannerSync'
import { usePlannerStore } from '../store/usePlannerStore'

function clearPlannerLocalStorage() {
  try {
    window.localStorage.removeItem('emma-study-planner:v1')
  } catch {
    // ignore
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ isLoading: true, session: null, user: null })
  const lastUserIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!supabaseConfigOk) {
      setState({ isLoading: false, session: null, user: null })
      return
    }

    const supabase = getSupabase()
    let mounted = true

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return
        const session = data.session ?? null
        const userId = session?.user?.id ?? null
        const storedUserId = localStorage.getItem('emma-study-planner:lastUserId')
        if (storedUserId !== userId) {
          clearPlannerLocalStorage()
          usePlannerStore.getState().resetAll()
          if (userId) localStorage.setItem('emma-study-planner:lastUserId', userId)
          else localStorage.removeItem('emma-study-planner:lastUserId')
        }
        lastUserIdRef.current = userId
        setState({ isLoading: false, session, user: session?.user ?? null })
      })
      .catch(() => {
        if (!mounted) return
        setState({ isLoading: false, session: null, user: null })
      })

    let sync: SyncHandle | null = null

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const userId = session?.user?.id ?? null
      if (lastUserIdRef.current !== userId) {
        clearPlannerLocalStorage()
        usePlannerStore.getState().resetAll()
        if (userId) localStorage.setItem('emma-study-planner:lastUserId', userId)
        else localStorage.removeItem('emma-study-planner:lastUserId')
        lastUserIdRef.current = userId
      }
      setState({ isLoading: false, session: session ?? null, user: session?.user ?? null })
      if (sync) {
        sync.stop()
        sync = null
      }
      if (session?.user) {
        void startPlannerSync(session.user).then((h) => {
          sync = h
        })
      }
    })

    return () => {
      mounted = false
      if (sync) sync.stop()
      data.subscription.unsubscribe()
    }
  }, [])

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>
}
