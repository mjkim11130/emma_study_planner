import type { User } from '@supabase/supabase-js'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { usePlannerStore } from '../store/usePlannerStore'

type RemoteRow = {
  user_id: string
  data: unknown
  updated_at: string
}

type PlannerData = {
  exams: unknown
  activeExamId: unknown
  subjects: unknown
  tasks: unknown
}

function nowIso() {
  return new Date().toISOString()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function pickPlannerData(input: unknown) {
  if (!isObject(input)) return null
  const data = input as PlannerData
  if (!Array.isArray(data.exams) || !Array.isArray(data.subjects) || !Array.isArray(data.tasks)) return null
  if (typeof data.activeExamId !== 'string') return null
  return {
    exams: data.exams,
    activeExamId: data.activeExamId,
    subjects: data.subjects,
    tasks: data.tasks,
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
    const next = pickPlannerData(remote.data)
    if (next) {
      // IMPORTANT: don't replace the whole zustand state; it would wipe action functions.
      // Only merge in the serializable planner data fields.
      usePlannerStore.setState(next as any, false)
    }
  }

  const push = async () => {
    if (stopped) return
    const state = usePlannerStore.getState() as any
    const data = {
      exams: state.exams,
      activeExamId: state.activeExamId,
      subjects: state.subjects,
      tasks: state.tasks,
    }
    const payload = {
      user_id: user.id,
      data,
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
