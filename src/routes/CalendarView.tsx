import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  getDay,
  isSameDay,
  isSameMonth,
  format,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type WheelEvent as ReactWheelEvent,
} from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { todayYmd } from '../lib/dates'
import { formatDurationKoFromSeconds } from '../lib/time'
import { Button } from '../components/ui'
import { DurationPickerButton } from '../components/DurationPicker'
import { TimePickerModal } from '../components/TimePicker'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'
import { TaskTimerModal } from '../components/TaskTimerModal'
import { TaskDialogShell } from '../components/TaskDialogShell'
import type { StudyTask } from '../store/types'
import { buildTimeSummaryNode, formatDurationPreciseKo } from '../lib/taskTimeSummary'

function StartPendingBubbleIcon() {
  return (
    <svg viewBox="0 -960 960 960" aria-hidden="true" className="h-8 w-8 text-slate-800">
      <path
        d="m388-212-56-56 92-92-92-92 56-56 92 92 92-92 56 56-92 92 92 92-56 56-92-92-92 92ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z"
        fill="currentColor"
      />
    </svg>
  )
}

function formatMeridiemHm(hm?: string) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const hours24 = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return null
  const meridiem = hours24 < 12 ? '오전' : '오후'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${meridiem} ${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function hmToMinutes(hm?: string | null) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const hours24 = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return null
  if (hours24 < 0 || hours24 > 23) return null
  if (minutes < 0 || minutes > 59) return null
  return hours24 * 60 + minutes
}

function diffMinutesAllowNextDay(startMin: number, endMin: number) {
  if (endMin === startMin) return { minutes: 0, wraps: false }
  if (endMin > startMin) return { minutes: endMin - startMin, wraps: false }
  return { minutes: endMin + 24 * 60 - startMin, wraps: true }
}

