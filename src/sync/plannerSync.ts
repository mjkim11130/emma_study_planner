import type { User } from '@supabase/supabase-js'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { usePlannerStore } from '../store/usePlannerStore'

type RemoteRow = {
  user_id: string
  data: unknown
  updated_at: string
}

function nowIso() {
  return new Date().toISOString()
}

function safeJsonParse<T>(input: unknown): T | null {
  try {
    return input as T
  } catch {
    return null
  }
}

export type SyncHandle = {
  stop: () => void
}

export async function startPlannerSync(user: User): Promise<SyncHandle> {
  if (!supabaseConfigOk) return { stop: () => {} }

  const supabase = getSupabase()
  let stopped = false
  let lastPushed = ''
  let debounceTimer: number | null = null

  // 1) Pull existing state from server (if any) and replace local.
  // Server wins on initial sync to enable multi-device continuation.
  const { data: remote, error } = await supabase
    .from('planner_state')
    .select('user_id,data,updated_at')
    .eq('user_id', user.id)
    .maybeSingle<RemoteRow>()

  if (!stopped && !error && remote?.data) {
    const next = safeJsonParse<Record<string, unknown>>(remote.data)
    if (next) {
      usePlannerStore.setState(next as any, true)
    }
  }

  const push = async () => {
    if (stopped) return
    const state = usePlannerStore.getState() as any
    const payload = {
      user_id: user.id,
      data: state,
      updated_at: nowIso(),
    }

    const nextKey = JSON.stringify(payload.data)
    if (nextKey === lastPushed) return
    lastPushed = nextKey

    await supabase.from('planner_state').upsert(payload, { onConflict: 'user_id' })
  }

  const schedulePush = () => {
    if (stopped) return
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      void push()
    }, 900)
  }

  const unsubscribe = usePlannerStore.subscribe(() => {
    schedulePush()
  })

  // Push once after initial subscribe so new accounts persist quickly.
  schedulePush()

  return {
    stop: () => {
      stopped = true
      if (debounceTimer) window.clearTimeout(debounceTimer)
      unsubscribe()
    },
  }
}

