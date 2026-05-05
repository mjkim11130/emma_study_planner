import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns'
import { ko } from 'date-fns/locale'
import { useContext, useEffect, useMemo, useRef, useState, type ReactNode, type WheelEvent as ReactWheelEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { todayYmd } from '../lib/dates'
import { formatRoundedDurationKoFromSeconds, formatRoundedDurationShortFromSeconds } from '../lib/time'
import { Button } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'
import { NewTaskSheetContext } from '../components/AppLayout'
import { NewTaskSheet } from '../components/NewTaskSheet'
import { TaskRecordSheet } from '../components/TaskRecordSheet'

function StartPendingBubbleIcon() {
  return (
    <svg viewBox="0 0 64 64" aria-hidden="true" className="h-8 w-8 text-slate-800">
      <rect x="9" y="14" width="34" height="34" rx="7" fill="#e8f1fb" />
      <path
        d="M18 10v8M34 10v8M9 23h34M16 30h6M26 30h6M16 38h6M26 38h6"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="43" cy="43" r="12" fill="#ffffff" />
      <circle
        cx="43"
        cy="43"
        r="12"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeDasharray="1.5 6.5"
      />
      <path
        d="M43 37v6h5"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className ?? 'h-4 w-4'}>
      <path d="M6 3v18" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path
        d="M6 4h11l-2 4 2 4H6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

function GoalPillIcon({ className }: { className?: string }) {
  return <span aria-hidden="true" className={`inline-block h-3.5 w-3.5 rounded-[4px] border-2 border-current ${className ?? ''}`} />
}

function RecordPillIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`inline-flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-white text-slate-900 ${className ?? ''}`}
    >
      <svg viewBox="0 0 24 24" className="h-3 w-3">
        <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
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

function formatDurationPreciseKo(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  if (clamped < 60) return '1분 이내'
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (parts.length === 0) {
    parts.push('0분')
  }
  return `${parts.join(' ')}동안`
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

function buildTimeSummaryNode({
  start,
  end,
  durationSeconds,
}: {
  start?: string | null
  end?: string | null
  durationSeconds?: number | null
}) {
  // If the range collapses to the same minute (e.g. 11:41 ~ 11:41), show a single timestamp.
  if (start && end && start === end) {
    return <>{formatMeridiemHm(start)}</>
  }
  const rangeText = start ? (end ? `${formatMeridiemHm(start)}부터 ${formatMeridiemHm(end)}까지` : `${formatMeridiemHm(start)}부터`) : ''
  const durationText = typeof durationSeconds === 'number' ? formatDurationPreciseKo(durationSeconds) : ''

  if (rangeText && !end && !durationText) {
    return (
      <>
        {rangeText} 시작
      </>
    )
  }

  if (rangeText && durationText) {
    return (
      <>
        {rangeText} {end ? <strong>{durationText}</strong> : durationText}
      </>
    )
  }

  if (durationText) return durationText
  return rangeText
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
        <span className="text-sm font-semibold text-slate-400">목표</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-slate-300" style={{ width: goalWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-500">{goalLabel}</span>
      </div>
      <div className="grid grid-cols-[46px_minmax(0,1fr)_98px] items-center gap-3">
        <span className="text-sm font-semibold text-slate-900">기록</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-slate-900" style={{ width: actualWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-900">{actualLabel}</span>
      </div>
      <div className="pt-1 text-center text-base font-semibold text-slate-700">{deltaLabel}</div>
    </div>
  )
}

export function CalendarView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const newTaskSheet = useContext(NewTaskSheetContext)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const today = useMemo(() => parseISO(todayYmd()), [])
  const [startOpen, setStartOpen] = useState(false)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [recordTaskId, setRecordTaskId] = useState<string | null>(null)
  const [startDock, setStartDock] = useState<{ v: 'top' | 'bottom'; h: 'right' }>({ v: 'bottom', h: 'right' })
  const topDockY = 64
  const scrollAnimRef = useRef<number | null>(null)
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
  const monthWeeks = useMemo(() => {
    const monthStart = parseISO(`${displayMonth}-01`)
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 })
    const gridEnd = endOfWeek(endOfMonth(monthStart), { weekStartsOn: 0 })
    const list: string[] = []
    for (let d = gridStart; d <= gridEnd; d = addDays(d, 7)) list.push(format(d, 'yyyy-MM-dd'))
    return list
  }, [displayMonth])

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

  const previewTask = useMemo(() => tasks.find((task) => task.id === previewTaskId) ?? null, [tasks, previewTaskId])
  const editTask = useMemo(() => tasks.find((task) => task.id === editTaskId) ?? null, [tasks, editTaskId])
  const openPreviewTask = (taskId: string) => {
    const next = new URLSearchParams(searchParams)
    next.set('previewTaskId', taskId)
    setSearchParams(next, { replace: true })
  }
  const closePreviewTask = () => {
    const next = new URLSearchParams(searchParams)
    next.delete('previewTaskId')
    setSearchParams(next, { replace: true })
  }
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
    if (previewTask.plannedSeconds > 0) {
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
    }
    return null
  }, [previewTask])
  const previewHeadlineTimes = useMemo(() => {
    if (!previewTask) return []
    const hasCompare = typeof previewTask.actualSeconds === 'number' && previewTask.plannedSeconds > 0
    const items: Array<{ kind: '목표' | '기록'; badge: string; text: ReactNode; key: string }> = []

    // Only show "목표" if we have a concrete start time to display.
    if (previewTask.plannedStartTime) {
      const plannedText = hasCompare
        ? buildTimeSummaryNode({ start: previewTask.plannedStartTime, end: previewPlannedEnd, durationSeconds: null })
        : buildTimeSummaryNode({
            start: previewTask.plannedStartTime,
            end: previewPlannedEnd,
            durationSeconds: previewTask.plannedSeconds > 0 ? previewTask.plannedSeconds : null,
          })
      items.push({
        kind: '목표',
        badge: '목표',
        text: plannedText,
        key: 'goal',
      })
    }

    if (previewTask.actualStartTime || typeof previewTask.actualSeconds === 'number') {
      const actualText = hasCompare
        ? buildTimeSummaryNode({ start: previewTask.actualStartTime, end: previewTask.actualEndTime, durationSeconds: null })
        : buildTimeSummaryNode({
            start: previewTask.actualStartTime,
            end: previewTask.actualEndTime,
            durationSeconds: typeof previewTask.actualSeconds === 'number' ? previewTask.actualSeconds : null,
          })
      items.push({
        kind: '기록',
        badge: '기록',
        text: actualText,
        key: 'actual',
      })
    }

    if (!items.some((item) => item.kind === '기록') && previewTask.status === 'completed') {
      items.push({
        kind: '기록',
        badge: '기록',
        text: '완료 처리',
        key: 'completed',
      })
    }

    return items
  }, [previewPlannedEnd, previewTask])
  const hasPreviewMeta = Boolean(previewHeadlineTimes.length || previewTask?.dueDate)
  const hasPreviewCompare = Boolean(previewActualSummary)

  // 일정 추가는 캘린더에서 하지 않고, 대시보드/과목 디테일에서 생성 후 날짜 배치하도록 유도

  const examMetaLabel = useMemo(() => {
    if (!activeExam) return null
    const name = activeExam.name?.trim()
    const pieces: string[] = []
    if (name) pieces.push(name)
    if (examCountdown?.examDate) pieces.push(`시험일 ${examCountdown.examDate}`)
    if (examCountdown?.dday) pieces.push(examCountdown.dday)
    return pieces.length ? pieces.join(' · ') : null
  }, [activeExam, examCountdown])

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

  return (
    <div className="flex h-[calc(100dvh-72px-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      <MobileTopBar
        title=""
        left={
          <Button
            variant="secondary"
            onClick={() => {
              const prevMonth = format(addMonths(parseISO(`${displayMonth}-01`), -1), 'yyyy-MM')
              setDisplayMonth(prevMonth)
            }}
          >
            이전
          </Button>
        }
        center={
          <div className="flex flex-col items-center justify-center gap-0.5">
            <div className="flex items-center justify-center gap-2">
              <div className="text-sm font-semibold text-slate-900">{displayMonth}</div>
              <Button
                variant="secondary"
                onClick={() => {
                  const now = format(new Date(), 'yyyy-MM')
                  setDisplayMonth(now)
                }}
              >
                이번달
              </Button>
            </div>
            {examMetaLabel ? <div className="text-[11px] text-slate-600">{examMetaLabel}</div> : null}
          </div>
        }
        right={
          <Button
            variant="secondary"
            onClick={() => {
              const nextMonth = format(addMonths(parseISO(`${displayMonth}-01`), 1), 'yyyy-MM')
              setDisplayMonth(nextMonth)
            }}
          >
            다음
          </Button>
        }
      />

      <div
        className="mt-2 flex-1 overflow-y-auto md:mt-3"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorY: 'contain',
        }}
      >
        {/* Sticky weekday header */}
        <div className="sticky top-0 z-20 grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-600">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-1 py-2 md:px-2">
              {d}
            </div>
          ))}
        </div>

        {monthWeeks.map((weekStart) => {
          const weekStartDate = parseISO(weekStart)
          const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStartDate, i), 'yyyy-MM-dd'))
          return (
            <div
              key={weekStart}
              className="grid grid-cols-7 scroll-mt-10"
            >
              {days.map((ymd) => {
                    const dayMonth = ymd.slice(0, 7)
                    const isCurrentMonth = dayMonth === displayMonth
                    const isToday = ymd === todayYmd()
                    const dayNum = Number(ymd.slice(8, 10))
                    const monthNum = Number(ymd.slice(5, 7))
                    const cellTasks = (tasksByDate.get(ymd) ?? [])
                      .slice()
                      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                    const visible = cellTasks.slice(0, 4)
                    const more = cellTasks.length - visible.length

                    return (
                      <div
                        key={ymd}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/day/${ymd}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') navigate(`/day/${ymd}`)
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
                        className={`h-[132px] cursor-pointer overflow-visible border-b border-r border-slate-100 p-1.5 md:h-[148px] md:p-2 ${
                          isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                        } ${isToday ? 'relative z-10 outline outline-2 outline-slate-300 outline-offset-[-2px]' : ''} ${
                          dragOverDate === ymd ? 'outline outline-2 outline-slate-400' : ''
                        }`}
                        aria-label={`${ymd} 일간 기록 보기`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                            {dayNum}
                          </div>
                          {dayNum === 1 ? (
                            <div className={`text-[11px] font-semibold ${isCurrentMonth ? 'text-slate-600' : 'text-slate-400'}`}>
                              {monthNum}월
                            </div>
                          ) : null}
                        </div>

                        <div className="-mx-1.5 mt-1 flex flex-col overflow-x-visible overflow-y-hidden max-h-[96px] divide-y divide-slate-200 md:-mx-2 md:max-h-[112px]">
                          {visible.map((t) => {
                            const sub = subjects.find((s) => s.id === t.subjectId)
                            const dday = formatDday(t.dueDate)
                            const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                            const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || hasActual)
                            const isCompleted = t.status === 'completed' || hasAnyRecord
                            const goalLabelKo = formatRoundedDurationKoFromSeconds(t.plannedSeconds)
                            const bg = sub?.color ?? '#94a3b8'
                            const textColor = pickReadableTextColor(bg)

                            const desktopTagText = isCompleted ? '✓' : dday ? dday : t.plannedSeconds > 0 ? goalLabelKo : null
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
                                className="box-border block w-full select-none rounded-[3px] py-1 pl-1.5 pr-0 text-left text-[10px] leading-none hover:brightness-95 active:cursor-grabbing md:pl-2"
                                style={{
                                  background: bg,
                                  color: textColor,
                                }}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                    <span className="md:hidden">{titleMobile}</span>
                                    <span className="hidden md:inline">{titleDesktop}</span>
                                  </span>
                                  {isCompleted ? (
                                    <span className="shrink-0 tabular-nums text-[9px] font-semibold leading-none tracking-tighter md:hidden">
                                      <span className="bg-white/60 px-1 py-[1px] text-slate-900">✓</span>
                                    </span>
                                  ) : null}
                                  {desktopTagText ? (
                                    <span className="hidden shrink-0 tabular-nums text-[9px] font-semibold leading-none tracking-tighter md:inline">
                                      <span
                                        className={`bg-white/60 px-1 py-[1px] ${
                                          isCompleted ? 'text-slate-900' : dday ? 'text-indigo-700' : 'text-slate-700'
                                        }`}
                                      >
                                        {desktopTagText}
                                      </span>
                                    </span>
                                  ) : null}
                                </div>
                              </button>
                            )
                          })}
                          {more > 0 ? <div className="text-[11px] text-slate-400">+{more}</div> : null}
                        </div>
                      </div>
                    )
                  })}
            </div>
          )
	        })}
	      </div>

        {previewTask ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 px-3 pb-3 pt-20 md:items-center md:p-6">
            <div
              className="absolute inset-0"
              onClick={closePreviewTask}
              aria-hidden="true"
            />
            <div className="relative w-full max-w-2xl overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-2xl">
              <div className="px-5 py-5 md:px-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    {(() => {
                      const hasAnyRecord = Boolean(
                        previewTask.actualStartTime ||
                          previewTask.actualEndTime ||
                          typeof previewTask.actualSeconds === 'number'
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
                  <div className="flex shrink-0 items-center gap-2">
                  <Button variant="secondary" onClick={() => navigate(`/task/${previewTask.id}`)}>
                    레거시
                  </Button>
                  <Button variant="secondary" onClick={() => setRecordTaskId(previewTask.id)}>
                    기록
                  </Button>
                  <Button variant="secondary" onClick={() => setEditTaskId(previewTask.id)}>
                    편집
                  </Button>
                  <Button variant="ghost" onClick={closePreviewTask}>
                    닫기
                  </Button>
                </div>
                </div>

                <div className="mt-2.5 text-2xl font-semibold leading-tight text-slate-900 md:text-[30px]">
                  {previewTask.title}
                </div>
                {previewTask.date ? (
                  <div className="mt-2 text-base text-slate-500">{formatTaskPreviewDate(previewTask.date)}</div>
                ) : null}
              </div>

              <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
                {hasPreviewMeta ? (
                  <div className="pt-2 md:col-span-2">
                    <div className="space-y-3">
                      {previewTask.dueDate ? (
                        <div className="flex flex-nowrap items-center gap-2.5 text-base font-medium text-indigo-700">
                          <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">
                            <span className="mr-1.5 inline-flex align-middle">
                              <FlagIcon className="h-4 w-4" />
                            </span>
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
                            className={`flex min-w-0 flex-nowrap items-center gap-2.5 text-base font-medium ${
                              item.kind === '목표' ? 'text-slate-400' : 'text-slate-700'
                            }`}
                          >
                            <span
                              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
                                item.kind === '기록' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              <span className="mr-1.5 inline-flex align-middle">
                                {item.kind === '기록' ? <RecordPillIcon /> : <GoalPillIcon />}
                              </span>
                              {item.badge}
                            </span>
                            {item.text ? (
                              <span className="min-w-0 whitespace-nowrap tracking-[-0.02em] md:tracking-[-0.04em]">
                                {item.text}
                              </span>
                            ) : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : null}
                {hasPreviewCompare ? (
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
            </div>
          </div>
        ) : null}
        <NewTaskSheet
          open={Boolean(editTaskId && editTask)}
          taskId={editTaskId}
          initial={
            editTask
              ? {
                  subjectId: editTask.subjectId,
                  title: editTask.title,
                  date: editTask.date,
                  dueDate: editTask.dueDate ?? '',
                  plannedStartTime: editTask.plannedStartTime ?? '',
                  plannedSeconds: editTask.plannedSeconds,
                }
              : null
          }
          onClose={() => setEditTaskId(null)}
        />
        <TaskRecordSheet taskId={recordTaskId} open={Boolean(recordTaskId)} onClose={() => setRecordTaskId(null)} />

	      {/* Always-on floating "Start 예정" popup above bottom bar (mobile). */}
		      <div
		        data-start-dock-root
		        className={`fixed z-40 md:hidden ${startDockOrigin} will-change-[width,height,border-radius]`}
	        style={{
	          right: '0.375rem',
	          bottom: startDock.v === 'bottom' ? 'calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + 10px)' : undefined,
	          top: startDock.v === 'top' ? `${topDockY}px` : undefined,
	          width: startOpen ? 'calc(100vw - 0.75rem)' : '64px',
	          height: startOpen ? '173px' : '64px',
	          borderRadius: startOpen ? 24 : 9999,
	          transition: startOpen
	            ? // Open: radius snaps first (already reduced), then only size expands.
	              'top 160ms ease-in-out, bottom 160ms ease-in-out, border-radius 0ms linear, width 360ms cubic-bezier(0.16, 1, 0.3, 1), height 360ms cubic-bezier(0.16, 1, 0.3, 1)'
	            : // Close: keep the nice morphing radius animation.
	              'top 160ms ease-in-out, bottom 160ms ease-in-out, border-radius 260ms cubic-bezier(0.16, 1, 0.3, 1), width 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms, height 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms',
	        }}
	      >
	        <div
	          className="relative h-full w-full overflow-hidden border border-white/8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm backdrop-saturate-105"
	          style={{
	            borderRadius: 'inherit',
	            backgroundColor: startOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)',
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
		            aria-label="시작 예정 열기"
		          >
		            <StartPendingBubbleIcon />
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
                  <div className="text-sm font-semibold text-slate-900">시작 예정</div>
                  {unassignedPending.length ? (
                    <div className="rounded-full bg-white/7 px-2 py-0.5 text-[11px] font-semibold text-slate-800 tabular-nums backdrop-blur">
                      {unassignedPending.length}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button onClick={() => newTaskSheet?.openSheet()}>
                    + 일정 추가
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => setStartOpen(false)}
                    aria-label="시작 예정 닫기"
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
	                        for (let i = 0; i < g.list.length; i += 4) columns.push(g.list.slice(i, i + 4))
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
	                                const dday = formatDday(t.dueDate)
	                                const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
	                                const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                                const timeLabelKo = formatRoundedDurationKoFromSeconds(secondsToShow)
                                const timeLabelShort = formatRoundedDurationShortFromSeconds(secondsToShow)
                                const bg = sub?.color ?? '#94a3b8'
                                const textColor = pickReadableTextColor(bg)
                                const mobileMetaText = dday ? dday : timeLabelShort
                                const desktopMetaText = `${timeLabelKo}${dday ? ` ${dday}` : ''}`
                                const mobileMaxUnits = 14
                                const desktopMaxUnits = 22
	                                const titleMaxUnitsMobile = mobileMaxUnits - measureUnits(mobileMetaText) - 1
	                                const titleMaxUnitsDesktop = desktopMaxUnits - measureUnits(desktopMetaText) - 1
	                                const titleMobile = truncateToUnits(t.title, titleMaxUnitsMobile)
	                                const titleDesktop = truncateToUnits(t.title, titleMaxUnitsDesktop)
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
                                      className="box-border block w-full select-none overflow-hidden rounded-[3px] py-1 pl-1.5 pr-10 text-left text-[10px] leading-none hover:brightness-95 active:cursor-grabbing"
                                      style={{ background: bg, color: textColor }}
                                    >
                                      <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                        <span className="md:hidden">{titleMobile}</span>
                                        <span className="hidden md:inline">{titleDesktop}</span>
                                      </span>
                                    </button>

                                    <div className="pointer-events-none absolute right-0 top-1/2 -translate-y-1/2 pr-1">
                                      <span className="tabular-nums text-[9px] leading-none tracking-tighter">
                                        {!dday ? (
                                          <span
                                            className={`bg-white/60 px-1 py-[1px] text-slate-700 md:hidden ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                          >
                                            {timeLabelShort}
                                          </span>
                                        ) : null}
                                        <span
                                          className={`hidden bg-white/60 px-1 py-[1px] text-slate-700 md:inline ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                        >
                                          {timeLabelKo}
                                        </span>
                                        {dday ? (
                                          <span className="ml-1 bg-white/60 px-1 py-[1px] font-semibold text-indigo-700">{dday}</span>
                                        ) : null}
                                      </span>
                                    </div>
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

	        {!startOpen && unassignedPending.length ? (
	          <span className="pointer-events-none absolute -right-2 -top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
	            {unassignedPending.length}
	          </span>
	        ) : null}
	      </div>
	    </div>
	  );
}
