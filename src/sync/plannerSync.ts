import type { User } from '@supabase/supabase-js'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { usePlannerStore } from '../store/usePlannerStore'
import type { Exam, StudyTask, Subject } from '../store/types'

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
  lastUsedSubjectIdByExam?: unknown
  subjectOrderByExam?: unknown
}

function nowIso() {
  return new Date().toISOString()
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeStringRecord(input: unknown) {
  if (!isObject(input)) return {}
  return Object.fromEntries(
    Object.entries(input)
      .filter(([key, value]) => Boolean(key) && typeof value === 'string' && value),
  ) as Record<string, string>
}

function normalizeStringArrayRecord(input: unknown) {
  if (!isObject(input)) return {}
  return Object.fromEntries(
    Object.entries(input).map(([key, value]) => [
      key,
      Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.length > 0) : [],
    ]),
  ) as Record<string, string[]>
}

function normalizeExam(input: unknown): Exam | null {
  if (!isObject(input) || typeof input.id !== 'string') return null
  return {
    id: input.id,
    name: typeof input.name === 'string' && input.name.trim() ? input.name : '시즌',
    status: input.status === 'archived' ? 'archived' : 'active',
    examDate: typeof input.examDate === 'string' && input.examDate ? input.examDate : undefined,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso(),
  }
}

function normalizeSubject(input: unknown, fallbackExamId: string): Subject | null {
  if (!isObject(input) || typeof input.id !== 'string') return null
  return {
    id: input.id,
    examId: typeof input.examId === 'string' && input.examId ? input.examId : fallbackExamId,
    name: typeof input.name === 'string' && input.name.trim() ? input.name : '주제',
    color: typeof input.color === 'string' && input.color ? input.color : '#94a3b8',
    archived: Boolean(input.archived),
    isRest: Boolean(input.isRest),
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso(),
  }
}

function normalizeTask(input: unknown, fallbackExamId: string): StudyTask | null {
  if (!isObject(input) || typeof input.id !== 'string' || typeof input.subjectId !== 'string') return null
  const plannedSeconds =
    typeof input.plannedSeconds === 'number' && Number.isFinite(input.plannedSeconds) ? Math.max(0, Math.floor(input.plannedSeconds)) : 0
  const actualSeconds =
    typeof input.actualSeconds === 'number' && Number.isFinite(input.actualSeconds) ? Math.max(0, Math.floor(input.actualSeconds)) : undefined

  return {
    id: input.id,
    examId: typeof input.examId === 'string' && input.examId ? input.examId : fallbackExamId,
    subjectId: input.subjectId,
    title: typeof input.title === 'string' ? input.title : '',
    date: typeof input.date === 'string' ? input.date : '',
    dueDate: typeof input.dueDate === 'string' && input.dueDate ? input.dueDate : undefined,
    plannedStartTime: typeof input.plannedStartTime === 'string' && input.plannedStartTime ? input.plannedStartTime : undefined,
    plannedSeconds,
    actualStartTime: typeof input.actualStartTime === 'string' && input.actualStartTime ? input.actualStartTime : undefined,
    actualEndTime: typeof input.actualEndTime === 'string' && input.actualEndTime ? input.actualEndTime : undefined,
    actualSeconds,
    recordCompleteOnly: Boolean(input.recordCompleteOnly),
    status: input.status === 'completed' ? 'completed' : 'pending',
    memo: typeof input.memo === 'string' && input.memo ? input.memo : undefined,
    createdAt: typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso(),
    updatedAt: typeof input.updatedAt === 'string' && input.updatedAt ? input.updatedAt : typeof input.createdAt === 'string' && input.createdAt ? input.createdAt : nowIso(),
  }
}

function latestLocalTimestamp() {
  const state = usePlannerStore.getState()
  const isFreshSeed =
    state.tasks.length === 0 &&
    state.exams.length === 1 &&
    state.subjects.length === 2 &&
    state.activeExamId === state.exams[0]?.id &&
    state.exams[0]?.name === '새 시즌' &&
    state.exams[0]?.status === 'active' &&
    !state.exams[0]?.examDate &&
    state.subjects.every((subject) => subject.examId === state.exams[0]?.id) &&
    state.subjects.some((subject) => subject.name === '중요') &&
    state.subjects.some((subject) => subject.name === '일반')

  if (isFreshSeed) return ''

  return [
    ...state.exams.map((exam) => exam.createdAt),
    ...state.subjects.map((subject) => subject.createdAt),
    ...state.tasks.map((task) => task.updatedAt || task.createdAt),
  ]
    .filter((value) => typeof value === 'string' && value.length > 0)
    .sort()
    .at(-1) ?? ''
}