function addSecondsToHm(hm: string, secondsToAdd: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const startSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60
  const endTotalMinutes = Math.floor((startSeconds + secondsToAdd) / 60)
  const normalized = ((endTotalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function formatTaskPreviewDate(ymd?: string) {
  if (!ymd) return null
  return format(parseISO(ymd), 'yyyy년 M월 d일 eeee', { locale: ko })
}

function formatDueDateLabel(ymd?: string) {
  if (!ymd) return null
  return `${format(parseISO(ymd), 'M월 d일')}까지 마감`
}

function parseYmd(value: string) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = parseISO(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toYmd(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function formatDurationGraphKo(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  if (clamped < 60) return '1분 이내'
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (parts.length === 0) parts.push('0분')
  return parts.join(' ')
}

function buildNextTaskTitle(baseTitle: string, tasks: StudyTask[]) {
  const trimmedBase = baseTitle.trim()
  if (!trimmedBase) return ''
  const usedNumbers = new Set<number>()
  for (const task of tasks) {
    const title = task.title.trim()
    if (title === trimmedBase) {
      usedNumbers.add(1)
      continue
    }
    const match = new RegExp(`^${trimmedBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+(\\d+)$`).exec(title)
    if (!match) continue
    usedNumbers.add(Number(match[1]))
  }
  let nextNumber = 1
  while (usedNumbers.has(nextNumber)) nextNumber += 1
  return `${trimmedBase} ${nextNumber}`
}

function CompareRail({
  goalLabel,
  actualLabel,
  deltaLabel,
  goalSeconds,
  actualSeconds,
}: {
  goalLabel: string
  actualLabel: string
  deltaLabel: string
  goalSeconds: number
  actualSeconds: number
}) {
  const maxSeconds = Math.max(goalSeconds, actualSeconds, 1)
  const goalWidth = `${(goalSeconds / maxSeconds) * 100}%`
  const actualWidth = `${(actualSeconds / maxSeconds) * 100}%`
  return (
    <div className="flex flex-col gap-2.5 py-1">
      <div className="grid grid-cols-[46px_minmax(0,1fr)_98px] items-center gap-3">
        <span className="text-sm font-semibold text-slate-400">계획</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-slate-300" style={{ width: goalWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-500">{goalLabel}</span>
      </div>
      <div className="grid grid-cols-[46px_minmax(0,1fr)_98px] items-center gap-3">
        <span className="text-sm font-semibold text-slate-900">완료</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-black/80" style={{ width: actualWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-900">{actualLabel}</span>
      </div>
      <div className="pt-1 text-center text-base font-semibold text-slate-700">{deltaLabel}</div>
    </div>
  )
}

export function CalendarView() {
  const DRAFT_TASK_ID = '__draft_task__'
  const location = useLocation()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)
  const today = useMemo(() => parseISO(todayYmd()), [])
  const [startOpen, setStartOpen] = useState(false)
  const [addDraft, setAddDraft] = useState<StudyTask | null>(null)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [timerTaskId, setTimerTaskId] = useState<string | null>(null)
  const [datePickerField, setDatePickerField] = useState<null | 'date' | 'dueDate'>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [timePickerField, setTimePickerField] = useState<
    null | 'plannedStartTime' | 'plannedEndTime' | 'actualStartTime' | 'actualEndTime'
  >(null)
  const [plannedDurationPickerOpen, setPlannedDurationPickerOpen] = useState(false)
  const [plannedSecondsDraft, setPlannedSecondsDraft] = useState(0)
  const [editValidationMessage, setEditValidationMessage] = useState<string | null>(null)
  const [editExitConfirmOpen, setEditExitConfirmOpen] = useState(false)
  const [editWarningMessage, setEditWarningMessage] = useState<string | null>(null)
  const [editTitleDraft, setEditTitleDraft] = useState('')
  const [editTitleSample, setEditTitleSample] = useState('제목 추가')
  const editTitleOriginalRef = useRef<{ taskId: string; title: string } | null>(null)
  const subjectPickerRef = useRef<HTMLDivElement | null>(null)
  const subjectPillRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const [startDock, setStartDock] = useState<{ v: 'top' | 'bottom'; h: 'right' }>({ v: 'bottom', h: 'right' })
  const topDockY = 64
  const [, setSheetDragY] = useState(0)
  const sheetDragRef = useRef<{ startY: number; isDragging: boolean }>({ startY: 0, isDragging: false })
  const sheetDragYRef = useRef(0)
  const [, setSheetIsDragging] = useState(false)
  const [sheetClosing, setSheetClosing] = useState(false)
  const [autoCloseAfterCompleteTaskId, setAutoCloseAfterCompleteTaskId] = useState<string | null>(null)
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null)
  const scrollAnimRef = useRef<number | null>(null)
  const [longPressWeekStartYmd, setLongPressWeekStartYmd] = useState<string | null>(null)
  const [pressedDayYmd, setPressedDayYmd] = useState<string | null>(null)
  const longPressRef = useRef<{
    timer: number | null
    firedAt: number
    weekStartYmd: string | null
    dayYmd: string | null
    armed: boolean
    startX: number
    startY: number
    moved: boolean
  }>({
    timer: null,
    firedAt: 0,
    weekStartYmd: null,
    dayYmd: null,
    armed: false,
    startX: 0,
    startY: 0,
    moved: false,
  })
  const dragRef = useRef<{
    isDragging: boolean
    startX: number
    startY: number
    dx: number
    dy: number
    didDrag: boolean
    lastDragAt: number
  }>({ isDragging: false, startX: 0, startY: 0, dx: 0, dy: 0, didDrag: false, lastDragAt: 0 })

  const normalizeHex = (color: string) => {
    const raw = color.trim()
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
    return null
  }

  const pickReadableTextColor = (bgColor: string) => {
    const hex = normalizeHex(bgColor)
    if (!hex) return '#0f172a' // slate-900 fallback
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const srgb = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    const L = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    return L > 0.5 ? '#0f172a' : '#ffffff'
  }

  const formatDday = (dueDate?: string) => {
    if (!dueDate) return null
    const end = parseISO(dueDate)
    const diffDays = differenceInCalendarDays(end, today) // due - today
    if (diffDays === 0) return 'D-Day'
    return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
  }

  const measureUnits = (text: string) => {
    let units = 0
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0
      const isWide =
        (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
        (code >= 0x2e80 && code <= 0xa4cf) || // CJK + Hangul compat
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
        (code >= 0xf900 && code <= 0xfaff) // CJK compat ideographs
      units += isWide ? 2 : 1
    }
    return units
  }

  const truncateToUnits = (text: string, maxUnits: number) => {
    if (maxUnits <= 0) return ''
    let units = 0
    let out = ''
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0
      const isWide =
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff)
      const u = isWide ? 2 : 1
      if (units + u > maxUnits) break
      units += u
      out += ch
    }
    return out
  }

  const [displayMonth, setDisplayMonth] = useState(() => format(parseISO(todayYmd()), 'yyyy-MM'))
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const buildMonthWeeks = (month: string) => {
    const monthStart = parseISO(`${month}-01`)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 1 })
    const list: string[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) list.push(format(d, 'yyyy-MM-dd'))
    return list
  }
  const monthWeeks = useMemo(() => buildMonthWeeks(displayMonth), [displayMonth])
  const prevMonth = useMemo(() => format(addMonths(parseISO(`${displayMonth}-01`), -1), 'yyyy-MM'), [displayMonth])
  const nextMonth = useMemo(() => format(addMonths(parseISO(`${displayMonth}-01`), 1), 'yyyy-MM'), [displayMonth])
  const prevMonthWeeks = useMemo(() => buildMonthWeeks(prevMonth), [prevMonth])
  const nextMonthWeeks = useMemo(() => buildMonthWeeks(nextMonth), [nextMonth])

  const [monthDragX, setMonthDragX] = useState(0)
  const [isMonthDragging, setIsMonthDragging] = useState(false)
  const monthSwipeRef = useRef<{ isDown: boolean; startX: number; startY: number; lastX: number }>({
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
  })

  const examCountdown = useMemo(() => {
    if (!activeExam?.examDate) return null
    const today = parseISO(todayYmd())
    const examDate = parseISO(activeExam.examDate)
    const diffDays = differenceInCalendarDays(examDate, today) // exam - today
    const dday = diffDays === 0 ? 'D-Day' : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
    const weeksLeft = diffDays > 0 ? Math.ceil(diffDays / 7) : 0
    return { dday, weeksLeft, examDate: activeExam.examDate }
  }, [activeExam])

  const scopedTasks = useMemo(() => tasks.filter((t) => t.examId === activeExamId && t.date), [tasks, activeExamId])
  const previewTaskId = searchParams.get('previewTaskId')
  const shouldOpenAdd = searchParams.get('add') === '1'
  const addDateParam = searchParams.get('addDate') ?? ''
  const shouldOpenAddFromNav = Boolean((location.state as { openTaskAdd?: boolean; addDate?: string } | null)?.openTaskAdd)
  const addDateFromNav = ((location.state as { openTaskAdd?: boolean; addDate?: string } | null)?.addDate ?? '').trim()
  const shouldAutoEdit = searchParams.get('edit') === '1'
  const shouldAutoCloseAfterComplete = searchParams.get('autoClose') === '1'
  const unassignedBySubject = useMemo(() => {
    const items = tasks.filter((t) => t.examId === activeExamId && !t.date && t.status !== 'completed').slice()
    const bySubject = new Map<string, typeof items>()
    for (const t of items) {
      const list = bySubject.get(t.subjectId) ?? []
      list.push(t)
      bySubject.set(t.subjectId, list)
    }
    const groups = Array.from(bySubject.entries()).map(([subjectId, list]) => {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // 최신 등록순(앞으로)
      return { subjectId, list, newest: list[0]?.createdAt ?? '' }
    })
    groups.sort((a, b) => b.newest.localeCompare(a.newest)) // 과목 그룹도 최신 등록순
    return groups
  }, [tasks, activeExamId])

  const unassignedPending = useMemo(() => unassignedBySubject.flatMap((g) => g.list), [unassignedBySubject])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of scopedTasks) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return map
  }, [scopedTasks])

  const storedPreviewTask = useMemo(() => tasks.find((task) => task.id === previewTaskId) ?? null, [tasks, previewTaskId])
  const isAddMode = addDraft?.id === DRAFT_TASK_ID
  const [editDraft, setEditDraft] = useState<StudyTask | null>(null)
  const basePreviewTask = addDraft ?? storedPreviewTask
  const isEditingPreview = Boolean(basePreviewTask && editTaskId === basePreviewTask.id)
  const previewTask = isAddMode ? addDraft : isEditingPreview ? editDraft ?? basePreviewTask : basePreviewTask
  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const openPreviewTask = (taskId: string, opts?: { autoEdit?: boolean; autoCloseAfterComplete?: boolean }) => {
    const next = new URLSearchParams(searchParams)
    next.set('previewTaskId', taskId)
    if (opts?.autoEdit) next.set('edit', '1')
    else next.delete('edit')
    if (opts?.autoCloseAfterComplete) next.set('autoClose', '1')
    else next.delete('autoClose')
    setSearchParams(next, { replace: true })
  }

  const openTaskAdd = (initial?: { date?: string }) => {
    const fallbackSubjectId =
      (lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
      subjects.find((s) => s.examId === activeExamId)?.id ??
      subjects[0]?.id ??
      ''
    if (!fallbackSubjectId) return
    const now = new Date().toISOString()
    const draft: StudyTask = {
      id: DRAFT_TASK_ID,
      examId: activeExamId,
      subjectId: fallbackSubjectId,
      title: '',
      date: initial?.date ?? '',
      plannedSeconds: 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    setAddDraft(draft)
    openPreviewTask(DRAFT_TASK_ID, { autoEdit: true })
    setEditTaskId(DRAFT_TASK_ID)
    setAutoCloseAfterCompleteTaskId(null)
  }

  const patchPreviewTask = (patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => {
    if (!previewTask) return
    if (isAddMode) {
      setAddDraft((current) => (current ? { ...current, ...patch, updatedAt: new Date().toISOString() } : current))
      return
    }
    if (isEditingPreview) {
      setEditDraft((current) => {
        const base = current ?? storedPreviewTask
        return base ? { ...base, ...patch, updatedAt: new Date().toISOString() } : current
      })
      return
    }
    // Safety: never apply edits to the store unless user explicitly commits via "완료".
    // (Prevents "편집 취소" being ineffective due to live updates.)
    return
  }

  const commitEditDraft = (original: StudyTask, draft: StudyTask) => {
    const patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>> = {}
    const keys: Array<keyof Omit<StudyTask, 'id' | 'createdAt'>> = [
      'examId',
      'subjectId',
      'title',
      'date',
      'dueDate',
      'plannedStartTime',
      'plannedSeconds',
      'actualStartTime',
      'actualEndTime',
      'actualSeconds',
      'recordCompleteOnly',
      'status',
      'updatedAt',
    ]
    for (const key of keys) {
      if (draft[key] !== original[key]) patch[key] = draft[key] as never
    }
    if (Object.keys(patch).length === 0) return
    updateTask(original.id, patch)
  }

  const commitAddDraft = (draft: StudyTask) => {
    const id = addTask({
      examId: draft.examId,
      subjectId: draft.subjectId,
      title: draft.title,
      date: draft.date,
      dueDate: draft.dueDate,
      plannedStartTime: draft.plannedStartTime,
      plannedSeconds: draft.plannedSeconds,
      actualStartTime: draft.actualStartTime,
      actualEndTime: draft.actualEndTime,
      actualSeconds: draft.actualSeconds,
      recordCompleteOnly: draft.recordCompleteOnly,
    })
    setFlashTaskId(id)
    window.setTimeout(() => {
      setFlashTaskId((cur) => (cur === id ? null : cur))
    }, 1200)
    return id
  }

  const closePreviewTask = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('previewTaskId')
    next.delete('add')
    next.delete('addDate')
    next.delete('edit')
    next.delete('autoClose')
    setSearchParams(next, { replace: true })
    setAddDraft(null)
    setEditDraft(null)
    setEditTaskId(null)
    setAutoCloseAfterCompleteTaskId(null)
  }

  const animateClosePreview = (opts?: { cancelAutoAdd?: boolean }) => {
    if (sheetClosing) return
    if (opts?.cancelAutoAdd && !isAddMode && previewTask && autoCloseAfterCompleteTaskId === previewTask.id) {
      deleteTask(previewTask.id)
      setAutoCloseAfterCompleteTaskId(null)
    }
    setSheetClosing(true)
    closePreviewTask()
    setSheetClosing(false)
  }

  useEffect(() => {
    if (!shouldOpenAddFromNav) return
    if (addDraft || storedPreviewTask) return
    openTaskAdd({ date: addDateFromNav || undefined })
    navigate({ pathname: location.pathname, search: location.search }, { replace: true, state: null })
  }, [shouldOpenAddFromNav, addDateFromNav, addDraft, storedPreviewTask, navigate, location.pathname, location.search])

  useEffect(() => {
    if (!shouldOpenAdd) return
    if (addDraft || storedPreviewTask) return
    openTaskAdd({ date: addDateParam || undefined })
  }, [shouldOpenAdd, addDateParam, addDraft, storedPreviewTask])

  useEffect(() => {
    if (!previewTask || isAddMode) return
    if (sheetClosing) return
    setEditDraft(null)
    if (shouldAutoEdit) setEditTaskId(previewTask.id)
    else setEditTaskId(null)
    if (shouldAutoCloseAfterComplete) setAutoCloseAfterCompleteTaskId(previewTask.id)
    else setAutoCloseAfterCompleteTaskId(null)
  }, [previewTask?.id, isAddMode, sheetClosing, shouldAutoEdit, shouldAutoCloseAfterComplete])

  useEffect(() => {
    if (isAddMode) return
    if (!storedPreviewTask) return
    if (editTaskId !== storedPreviewTask.id) return
    setEditDraft({ ...storedPreviewTask })
  }, [editTaskId, storedPreviewTask?.id, isAddMode])

  useLayoutEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    if (!previewTask.subjectId) return
    const el = subjectPillRefs.current[previewTask.subjectId]
    if (!el) return
    el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' })
  }, [previewTask?.id, previewTask?.subjectId, editTaskId])

  const openCalendarFor = (field: 'date' | 'dueDate') => {
    if (!previewTask) return
    setDatePickerField(field)
    const current = parseYmd(field === 'date' ? previewTask.date : (previewTask.dueDate ?? ''))
    setCalendarMonth(startOfMonth(current ?? new Date()))
  }

  const pickCalendarDay = (d: Date) => {
    if (!previewTask) return
    const ymd = toYmd(d)
    if (datePickerField === 'date') patchPreviewTask({ date: ymd })
    if (datePickerField === 'dueDate') patchPreviewTask({ dueDate: ymd })
    setDatePickerField(null)
  }

  useEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    setPlannedSecondsDraft(Math.max(0, previewTask.plannedSeconds ?? 0))
  }, [previewTask?.id, previewTask?.subjectId, editTaskId, subjects])

  useEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    const currentTitle = previewTask.title ?? ''
    setEditTitleDraft(currentTitle)
    editTitleOriginalRef.current = { taskId: previewTask.id, title: currentTitle }
    const sample = isAddMode
      ? '제목 추가'
      : currentTitle.trim()
        ? currentTitle
        : (subjects.find((s) => s.id === previewTask.subjectId)?.name ?? '제목 추가')
    setEditTitleSample(sample || '제목 추가')
  }, [isAddMode, previewTask?.id, editTaskId, previewTask?.subjectId, subjects])

  const previewSubject = useMemo(
    () => subjects.find((subject) => subject.id === previewTask?.subjectId) ?? null,
    [subjects, previewTask?.subjectId],
  )
  const previewPlannedEnd =
    previewTask?.plannedStartTime && previewTask.plannedSeconds > 0
      ? addSecondsToHm(previewTask.plannedStartTime, previewTask.plannedSeconds)
      : null
  const previewActualSummary = useMemo(() => {
    if (!previewTask) return null
    if (typeof previewTask.actualSeconds !== 'number') return null
    if (previewTask.actualSeconds < 60) return null
    // 계획 소요시간이 없으면(시작시간만 있는 케이스 포함) 비교 그래프를 띄우지 않음.
    if (!(previewTask.plannedSeconds > 0)) return null

    const variance = previewTask.actualSeconds - previewTask.plannedSeconds
    if (variance < 0) {
      return {
        kind: 'compare' as const,
        goalLabel: formatDurationGraphKo(previewTask.plannedSeconds),
        actualLabel: formatDurationGraphKo(previewTask.actualSeconds),
        goalSeconds: previewTask.plannedSeconds,
        actualSeconds: previewTask.actualSeconds,
        deltaLabel: `${formatDurationGraphKo(Math.abs(variance))} 일찍 완료`,
      }
    }
    if (variance > 0) {
      return {
        kind: 'compare' as const,
        goalLabel: formatDurationGraphKo(previewTask.plannedSeconds),
        actualLabel: formatDurationGraphKo(previewTask.actualSeconds),
        goalSeconds: previewTask.plannedSeconds,
        actualSeconds: previewTask.actualSeconds,
        deltaLabel: `${formatDurationGraphKo(Math.abs(variance))} 오래 지속`,
      }
    }
    return {
      kind: 'compare' as const,
      goalLabel: formatDurationGraphKo(previewTask.plannedSeconds),
      actualLabel: formatDurationGraphKo(previewTask.actualSeconds),
      goalSeconds: previewTask.plannedSeconds,
      actualSeconds: previewTask.actualSeconds,
      deltaLabel: '딱 맞게 완료',
    }
  }, [previewTask])
  const previewHeadlineTimes = useMemo(() => {
    if (!previewTask) return []
    const showGraph = Boolean(previewActualSummary)
    const items: Array<{ kind: '계획' | '완료'; badge: string; text: ReactNode; key: string }> = []
    const buildNode = (input: { start?: string | null; end?: string | null; durationSeconds?: number | null }) =>
      buildTimeSummaryNode({ ...input, formatHm: (hm) => formatMeridiemHm(hm) })

    // Show "계획" when we have either start time or duration.
    if (previewTask.plannedStartTime || previewTask.plannedSeconds > 0) {
      const plannedText = previewTask.plannedStartTime
        ? showGraph
          ? buildNode({ start: previewTask.plannedStartTime, end: previewPlannedEnd, durationSeconds: null })
          : buildNode({
              start: previewTask.plannedStartTime,
              end: previewPlannedEnd,
              durationSeconds: previewTask.plannedSeconds > 0 ? previewTask.plannedSeconds : null,
            })
        : previewTask.plannedSeconds > 0
          ? (showGraph ? null : formatDurationPreciseKo(previewTask.plannedSeconds))
          : null
      if (plannedText) {
      items.push({
        kind: '계획',
        badge: '계획',
        text: plannedText,
        key: 'goal',
      })
      }
    }

    if (previewTask.actualStartTime || typeof previewTask.actualSeconds === 'number') {
      const actualText = showGraph
        ? buildNode({ start: previewTask.actualStartTime, end: previewTask.actualEndTime, durationSeconds: null })
        : buildNode({
            start: previewTask.actualStartTime,
            end: previewTask.actualEndTime,
            durationSeconds: typeof previewTask.actualSeconds === 'number' ? previewTask.actualSeconds : null,
          })
      items.push({
        kind: '완료',
        badge: '완료',
        text: actualText,
        key: 'actual',
      })
    }

    if (!items.some((item) => item.kind === '완료') && previewTask.status === 'completed') {
      items.push({
        kind: '완료',
        badge: '완료',
        text: '완료 처리',
        key: 'completed',
      })
    }

    return items
  }, [previewActualSummary, previewPlannedEnd, previewTask])
  const hasPreviewMeta = Boolean(isEditingPreview || previewHeadlineTimes.length || previewTask?.dueDate)
  const hasPreviewCompare = Boolean(previewActualSummary)

  // 일정 추가는 캘린더에서 하지 않고, 대시보드/과목 디테일에서 생성 후 날짜 배치하도록 유도

  const examMetaLabel = useMemo(() => {
    if (!activeExam) return null
    if (!examCountdown) return activeExam.name?.trim() || null
    const name = activeExam.name?.trim() || '시즌'
    const weeksLeft = typeof examCountdown.weeksLeft === 'number' ? examCountdown.weeksLeft : null
    const weekLabel = weeksLeft !== null ? `${name} ${weeksLeft}주 전` : name
    return `${weekLabel} · ${examCountdown.dday}`
  }, [activeExam, examCountdown])

  const displayMonthLabel = useMemo(() => format(parseISO(`${displayMonth}-01`), 'yyyy년 M월'), [displayMonth])
  const prevMonthLabel = useMemo(() => format(parseISO(`${prevMonth}-01`), 'M월'), [prevMonth])
  const nextMonthLabel = useMemo(() => format(parseISO(`${nextMonth}-01`), 'M월'), [nextMonth])

  useEffect(() => {
    try {
      if ('scrollRestoration' in window.history) window.history.scrollRestoration = 'manual'
    } catch {
      // ignore
    }
    if (scrollAnimRef.current) window.cancelAnimationFrame(scrollAnimRef.current)
  }, [])

  const onStartDockPointerDown = (e: React.PointerEvent, allowOnInteractive: boolean) => {
    // only for mobile floating widget; ignore right click etc.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (!allowOnInteractive && target?.closest('button, a')) return
    dragRef.current.isDragging = true
    dragRef.current.startX = e.clientX
    dragRef.current.startY = e.clientY
    dragRef.current.dx = 0
    dragRef.current.dy = 0
    dragRef.current.didDrag = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onStartDockPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return
    dragRef.current.dx = e.clientX - dragRef.current.startX
    dragRef.current.dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.didDrag && Math.hypot(dragRef.current.dx, dragRef.current.dy) > 6) dragRef.current.didDrag = true
    const root = (e.currentTarget as HTMLElement).closest('[data-start-dock-root]') as HTMLElement | null
    if (root) root.style.transform = `translate3d(${dragRef.current.dx}px, ${dragRef.current.dy}px, 0)`
  }

  const onStartDockPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return
    dragRef.current.isDragging = false
    if (dragRef.current.didDrag) dragRef.current.lastDragAt = Date.now()
    const root = (e.currentTarget as HTMLElement).closest('[data-start-dock-root]') as HTMLElement | null
    if (root) root.style.transform = ''
    const vh = window.innerHeight || 1
    const v: 'top' | 'bottom' = e.clientY < vh / 2 ? 'top' : 'bottom'
    setStartDock({ v, h: 'right' })
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const shouldIgnoreClickAfterDrag = () => Date.now() - (dragRef.current.lastDragAt || 0) < 350

  const startDockOrigin = startDock.v === 'top' ? 'origin-top-right' : 'origin-bottom-right'

  const onStartPendingWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    // Let native scrolling happen (so wheel inertia/trackpad feels right),
    // but never allow the background month calendar to capture the wheel.
    e.stopPropagation()

    // Optional: shift+wheel scrolls horizontally.
    if (e.shiftKey && e.deltaX === 0) {
      e.preventDefault()
      e.currentTarget.scrollLeft += e.deltaY
    }
  }

  const monthGridRef = useRef<HTMLDivElement | null>(null)
  const [monthGridHeight, setMonthGridHeight] = useState(0)
  const monthProbeCellRef = useRef<HTMLDivElement | null>(null)
  const monthProbeTasksRef = useRef<HTMLDivElement | null>(null)
  const monthProbeTaskRowRef = useRef<HTMLButtonElement | null>(null)
  const monthProbeMoreRowRef = useRef<HTMLDivElement | null>(null)
  const [monthCellMaxTasks, setMonthCellMaxTasks] = useState(4)

  useLayoutEffect(() => {
    const el = monthGridRef.current
    if (!el) return

    const update = () => setMonthGridHeight(el.getBoundingClientRect().height)
    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(el)
    return () => ro.disconnect()
  }, [displayMonth])

  useLayoutEffect(() => {
    const cellEl = monthProbeCellRef.current
    const tasksEl = monthProbeTasksRef.current
    const taskRowEl = monthProbeTaskRowRef.current
    const moreRowEl = monthProbeMoreRowRef.current

    if (!cellEl || !tasksEl || !taskRowEl || !moreRowEl) return

    const clamp = (n: number, min: number, max: number) => Math.max(min, Math.min(max, n))
    const calc = () => {
      const tasksH = tasksEl.getBoundingClientRect().height
      const taskRowH = taskRowEl.getBoundingClientRect().height
      if (!Number.isFinite(tasksH) || !Number.isFinite(taskRowH) || tasksH <= 0 || taskRowH <= 0) {
        setMonthCellMaxTasks(4)
        return
      }

      // `divide-y` adds a 1px border between rows; include it to avoid overestimating.
      const dividerPx = 1
      const effectiveRowH = taskRowH + dividerPx
      // Allow a tiny epsilon to reduce off-by-1 due to subpixel rounding.
      const epsilon = 0.75
      const maxLines = Math.floor((tasksH + epsilon) / effectiveRowH)
      // Let it grow with available height (mobile tall screens can show many).
      setMonthCellMaxTasks(clamp(maxLines, 0, 30))
    }

    calc()
    const ro = new ResizeObserver(() => calc())
    ro.observe(cellEl)
    ro.observe(tasksEl)
    ro.observe(taskRowEl)
    ro.observe(moreRowEl)
    return () => ro.disconnect()
  }, [displayMonth, monthWeeks.length, monthGridHeight])

  const onMonthGridPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    const target = e.target as HTMLElement | null
    // Avoid interfering with tapping tasks (buttons) inside a day cell.
    if (target?.closest('button')) return
    // Avoid interfering with tapping the day cell itself (single tap should navigate).
    if (target?.closest('[data-month-day-cell="true"]')) return
    monthSwipeRef.current.isDown = true
    monthSwipeRef.current.startX = e.clientX
    monthSwipeRef.current.startY = e.clientY
    monthSwipeRef.current.lastX = e.clientX
    setIsMonthDragging(true)
    setMonthDragX(0)
  }

  const onMonthGridPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (!monthSwipeRef.current.isDown) return
    const dx = e.clientX - monthSwipeRef.current.startX
    const dy = e.clientY - monthSwipeRef.current.startY
    // only start horizontal drag if it's clearly horizontal
    if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return
    if (Math.abs(dy) > Math.abs(dx) * 0.9) return
    monthSwipeRef.current.lastX = e.clientX
    setMonthDragX(dx)
  }

  const onMonthGridPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType !== 'touch') return
    if (!monthSwipeRef.current.isDown) return
    monthSwipeRef.current.isDown = false
    setIsMonthDragging(false)

    const dx = e.clientX - monthSwipeRef.current.startX
    const dy = e.clientY - monthSwipeRef.current.startY
    const threshold = 62
    if (Math.abs(dx) < threshold || Math.abs(dy) > 28) {
      setMonthDragX(0)
      return
    }

    if (dx < 0) {
      setMonthDragX(0)
      setDisplayMonth(nextMonth)
      return
    }

    setMonthDragX(0)
    setDisplayMonth(prevMonth)
  }

  useEffect(() => {
    // reset drag offset when month changes
    setMonthDragX(0)
    setIsMonthDragging(false)
    monthSwipeRef.current.isDown = false
  }, [displayMonth])

  const renderMonthGrid = (weeks: string[], month: string) => {
    return (
      <div
        className="grid h-full min-h-0"
        style={{
          gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          gridTemplateRows: `repeat(${Math.max(1, weeks.length)}, minmax(0, 1fr))`,
        }}
      >
        {weeks
          .flatMap((weekStart) => {
            const weekStartDate = parseISO(weekStart)
            return Array.from({ length: 7 }, (_, i) => format(addDays(weekStartDate, i), 'yyyy-MM-dd'))
          })
          .map((ymd, idx) => {
            const dayMonth = ymd.slice(0, 7)
            const isCurrentMonth = dayMonth === month
            const isToday = ymd === todayYmd()
            const dayNum = Number(ymd.slice(8, 10))
            const cellTasks = (tasksByDate.get(ymd) ?? [])
              .slice()
              .sort((a, b) => {
                const aHasActual = typeof a.actualSeconds === 'number' && Number.isFinite(a.actualSeconds)
                const bHasActual = typeof b.actualSeconds === 'number' && Number.isFinite(b.actualSeconds)
                const aHasAnyRecord = Boolean(a.actualStartTime || a.actualEndTime || aHasActual)
                const bHasAnyRecord = Boolean(b.actualStartTime || b.actualEndTime || bHasActual)
                const aCompleted = a.status === 'completed' || aHasAnyRecord
                const bCompleted = b.status === 'completed' || bHasAnyRecord
                if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
                const aStart = hmToMinutes(a.actualStartTime ?? a.plannedStartTime ?? null)
                const bStart = hmToMinutes(b.actualStartTime ?? b.plannedStartTime ?? null)

                if (aStart === null && bStart !== null) return 1
                if (aStart !== null && bStart === null) return -1
                if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart
                return a.createdAt.localeCompare(b.createdAt)
              })
            const isProbe = idx === 0
            const weekStartYmd = format(startOfWeek(parseISO(ymd), { weekStartsOn: 1 }), 'yyyy-MM-dd')
            const isWeekHighlighted = Boolean(longPressWeekStartYmd && weekStartYmd === longPressWeekStartYmd)
            const weekDayIdxRaw = getDay(parseISO(ymd)) // 0=Sun ... 6=Sat
            const weekDayIdx = (weekDayIdxRaw + 6) % 7 // 0=Mon ... 6=Sun
            const maxLines = monthCellMaxTasks
            const visible = cellTasks.slice(0, maxLines)
            const more = cellTasks.length - visible.length

            return (
              <div
                key={`${month}-${ymd}`}
                data-month-day-cell="true"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') navigate(`/day/${ymd}`)
                }}
                onPointerDown={(e) => {
                  if ((e.target as HTMLElement | null)?.closest('button')) return
                  if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer)
                  longPressRef.current.armed = false
                  longPressRef.current.moved = false
                  longPressRef.current.startX = e.clientX
                  longPressRef.current.startY = e.clientY
                  longPressRef.current.weekStartYmd = weekStartYmd
                  longPressRef.current.dayYmd = ymd
                  setPressedDayYmd(ymd)
                  setLongPressWeekStartYmd(null)
                  try {
                    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
                  } catch {
                    // ignore
                  }
                  longPressRef.current.timer = window.setTimeout(() => {
                    if (longPressRef.current.moved) return
                    longPressRef.current.firedAt = Date.now()
                    longPressRef.current.timer = null
                    longPressRef.current.armed = true
                    setLongPressWeekStartYmd(weekStartYmd)
                  }, 420)
                }}
                onPointerMove={(e) => {
                  if (!pressedDayYmd) return
                  const dx = e.clientX - longPressRef.current.startX
                  const dy = e.clientY - longPressRef.current.startY
                  if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
                  longPressRef.current.moved = true
                  if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer)
                  longPressRef.current.timer = null
                  longPressRef.current.armed = false
                  longPressRef.current.weekStartYmd = null
                  longPressRef.current.dayYmd = null
                  setLongPressWeekStartYmd(null)
                  setPressedDayYmd(null)
                }}
                onPointerUp={(e) => {
                  if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer)
                  longPressRef.current.timer = null
                  const armed = longPressRef.current.armed
                  const w = longPressRef.current.weekStartYmd
                  const d = longPressRef.current.dayYmd
                  const moved = longPressRef.current.moved
                  longPressRef.current.armed = false
                  longPressRef.current.moved = false
                  longPressRef.current.weekStartYmd = null
                  longPressRef.current.dayYmd = null
                  setLongPressWeekStartYmd(null)
                  setPressedDayYmd(null)
                  if (moved) return
                  if (!d) return
                  if (Date.now() - (longPressRef.current.firedAt || 0) < 200) {
                    // ignore stray click after long-press timer
                  }
                  if (armed && w) {
                    navigate(`/week?weekStart=${encodeURIComponent(w)}`)
                    return
                  }
                  // short press: go to day
                  if ((e.target as HTMLElement | null)?.closest('button')) return
                  navigate(`/day/${d}`)
                }}
                onPointerCancel={() => {
                  if (longPressRef.current.timer) window.clearTimeout(longPressRef.current.timer)
                  longPressRef.current.timer = null
                  longPressRef.current.armed = false
                  longPressRef.current.weekStartYmd = null
                  longPressRef.current.dayYmd = null
                  setLongPressWeekStartYmd(null)
                  setPressedDayYmd(null)
                }}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverDate(ymd)
                }}
                onDragLeave={() => {
                  setDragOverDate((cur) => (cur === ymd ? null : cur))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const taskId = e.dataTransfer.getData('text/emma-task-id')
                  if (taskId) updateTask(taskId, { date: ymd })
                  setDragOverDate(null)
                }}
                className={`relative flex min-h-0 cursor-pointer flex-col overflow-hidden border-b border-r border-slate-100 p-1.5 md:p-2 ${
                  isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                }`}
                ref={isProbe ? monthProbeCellRef : undefined}
              >
                {isToday ? <div className="pointer-events-none absolute inset-0 z-0 rounded-[2px] border-2 border-slate-300" /> : null}
                {dragOverDate === ymd ? (
                  <div className="pointer-events-none absolute inset-0 z-0 rounded-[2px] border-2 border-slate-400" />
                ) : null}
                {pressedDayYmd === ymd && !longPressWeekStartYmd ? (
                  <div className="pointer-events-none absolute inset-0 z-0 rounded-[2px] border-2 border-black/45" />
                ) : null}
                {isWeekHighlighted ? (
                  <div
                    className={`pointer-events-none absolute inset-0 z-0 ${
                      weekDayIdx === 0 ? 'border-l-2' : 'border-l-0'
                    } ${weekDayIdx === 6 ? 'border-r-2' : 'border-r-0'} border-y-2 border-black/45`}
                  />
                ) : null}
                <div className="relative z-10 flex w-full shrink-0 items-center justify-between gap-1">
                  <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>{dayNum}</div>
                  {more > 0 ? (
                    <div className="shrink-0 text-[11px] font-semibold leading-none text-slate-400 tabular-nums">+{more}</div>
                  ) : null}
                </div>
                <div
                  className="relative z-10 -mx-1.5 mt-1 flex min-h-0 flex-1 flex-col overflow-hidden divide-y divide-slate-200 md:-mx-2"
                  ref={isProbe ? monthProbeTasksRef : undefined}
                >
                  {visible.map((t) => {
                    const subject = subjects.find((s) => s.id === t.subjectId)
                    const bg = subject?.color ?? '#94a3b8'
                    const textColor = pickReadableTextColor(bg)
                    const dday = formatDday(t.dueDate)
                    const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                    const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || hasActual)
                    const isCompleted = t.status === 'completed' || hasAnyRecord
                    const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                    const timeLabelKo = formatDurationKoFromSeconds(secondsToShow)
                    const desktopTagText = isCompleted ? '✓' : dday ? dday : t.plannedSeconds > 0 ? timeLabelKo : null
                    const mobileMaxUnits = 14
                    const desktopMaxUnits = 22
                    const titleMaxUnitsMobile = mobileMaxUnits
                    const titleMaxUnitsDesktop = desktopMaxUnits - measureUnits(desktopTagText ?? '') - 1
                    const titleMobile = truncateToUnits(t.title, titleMaxUnitsMobile)
                    const titleDesktop = truncateToUnits(t.title, titleMaxUnitsDesktop)

                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          openPreviewTask(t.id)
                        }}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/emma-task-id', t.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDragOverDate(null)}
                        className={`box-border block w-full select-none rounded-[3px] py-[1px] pl-1.5 pr-0 text-left text-[11px] leading-tight active:cursor-grabbing md:py-0.5 md:pl-2 md:text-[11px] ${
	                          flashTaskId === t.id ? 'emma-flash-3' : ''
	                        }`}
                        data-completed={isCompleted ? 'true' : 'false'}
                        style={{ background: bg, color: textColor, filter: isCompleted ? 'saturate(0.85) brightness(0.97)' : undefined }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="min-w-0 overflow-hidden whitespace-nowrap">
                            <span className="md:hidden">{titleMobile}</span>
                            <span className="hidden md:inline">{titleDesktop}</span>
                          </span>
                          {isCompleted ? (
                            <span className="shrink-0 tabular-nums text-[9px] font-semibold leading-none tracking-tighter md:hidden">
                              <span className="px-1 py-[1px]" style={{ color: textColor }}>
                                ✓
                              </span>
                            </span>
                          ) : null}
                          {desktopTagText ? (
                            <span className="hidden shrink-0 tabular-nums text-[9px] font-semibold leading-none tracking-tighter md:inline">
                              <span
                                className={`px-1 py-[1px] ${
                                  isCompleted
                                    ? ''
                                    : `bg-white/60 ${dday ? 'text-indigo-700' : 'text-slate-700'}`
                                }`}
                                style={isCompleted ? { color: textColor } : undefined}
                              >
                                {desktopTagText}
                              </span>
                            </span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                  {/* "+N" moved to top-right badge */}
                  {isProbe ? (
                    <div className="pointer-events-none absolute left-0 top-0 opacity-0" aria-hidden="true">
                      <button
                        ref={monthProbeTaskRowRef}
                        type="button"
                        tabIndex={-1}
                        className="box-border block w-full select-none rounded-[3px] py-0.5 pl-1.5 pr-0 text-left text-[10px] leading-none md:py-1 md:pl-2"
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="min-w-0 overflow-hidden whitespace-nowrap">
                            <span className="md:hidden">수학 18</span>
                            <span className="hidden md:inline">수학 18</span>
                          </span>
                          <span className="hidden shrink-0 tabular-nums text-[9px] font-semibold leading-none tracking-tighter md:inline">
                            <span className="bg-white/60 px-1 py-[1px] text-slate-700">10분</span>
                          </span>
                        </div>
                      </button>
                      <div ref={monthProbeMoreRowRef} className="px-0.5 text-[11px] leading-tight text-slate-400">
                        +2
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            )
          })}
      </div>
    )
  }

  return (
    <div className="flex h-[calc(100dvh-72px-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      <MobileTopBar
        title=""
        left={
          <Button
            variant="secondary"
            onClick={() => {
              setDisplayMonth(prevMonth)
            }}
          >
            {prevMonthLabel}
          </Button>
        }
        center={
          <button
            type="button"
            onClick={() => {
              const now = format(new Date(), 'yyyy-MM')
              setDisplayMonth(now)
            }}
            className="flex w-full flex-col items-center justify-center gap-0.5 rounded-xl py-1.5 text-center hover:bg-slate-50"
            aria-label="이번달로 이동"
          >
            <div className="flex items-center justify-center gap-2">
              <div className="text-sm font-semibold text-slate-900">{displayMonthLabel}</div>
            </div>
            {examMetaLabel ? <div className="text-[11px] text-slate-600">{examMetaLabel}</div> : null}
          </button>
        }
        right={
          <Button
            variant="secondary"
            onClick={() => {
              setDisplayMonth(nextMonth)
            }}
          >
            {nextMonthLabel}
          </Button>
        }
      />

      <div
        className="mt-2 flex min-h-0 flex-1 flex-col overflow-hidden md:mt-3"
        style={{
          overscrollBehaviorY: 'contain',
        }}
      >
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-600">
          {[
            { k: 'Mon', label: '월', cls: 'text-slate-600' },
            { k: 'Tue', label: '화', cls: 'text-slate-600' },
            { k: 'Wed', label: '수', cls: 'text-slate-600' },
            { k: 'Thu', label: '목', cls: 'text-slate-600' },
            { k: 'Fri', label: '금', cls: 'text-slate-600' },
            { k: 'Sat', label: '토', cls: 'text-blue-600' },
            { k: 'Sun', label: '일', cls: 'text-rose-600' },
          ].map((d) => (
            <div key={d.k} className={`px-1 py-2 text-center md:px-2 ${d.cls}`}>
              {d.label}
            </div>
          ))}
        </div>

        <div
          ref={monthGridRef}
          onPointerDown={onMonthGridPointerDown}
          onPointerMove={onMonthGridPointerMove}
          onPointerUp={onMonthGridPointerUp}
          onPointerCancel={() => {
            monthSwipeRef.current.isDown = false
            setIsMonthDragging(false)
            setMonthDragX(0)
          }}
          className="relative min-h-0 flex-1 overflow-hidden px-3"
          style={{ touchAction: 'none' }}
        >
          <div
            className="absolute inset-0"
            style={{
              opacity: isMonthDragging ? 1 : 0,
              transition: isMonthDragging ? 'none' : 'opacity 120ms ease-out',
            }}
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]"
              style={{ transform: `translate3d(calc(-100% + ${monthDragX}px), 0, 0)` }}
            >
              {renderMonthGrid(prevMonthWeeks, prevMonth)}
            </div>
            <div
              className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]"
              style={{ transform: `translate3d(calc(100% + ${monthDragX}px), 0, 0)` }}
            >
              {renderMonthGrid(nextMonthWeeks, nextMonth)}
            </div>
          </div>

          <div
            className="absolute inset-0 overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_1px_0_rgba(15,23,42,0.02)]"
            style={{
              transform: `translate3d(${monthDragX}px, 0, 0)`,
              transition: isMonthDragging ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
              willChange: 'transform',
            }}
          >
            {renderMonthGrid(monthWeeks, displayMonth)}
          </div>
        </div>
      </div>

	        {previewTask ? (
	          <TaskDialogShell
	            open
	            onClose={closePreviewTask}
	            onBackdropClick={() => {
	              if (sheetClosing) return
	              if (isAddMode) {
	                closePreviewTask()
	                return
	              }
	              if (!isEditingPreview) {
	                animateClosePreview()
	                return
	              }
	              const start = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualStartTime ?? null)
	              const end = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualEndTime ?? null)
	              const hasOnlyOne = !previewTask.recordCompleteOnly && ((start === null) !== (end === null))
	              const invalidRange = !previewTask.recordCompleteOnly && start !== null && end !== null && end < start
	              if (hasOnlyOne || invalidRange) {
	                setEditExitConfirmOpen(true)
	                return
	              }
	              setEditTaskId(null)
	            }}
	            titleRow={null}
	            footer={null}
	          >
	              <div
	                className="md:hidden px-5 pt-2"
	                style={{ touchAction: 'none' }}
	                onPointerDown={(e) => {
	                  sheetDragRef.current = { startY: e.clientY, isDragging: true }
	                  setSheetIsDragging(true)
	                  sheetDragYRef.current = 0
	                  setSheetDragY(0)
	                  ;(e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId)
	                }}
	                onPointerMove={(e) => {
	                  if (!sheetDragRef.current.isDragging) return
	                  const dy = Math.max(0, e.clientY - sheetDragRef.current.startY)
	                  sheetDragYRef.current = dy
	                  setSheetDragY(dy)
	                }}
	                onPointerUp={(e) => {
	                  if (!sheetDragRef.current.isDragging) return
	                  sheetDragRef.current.isDragging = false
	                  setSheetIsDragging(false)
	                  const dy = sheetDragYRef.current
	                  if (dy > 120) {
	                    closePreviewTask()
	                    return
	                  }
	                  sheetDragYRef.current = 0
	                  setSheetDragY(0)
	                  try {
	                    ;(e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId)
	                  } catch {
	                    // ignore
	                  }
	                }}
	                onPointerCancel={() => {
	                  sheetDragRef.current.isDragging = false
	                  setSheetIsDragging(false)
	                  sheetDragYRef.current = 0
	                  setSheetDragY(0)
	                }}
	              >
	                <div
	                  role="button"
	                  tabIndex={0}
	                  aria-label="드래그로 닫기"
	                  className="mx-auto h-1.5 w-12 rounded-full bg-slate-300"
	                />
	              </div>
	              <div className="px-5 py-5 md:px-6">
	                {(() => {
	                  const isEditing = editTaskId === previewTask.id
	                  return (
	                    <>
	                      <div className="flex items-center justify-between gap-3">
	                        {isEditing ? (
	                          <div ref={subjectPickerRef} className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overflow-y-visible px-1 py-1">
	                            {scopedSubjects.map((subject) => {
	                              const selected = subject.id === previewTask.subjectId
	                              return (
	                                <button
	                                  key={subject.id}
	                                  type="button"
	                                  ref={(el) => {
	                                    subjectPillRefs.current[subject.id] = el
	                                  }}
	                                  onClick={() => {
	                                    patchPreviewTask({ subjectId: subject.id })
	                                    if (!editTitleDraft.trim() && isAddMode) setEditTitleSample('제목 추가')
	                                  }}
	                                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
	                                    selected
	                                      ? 'ring-2 ring-slate-900/15 ring-offset-1 opacity-100'
	                                      : 'border border-slate-200/70 opacity-45 saturate-[0.75]'
	                                  }`}
	                                  style={{
	                                    background: subject.color,
	                                    color: pickReadableTextColor(subject.color),
	                                  }}
	                                  aria-label={`과목 ${subject.name} 선택`}
	                                >
	                                  {subject.name}
	                                </button>
	                              )
	                            })}
	                          </div>
	                        ) : (
	                          <div className="flex min-w-0 items-center gap-2">
	                            {(() => {
	                              const hasAnyRecord = Boolean(
	                                previewTask.actualStartTime ||
	                                  previewTask.actualEndTime ||
	                                  typeof previewTask.actualSeconds === 'number',
	                              )
	                              const isCompleted = previewTask.status === 'completed' || hasAnyRecord
	                              const color = previewSubject?.color ?? '#94a3b8'
	                              return isCompleted ? (
	                                <span
	                                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
	                                  style={{ background: color }}
	                                  aria-hidden="true"
	                                >
	                                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white">
	                                    <path
	                                      d="M20 6L9 17l-5-5"
	                                      fill="none"
	                                      stroke="currentColor"
	                                      strokeWidth="3"
	                                      strokeLinecap="round"
	                                      strokeLinejoin="round"
	                                    />
	                                  </svg>
	                                </span>
	                              ) : (
	                                <span
	                                  className="inline-block h-4 w-4 shrink-0 rounded-[5px] border-2"
	                                  style={{ borderColor: color }}
	                                  aria-hidden="true"
	                                />
	                              )
	                            })()}
	                            <span className="truncate text-sm font-semibold text-slate-500">{previewSubject?.name ?? '과목'}</span>
	                          </div>
	                        )}
	                        <button
	                          type="button"
	                          onClick={closePreviewTask}
	                          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
	                          aria-label="닫기"
	                        >
	                          <span aria-hidden="true" className="text-xl leading-none">
	                            ×
	                          </span>
	                        </button>
	                      </div>

	                      {isEditing ? (
	                        <div
	                          className="mt-2.5 rounded-2xl bg-slate-50 px-4 py-3"
	                        >
	                          <input
	                            value={editTitleDraft}
	                            onChange={(e) => setEditTitleDraft(e.target.value)}
	                            placeholder={editTitleSample || '제목 추가'}
	                            className="w-full bg-transparent text-2xl font-semibold leading-tight text-slate-900 outline-none placeholder:text-slate-400 md:text-[30px]"
	                          />
	                        </div>
	                      ) : (
	                        <div className="mt-2.5 text-2xl font-semibold leading-tight text-slate-900 md:text-[30px]">
	                          {previewTask.title}
	                        </div>
	                      )}
	                    </>
	                  )
	                })()}
	                {isEditingPreview ? (
	                  <div className="mt-2 px-4">
	                    <button
	                      type="button"
	                      onClick={() => openCalendarFor('date')}
	                      className="inline-flex cursor-pointer items-center gap-2 text-base font-medium text-slate-500 underline decoration-slate-200 decoration-dotted underline-offset-4 transition hover:text-slate-700 hover:decoration-slate-400"
	                      aria-label="날짜 선택"
	                    >
	                      <span>{formatTaskPreviewDate(previewTask.date) ?? '날짜 선택'}</span>
	                      {previewTask.date ? (
	                        <span
	                          role="button"
	                          tabIndex={0}
	                          onClick={(e) => {
	                            e.stopPropagation()
	                            patchPreviewTask({ date: '' })
	                          }}
	                          onKeyDown={(e) => {
	                            if (e.key !== 'Enter' && e.key !== ' ') return
	                            e.preventDefault()
	                            e.stopPropagation()
	                            patchPreviewTask({ date: '' })
	                          }}
	                          className="shrink-0 text-base font-semibold text-slate-400 no-underline transition hover:text-slate-600"
	                          aria-label="날짜 삭제"
	                        >
	                          ×
	                        </span>
	                      ) : null}
	                    </button>
	                  </div>
	                ) : previewTask.date ? (
	                  <div className="mt-2 text-base text-slate-500">{formatTaskPreviewDate(previewTask.date)}</div>
	                ) : null}
	              </div>

	              <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
		                {hasPreviewMeta ? (
		                  <div className="pt-2 md:col-span-2">
		                    <div className="space-y-3">
		                      {isEditingPreview ? (
		                        <div className="space-y-3">
		                          <div className="flex flex-nowrap items-center gap-2.5 text-base font-medium text-indigo-700">
	                            <button
	                              type="button"
	                              onClick={() => openCalendarFor('dueDate')}
	                              className="shrink-0 cursor-pointer rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
	                              aria-label="디데이 선택"
	                            >
	                              {formatDday(previewTask.dueDate) ?? '마감'}
	                            </button>
		                            <button
		                              type="button"
		                              onClick={() => openCalendarFor('dueDate')}
		                              className={`min-w-0 cursor-pointer whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.03em] ${
		                                previewTask.dueDate
		                                  ? 'text-indigo-700 decoration-indigo-200 hover:decoration-indigo-400'
		                                  : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
		                              }`}
		                              aria-label="마감 날짜 선택"
		                            >
		                              {previewTask.dueDate ? formatDueDateLabel(previewTask.dueDate) : '마감 날짜 선택'}
		                            </button>
		                            {previewTask.dueDate ? (
		                              <button
		                                type="button"
		                                onClick={() => patchPreviewTask({ dueDate: undefined })}
		                                className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
		                                aria-label="디데이 삭제"
		                              >
		                                ×
		                              </button>
		                            ) : null}
		                          </div>

		                          {editValidationMessage ? (
		                            <div className="text-sm font-semibold text-rose-700">{editValidationMessage}</div>
		                          ) : null}
		                          {editWarningMessage ? (
		                            <div className="text-sm font-semibold text-amber-700">{editWarningMessage}</div>
		                          ) : null}

			                          <div className="flex min-w-0 flex-nowrap items-center gap-2 text-base font-medium text-slate-700">
			                            <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-500">
			                              계획
			                            </span>
			                            <button
			                              type="button"
			                              onClick={() => {
			                                setTimePickerField('plannedStartTime')
			                                setTimePickerOpen(true)
			                              }}
			                              className={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
			                                previewTask.plannedStartTime
			                                  ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
			                                  : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
			                              }`}
			                              aria-label="시작시간 입력"
			                            >
			                              {previewTask.plannedStartTime
			                                ? formatMeridiemHm(previewTask.plannedStartTime) ?? previewTask.plannedStartTime
			                                : '시작시간'}
			                            </button>
			                            {previewTask.plannedStartTime ? (
			                              <button
			                                type="button"
			                                onClick={() => patchPreviewTask({ plannedStartTime: undefined })}
			                                className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
			                                aria-label="계획 시작시간 삭제"
			                              >
			                                ×
			                              </button>
			                            ) : null}
			                            <span className="shrink-0 px-1 text-slate-400">-</span>
			                            <DurationPickerButton
			                              valueSeconds={plannedSecondsDraft}
			                              onChangeSeconds={(nextSeconds) => setPlannedSecondsDraft(nextSeconds)}
			                              maxHours={10}
			                              buttonLabel={plannedSecondsDraft > 0 ? formatDurationPreciseKo(plannedSecondsDraft) : '소요시간'}
			                              buttonClassName={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left text-base font-medium tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
			                                plannedSecondsDraft > 0
			                                  ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
			                                  : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
			                              }`}
			                              ariaLabel="소요시간 입력"
			                              open={plannedDurationPickerOpen}
			                              onOpenChange={(next) => {
			                                setPlannedDurationPickerOpen(next)
			                                if (!next) patchPreviewTask({ plannedSeconds: plannedSecondsDraft })
			                              }}
			                            />
			                            {plannedSecondsDraft > 0 ? (
			                              <button
			                                type="button"
			                                onClick={() => {
			                                  setPlannedSecondsDraft(0)
			                                  patchPreviewTask({ plannedSeconds: 0 })
			                                }}
			                                className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
			                                aria-label="계획 소요시간 삭제"
			                              >
			                                ×
			                              </button>
			                            ) : null}
			                            <span className="shrink-0 px-1 text-slate-400">-</span>
			                            <button
			                              type="button"
			                              onClick={() => {
			                                setTimePickerField('plannedEndTime')
			                                setTimePickerOpen(true)
			                              }}
			                              className={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
			                                previewTask.plannedStartTime && plannedSecondsDraft > 0
			                                  ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
			                                  : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
			                              }`}
			                              aria-label="종료시간 입력"
			                            >
			                              {previewTask.plannedStartTime && plannedSecondsDraft > 0
			                                ? formatMeridiemHm(addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft) ?? '') ??
			                                  addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft) ??
			                                  '종료시간'
			                                : '종료시간'}
			                            </button>
			                          </div>

		                          <div className="flex flex-col gap-2 md:flex-row md:items-center">
		                            <div className="flex min-w-0 flex-nowrap items-center gap-3 text-base font-medium text-slate-700 md:flex-1">
                              <span className="shrink-0 whitespace-nowrap rounded-full bg-black/80 px-3 py-1.5 text-sm font-semibold text-white">
		                                완료
		                              </span>
		                              {previewTask.recordCompleteOnly ? (
		                                <span className="min-w-0 truncate whitespace-nowrap tracking-[-0.02em] text-slate-700 md:tracking-[-0.04em]">
		                                  완료 처리
		                                </span>
		                              ) : (
		                                <>
		                                  <button
		                                    type="button"
		                                    onClick={() => {
		                                      setTimePickerField('actualStartTime')
		                                      setTimePickerOpen(true)
		                                    }}
		                                    className={`min-w-0 truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] cursor-pointer ${
		                                      previewTask.actualStartTime
		                                        ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
		                                        : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
		                                    }`}
		                                    aria-label="시작시간 입력"
		                                  >
		                                    {previewTask.actualStartTime
		                                      ? `${formatMeridiemHm(previewTask.actualStartTime) ?? previewTask.actualStartTime}부터`
		                                      : '시작시간 입력'}
		                                  </button>
		                                  <span className="shrink-0 px-1.5 text-slate-400">·</span>
		                                  <button
		                                    type="button"
		                                    onClick={() => {
		                                      setTimePickerField('actualEndTime')
		                                      setTimePickerOpen(true)
		                                    }}
		                                    className={`min-w-0 truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] cursor-pointer ${
		                                      previewTask.actualEndTime
		                                        ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
		                                        : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
		                                    }`}
		                                    aria-label="종료시간 입력"
		                                  >
		                                    {previewTask.actualEndTime
		                                      ? `${formatMeridiemHm(previewTask.actualEndTime) ?? previewTask.actualEndTime}까지`
		                                      : '종료시간 입력'}
		                                  </button>
		                                  {previewTask.actualStartTime || previewTask.actualEndTime ? (
		                                    <button
		                                      type="button"
                                      onClick={() => {
                                        patchPreviewTask({
                                          actualStartTime: undefined,
                                          actualEndTime: undefined,
                                          actualSeconds: undefined,
                                          status: 'pending',
                                        })
                                      }}
		                                      className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
		                                      aria-label="완료 삭제"
		                                    >
		                                      ×
		                                    </button>
		                                  ) : null}
		                                </>
		                              )}
		                            </div>

		                            <label className="flex w-fit cursor-pointer items-center gap-2 self-end text-sm font-semibold text-slate-600 md:ml-auto md:self-auto">
		                            <input
		                              type="checkbox"
		                              checked={Boolean(previewTask.recordCompleteOnly)}
		                              onChange={(e) => {
		                                const checked = e.target.checked
		                                patchPreviewTask({
		                                  recordCompleteOnly: checked,
		                                  status: checked ? 'completed' : 'pending',
		                                  actualStartTime: undefined,
		                                  actualEndTime: undefined,
		                                  actualSeconds: undefined,
		                                })
		                              }}
		                              className="h-4 w-4 rounded border-slate-300"
		                            />
		                            완료 처리
		                          </label>
		                          </div>
		                        </div>
	                      ) : (
	                        <>
	                          {previewTask.dueDate ? (
	                            <div className="flex flex-nowrap items-center gap-2.5 text-base font-medium text-indigo-700">
	                              <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
	                                {formatDday(previewTask.dueDate)}
	                              </span>
	                              <span className="min-w-0 whitespace-nowrap tracking-[-0.02em] md:tracking-[-0.03em] text-indigo-700">
	                                {formatDueDateLabel(previewTask.dueDate)}
	                              </span>
	                            </div>
	                          ) : null}
	                          <div className={`grid gap-3 ${previewHeadlineTimes.length > 1 && hasPreviewCompare ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
	                            {previewHeadlineTimes.map((item) => (
	                              <div
	                                key={item.key}
	                                className={`flex w-full min-w-0 flex-nowrap items-center gap-2.5 text-base font-medium ${
	                                  item.kind === '계획' ? 'text-slate-400' : 'text-slate-700'
	                                }`}
	                              >
	                                <span
	                                  className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
	                                    item.kind === '완료' ? 'bg-black/80 text-white' : 'bg-slate-100 text-slate-500'
	                                  }`}
	                                >
	                                  {item.badge}
	                                </span>
	                                {item.text ? (
	                                  <span className="min-w-0 flex-1 whitespace-nowrap tracking-[-0.02em] md:tracking-[-0.04em]">
	                                    {item.text}
	                                  </span>
	                                ) : null}
	                              </div>
	                            ))}
	                          </div>
	                        </>
	                      )}
		                    </div>
		                  </div>
		                ) : null}
	                {!isEditingPreview && hasPreviewCompare ? (
	                  <div className="pt-3 md:col-span-2">
	                    <div className="py-1 text-center">
	                      {previewActualSummary ? (
	                        <CompareRail
                          goalLabel={previewActualSummary.goalLabel}
                          actualLabel={previewActualSummary.actualLabel}
                          deltaLabel={previewActualSummary.deltaLabel}
                          goalSeconds={previewActualSummary.goalSeconds}
                          actualSeconds={previewActualSummary.actualSeconds}
                        />
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {previewTask.memo ? (
                  <div className="rounded-2xl bg-slate-50 px-4 py-3.5 md:col-span-2">
                    <div className="text-xs font-semibold text-slate-500">메모</div>
                    <div className="mt-1.5 whitespace-pre-wrap text-base font-medium leading-7 text-slate-900">{previewTask.memo}</div>
                  </div>
                ) : null}
	              </div>

	              {isEditingPreview ? (
	                <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
	                  {(() => {
	                    if (!previewTask) return null
	                    if (previewTask.recordCompleteOnly) return null
	                    const s = hmToMinutes(previewTask.actualStartTime ?? null)
	                    const e = hmToMinutes(previewTask.actualEndTime ?? null)
	                    const hasOnlyOne = (s === null) !== (e === null)
	                    if (!hasOnlyOne) return null
	                    return (
	                      <div className="mb-3 rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
	                        완료 시작시간과 종료시간을 모두 입력해야 완료할 수 있어요.
	                      </div>
	                    )
	                  })()}
	                  <div className="grid grid-cols-2 gap-3">
	                  <button
	                    type="button"
	                    onClick={() => {
	                      if (!previewTask) return
	                      setEditWarningMessage(null)
	                      const draft = editTitleDraft.trim()
	                      const original = (editTitleOriginalRef.current?.taskId === previewTask.id ? editTitleOriginalRef.current.title : previewTask.title ?? '').trim()
	                      const addFallbackTitle = buildNextTaskTitle((previewSubject?.name ?? '').trim(), tasks)
	                      const nextTitle = isAddMode
	                        ? draft || addFallbackTitle
	                        : draft || original || (previewSubject?.name ?? '').trim()
	                      if (!previewTask.recordCompleteOnly) {
	                        const start = hmToMinutes(previewTask.actualStartTime ?? null)
	                        const end = hmToMinutes(previewTask.actualEndTime ?? null)
	                        const hasOnlyOne = (start === null) !== (end === null)
	                        if (hasOnlyOne) {
	                          setEditValidationMessage('완료 시작시간과 종료시간을 모두 입력해야 저장할 수 있어요.')
	                          return
	                        }
	                      }
	                      const start = hmToMinutes(previewTask.actualStartTime ?? null)
	                      const end = hmToMinutes(previewTask.actualEndTime ?? null)
	                      if (start !== null && end !== null) {
	                        if (end === start) {
	                          setEditValidationMessage('완료 종료시간을 시작시간과 동일하게 설정할 수 없어요.')
	                          return
	                        }
	                        const { minutes, wraps } = diffMinutesAllowNextDay(start, end)
	                        if (minutes > 10 * 60) {
	                          setEditValidationMessage('완료 시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.')
	                          return
	                        }
	                        if (wraps) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
	                      }
	                      setEditValidationMessage(null)
	                      if (isAddMode) {
	                        const createdId = commitAddDraft({ ...previewTask, title: nextTitle })
	                        if (!createdId) return
	                        setEditTaskId(null)
	                        setEditDraft(null)
	                        closePreviewTask()
	                        const hasDateAssigned = Boolean(previewTask.date && String(previewTask.date).trim())
	                        setStartOpen(!hasDateAssigned)
	                        return
	                      }
	                      if (!storedPreviewTask) return
	                      const base = editDraft ?? storedPreviewTask
	                      commitEditDraft(storedPreviewTask, { ...base, title: nextTitle, updatedAt: new Date().toISOString() })
	                      setEditTaskId(null)
	                      setEditDraft(null)
	                      if (autoCloseAfterCompleteTaskId === previewTask.id) {
	                        const hasDateAssigned = Boolean(previewTask.date && String(previewTask.date).trim())
	                        setStartOpen(!hasDateAssigned)
	                        setAutoCloseAfterCompleteTaskId(null)
	                        animateClosePreview()
	                      }
	                    }}
	                    disabled={(() => {
	                      if (!previewTask) return true
	                      if (previewTask.recordCompleteOnly) return false
	                      const start = hmToMinutes(previewTask.actualStartTime ?? null)
	                      const end = hmToMinutes(previewTask.actualEndTime ?? null)
	                      const hasOnlyOne = (start === null) !== (end === null)
	                      if (hasOnlyOne) return true
	                      if (start === null || end === null) return false
	                      if (end === start) return true
	                      const { minutes } = diffMinutesAllowNextDay(start, end)
	                      return minutes > 10 * 60
	                    })()}
	                    className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-black/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-black/70 disabled:bg-black/30"
	                  >
	                    {isAddMode ? '등록' : '완료'}
	                  </button>
	                  <button
	                    type="button"
	                    onClick={() => {
	                      if (!previewTask) return
	                      if (isAddMode) {
	                        closePreviewTask()
	                        return
	                      }
	                      const start = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualStartTime ?? null)
	                      const end = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualEndTime ?? null)
	                      const hasOnlyOne = !previewTask.recordCompleteOnly && ((start === null) !== (end === null))
	                      const invalidRange =
	                        !previewTask.recordCompleteOnly &&
	                        start !== null &&
	                        end !== null &&
	                        (end === start || diffMinutesAllowNextDay(start, end).minutes > 10 * 60)
	                      if (hasOnlyOne || invalidRange) {
	                        setEditExitConfirmOpen(true)
	                        return
	                      }
	                      setEditTaskId(null)
	                      setEditDraft(null)
	                      setEditValidationMessage(null)
	                      setEditWarningMessage(null)
	                    }}
	                    className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
	                  >
	                    {isAddMode ? '등록 취소' : '편집 취소'}
	                  </button>
	                  </div>
	                </div>
	              ) : null}
	              {!isEditingPreview ? (
	                <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
	                  <div className="grid grid-cols-3 gap-2">
	                    <button
	                      type="button"
	                      onClick={() => setTimerTaskId(previewTask.id)}
	                      className="inline-flex h-10 items-center justify-center rounded-xl bg-black/80 px-3 text-sm font-semibold text-white transition hover:bg-black/70"
	                    >
	                      타이머
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => setEditTaskId(previewTask.id)}
	                      className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
	                    >
	                      편집
	                    </button>
	                    <button
	                      type="button"
	                      onClick={() => {
	                        deleteTask(previewTask.id)
	                        closePreviewTask()
	                      }}
	                      className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
	                      aria-label="태스크 삭제"
	                    >
	                      삭제
	                    </button>
	                  </div>
	                </div>
	              ) : null}
		          </TaskDialogShell>
		        ) : null}
		        {isEditingPreview && datePickerField ? (
		              <div
		                className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/35 px-4"
		                onMouseDown={(e) => {
		                  e.stopPropagation()
		                  if (e.target === e.currentTarget) setDatePickerField(null)
		                }}
		                onTouchStart={(e) => {
		                  e.stopPropagation()
		                  if (e.target === e.currentTarget) setDatePickerField(null)
		                }}
		              >
		                <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
		                  <div className="flex items-center justify-between">
		                    <div className="text-base font-semibold text-slate-900">{datePickerField === 'date' ? '날짜 선택' : '디데이 선택'}</div>
		                    <button
		                      type="button"
		                      onClick={() => setDatePickerField(null)}
		                      className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
		                      aria-label="닫기"
		                    >
		                      닫기
		                    </button>
		                  </div>

		                  <div className="mt-3 flex items-center justify-between">
		                    <button
		                      type="button"
		                      onClick={() => setCalendarMonth((cur) => startOfMonth(subMonths(cur, 1)))}
		                      className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
		                      aria-label="이전 달"
		                    >
		                      ‹
		                    </button>
		                    <div className="text-sm font-semibold text-slate-900">{format(calendarMonth, 'yyyy년 M월')}</div>
		                    <button
		                      type="button"
		                      onClick={() => setCalendarMonth((cur) => startOfMonth(addMonths(cur, 1)))}
		                      className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
		                      aria-label="다음 달"
		                    >
		                      ›
		                    </button>
		                  </div>

		                  <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
		                    {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
		                      <div key={d}>{d}</div>
		                    ))}
		                  </div>

		                  {(() => {
		                    const first = startOfMonth(calendarMonth)
		                    const offset = getDay(first)
		                    const start = new Date(first)
		                    start.setDate(first.getDate() - offset)
		                    const selected = parseYmd(datePickerField === 'date' ? (previewTask?.date ?? '') : (previewTask?.dueDate ?? ''))
		                    const today = new Date()
		                    const days = Array.from({ length: 42 }, (_, i) => {
		                      const d = new Date(start)
		                      d.setDate(start.getDate() + i)
		                      return d
		                    })
		                    return (
		                      <div className="mt-2 grid grid-cols-7 gap-1">
		                        {days.map((d) => {
		                          const inMonth = isSameMonth(d, calendarMonth)
		                          const isSelected = selected ? isSameDay(d, selected) : false
		                          const isToday = isSameDay(d, today)
		                          return (
		                            <button
		                              key={d.toISOString()}
		                              type="button"
		                              onClick={() => pickCalendarDay(d)}
		                              className={`h-10 rounded-xl text-sm font-semibold transition ${
                                isSelected
                                  ? 'bg-black/80 text-white'
		                                  : inMonth
		                                    ? 'text-slate-900 hover:bg-slate-100'
		                                    : 'text-slate-300 hover:bg-slate-50'
		                              } ${isToday && !isSelected ? 'ring-1 ring-slate-300' : ''}`}
		                              aria-label={format(d, 'yyyy년 M월 d일')}
		                            >
		                              {d.getDate()}
		                            </button>
		                          )
		                        })}
		                      </div>
		                    )
		                  })()}
		                </div>
		              </div>
			        ) : null}
		            {isEditingPreview && timePickerOpen ? (
		              <TimePickerModal
		                open
		                onClose={() => setTimePickerOpen(false)}
		                title={
		                  timePickerField === 'actualStartTime'
		                    ? '완료 시작시간'
		                    : timePickerField === 'actualEndTime'
		                      ? '완료 종료시간'
		                      : timePickerField === 'plannedEndTime'
		                        ? '계획 종료시간'
		                        : '계획 시작시간'
		                }
		                initialHm={
		                  (() => {
		                    if (!previewTask) return null
		                    return timePickerField === 'actualStartTime'
		                      ? previewTask.actualStartTime ?? previewTask.actualEndTime ?? null
		                      : timePickerField === 'actualEndTime'
		                        ? previewTask.actualEndTime ?? previewTask.actualStartTime ?? null
		                        : timePickerField === 'plannedEndTime'
		                          ? addSecondsToHm(previewTask.plannedStartTime ?? '00:00', plannedSecondsDraft) ??
		                            previewTask.plannedStartTime ??
		                            null
		                          : previewTask.plannedStartTime ?? null
		                  })()
		                }
		                onApply={(hm) => {
		                  if (!previewTask) return
		                  setEditWarningMessage(null)
		                  if (timePickerField === 'actualStartTime') {
		                    patchPreviewTask({
		                      actualStartTime: hm,
		                      actualEndTime: previewTask.actualEndTime ? previewTask.actualEndTime : hm,
		                    })
		                  } else if (timePickerField === 'actualEndTime') {
		                    patchPreviewTask({
		                      actualEndTime: hm,
		                      actualStartTime: previewTask.actualStartTime ? previewTask.actualStartTime : hm,
		                    })
		                  } else if (timePickerField === 'plannedEndTime') {
		                    const startMin = hmToMinutes(previewTask.plannedStartTime ?? null)
		                    const endMin = hmToMinutes(hm)
		                    if (startMin === null || endMin === null) {
		                      patchPreviewTask({ plannedStartTime: hm })
		                      return
		                    }
		                    if (endMin === startMin) return
		                    const { minutes, wraps } = diffMinutesAllowNextDay(startMin, endMin)
		                    if (minutes > 10 * 60) return
		                    if (wraps) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
		                    const nextSeconds = Math.max(0, minutes * 60)
		                    setPlannedSecondsDraft(nextSeconds)
		                    patchPreviewTask({ plannedSeconds: nextSeconds })
		                  } else {
		                    patchPreviewTask({ plannedStartTime: hm })
		                  }
		                }}
		                validate={(hm) => {
		                  const proposedMin = hmToMinutes(hm)
		                  if (proposedMin === null) return null
		                  if (timePickerField === 'plannedEndTime') {
		                    const startMin = hmToMinutes(previewTask?.plannedStartTime ?? null)
		                    if (startMin === null) return null
		                    if (proposedMin === startMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
		                    const { minutes } = diffMinutesAllowNextDay(startMin, proposedMin)
		                    if (minutes > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
		                    return null
		                  }
		                  const startMin = timePickerField === 'actualEndTime' ? hmToMinutes(previewTask?.actualStartTime ?? null) : null
		                  const endMin = timePickerField === 'actualStartTime' ? hmToMinutes(previewTask?.actualEndTime ?? null) : null
		                  if (timePickerField === 'actualStartTime' && endMin !== null) {
		                    if (endMin === proposedMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
		                    const { minutes } = diffMinutesAllowNextDay(proposedMin, endMin)
		                    if (minutes > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
		                  }
		                  if (timePickerField === 'actualEndTime' && startMin !== null) {
		                    if (proposedMin === startMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
		                    const { minutes } = diffMinutesAllowNextDay(startMin, proposedMin)
		                    if (minutes > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
		                  }
		                  return null
		                }}
		              />
		            ) : null}
		            {isEditingPreview && editExitConfirmOpen ? (
		              <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/35 px-4">
		                <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
		                  <div className="text-base font-semibold text-slate-900">편집을 취소할까요?</div>
		                  <div className="mt-2 text-sm text-slate-500">
		                    완료 시작시간과 종료시간이 아직 완성되지 않았어요. 편집을 취소하거나 계속 편집할 수 있어요.
		                  </div>
		                  <div className="mt-4 flex justify-end gap-2">
		                    <Button
		                      variant="ghost"
		                      onClick={() => {
		                        setEditExitConfirmOpen(false)
		                      }}
		                    >
		                      계속 편집
		                    </Button>
		                    <Button
		                      variant="secondary"
		                      onClick={() => {
		                        setEditExitConfirmOpen(false)
		                        setEditTaskId(null)
		                        setEditValidationMessage(null)
		                      }}
		                    >
		                      편집 취소
		                    </Button>
		                  </div>
		                </div>
		              </div>
		            ) : null}
		        {previewTask && !isAddMode && timerTaskId === previewTask.id ? (
	          <TaskTimerModal
	            plannedSeconds={previewTask.plannedSeconds ?? 0}
	            subjectName={previewSubject?.name ?? '과목'}
	            taskTitle={previewTask.title ?? ''}
	            subjectColor={previewSubject?.color ?? '#94a3b8'}
	            onClose={() => setTimerTaskId(null)}
	            onRecord={(result) => {
	              patchPreviewTask({
	                actualStartTime: result.actualStartTime,
	                actualEndTime: result.actualEndTime,
	                actualSeconds: result.actualSeconds,
	              })
	            }}
	          />
	        ) : null}

	      {/* Always-on floating "날짜 미정" popup above bottom bar (mobile). */}
	      <div
	        data-start-dock-root
	        className={`fixed z-40 flex items-start justify-end gap-[10px] md:hidden ${startDockOrigin}`}
	        style={{
	          right: '0.375rem',
	          bottom: startDock.v === 'bottom' ? 'calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + 10px)' : undefined,
	          top: startDock.v === 'top' ? `${topDockY}px` : undefined,
	          width: startOpen ? 'calc(100vw - 0.75rem)' : '138px',
	          height: startOpen ? '173px' : '64px',
	        }}
	      >
	        {!startOpen ? (
	          <button
	            type="button"
	            className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-black/80 text-white shadow-xl ring-1 ring-black/10"
	            onClick={() => openTaskAdd()}
	            aria-label="일정 추가"
	          >
	            <span aria-hidden="true" className="text-3xl leading-none">
	              +
	            </span>
	          </button>
	        ) : null}
	        <div
	          className={`relative border border-white/8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm backdrop-saturate-105 will-change-[width,height,border-radius]`}
	          style={{
	            width: startOpen ? '100%' : '64px',
	            height: startOpen ? '100%' : '64px',
	            borderRadius: startOpen ? 24 : 9999,
	            backgroundColor: startOpen ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.96)',
	            overflow: startOpen ? 'hidden' : 'visible',
	            transition: startOpen
	              ? 'border-radius 0ms linear, width 360ms cubic-bezier(0.16, 1, 0.3, 1), height 360ms cubic-bezier(0.16, 1, 0.3, 1)'
	              : 'border-radius 260ms cubic-bezier(0.16, 1, 0.3, 1), width 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms, height 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms',
	          }}
	        >
	          <button
	            type="button"
            onClick={() => {
              if (shouldIgnoreClickAfterDrag()) return
              setStartOpen(true)
            }}
	            className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-110 ease-out ${
	              startOpen ? 'pointer-events-none scale-[0.92] opacity-0' : 'pointer-events-auto scale-100 opacity-100'
	            }`}
            onPointerDown={(e) => onStartDockPointerDown(e, true)}
            onPointerMove={onStartDockPointerMove}
            onPointerUp={onStartDockPointerUp}
            onPointerCancel={onStartDockPointerUp}
		            style={{ touchAction: 'none' }}
		            aria-label="날짜 미정 열기"
		          >
		            <div className="relative">
		              <StartPendingBubbleIcon />
		              {unassignedPending.length ? (
		                <div className="absolute -right-2.5 -top-2.5 min-w-[18px] rounded-full bg-black/80 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white tabular-nums shadow-sm">
		                  {unassignedPending.length > 99 ? '99+' : unassignedPending.length}
		                </div>
		              ) : null}
		            </div>
		          </button>

          {startOpen ? (
            <div
	              className={`flex h-full flex-col transition-[opacity,transform] duration-110 ease-out ${
	                startOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
	              }`}
            >
              <div
                className="flex w-full items-center justify-between gap-2 px-3 py-2"
                onPointerDown={(e) => onStartDockPointerDown(e, false)}
                onPointerMove={onStartDockPointerMove}
                onPointerUp={onStartDockPointerUp}
                onPointerCancel={onStartDockPointerUp}
                style={{ touchAction: 'none' }}
              >
                <div className="flex items-center gap-2">
                    <div className="text-sm font-semibold text-slate-900">날짜 미정</div>
                  {unassignedPending.length ? (
                    <div className="rounded-full bg-white/7 px-2 py-0.5 text-[11px] font-semibold text-slate-800 tabular-nums backdrop-blur">
                      {unassignedPending.length}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      openTaskAdd()
                      setStartOpen(false)
                    }}
                  >
                    + 일정 추가
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setStartOpen(false)}
                    aria-label="날짜 미정 닫기"
                  >
                    <span aria-hidden="true" className="text-lg leading-none">
                      ×
                    </span>
                  </Button>
                </div>
              </div>

              <div
                className="h-[132px] border-t border-white/8 px-3 py-2"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverDate('__unassigned__')
                }}
                onDragLeave={() => {
                  setDragOverDate((cur) => (cur === '__unassigned__' ? null : cur))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const taskId = e.dataTransfer.getData('text/emma-task-id')
                  if (taskId) updateTask(taskId, { date: '' })
                  setDragOverDate(null)
                }}
              >
                <div className={`${dragOverDate === '__unassigned__' ? 'outline outline-2 outline-slate-400' : ''}`}>
	                  <div
	                    className="h-full overflow-x-auto overflow-y-auto overscroll-contain pb-1"
	                    onWheel={onStartPendingWheel}
	                    onWheelCapture={(e) => e.stopPropagation()}
	                  >
	                    <div className="flex gap-2">
	                      {unassignedBySubject.map((g) => {
	                        const subject = subjects.find((s) => s.id === g.subjectId)
	                        const columns = []
	                        for (let i = 0; i < g.list.length; i += 3) columns.push(g.list.slice(i, i + 3))
	                        return (
	                          <div key={g.subjectId} className="flex h-full shrink-0 flex-col">
	                            <div className="mb-1 w-[calc((100vw-0.75rem)/7)] overflow-hidden whitespace-nowrap text-[11px] font-semibold text-slate-800">
	                              {subject?.name ?? '과목'}
	                            </div>
	                            <div className="flex gap-2">
	                              {columns.map((col, colIdx) => (
	                                <div key={colIdx} className="w-[calc((100vw-0.75rem)/7)] shrink-0">
	                                  <div className="flex flex-col gap-1 pb-1">
	                                    {col.map((t) => {
	                                const sub = subjects.find((s) => s.id === t.subjectId)
	                                const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
	                                const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || hasActual)
	                                const isCompleted = t.status === 'completed' || hasAnyRecord
	                                const bg = sub?.color ?? '#94a3b8'
	                                const textColor = pickReadableTextColor(bg)
	                                const mobileMaxUnits = 14
	                                const desktopMaxUnits = 22
	                                const titleMobile = truncateToUnits(t.title, mobileMaxUnits)
	                                const titleDesktop = truncateToUnits(t.title, desktopMaxUnits)
	                                return (
                                  <div
                                    key={t.id}
                                    className="relative w-full"
                                  >
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        openPreviewTask(t.id)
                                      }}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/emma-task-id', t.id)
                                        e.dataTransfer.effectAllowed = 'move'
                                      }}
                                      onDragEnd={() => setDragOverDate(null)}
	                                      className={`box-border block w-full select-none overflow-hidden rounded-[8px] px-2 py-1.5 text-left text-[11px] leading-tight active:cursor-grabbing ${
	                                        flashTaskId === t.id ? 'emma-flash-3' : ''
	                                      }`}
                                      style={{
                                        background: bg,
                                        color: textColor,
                                        filter: isCompleted ? 'saturate(0.85) brightness(0.97)' : undefined,
                                      }}
                                    >
                                      <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                        <span className="md:hidden">{titleMobile}</span>
                                        <span className="hidden md:inline">{titleDesktop}</span>
                                      </span>
                                    </button>

	                                    {/* meta tags removed */}
                                  </div>
	                                )
	                                    })}
	                                  </div>
	                                </div>
	                              ))}
	                            </div>
	                          </div>
	                        )
	                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
          </div>
        </div>
	    </div>
	  )
}