function pickPlannerData(input: unknown) {
  if (!isObject(input)) return null
  const data = input as PlannerData
  if (!Array.isArray(data.exams) || !Array.isArray(data.subjects) || !Array.isArray(data.tasks)) return null
  if (typeof data.activeExamId !== 'string') return null

  const exams = data.exams.map(normalizeExam).filter((value): value is Exam => value !== null)
  const fallbackExamId = exams[0]?.id ?? ''
  if (!fallbackExamId) return null
  const subjects = data.subjects.map((subject) => normalizeSubject(subject, fallbackExamId)).filter((value): value is Subject => value !== null)
  const tasks = data.tasks.map((task) => normalizeTask(task, fallbackExamId)).filter((value): value is StudyTask => value !== null)

  return {
    exams,
    activeExamId: data.activeExamId || fallbackExamId,
    subjects,
    tasks,
    lastUsedSubjectIdByExam: normalizeStringRecord(data.lastUsedSubjectIdByExam),
    subjectOrderByExam: normalizeStringArrayRecord(data.subjectOrderByExam),
  }
}

export type SyncHandle = {
  stop: () => void
}

export async function startPlannerSync(user: User): Promise<SyncHandle> {
  if (!supabaseConfigOk) return { stop: () => {} }

  const supabase = getSupabase()
  let stopped = false
  let lastSynced = ''
  let debounceTimer: number | null = null
  let pushInFlight = false
  let pushQueued = false

  // 1) Pull existing state from server (if any) and replace local.
  // Server wins on initial sync to enable multi-device continuation.
  const { data: remote, error } = await supabase
    .from('planner_state')
    .select('user_id,data,updated_at')
    .eq('user_id', user.id)
    .maybeSingle<RemoteRow>()

  if (!stopped && !error && remote?.data) {
    const next = pickPlannerData(remote.data)
    const localIsNewer = Boolean(remote.updated_at && latestLocalTimestamp() > remote.updated_at)
    if (next && !localIsNewer) {
      // IMPORTANT: don't replace the whole zustand state; it would wipe action functions.
      // Only merge in the serializable planner data fields.
      usePlannerStore.setState(next, false)
      lastSynced = JSON.stringify({
        exams: next.exams,
        activeExamId: next.activeExamId,
        subjects: next.subjects,
        tasks: next.tasks,
        lastUsedSubjectIdByExam: next.lastUsedSubjectIdByExam,
        subjectOrderByExam: next.subjectOrderByExam,
      })
    }
  }

  const currentPlannerData = () => {
    const state = usePlannerStore.getState()
    return {
      exams: state.exams,
      activeExamId: state.activeExamId,
      subjects: state.subjects,
      tasks: state.tasks,
      lastUsedSubjectIdByExam: state.lastUsedSubjectIdByExam,
      subjectOrderByExam: state.subjectOrderByExam,
    }
  }

  const push = async () => {
    if (stopped) return
    if (!navigator.onLine) return
    if (pushInFlight) {
      pushQueued = true
      return
    }

    const data = currentPlannerData()
    const nextKey = JSON.stringify(data)
    if (nextKey === lastSynced) return

    pushInFlight = true
    const payload = {
      user_id: user.id,
      data,
      updated_at: nowIso(),
    }

    try {
      const { error } = await supabase.from('planner_state').upsert(payload, { onConflict: 'user_id' })
      if (!error) lastSynced = nextKey
    } finally {
      pushInFlight = false
      if (pushQueued) {
        pushQueued = false
        schedulePush(200)
      }
    }
  }

  const schedulePush = (delay = 900) => {
    if (stopped) return
    if (debounceTimer) window.clearTimeout(debounceTimer)
    debounceTimer = window.setTimeout(() => {
      debounceTimer = null
      void push()
    }, delay)
  }

  const unsubscribe = usePlannerStore.subscribe(() => {
    schedulePush()
  })

  const handleOnline = () => {
    schedulePush(100)
  }

  const handleVisible = () => {
    if (document.visibilityState !== 'visible') return
    schedulePush(100)
  }

  window.addEventListener('online', handleOnline)
  document.addEventListener('visibilitychange', handleVisible)

  // Push once after initial subscribe so new accounts persist quickly.
  schedulePush()

  return {
    stop: () => {
      stopped = true
      if (debounceTimer) window.clearTimeout(debounceTimer)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisible)
      unsubscribe()
    },
  }
}
