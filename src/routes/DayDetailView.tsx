import { addDays, format, startOfWeek } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../components/ContextMenu'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { todayYmd, ymdToDate } from '../lib/dates'
import { formatDurationKoFromMinutes, formatDurationKoFromSeconds, durationSecondsFromHmRange } from '../lib/time'
import { formatDday } from '../lib/dday'
import { Button } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'
import { IconCalendarMonth, IconCalendarWeek, IconPlus } from '../components/NavIcons'
import { useTaskDialog } from '../components/TaskDialogContext'
import { TimePickerModal } from '../components/TimePicker'
import { getTaskDragId, setTaskDragData, syncTaskDropEffect } from '../lib/taskDrag'
import { buildClipboardTaskAtTime, copyTaskToClipboard, pasteTaskFromClipboard } from '../lib/taskClipboard'
import { useTouchContextMenu } from '../lib/useTouchContextMenu'

function UnscheduledBubbleIcon() {
  return (
    <svg viewBox="0 -960 960 960" aria-hidden="true" className="h-8 w-8 text-slate-800">
      <path
        d="M612-292 440-464v-216h80v184l148 148-56 56Zm-498-25q-13-29-21-60t-11-63h81q3 21 8.5 42t13.5 41l-71 40ZM82-520q3-32 11-63.5t22-60.5l70 40q-8 20-13.5 41t-8.5 43H82Zm165 366q-27-20-50-43.5T154-248l70-40q14 18 29.5 33.5T287-225l-40 71Zm-22-519-71-40q20-27 43-50t50-43l40 71q-17 14-32.5 29.5T225-673ZM440-82q-32-3-63.5-11T316-115l40-70q20 8 41 13.5t43 8.5v81Zm-84-693-40-70q29-14 60.5-22t63.5-11v81q-22 3-43 8.5T356-775ZM520-82v-81q22-3 43-8.5t41-13.5l40 70q-29 14-60.5 22T520-82Zm84-693q-20-8-41-13.5t-43-8.5v-81q32 3 63.5 11t60.5 22l-40 70Zm109 621-40-71q17-14 32.5-29.5T735-287l71 40q-20 27-43 50.5T713-154Zm22-519q-14-17-29.5-32.5T673-735l40-71q27 19 50 42t42 50l-70 41Zm62 153q-3-22-8.5-43T775-604l70-41q13 30 21.5 61.5T878-520h-81Zm48 204-70-40q8-20 13.5-41t8.5-43h81q-3 32-11 63.5T845-316Z"
        fill="currentColor"
      />
    </svg>
  )
}

function hmToMinutesLocal(hm?: string) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

function minutesToHm(min: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function hourToKoLabel(hour24: number) {
  const h = ((hour24 % 24) + 24) % 24
  const meridiem = h < 12 ? '오전' : '오후'
  const hours12 = h % 12 === 0 ? 12 : h % 12
  return `${meridiem} ${hours12}시`
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

function snap10(min: number) {
  return Math.max(0, Math.min(24 * 60 - 10, Math.round(min / 10) * 10))
}

function timelineDisplayDurationMin(durationMin: number) {
  if (!Number.isFinite(durationMin) || durationMin <= 0) return 30
  if (durationMin <= 30) return 30
  return Math.max(30, snap10(durationMin))
}

function isMeaningfulDuration(durationMin: number) {
  return Number.isFinite(durationMin) && durationMin > 0.0001
}

function parseHexColor(hex: string) {
  const h = hex.trim().replace(/^#/, '')
  if (h.length === 3) {
    const r = parseInt(h[0] + h[0], 16)
    const g = parseInt(h[1] + h[1], 16)
    const b = parseInt(h[2] + h[2], 16)
    if ([r, g, b].some((x) => Number.isNaN(x))) return null
    return { r, g, b }
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16)
    const g = parseInt(h.slice(2, 4), 16)
    const b = parseInt(h.slice(4, 6), 16)
    if ([r, g, b].some((x) => Number.isNaN(x))) return null
    return { r, g, b }
  }
  return null
}

function pickOnColorText(bg: string) {
  const rgb = parseHexColor(bg)
  if (!rgb) return 'text-slate-900'
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255
  return luminance < 0.55 ? 'text-white' : 'text-slate-900'
}

function estimateInlineTextPx(text: string, fontPx = 11) {
  // rough heuristic for 11px UI font on mobile
  // conservative: Korean + numerals + spacing tends to be wider than latin average
  const avgCharPx = fontPx * 0.64
  return Math.ceil(text.length * avgCharPx)
}

type TimelineKind = 'planned' | 'actual'

type TimelineItem = {
  id: string
  kind: TimelineKind
  title: string
  subjectColor?: string
  subjectName: string
  completed: boolean
  startMin: number
  durationMin: number
  fallbackDurationMin: number
  startLabel: string
  endLabel: string
}

type TimelineWindow = { startMin: number; endMin: number }

function loadDefaultTimelineWindow(): TimelineWindow {
  const fallback: TimelineWindow = { startMin: 9 * 60, endMin: 24 * 60 }
  try {
    const raw = window.localStorage.getItem('emma-study-planner:defaultTimelineWindow:v1')
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const startMin = Number(parsed?.startMin)
    const endMin = Number(parsed?.endMin)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return fallback
    if (endMin <= startMin) return fallback
    return {
      startMin: Math.max(0, Math.min(23 * 60, snap10(startMin))),
      endMin: Math.max(10, Math.min(24 * 60, snap10(endMin))),
    }
  } catch {
    return fallback
  }
}

function loadTimelineWindow(date: string): TimelineWindow {
  const fallback = loadDefaultTimelineWindow()
  if (!date) return fallback
  try {
    const raw = window.localStorage.getItem('emma-study-planner:dayTimelineWindow:v1')
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const entry = parsed?.[date]
    if (!entry || typeof entry !== 'object') return fallback
    const startMin = Number(entry.startMin)
    const endMin = Number(entry.endMin)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return fallback
    if (endMin <= startMin) return fallback
    return {
      startMin: Math.max(0, Math.min(23 * 60, snap10(startMin))),
      endMin: Math.max(10, Math.min(24 * 60, snap10(endMin))),
    }
  } catch {
    return fallback
  }
}

function saveTimelineWindow(date: string, win: TimelineWindow) {
  if (!date) return
  try {
    const key = 'emma-study-planner:dayTimelineWindow:v1'
    const raw = window.localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : {}
    const next = { ...(parsed ?? {}), [date]: win }
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // ignore
  }
}

function remToPx(rem: string) {
  const n = Number(rem.replace(/rem$/, ''))
  if (!Number.isFinite(n)) return 0
  const root = typeof window !== 'undefined' ? parseFloat(getComputedStyle(document.documentElement).fontSize || '16') : 16
  return n * (Number.isFinite(root) ? root : 16)
}

export function DayDetailView() {
  const navigate = useNavigate()
  const { confirm } = useConfirmDialog()
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const params = useParams()
  const date = params.date ?? todayYmd()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const allTasks = usePlannerStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => t.examId === activeExamId && t.date === date), [allTasks, activeExamId, date])
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const duplicateTask = usePlannerStore((s) => s.duplicateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)
  const { openTaskAdd, openTaskPreview } = useTaskDialog()
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const taskTouchContextMenu = useTouchContextMenu()
  const openContextMenu = (e: ReactMouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }
  const openContextMenuAt = (x: number, y: number, items: ContextMenuItem[]) => {
    setContextMenu({ x, y, items })
  }
  const buildDayTaskMenuItems = (taskId: string) => {
    const task = allTasks.find((it) => it.id === taskId)
    return {
      header: { title: task?.title || '제목 없음', color: subjects.find((s) => s.id === task?.subjectId)?.color ?? '#94a3b8' },
      items: [
        { key: 'timer', label: '타이머', onSelect: () => openTaskPreview(taskId, { autoTimer: true }) },
        ...(task ? [{ key: 'copy', label: '일정 복사', onSelect: () => copyTaskToClipboard(task) }] : []),
        { key: 'edit', label: '편집', onSelect: () => openTaskPreview(taskId, { autoEdit: true }) },
        {
          key: 'delete',
          label: '삭제',
          danger: true,
          onSelect: async () => {
            const ok = await confirm({
              title: '일정을 삭제할까요?',
              message: '이 작업은 되돌릴 수 없어요.',
              confirmLabel: '삭제',
              danger: true,
            })
            if (!ok) return
            deleteTask(taskId)
          },
        },
      ] satisfies ContextMenuItem[],
    }
  }

  const openDayTaskMenu = (e: ReactMouseEvent, taskId: string) => {
    const menu = buildDayTaskMenuItems(taskId)
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, ...menu })
  }

  const openDayTaskMenuAt = (x: number, y: number, taskId: string) => {
    setContextMenu({ x, y, ...buildDayTaskMenuItems(taskId) })
  }
  const openDayTimelineMenu = (e: ReactMouseEvent, startMin: number) => {
    const items: ContextMenuItem[] = [
      {
        key: 'add',
        label: '일정 추가',
        icon: <IconPlus className="h-4 w-4" />,
        onSelect: () => openTaskAdd({ date, plannedStartTime: minutesToHm(startMin), plannedSeconds: 0 }),
      },
    ]
    const clipboardTask = buildClipboardTaskAtTime(minutesToHm(startMin))
    if (clipboardTask) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { ...clipboardTask, date })
        },
      })
    }
    items.push(
      { key: 'month', label: '월간 캘린더 보기', icon: <IconCalendarMonth className="h-4 w-4" />, onSelect: () => navigate(`/?month=${encodeURIComponent(date.slice(0, 7))}`) },
      {
        key: 'week',
        label: '주간 캘린더 보기',
        icon: <IconCalendarWeek className="h-4 w-4" />,
        onSelect: () =>
          navigate(`/week?weekStart=${encodeURIComponent(format(startOfWeek(ymdToDate(date), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}`),
      },
    )
    openContextMenu(e, items)
  }
  const openDayTimelineMenuAt = (x: number, y: number, startMin: number) => {
    const items: ContextMenuItem[] = [
      {
        key: 'add',
        label: '일정 추가',
        icon: <IconPlus className="h-4 w-4" />,
        onSelect: () => openTaskAdd({ date, plannedStartTime: minutesToHm(startMin), plannedSeconds: 0 }),
      },
    ]
    const clipboardTask = buildClipboardTaskAtTime(minutesToHm(startMin))
    if (clipboardTask) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { ...clipboardTask, date })
        },
      })
    }
    items.push(
      { key: 'month', label: '월간 캘린더 보기', icon: <IconCalendarMonth className="h-4 w-4" />, onSelect: () => navigate(`/?month=${encodeURIComponent(date.slice(0, 7))}`) },
      {
        key: 'week',
        label: '주간 캘린더 보기',
        icon: <IconCalendarWeek className="h-4 w-4" />,
        onSelect: () =>
          navigate(`/week?weekStart=${encodeURIComponent(format(startOfWeek(ymdToDate(date), { weekStartsOn: 1 }), 'yyyy-MM-dd'))}`),
      },
    )
    openContextMenuAt(x, y, items)
  }
  const [unscheduledOpen, setUnscheduledOpen] = useState(false)
  const [timelineTimePickerOpen, setTimelineTimePickerOpen] = useState(false)
  const [timelineTimePickerField, setTimelineTimePickerField] = useState<null | 'start' | 'end'>(null)
  const [unscheduledDock, setUnscheduledDock] = useState<{ v: 'top' | 'bottom'; h: 'right' }>({ v: 'bottom', h: 'right' })
  const topDockY = 64
  const [isXlUp, setIsXlUp] = useState(false)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 1280px)')
    const onChange = () => setIsXlUp(Boolean(mq.matches))
    onChange()
    if (typeof mq.addEventListener === 'function') {
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
    // Safari fallback
    mq.addListener(onChange)
    return () => mq.removeListener(onChange)
  }, [])
  const dockDragRef = useRef<{
    isDragging: boolean
    startX: number
    startY: number
    dx: number
    dy: number
    didDrag: boolean
    lastDragAt: number
  }>({ isDragging: false, startX: 0, startY: 0, dx: 0, dy: 0, didDrag: false, lastDragAt: 0 })

  const createTaskAndClose = () => {
    const fallbackSubjectId =
      (lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
      subjects.find((s) => s.examId === activeExamId)?.id ??
      subjects[0]?.id ??
      ''
    if (!fallbackSubjectId) return
    openTaskAdd({ date })
  }

  const onUnscheduledDockPointerDown = (e: React.PointerEvent, allowOnInteractive: boolean) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (!allowOnInteractive && target?.closest('button, a')) return
    dockDragRef.current.isDragging = true
    dockDragRef.current.startX = e.clientX
    dockDragRef.current.startY = e.clientY
    dockDragRef.current.dx = 0
    dockDragRef.current.dy = 0
    dockDragRef.current.didDrag = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onUnscheduledDockPointerMove = (e: React.PointerEvent) => {
    if (!dockDragRef.current.isDragging) return
    dockDragRef.current.dx = e.clientX - dockDragRef.current.startX
    dockDragRef.current.dy = e.clientY - dockDragRef.current.startY
    if (!dockDragRef.current.didDrag && Math.hypot(dockDragRef.current.dx, dockDragRef.current.dy) > 6) dockDragRef.current.didDrag = true
    const root = (e.currentTarget as HTMLElement).closest('[data-unscheduled-dock-root]') as HTMLElement | null
    if (root) root.style.transform = `translate3d(${dockDragRef.current.dx}px, ${dockDragRef.current.dy}px, 0)`
  }

  const onUnscheduledDockPointerUp = (e: React.PointerEvent) => {
    if (!dockDragRef.current.isDragging) return
    dockDragRef.current.isDragging = false
    if (dockDragRef.current.didDrag) dockDragRef.current.lastDragAt = Date.now()
    const root = (e.currentTarget as HTMLElement).closest('[data-unscheduled-dock-root]') as HTMLElement | null
    if (root) root.style.transform = ''
    const vh = window.innerHeight || 1
    const v: 'top' | 'bottom' = e.clientY < vh / 2 ? 'top' : 'bottom'
    setUnscheduledDock({ v, h: 'right' })
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const shouldIgnoreClickAfterDockDrag = () => Date.now() - (dockDragRef.current.lastDragAt || 0) < 350
  const unscheduledDockOrigin = unscheduledDock.v === 'top' ? 'origin-top-right' : 'origin-bottom-right'

  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>(() => loadTimelineWindow(date))
  useEffect(() => {
    setTimelineWindow(loadTimelineWindow(date))
  }, [date])
  useEffect(() => {
    saveTimelineWindow(date, timelineWindow)
  }, [date, timelineWindow])

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []
    for (const t of tasks) {
      const subject = subjects.find((s) => s.id === t.subjectId)
      const subjectName = subject?.name ?? '주제'
      const completed = t.status === 'completed'

      const actualStartMin = hmToMinutesLocal(t.actualStartTime)
      const actualEndMin = hmToMinutesLocal(t.actualEndTime)
      const plannedStartMin = hmToMinutesLocal(t.plannedStartTime)

      if (actualStartMin !== null) {
        const durationSeconds =
          typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
            ? Math.max(0, t.actualSeconds)
            : durationSecondsFromHmRange(t.actualStartTime, t.actualEndTime, { allowNextDay: true }) ?? 0
        const durationMinExact = durationSeconds / 60
        const hasDuration = isMeaningfulDuration(durationMinExact)
        const plannedDurationMinExact = (t.plannedSeconds ?? 0) / 60
        const isTinyRecordedRange =
          actualEndMin !== null && hasDuration ? durationMinExact < 1 : false
        const startMin = actualStartMin
        const endMinExact = Math.min(24 * 60, startMin + Math.max(0, durationMinExact))
        items.push({
          id: t.id,
          kind: 'actual',
          title: t.title,
          subjectColor: subject?.color,
          subjectName,
          completed,
          startMin,
          durationMin: hasDuration ? durationMinExact : 0,
          fallbackDurationMin:
            !isTinyRecordedRange && isMeaningfulDuration(plannedDurationMinExact) ? plannedDurationMinExact : 0,
          startLabel: minutesToHm(startMin),
          endLabel: hasDuration ? minutesToHm(endMinExact) : '',
        })
        continue
      }

      if (plannedStartMin !== null) {
        const durationMinExact = (t.plannedSeconds ?? 0) / 60
        const hasDuration = isMeaningfulDuration(durationMinExact)
        const startMin = plannedStartMin
        const endMinExact = Math.min(24 * 60, startMin + Math.max(0, durationMinExact))
        const isRecordCompleteOnly = Boolean(t.recordCompleteOnly)
        items.push({
          id: t.id,
          kind: isRecordCompleteOnly ? 'actual' : 'planned',
          title: t.title,
          subjectColor: subject?.color,
          subjectName,
          completed,
          startMin,
          durationMin: hasDuration ? durationMinExact : 0,
          fallbackDurationMin: 0,
          startLabel: minutesToHm(startMin),
          endLabel: hasDuration ? minutesToHm(endMinExact) : '',
        })
      }
    }
    return items.sort((a, b) => a.startMin - b.startMin)
  }, [tasks, subjects])

  const dayUnscheduled = useMemo(() => {
    return tasks
      .filter((t) => t.date === date && !t.actualStartTime && !t.plannedStartTime)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [tasks, date])

  const title = date ? format(ymdToDate(date), 'yyyy년 M월 d일') : 'Day Detail'
  const prevYmd = useMemo(() => format(addDays(ymdToDate(date), -1), 'yyyy-MM-dd'), [date])
  const nextYmd = useMemo(() => format(addDays(ymdToDate(date), 1), 'yyyy-MM-dd'), [date])
  const prevLabel = useMemo(() => `${format(addDays(ymdToDate(date), -1), 'd')}일`, [date])
  const nextLabel = useMemo(() => `${format(addDays(ymdToDate(date), 1), 'd')}일`, [date])

  const openTimelineTimePicker = (field: 'start' | 'end') => {
    setTimelineTimePickerField(field)
    setTimelineTimePickerOpen(true)
  }

  const [searchParams, setSearchParams] = useSearchParams()
  const makeDayLink = (ymd: string) => {
    const v = searchParams.get('view')
    const q = v && v !== 'timeline' ? `?view=${encodeURIComponent(v)}` : ''
    return `/day/${ymd}${q}`
  }
  const dayViewMode: 'timeline' | 'planned' | 'completed' =
    searchParams.get('view') === 'planned' ? 'planned' : searchParams.get('view') === 'completed' ? 'completed' : 'timeline'
  const daySwipeRef = useRef<{ isDown: boolean; startX: number; startY: number; lastX: number }>({
    isDown: false,
    startX: 0,
    startY: 0,
    lastX: 0,
  })
  const daySwipeLockRef = useRef<'none' | 'h' | 'v'>('none')
  const daySwipeHostRef = useRef<HTMLDivElement | null>(null)
  const [daySwipeX, setDaySwipeX] = useState(0)
  const [dayIsSwiping, setDayIsSwiping] = useState(false)
  const [daySwipeBlocked, setDaySwipeBlocked] = useState(false)
  const daySwipeScrollStopRef = useRef<{ active: boolean; onTouchMove?: (e: TouchEvent) => void; onWheel?: (e: WheelEvent) => void }>({
    active: false,
  })
  const startDaySwipeScrollStop = () => {
    if (typeof window === 'undefined') return
    if (daySwipeScrollStopRef.current.active) return
    const onTouchMove = (e: TouchEvent) => {
      // iOS Safari: prevent scrolling while horizontal swipe is active, even if pointer events become non-cancelable.
      if (e.cancelable) e.preventDefault()
    }
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault()
    }
    daySwipeScrollStopRef.current.active = true
    daySwipeScrollStopRef.current.onTouchMove = onTouchMove
    daySwipeScrollStopRef.current.onWheel = onWheel
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('wheel', onWheel, { passive: false })
  }
  const stopDaySwipeScrollStop = () => {
    if (typeof window === 'undefined') return
    if (!daySwipeScrollStopRef.current.active) return
    const onTouchMove = daySwipeScrollStopRef.current.onTouchMove
    if (onTouchMove) window.removeEventListener('touchmove', onTouchMove)
    const onWheel = daySwipeScrollStopRef.current.onWheel
    if (onWheel) window.removeEventListener('wheel', onWheel)
    daySwipeScrollStopRef.current.active = false
    daySwipeScrollStopRef.current.onTouchMove = undefined
    daySwipeScrollStopRef.current.onWheel = undefined
  }
  const dayTabsRef = useRef<HTMLDivElement | null>(null)
  const [dayTabsW, setDayTabsW] = useState(0)
  const timelineScrollRef = useRef<HTMLDivElement | null>(null)
  const plannedScrollRef = useRef<HTMLDivElement | null>(null)
  const completedScrollRef = useRef<HTMLDivElement | null>(null)
  const scrollTopByTabRef = useRef<{ timeline: number; planned: number; completed: number }>({
    timeline: 0,
    planned: 0,
    completed: 0,
  })
  useEffect(() => {
    const el = dayTabsRef.current
    if (!el) return
    const calc = () => setDayTabsW(el.getBoundingClientRect().width || 0)
    calc()
    const ro = new ResizeObserver(() => calc())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const top = scrollTopByTabRef.current[dayViewMode === 'timeline' ? 'timeline' : dayViewMode === 'planned' ? 'planned' : 'completed'] ?? 0
    const el =
      dayViewMode === 'timeline'
        ? timelineScrollRef.current
        : dayViewMode === 'planned'
          ? plannedScrollRef.current
          : completedScrollRef.current
    if (!el) return
    el.scrollTop = top
  }, [dayViewMode])

  const listGroups = useMemo(() => {
    const groups = new Map<string, { subjectId: string; subjectName: string; subjectColor: string; items: typeof tasks }>()
    for (const t of tasks) {
      const subject = subjects.find((s) => s.id === t.subjectId)
      const subjectId = subject?.id ?? 'unknown'
      const subjectName = subject?.name ?? '주제'
      const subjectColor = subject?.color ?? '#94a3b8'
      const key = `${subjectId}:${subjectName}:${subjectColor}`
      const g = groups.get(key) ?? { subjectId, subjectName, subjectColor, items: [] as any }
      g.items.push(t)
      groups.set(key, g)
    }
    const out = Array.from(groups.values()).sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    for (const g of out) {
      g.items.sort((a, b) => {
        const aHasRecord = Boolean(a.actualStartTime || a.actualEndTime || typeof a.actualSeconds === 'number')
        const bHasRecord = Boolean(b.actualStartTime || b.actualEndTime || typeof b.actualSeconds === 'number')
        const aCompleted = a.status === 'completed' || aHasRecord
        const bCompleted = b.status === 'completed' || bHasRecord
        if (aCompleted !== bCompleted) return aCompleted ? 1 : -1
        const aTime = (a.actualStartTime ?? a.plannedStartTime ?? '99:99') as string
        const bTime = (b.actualStartTime ?? b.plannedStartTime ?? '99:99') as string
        const cmp = aTime.localeCompare(bTime)
        if (cmp !== 0) return cmp
        return a.createdAt.localeCompare(b.createdAt)
      })
    }
    return out
  }, [tasks, subjects])

  // listGroups are filtered inside listPanel(mode)

  const duplicateTimelineTaskAt = (taskId: string, kind: TimelineKind, startMin: number, durationMin: number) => {
    const startHm = minutesToHm(startMin)
    const endHm = minutesToHm(startMin + durationMin)
    if (kind === 'actual') {
      duplicateTask(taskId, {
        actualStartTime: startHm,
        actualEndTime: endHm,
        actualSeconds: undefined,
        recordCompleteOnly: false,
        status: 'completed',
      })
      return
    }
    duplicateTask(taskId, {
      plannedStartTime: startHm,
      plannedSeconds: durationMin * 60,
    })
  }

  const duplicateTimelineTaskAsUnscheduled = (taskId: string, kind: TimelineKind) => {
    if (kind === 'actual') {
      duplicateTask(taskId, {
        actualStartTime: undefined,
        actualEndTime: undefined,
        actualSeconds: undefined,
        plannedStartTime: undefined,
        recordCompleteOnly: false,
        status: 'pending',
      })
      return
    }
    duplicateTask(taskId, { plannedStartTime: undefined })
  }

  const timelinePanel = (
    <div className="px-4 md:px-3">
      <div data-no-day-swipe={daySwipeBlocked ? 'true' : undefined}>
      <DayTimeline
        items={timelineItems}
        viewStartMin={timelineWindow.startMin}
        viewEndMin={timelineWindow.endMin}
        onChangeWindow={(startMin, endMin) => setTimelineWindow({ startMin, endMin })}
        onRequestTimePick={(field) => openTimelineTimePicker(field)}
        onOpenTask={(taskId) => openTaskPreview(taskId)}
        onOpenTaskMenu={openDayTaskMenu}
        onOpenTaskMenuAt={openDayTaskMenuAt}
        onOpenCanvasMenu={openDayTimelineMenu}
        onOpenCanvasMenuAt={openDayTimelineMenuAt}
        onInteractionLockChange={(locked) => setDaySwipeBlocked(locked)}
        onToggleComplete={(taskId, _kind, nextCompleted) => {
          if (nextCompleted) {
            // 타임라인 체크는 편집창의 "완료 처리"와 동일: 기록시간 없이 완료 처리
            updateTask(taskId, {
              status: 'completed',
              recordCompleteOnly: true,
              actualStartTime: undefined,
              actualEndTime: undefined,
              actualSeconds: undefined,
            })
          } else {
            updateTask(taskId, {
              status: 'pending',
              recordCompleteOnly: false,
              actualStartTime: undefined,
              actualEndTime: undefined,
              actualSeconds: undefined,
            })
          }
        }}
        onUnscheduleTask={(taskId, kind) => {
          if (kind === 'actual') {
            updateTask(taskId, {
              actualStartTime: undefined,
              actualEndTime: undefined,
              actualSeconds: undefined,
              plannedStartTime: undefined,
            })
          } else {
            updateTask(taskId, { plannedStartTime: undefined })
          }
        }}
        onDuplicateTask={duplicateTimelineTaskAt}
        onDuplicateTaskAsUnscheduled={duplicateTimelineTaskAsUnscheduled}
        onUpdate={(taskId, kind, startMin, durationMin) => {
          const startHm = minutesToHm(startMin)
          const endHm = minutesToHm(startMin + durationMin)
          if (kind === 'actual') {
            // 완료처리 상태에서 시간을 옮기면 "완료 시간 입력"으로 간주
            updateTask(taskId, {
              actualStartTime: startHm,
              actualEndTime: endHm,
              actualSeconds: undefined,
              recordCompleteOnly: false,
              status: 'completed',
            })
          } else {
            updateTask(taskId, { plannedStartTime: startHm, plannedSeconds: durationMin * 60 })
          }
        }}
        onDropTask={(taskId, startMin, copyMode) => {
          const task = tasks.find((x) => x.id === taskId)
          if (!task) return
          // 시간미정 -> 타임라인 배치 시 "소요시간"은 덮어쓰지 않음 (있으면 유지, 없으면 undefined 유지)
          if (copyMode) {
            duplicateTask(taskId, { plannedStartTime: minutesToHm(startMin) })
            return
          }
          updateTask(taskId, { plannedStartTime: minutesToHm(startMin) })
        }}
        onAddRange={(startMin, endMin) => {
          const start = snap10(Math.min(startMin, endMin))
          const end = Math.max(start + 10, snap10(Math.max(startMin, endMin)))
          const minutes = Math.max(0, end - start)
          // if user only uses the minimum 10-min selection, treat it as "start time only" (no duration)
          const plannedSeconds = minutes <= 10 ? 0 : minutes * 60
          openTaskAdd({ date, plannedStartTime: minutesToHm(start), plannedSeconds })
        }}
      />
      </div>
    </div>
  )

  const listPanel = (mode: 'planned' | 'completed') => (
    <div className="px-4 md:px-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="hidden xl:flex items-center gap-3">
          <span className="text-2xl font-bold tracking-tight text-slate-900">
            {mode === 'completed' ? '완료' : '계획'}
          </span>
        </span>
        <span className="xl:hidden" />
        <button
          type="button"
          onClick={() => openTaskAdd({ date })}
          className="inline-flex h-9 items-center justify-center rounded-xl bg-black/80 px-3 text-sm font-semibold text-white hover:bg-black/70"
          aria-label={`${mode === 'completed' ? '완료' : '계획'} 일정 추가`}
        >
          + 일정 추가
        </button>
      </div>
      <div className="space-y-4">
        {listGroups
          .map((g) => {
            const isTaskCompleted = (t: (typeof tasks)[number]) => {
              const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
              return t.status === 'completed' || hasAnyRecord
            }
            const items = g.items.filter((t) => (mode === 'completed' ? isTaskCompleted(t) : !isTaskCompleted(t)))
            return { ...g, items }
          })
          .filter((g) => g.items.length > 0)
          .map((g) => (
          <div key={g.subjectId}>
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <span className="h-4 w-1.5 rounded-none" style={{ background: g.subjectColor }} aria-hidden="true" />
              <span className="min-w-0 truncate">{g.subjectName}</span>
            </div>
            <div className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
              {g.items.map((t) => {
                const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
                const isCompleted = t.status === 'completed' || hasAnyRecord
                const plannedSeconds = Number.isFinite(t.plannedSeconds) ? Math.max(0, t.plannedSeconds) : 0
                const hasPlannedDuration = plannedSeconds > 0
                const actualSecondsFromTimes = (() => {
                  return durationSecondsFromHmRange(t.actualStartTime, t.actualEndTime, { allowNextDay: true }) ?? 0
                })()
                const actualSeconds =
                  typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                    ? Math.max(0, t.actualSeconds)
                    : t.recordCompleteOnly
                      ? plannedSeconds
                      : actualSecondsFromTimes
                const hasActualDuration = actualSeconds > 0
                const deltaMin = hasActualDuration && hasPlannedDuration ? Math.round((actualSeconds - plannedSeconds) / 60) : 0
                const plannedStartMin = hmToMinutesLocal(t.plannedStartTime)
                const plannedEndHm =
                  plannedStartMin !== null && hasPlannedDuration ? minutesToHm(plannedStartMin + plannedSeconds / 60) : null
                const actualStartMin = hmToMinutesLocal(t.actualStartTime)
                const actualEndMin = hmToMinutesLocal(t.actualEndTime)
                const actualIsTinyRange = actualStartMin !== null && actualEndMin !== null ? actualSeconds < 60 : false
                const plannedIsTinyRange = hasPlannedDuration ? plannedSeconds / 60 < 1 : false
                const timeLabel =
                  t.actualStartTime || t.actualEndTime
                    ? actualIsTinyRange
                      ? `${formatMeridiemHm(t.actualStartTime ?? undefined) ?? (t.actualStartTime ?? '-')}`
                      : `${formatMeridiemHm(t.actualStartTime ?? undefined) ?? (t.actualStartTime ?? '-')}-${formatMeridiemHm(t.actualEndTime ?? undefined) ?? (t.actualEndTime ?? '-')}`
                    : t.plannedStartTime
                      ? hasPlannedDuration && plannedEndHm
                        ? plannedIsTinyRange
                          ? `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}`
                          : `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}-${formatMeridiemHm(plannedEndHm) ?? plannedEndHm}`
                        : `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}`
                      : ''
                const dday = formatDday(t.dueDate)
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (taskTouchContextMenu.shouldIgnoreClick()) return
                      openTaskPreview(t.id)
                    }}
                    onContextMenu={(e) => openDayTaskMenu(e, t.id)}
                    {...taskTouchContextMenu.bind(`day-list:${t.id}`, ({ x, y }) => openDayTaskMenuAt(x, y, t.id))}
                    className={`grid w-full select-none grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 px-2 py-3 text-slate-900 hover:bg-slate-50 ${
                      isCompleted ? 'opacity-75' : ''
                    }`}
                  >
                    <span className="flex min-w-0 flex-col gap-0.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <button
                          type="button"
                          className="shrink-0 opacity-95"
                          aria-label={isCompleted ? '완료 해제' : '완료 처리'}
                          onClick={(e) => {
                            e.stopPropagation()
                            if (isCompleted) {
                              updateTask(t.id, {
                                status: 'pending',
                                recordCompleteOnly: false,
                                actualStartTime: undefined,
                                actualEndTime: undefined,
                                actualSeconds: undefined,
                              })
                              return
                            }
                            const hasRecordedTime = Boolean(t.actualStartTime && t.actualEndTime) || typeof t.actualSeconds === 'number'
                            updateTask(t.id, { status: 'completed', recordCompleteOnly: !hasRecordedTime })
                          }}
                          style={{ color: g.subjectColor }}
                        >
                          {isCompleted ? (
                            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                              <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="currentColor" stroke="currentColor" strokeWidth="2" />
                              <path
                                d="M6 10.2l2.3 2.3L14.5 6.6"
                                fill="none"
                                stroke="#ffffff"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          ) : (
                            <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                              <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                            </svg>
                          )}
                        </button>
                        <span className="min-w-0 truncate font-semibold">{t.title}</span>
                      </span>
                      <span className="pl-7 text-left text-[11px] font-semibold tabular-nums opacity-80">
                        {timeLabel ? timeLabel : <span className="invisible">오후 11:00-오후 11:40</span>}
                      </span>
                    </span>
                    <span className="shrink-0 self-stretch overflow-hidden">
                      <span
                        className="flex max-w-[220px] flex-col items-end justify-between gap-1 overflow-hidden text-xs tabular-nums opacity-90"
                        style={{ height: '100%' }}
                      >
                      <span className="min-h-[18px]">
                        {dday ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-indigo-700 tabular-nums">
                            {dday}
                          </span>
                        ) : null}
                      </span>
                      {hasPlannedDuration && hasActualDuration ? (
                        <span className="mt-0.5 block text-right">
                          <span className="flex items-center justify-end gap-2">
                            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">계획</span>
                            <span className="opacity-90">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                          </span>
                          <span className="mt-1 flex items-center justify-end gap-2">
                            {deltaMin === 0 ? null : (
                              <span
                                className={`rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                                  deltaMin > 0 ? 'text-blue-700' : 'text-rose-700'
                                }`}
                              >
                                {deltaMin > 0 ? `+ ${formatDurationKoFromMinutes(deltaMin)}` : `- ${formatDurationKoFromMinutes(Math.abs(deltaMin))}`}
                              </span>
                            )}
                            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
                            <span className="opacity-90">{formatDurationKoFromSeconds(actualSeconds)}</span>
                          </span>
                        </span>
                      ) : hasActualDuration ? (
                        <span className="mt-0.5 flex items-center justify-end gap-1.5">
                          <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
                          <span className="opacity-90">{formatDurationKoFromSeconds(actualSeconds)}</span>
                        </span>
                      ) : hasPlannedDuration ? (
                        t.recordCompleteOnly && !t.plannedStartTime ? (
                          <span className="mt-0.5 flex items-center justify-end gap-3">
                            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">계획</span>
                            <span className="opacity-90">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
                            <span className="opacity-90">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                          </span>
                        ) : (
                          <span className="mt-0.5 flex items-center justify-end gap-1.5">
                            <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">계획</span>
                            <span className="opacity-90">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                          </span>
                        )
                      ) : (
                        <span />
                      )}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
        {(() => {
          const isTaskCompleted = (t: (typeof tasks)[number]) => {
            const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
            return t.status === 'completed' || hasAnyRecord
          }
          const hasAny = listGroups.some((g) => g.items.some((t) => (mode === 'completed' ? isTaskCompleted(t) : !isTaskCompleted(t))))
          return hasAny ? null : <div className="py-6 text-center text-sm text-slate-500">일정이 없어요.</div>
        })()}
      </div>
    </div>
  )

  const listHasAny = useMemo(() => {
    const isTaskCompleted = (t: (typeof tasks)[number]) => {
      const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
      return t.status === 'completed' || hasAnyRecord
    }
    const plannedAny = listGroups.some((g) => g.items.some((t) => !isTaskCompleted(t)))
    const completedAny = listGroups.some((g) => g.items.some((t) => isTaskCompleted(t)))
    return { plannedAny, completedAny }
  }, [listGroups, tasks])

  const setDayViewMode = (next: 'timeline' | 'planned' | 'completed') => {
    setSearchParams(
      (prev) => {
        const p = new URLSearchParams(prev)
        if (next === 'planned') p.set('view', 'planned')
        else if (next === 'completed') p.set('view', 'completed')
        else p.delete('view')
        return p
      },
      { replace: true },
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {(() => {
        const dayTabs = (
          <div ref={dayTabsRef} className="relative flex w-full select-none items-stretch justify-between">
            {(() => {
              const idx = dayViewMode === 'timeline' ? 0 : dayViewMode === 'planned' ? 1 : 2
              const w = dayTabsW || 1
              const progress = idx + -daySwipeX / w
              const clamped = Math.max(0, Math.min(2, progress))
              const leftPct = (clamped / 3) * 100
              return (
                <div
                  className="absolute bottom-0 h-[3px] w-1/3 bg-black/80"
                  style={{
                    left: `${leftPct}%`,
                    transition: dayIsSwiping ? 'none' : 'left 220ms cubic-bezier(0.16, 1, 0.3, 1)',
                  }}
                  aria-hidden="true"
                />
              )
            })()}
            <button
              type="button"
              onClick={() => setDayViewMode('timeline')}
              className={`flex-1 py-2 text-center text-base font-medium ${
                dayViewMode === 'timeline' ? 'text-slate-900' : 'text-slate-500'
              }`}
            >
              타임라인
            </button>
            <button
              type="button"
              onClick={() => setDayViewMode('planned')}
              className={`flex-1 py-2 text-center text-base font-medium ${
                dayViewMode === 'planned' ? 'text-slate-900' : 'text-slate-500'
              }`}
            >
              계획
            </button>
            <button
              type="button"
              onClick={() => setDayViewMode('completed')}
              className={`flex-1 py-2 text-center text-base font-medium ${
                dayViewMode === 'completed' ? 'text-slate-900' : 'text-slate-500'
              }`}
            >
              완료
            </button>
          </div>
        )
        return (
          <MobileTopBar
            title={title}
            left={
              <Button variant="secondary" onClick={() => navigate(makeDayLink(prevYmd))}>
                {prevLabel}
              </Button>
            }
            right={
              <Button variant="secondary" onClick={() => navigate(makeDayLink(nextYmd))}>
                {nextLabel}
              </Button>
            }
            bottom={
              <div className="xl:hidden">
                {dayTabs}
              </div>
            }
          />
        )
      })()}

      <div className="hidden xl:grid xl:grid-cols-2 xl:items-start xl:gap-4">
        <div className="min-w-0">{timelinePanel}</div>
        <div className="min-w-0">
          <div className="flex min-h-0 flex-col">
            {listHasAny.plannedAny ? <div className="min-h-0">{listPanel('planned')}</div> : null}
            {listHasAny.plannedAny && listHasAny.completedAny ? <div className="my-3 h-px w-full bg-slate-200" /> : null}
            {listHasAny.completedAny ? <div className="min-h-0">{listPanel('completed')}</div> : null}
          </div>
        </div>
      </div>
      <div
        className="xl:hidden"
        ref={daySwipeHostRef}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return
          const target = e.target as HTMLElement | null
          // do not steal gestures on interactive controls
          if (target?.closest('input, textarea, select, [data-no-day-swipe=\"true\"]')) return
          daySwipeRef.current.isDown = true
          daySwipeRef.current.startX = e.clientX
          daySwipeRef.current.startY = e.clientY
          daySwipeRef.current.lastX = e.clientX
          daySwipeLockRef.current = 'none'
          setDayIsSwiping(false)
          setDaySwipeX(0)
          if (daySwipeHostRef.current) daySwipeHostRef.current.style.touchAction = 'pan-y'
          stopDaySwipeScrollStop()
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'touch') return
          if (!daySwipeRef.current.isDown) return
          const dx = e.clientX - daySwipeRef.current.startX
          const dy = e.clientY - daySwipeRef.current.startY
          if (daySwipeLockRef.current === 'none') {
            if (Math.abs(dx) < 3 && Math.abs(dy) < 3) return
            if (Math.abs(dx) > Math.abs(dy) * 1.08) daySwipeLockRef.current = 'h'
            else if (Math.abs(dy) > Math.abs(dx) * 1.08) daySwipeLockRef.current = 'v'
            else return
            if (daySwipeLockRef.current === 'h') {
              if (daySwipeHostRef.current) daySwipeHostRef.current.style.touchAction = 'pan-x'
              startDaySwipeScrollStop()
              try {
                ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
              } catch {
                // ignore
              }
            } else {
              // vertical intent: ensure horizontal swipe never steals this gesture
              if (daySwipeHostRef.current) daySwipeHostRef.current.style.touchAction = 'pan-y'
              stopDaySwipeScrollStop()
            }
          }
          if (daySwipeLockRef.current === 'v') return
          if (!dayIsSwiping) setDayIsSwiping(true)
          daySwipeRef.current.lastX = e.clientX
          // lock out vertical scroll while we are swiping horizontally (even if hand jitters vertically)
          if (e.cancelable) e.preventDefault()
          setDaySwipeX(dx)
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== 'touch') return
          if (!daySwipeRef.current.isDown) return
          daySwipeRef.current.isDown = false
          const dx = e.clientX - daySwipeRef.current.startX
          const threshold = 62
          setDayIsSwiping(false)
          setDaySwipeX(0)
          if (daySwipeHostRef.current) daySwipeHostRef.current.style.touchAction = 'pan-y'
          stopDaySwipeScrollStop()
          if (daySwipeLockRef.current !== 'h') return
          if (Math.abs(dx) < threshold) return
          if (dx < 0) {
            if (dayViewMode === 'timeline') setDayViewMode('planned')
            else if (dayViewMode === 'planned') setDayViewMode('completed')
          } else {
            if (dayViewMode === 'completed') setDayViewMode('planned')
            else if (dayViewMode === 'planned') setDayViewMode('timeline')
          }
        }}
        onPointerCancel={() => {
          daySwipeRef.current.isDown = false
          daySwipeLockRef.current = 'none'
          setDayIsSwiping(false)
          setDaySwipeX(0)
          if (daySwipeHostRef.current) daySwipeHostRef.current.style.touchAction = 'pan-y'
          stopDaySwipeScrollStop()
        }}
        style={{ touchAction: 'pan-y' }}
      >
        <div className="relative overflow-hidden">
          <div
            className="flex w-[300%]"
            style={{
              transform: (() => {
                const base = dayViewMode === 'timeline' ? 0 : dayViewMode === 'planned' ? -33.3333 : -66.6666
                const dx = dayViewMode === 'timeline' ? Math.min(0, daySwipeX) : dayViewMode === 'completed' ? Math.max(0, daySwipeX) : daySwipeX
                return `translate3d(calc(${base}% + ${dx}px), 0, 0)`
              })(),
              transition: dayIsSwiping ? 'none' : 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            <div
              ref={timelineScrollRef}
              className="w-1/3 overflow-y-auto overscroll-contain"
              style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 120px - var(--bottom-nav-h, 0px) - var(--bottom-overlay-offset, 0px))' }}
              onScroll={(e) => (scrollTopByTabRef.current.timeline = (e.currentTarget as HTMLDivElement).scrollTop)}
            >
              {timelinePanel}
            </div>
            <div
              ref={plannedScrollRef}
              className="w-1/3 overflow-y-auto overscroll-contain"
              style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 120px - var(--bottom-nav-h, 0px) - var(--bottom-overlay-offset, 0px))' }}
              onScroll={(e) => (scrollTopByTabRef.current.planned = (e.currentTarget as HTMLDivElement).scrollTop)}
            >
              {listPanel('planned')}
            </div>
            <div
              ref={completedScrollRef}
              className="w-1/3 overflow-y-auto overscroll-contain"
              style={{ height: 'calc(100dvh - env(safe-area-inset-top) - 120px - var(--bottom-nav-h, 0px) - var(--bottom-overlay-offset, 0px))' }}
              onScroll={(e) => (scrollTopByTabRef.current.completed = (e.currentTarget as HTMLDivElement).scrollTop)}
            >
              {listPanel('completed')}
            </div>
          </div>
        </div>
      </div>

      <TimePickerModal
        open={timelineTimePickerOpen}
        title={timelineTimePickerField === 'end' ? '종료' : '시작'}
        initialHm={timelineTimePickerField === 'end' ? minutesToHm(timelineWindow.endMin) : minutesToHm(timelineWindow.startMin)}
        stepMinutes={10}
        validate={(hm) => {
          const m = hmToMinutesLocal(hm)
          if (m === null) return '유효한 시간을 선택해주세요.'
          const picked = snap10(m)
          if (timelineTimePickerField === 'start') {
            if (picked >= timelineWindow.endMin) return '시작은 종료보다 이전이어야 해요.'
            if (timelineWindow.endMin - picked < 10) return '최소 10분 이상 보여야 해요.'
          } else if (timelineTimePickerField === 'end') {
            if (picked <= timelineWindow.startMin) return '종료는 시작보다 이후여야 해요.'
            if (picked - timelineWindow.startMin < 10) return '최소 10분 이상 보여야 해요.'
          }
          return null
        }}
        onApply={(hm) => {
          const m = hmToMinutesLocal(hm)
          if (m === null) return
          const picked = snap10(m)
          if (timelineTimePickerField === 'start') {
            const startMin = picked
            const endMin = Math.max(startMin + 10, timelineWindow.endMin)
            setTimelineWindow({ startMin, endMin })
          } else if (timelineTimePickerField === 'end') {
            const endMin = Math.max(timelineWindow.startMin + 10, picked)
            setTimelineWindow({ startMin: timelineWindow.startMin, endMin })
          }
        }}
        onClose={() => setTimelineTimePickerOpen(false)}
      />

      {dayViewMode === 'timeline' && !isXlUp ? (
        <div
          data-unscheduled-dock-root
          className={`fixed z-40 flex items-start justify-end gap-[10px] md:hidden ${unscheduledDockOrigin}`}
          style={{
            right: '0.375rem',
            bottom: unscheduledDock.v === 'bottom' ? 'calc(var(--bottom-nav-h, 0px) + var(--bottom-overlay-offset, 0px) + 10px)' : undefined,
            top: unscheduledDock.v === 'top' ? `${topDockY}px` : undefined,
            width: unscheduledOpen ? 'calc(100vw - 0.75rem)' : '138px',
            height: unscheduledOpen ? '173px' : '64px',
          }}
        >
          {!unscheduledOpen ? (
            <button
              type="button"
              className="flex h-[64px] w-[64px] items-center justify-center rounded-full bg-black/80 text-white shadow-xl ring-1 ring-black/10"
              onClick={createTaskAndClose}
              aria-label="일정 추가"
            >
              <span aria-hidden="true" className="text-3xl leading-none">
                +
              </span>
            </button>
          ) : null}
          <div
            className="relative border border-white/8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm backdrop-saturate-105 will-change-[width,height,border-radius]"
            style={{
              width: unscheduledOpen ? '100%' : '64px',
              height: unscheduledOpen ? '100%' : '64px',
              borderRadius: unscheduledOpen ? 24 : 9999,
              backgroundColor: unscheduledOpen ? 'rgba(255,255,255,0.82)' : 'rgba(255,255,255,0.96)',
              overflow: unscheduledOpen ? 'hidden' : 'visible',
              transition: unscheduledOpen
                ? 'border-radius 0ms linear, width 360ms cubic-bezier(0.16, 1, 0.3, 1), height 360ms cubic-bezier(0.16, 1, 0.3, 1)'
                : 'border-radius 260ms cubic-bezier(0.16, 1, 0.3, 1), width 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms, height 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms',
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (shouldIgnoreClickAfterDockDrag()) return
                setUnscheduledOpen(true)
              }}
              className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-110 ease-out ${
                unscheduledOpen ? 'pointer-events-none scale-[0.92] opacity-0' : 'pointer-events-auto scale-100 opacity-100'
              }`}
              onPointerDown={(e) => onUnscheduledDockPointerDown(e, true)}
              onPointerMove={onUnscheduledDockPointerMove}
              onPointerUp={onUnscheduledDockPointerUp}
              onPointerCancel={onUnscheduledDockPointerUp}
              style={{ touchAction: 'none' }}
              aria-label="시간 미정 열기"
            >
              <div className="relative">
                <UnscheduledBubbleIcon />
                {dayUnscheduled.length ? (
                  <div className="absolute -right-2.5 -top-2.5 min-w-[18px] rounded-full bg-black/80 px-1.5 py-0.5 text-center text-[11px] font-semibold leading-none text-white tabular-nums shadow-sm">
                    {dayUnscheduled.length > 99 ? '99+' : dayUnscheduled.length}
                  </div>
                ) : null}
              </div>
            </button>

            {unscheduledOpen ? (
              <div className="flex h-full flex-col">
              <div
                className="flex w-full items-center justify-between gap-2 px-3 py-2"
                onPointerDown={(e) => onUnscheduledDockPointerDown(e, false)}
                onPointerMove={onUnscheduledDockPointerMove}
                onPointerUp={onUnscheduledDockPointerUp}
                onPointerCancel={onUnscheduledDockPointerUp}
                style={{ touchAction: 'none' }}
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">시간 미정</div>
                  {dayUnscheduled.length ? (
                    <div className="rounded-full bg-white/7 px-2 py-0.5 text-[11px] font-semibold text-slate-800 tabular-nums backdrop-blur">
                      {dayUnscheduled.length}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      createTaskAndClose()
                      setUnscheduledOpen(false)
                    }}
                  >
                    + 일정 추가
                  </Button>
                  <Button variant="secondary" onClick={() => setUnscheduledOpen(false)} aria-label="시간 미정 닫기">
                    <span aria-hidden="true" className="text-lg leading-none">
                      ×
                    </span>
                  </Button>
                </div>
              </div>

              <div
                className="h-[132px] border-t border-white/8 px-3 py-2"
                data-unscheduled-dropzone="true"
                onDragOver={(e) => {
                  e.preventDefault()
                  syncTaskDropEffect(e)
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const taskId = getTaskDragId(e.dataTransfer)
                  if (!taskId) return
                  if (e.altKey) duplicateTask(taskId, { plannedStartTime: undefined })
                  else updateTask(taskId, { plannedStartTime: undefined })
                }}
              >
                {dayUnscheduled.length === 0 ? (
                  <div className="text-sm text-slate-800/70">시간 미정 일정이 없어요.</div>
                ) : (
                  <div className="h-full overflow-y-auto overscroll-contain pr-1">
                    {(() => {
                      type UnscheduledTask = (typeof dayUnscheduled)[number]
                      const groups = new Map<
                        string,
                        { subjectId: string; subjectName: string; subjectColor: string; items: UnscheduledTask[] }
                      >()
                      for (const t of dayUnscheduled) {
                        const subject = subjects.find((s) => s.id === t.subjectId)
                        const subjectId = subject?.id ?? 'unknown'
                        const subjectName = subject?.name ?? '주제'
                        const subjectColor = subject?.color ?? '#94a3b8'
                        const key = `${subjectId}:${subjectName}:${subjectColor}`
                        const g = groups.get(key) ?? { subjectId, subjectName, subjectColor, items: [] as UnscheduledTask[] }
                        g.items.push(t)
                        groups.set(key, g)
                      }
                      const ordered = Array.from(groups.values()).sort((a, b) => a.subjectName.localeCompare(b.subjectName))
                      return (
                        <div className="flex h-full gap-3 overflow-x-auto overscroll-x-contain pr-2">
                          {ordered.map((g) => {
                            const bg = g.subjectColor
                            const onText = pickOnColorText(bg)
                            const cols: Array<typeof g.items> = []
                            for (let i = 0; i < g.items.length; i += 2) cols.push(g.items.slice(i, i + 2))
                            return (
                              <div key={g.subjectId} className="flex h-full shrink-0 flex-col">
                                <div className="mb-2 text-[12px] font-semibold text-slate-900/90">{g.subjectName}</div>
                                <div className="flex gap-2">
                                      {cols.map((col, ci) => (
                                        <div key={ci} className="flex flex-col gap-2">
                                          {col.map((t) => {
                                            const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
                                            const isCompleted = t.status === 'completed' || hasAnyRecord
                                            return (
	                                              <button
	                                                key={t.id}
	                                            type="button"
	                                            onClick={() => {
	                                              if (taskTouchContextMenu.shouldIgnoreClick()) return
	                                              openTaskPreview(t.id)
	                                            }}
                                                onContextMenu={(e) => openDayTaskMenu(e, t.id)}
	                                            {...taskTouchContextMenu.bind(`day-bubble:${t.id}`, ({ x, y }) => openDayTaskMenuAt(x, y, t.id))}
	                                            draggable
	                                            onDragStart={(e) => {
                                              setTaskDragData(e.dataTransfer, t.id)
                                            }}
                                            className={`w-[33vw] max-w-[190px] select-none rounded-xl border border-black/10 px-2.5 py-1.5 text-left text-[10px] shadow-sm ${onText} ${
                                              isCompleted ? 'saturate-[0.85] brightness-[0.97]' : ''
                                            }`}
                                            style={{ backgroundColor: bg }}
                                            title="타임라인으로 드래그해서 배치"
                                          >
                                            <div className="flex items-start justify-between gap-1.5">
                                              <div className="min-w-0">
                                                <div className="flex items-center gap-1.5">
                                                  <button
                                                    type="button"
                                                    className="inline-flex h-3.5 w-3.5 items-center justify-center opacity-90"
                                                    aria-label={isCompleted ? '완료 해제' : '완료 처리'}
                                                    onClick={(e) => {
                                                      e.stopPropagation()
                                                      if (isCompleted) {
                                                        updateTask(t.id, {
                                                          status: 'pending',
                                                          recordCompleteOnly: false,
                                                          actualStartTime: undefined,
                                                          actualEndTime: undefined,
                                                          actualSeconds: undefined,
                                                        })
                                                      } else {
                                                        const hasRecordedTime =
                                                          Boolean(t.actualStartTime && t.actualEndTime) || typeof t.actualSeconds === 'number'
                                                        updateTask(t.id, { status: 'completed', recordCompleteOnly: !hasRecordedTime })
                                                      }
                                                    }}
                                                  >
                                                    {isCompleted ? (
                                                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                                                        <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                                        <path d="M6 10.2l2.3 2.3L14.5 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                                      </svg>
                                                    ) : (
                                                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                                                        <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                                      </svg>
                                                    )}
                                                  </button>
                                                  <div className="min-w-0 truncate font-semibold">{t.title}</div>
                                                </div>
                                              </div>
                                            </div>
                                          </button>
                                        )
                                      })}
                                      {col.length === 1 ? <div className="h-[1px]" /> : null}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
      ) : null}
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
}

function DayTimeline({
  items,
  onUpdate,
  onDropTask,
  onUnscheduleTask,
  onDuplicateTask,
  onDuplicateTaskAsUnscheduled,
  onToggleComplete,
  onAddRange,
  viewStartMin,
  viewEndMin,
  onChangeWindow,
  onRequestTimePick,
  onOpenTask,
  onOpenTaskMenu,
  onOpenTaskMenuAt,
  onOpenCanvasMenu,
  onOpenCanvasMenuAt,
  onInteractionLockChange,
}: {
  items: TimelineItem[]
  onUpdate: (taskId: string, kind: TimelineKind, startMin: number, durationMin: number) => void
  onDropTask: (taskId: string, startMin: number, copyMode: boolean) => void
  onUnscheduleTask: (taskId: string, kind: TimelineKind) => void
  onDuplicateTask: (taskId: string, kind: TimelineKind, startMin: number, durationMin: number) => void
  onDuplicateTaskAsUnscheduled: (taskId: string, kind: TimelineKind) => void
  onToggleComplete: (taskId: string, kind: TimelineKind, nextCompleted: boolean) => void
  onAddRange: (startMin: number, endMin: number) => void
  viewStartMin: number
  viewEndMin: number
  onChangeWindow: (startMin: number, endMin: number) => void
  onRequestTimePick: (field: 'start' | 'end') => void
  onOpenTask: (taskId: string) => void
  onOpenTaskMenu?: (e: ReactMouseEvent, taskId: string) => void
  onOpenTaskMenuAt?: (x: number, y: number, taskId: string) => void
  onOpenCanvasMenu?: (e: ReactMouseEvent, startMin: number) => void
  onOpenCanvasMenuAt?: (x: number, y: number, startMin: number) => void
  onInteractionLockChange?: (locked: boolean) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const interactionLockedRef = useRef(false)
  const setInteractionLocked = (next: boolean) => {
    if (interactionLockedRef.current === next) return
    interactionLockedRef.current = next
    onInteractionLockChange?.(next)
  }
  const [containerW, setContainerW] = useState(0)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const calc = () => setContainerW(el.getBoundingClientRect().width || 0)
    calc()
    const ro = new ResizeObserver(() => calc())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pendingRef = useRef<{
    pointerId: number
    id: string
    kind: TimelineKind
    mode: 'move' | 'resize'
    startX: number
    startY: number
    started: boolean
    timeoutId: number | null
  } | null>(null)
  const dragScrollStopRef = useRef<{
    active: boolean
    onTouchMove?: (e: TouchEvent) => void
    onWheel?: (e: WheelEvent) => void
    onEnd?: () => void
  }>({ active: false })
  const [active, setActive] = useState<{
    id: string
    kind: TimelineKind
    mode: 'move' | 'resize'
    originY: number
    originX: number
    lastX: number
    lastY: number
    originStart: number
    originDur: number
    currentStart: number
    currentDur: number
    copyMode: boolean
    moved: boolean
    outside: boolean
  } | null>(null)
  const [windowDrag, setWindowDrag] = useState<{
    mode: 'start' | 'end'
    originY: number
    originStart: number
    originEnd: number
    moved: boolean
  } | null>(null)

  const [rangeSelect, setRangeSelect] = useState<{
    pointerId: number
    startMin: number
    endMin: number
    active: boolean
  } | null>(null)
  const rangePressRef = useRef<{
    timeoutId: number | null
    pointerId: number
    startX: number
    startY: number
    started: boolean
    startMin: number
  }>({ timeoutId: null, pointerId: -1, startX: 0, startY: 0, started: false, startMin: 0 })

  const startDragScrollStop = () => {
    if (typeof window === 'undefined') return
    if (dragScrollStopRef.current.active) return
    const onTouchMove = (e: TouchEvent) => {
      if (e.cancelable) e.preventDefault()
    }
    const onWheel = (e: WheelEvent) => {
      if (e.cancelable) e.preventDefault()
    }
    const onEnd = () => stopDragScrollStop()
    dragScrollStopRef.current.active = true
    dragScrollStopRef.current.onTouchMove = onTouchMove
    dragScrollStopRef.current.onWheel = onWheel
    dragScrollStopRef.current.onEnd = onEnd
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('wheel', onWheel, { passive: false })
    // Safety: always release on end/cancel even if pointer events get lost on iOS Safari.
    window.addEventListener('touchend', onEnd, { passive: true })
    window.addEventListener('touchcancel', onEnd, { passive: true })
    window.addEventListener('pointerup', onEnd, { passive: true })
    window.addEventListener('pointercancel', onEnd, { passive: true })
  }

  const stopDragScrollStop = () => {
    if (typeof window === 'undefined') return
    if (!dragScrollStopRef.current.active) return
    const onTouchMove = dragScrollStopRef.current.onTouchMove
    if (onTouchMove) window.removeEventListener('touchmove', onTouchMove)
    const onWheel = dragScrollStopRef.current.onWheel
    if (onWheel) window.removeEventListener('wheel', onWheel)
    const onEnd = dragScrollStopRef.current.onEnd
    if (onEnd) {
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
      window.removeEventListener('pointerup', onEnd)
      window.removeEventListener('pointercancel', onEnd)
    }
    dragScrollStopRef.current.active = false
    dragScrollStopRef.current.onTouchMove = undefined
    dragScrollStopRef.current.onWheel = undefined
    dragScrollStopRef.current.onEnd = undefined
  }

  const pxPerMin = 1.2 // 10분=12px (모바일에서도 조작 가능)
  const startMin = snap10(viewStartMin)
  const endMin = Math.max(startMin + 10, snap10(viewEndMin))
  const windowMinutes = endMin - startMin
  const viewHeight = Math.max(240, windowMinutes * pxPerMin)

  const overlapLayout = useMemo(() => {
    type Layout = { col: number; cols: number }
    type Node = { key: string; start: number; end: number; col: number; group: number }

    const visible = items
      .map((it) => {
        const displayDur = timelineDisplayDurationMin(it.durationMin)
        return { it, key: `${it.kind}:${it.id}`, start: it.startMin, end: it.startMin + displayDur }
      })
      .filter((x) => x.end > startMin && x.start < endMin)
      .sort((a, b) => a.start - b.start || a.end - b.end || a.key.localeCompare(b.key))

    const nodes: Node[] = []
    const groupMaxCols = new Map<number, number>()
    const active: Node[] = []
    let groupId = 0
    let nextColByGroup = 0

    const cleanupActive = (at: number) => {
      for (let i = active.length - 1; i >= 0; i--) {
        if (active[i].end <= at) active.splice(i, 1)
      }
    }

    const pickCol = () => {
      const used = new Set(active.map((n) => n.col))
      for (let c = 0; c < 64; c++) {
        if (!used.has(c)) return c
      }
      return used.size
    }

    for (const v of visible) {
      cleanupActive(v.start)
      if (active.length === 0) {
        groupId += 1
        nextColByGroup = 0
      }

      const col = pickCol()
      const node: Node = { key: v.key, start: v.start, end: v.end, col, group: groupId }
      nodes.push(node)
      active.push(node)

      nextColByGroup = Math.max(nextColByGroup, col + 1)
      const prev = groupMaxCols.get(groupId) ?? 0
      if (nextColByGroup > prev) groupMaxCols.set(groupId, nextColByGroup)
    }

    const out = new Map<string, Layout>()
    for (const n of nodes) {
      out.set(n.key, { col: n.col, cols: groupMaxCols.get(n.group) ?? 1 })
    }
    return out
  }, [items, startMin, endMin])

  const cancelPending = () => {
    const pending = pendingRef.current
    if (!pending) return
    if (pending.timeoutId != null) window.clearTimeout(pending.timeoutId)
    pendingRef.current = null
    // pending drag canceled: release interaction lock if nothing else is active
    if (!active && !rangeSelect) setInteractionLocked(false)
  }

  const beginDrag = (e: React.PointerEvent, id: string, kind: TimelineKind, mode: 'move' | 'resize') => {
    const it = items.find((x) => x.id === id && x.kind === kind)
    if (!it) return
    setInteractionLocked(true)
    if (containerRef.current) containerRef.current.style.touchAction = 'none'
    startDragScrollStop()
    containerRef.current?.setPointerCapture(e.pointerId)
    setActive({
      id,
      kind,
      mode,
      originY: e.clientY,
      originX: e.clientX,
      lastX: e.clientX,
      lastY: e.clientY,
      originStart: it.startMin,
      originDur: it.durationMin,
      currentStart: it.startMin,
      currentDur: it.durationMin,
      copyMode: Boolean(e.pointerType !== 'touch' && e.altKey && mode === 'move'),
      moved: false,
      outside: false,
    })
  }

  const handlePointerDown = (e: React.PointerEvent, id: string, kind: TimelineKind, mode: 'move' | 'resize') => {
    // mouse/pen: drag immediately. touch: long-press to drag so vertical scroll still works.
    if (e.pointerType !== 'touch') {
      if (e.button !== 0) return
      beginDrag(e, id, kind, mode)
      return
    }
    // touch: lock outer horizontal swipe immediately; will be released if user scrolls instead of long-pressing
    setInteractionLocked(true)
    cancelPending()
    const pointerId = e.pointerId
    const startX = e.clientX
    const startY = e.clientY
    const timeoutId = window.setTimeout(() => {
      const pending = pendingRef.current
      if (!pending || pending.pointerId !== pointerId) return
      pending.started = true
    }, 260)
    pendingRef.current = { pointerId, id, kind, mode, startX, startY, started: false, timeoutId }
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (rangeSelect && rangeSelect.pointerId === e.pointerId) {
      if (!containerRef.current) return
      if (!rangeSelect.active) return
      if (e.cancelable) e.preventDefault()
      const rect = containerRef.current.getBoundingClientRect()
      const yInViewport = e.clientY - rect.top
      const minutesRaw = yInViewport / pxPerMin
      const at = snap10(startMin + minutesRaw)
      setRangeSelect((cur) => {
        if (!cur || cur.pointerId !== e.pointerId) return cur
        const a = cur.startMin
        const b = at
        const start = Math.min(a, b)
        const end = Math.max(a, b)
        return { ...cur, endMin: end <= start ? start + 10 : end }
      })
      return
    }
    const pendingRange = rangePressRef.current
    if (pendingRange.pointerId === e.pointerId && pendingRange.timeoutId != null && !pendingRange.started) {
      const dx = e.clientX - pendingRange.startX
      const dy = e.clientY - pendingRange.startY
      if (Math.hypot(dx, dy) > 8) {
        if (pendingRange.timeoutId) window.clearTimeout(pendingRange.timeoutId)
        rangePressRef.current = { timeoutId: null, pointerId: -1, startX: 0, startY: 0, started: false, startMin: 0 }
        if (!active) setInteractionLocked(false)
      }
    }
    if (pendingRange.pointerId === e.pointerId && pendingRange.started && !rangeSelect) {
      const dx = e.clientX - pendingRange.startX
      const dy = e.clientY - pendingRange.startY
      if (Math.hypot(dx, dy) <= 8) return
      if (!containerRef.current) return
      setRangeSelect({ pointerId: e.pointerId, startMin: pendingRange.startMin, endMin: pendingRange.startMin + 10, active: true })
      containerRef.current.style.touchAction = 'none'
      try {
        containerRef.current.setPointerCapture(e.pointerId)
      } catch {
        // ignore
      }
      startDragScrollStop()
      return
    }
    const pending = pendingRef.current
    if (pending && pending.pointerId === e.pointerId && !pending.started) {
      const dx = e.clientX - pending.startX
      const dy = e.clientY - pending.startY
      if (Math.hypot(dx, dy) > 8) cancelPending()
      return
    }
    if (pending && pending.pointerId === e.pointerId && pending.started) {
      const dx = e.clientX - pending.startX
      const dy = e.clientY - pending.startY
      if (Math.hypot(dx, dy) <= 8) return
      cancelPending()
      beginDrag(e, pending.id, pending.kind, pending.mode)
      return
    }
    if (!active) return
    if (e.cancelable) e.preventDefault()
    const dy = e.clientY - active.originY
    const deltaMinRaw = dy / pxPerMin
    const dx = e.clientX - active.originX
    const moved = active.moved || Math.abs(dy) > 5 || Math.abs(dx) > 5
    const rect = containerRef.current?.getBoundingClientRect()
    const outside = rect
      ? e.clientX < rect.left || e.clientX > rect.right || e.clientY < rect.top || e.clientY > rect.bottom
      : false
    if (active.mode === 'move') {
      const nextStartRaw = snap10(active.originStart + deltaMinRaw)
      const maxStart = snap10(Math.max(startMin, endMin - active.originDur))
      const nextStart = Math.min(maxStart, Math.max(startMin, nextStartRaw))
      onUpdate(active.id, active.kind, nextStart, active.originDur)
      setActive((cur) =>
        cur
          ? {
              ...cur,
              moved,
              lastX: e.clientX,
              lastY: e.clientY,
              outside,
              currentStart: nextStart,
              currentDur: cur.originDur,
              copyMode: Boolean(e.pointerType !== 'touch' && e.altKey),
            }
          : cur,
      )
    } else {
      const nextDurRaw = Math.max(30, snap10(active.originDur + deltaMinRaw))
      const maxDur = Math.max(30, snap10(endMin - active.originStart))
      const nextDur = Math.min(maxDur, nextDurRaw)
      onUpdate(active.id, active.kind, active.originStart, nextDur)
      setActive((cur) =>
        cur
          ? {
              ...cur,
              moved,
              lastX: e.clientX,
              lastY: e.clientY,
              outside,
              currentStart: cur.originStart,
              currentDur: nextDur,
              copyMode: false,
            }
          : cur,
      )
    }
  }

  const handlePointerUp = (e?: React.PointerEvent) => {
    if (e) {
      const pending = pendingRef.current
      if (pending && pending.pointerId === e.pointerId && !pending.started) {
        cancelPending()
        onOpenTask(pending.id)
        return
      }
      if (pending && pending.pointerId === e.pointerId && pending.started) {
        cancelPending()
        onOpenTaskMenuAt?.(e.clientX, e.clientY, pending.id)
        setInteractionLocked(false)
        return
      }
    }
    cancelPending()
    if (rangePressRef.current.timeoutId) {
      window.clearTimeout(rangePressRef.current.timeoutId)
      rangePressRef.current = { timeoutId: null, pointerId: -1, startX: 0, startY: 0, started: false, startMin: 0 }
    }
    if (e && rangePressRef.current.pointerId === e.pointerId && rangePressRef.current.started && !rangeSelect) {
      const pending = rangePressRef.current
      rangePressRef.current = { timeoutId: null, pointerId: -1, startX: 0, startY: 0, started: false, startMin: 0 }
      if (containerRef.current) containerRef.current.style.touchAction = ''
      stopDragScrollStop()
      setInteractionLocked(false)
      onOpenCanvasMenuAt?.(e.clientX, e.clientY, pending.startMin)
      return
    }
    if (e && rangeSelect && rangeSelect.pointerId === e.pointerId) {
      const cur = rangeSelect
      setRangeSelect(null)
      if (containerRef.current) containerRef.current.style.touchAction = ''
      stopDragScrollStop()
      if (cur.active) onAddRange(cur.startMin, cur.endMin)
      setInteractionLocked(false)
      return
    }
    if (active && active.mode === 'move') {
      if (!active.moved) {
        onOpenTask(active.id)
      } else {
        const el = document.elementFromPoint(active.lastX, active.lastY)
        const droppedToUnscheduled = Boolean(el && (el as HTMLElement).closest('[data-unscheduled-dropzone="true"]'))
        if (active.copyMode) {
          onUpdate(active.id, active.kind, active.originStart, active.originDur)
          if (droppedToUnscheduled) onDuplicateTaskAsUnscheduled(active.id, active.kind)
          else onDuplicateTask(active.id, active.kind, active.currentStart, active.currentDur)
        } else if (droppedToUnscheduled) {
          onUnscheduleTask(active.id, active.kind)
        }
      }
    }
    if (containerRef.current) containerRef.current.style.touchAction = ''
    setActive(null)
    if (windowDrag && !windowDrag.moved) onRequestTimePick(windowDrag.mode)
    setWindowDrag(null)
    stopDragScrollStop()
    setInteractionLocked(false)
  }

  const handleWindowPointerDown = (e: React.PointerEvent, mode: 'start' | 'end') => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    containerRef.current?.setPointerCapture(e.pointerId)
    // Only disable scrolling once the user actually drags (see handleWindowPointerMove).
    if (containerRef.current) containerRef.current.style.touchAction = ''
    setWindowDrag({ mode, originY: e.clientY, originStart: startMin, originEnd: endMin, moved: false })
  }

  const handleWindowPointerMove = (e: React.PointerEvent) => {
    if (!windowDrag) return
    const dy = e.clientY - windowDrag.originY
    const deltaMinRaw = dy / pxPerMin
    const moved = windowDrag.moved || Math.abs(dy) > 5
    if (moved) {
      if (containerRef.current) containerRef.current.style.touchAction = 'none'
      startDragScrollStop()
      if (e.cancelable) e.preventDefault()
    }
    if (windowDrag.mode === 'start') {
      const nextStartRaw = snap10(windowDrag.originStart + deltaMinRaw)
      const nextStart = Math.max(0, Math.min(nextStartRaw, windowDrag.originEnd - 10))
      if (nextStart !== startMin) onChangeWindow(nextStart, windowDrag.originEnd)
    } else {
      const nextEndRaw = snap10(windowDrag.originEnd + deltaMinRaw)
      const nextEnd = Math.max(windowDrag.originStart + 10, Math.min(24 * 60, nextEndRaw))
      if (nextEnd !== endMin) onChangeWindow(windowDrag.originStart, nextEnd)
    }
    if (moved !== windowDrag.moved) setWindowDrag((cur) => (cur ? { ...cur, moved } : cur))
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const taskId = getTaskDragId(e.dataTransfer)
    if (!taskId) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const yInViewport = e.clientY - rect.top
    const minutesRaw = yInViewport / pxPerMin
    const dropStart = snap10(startMin + minutesRaw)
    onDropTask(taskId, dropStart, e.altKey)
  }

  const dragGhost = useMemo(() => {
    if (!active || active.mode !== 'move' || !active.outside) return null
    const it = items.find((x) => x.id === active.id && x.kind === active.kind)
    if (!it) return null
    const displayDur = timelineDisplayDurationMin(it.durationMin)
    const height = Math.max(28, displayDur * pxPerMin)
    const bg = it.subjectColor ?? (it.kind === 'actual' ? '#0f172a' : '#e2e8f0')
    const onText = pickOnColorText(bg)
    const timeLabel = it.endLabel ? `${it.startLabel}-${it.endLabel}` : it.startLabel
    return { height, bg, onText, title: it.title, subject: it.subjectName, completed: it.completed, timeLabel }
  }, [active, items, pxPerMin])

  return (
    <div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
        style={{ height: viewHeight }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          const target = e.target as HTMLElement | null
          if (target?.closest('[data-timeline-item="true"]')) return
          if (target?.closest('[data-window-handle="true"]')) return
          if (!containerRef.current) return
          if (e.pointerType === 'touch') setInteractionLocked(true)
          const rect = containerRef.current.getBoundingClientRect()
          const yInViewport = e.clientY - rect.top
          const minutesRaw = yInViewport / pxPerMin
          const at = snap10(startMin + minutesRaw)
          if (rangePressRef.current.timeoutId) window.clearTimeout(rangePressRef.current.timeoutId)
          rangePressRef.current = {
            timeoutId: window.setTimeout(() => {
              const pending = rangePressRef.current
              if (pending.pointerId !== e.pointerId) return
              pending.started = true
              pending.timeoutId = null
            }, 320),
            pointerId: e.pointerId,
            startX: e.clientX,
            startY: e.clientY,
            started: false,
            startMin: at,
          }
        }}
        onDragOver={(e) => {
          e.preventDefault()
          syncTaskDropEffect(e)
        }}
        onDrop={handleDrop}
        onContextMenu={(e) => {
          const target = e.target as HTMLElement | null
          if (target?.closest('[data-timeline-item="true"]')) return
          if (target?.closest('[data-window-handle="true"]')) return
          if (!containerRef.current) return
          const rect = containerRef.current.getBoundingClientRect()
          const yInViewport = e.clientY - rect.top
          const minutesRaw = yInViewport / pxPerMin
          const at = snap10(startMin + minutesRaw)
          onOpenCanvasMenu?.(e, at)
        }}
        onPointerMove={handlePointerMove}
        onPointerMoveCapture={handleWindowPointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* window resize handles */}
        <div
          data-window-handle="true"
          className="absolute left-0 right-0 top-0 z-20 flex h-5 items-center justify-center bg-white/70 backdrop-blur"
          onPointerDown={(e) => handleWindowPointerDown(e, 'start')}
          style={{ touchAction: 'none' }}
          role="slider"
          aria-label="타임라인 시작 조절"
        >
          <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 shadow-sm ring-1 ring-black/5">
            {formatMeridiemHm(minutesToHm(startMin)) ?? minutesToHm(startMin)}
          </div>
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <div
          data-window-handle="true"
          className="absolute left-0 right-0 bottom-0 z-20 flex h-5 items-center justify-center bg-white/70 backdrop-blur"
          onPointerDown={(e) => handleWindowPointerDown(e, 'end')}
          style={{ touchAction: 'none' }}
          role="slider"
          aria-label="타임라인 종료 조절"
        >
          <div className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-700 shadow-sm ring-1 ring-black/5">
            {formatMeridiemHm(minutesToHm(endMin)) ?? minutesToHm(endMin)}
          </div>
          <div className="h-1.5 w-10 rounded-full bg-slate-300" />
        </div>
        <div className="relative" style={{ height: viewHeight }}>
          {rangeSelect?.active ? (
            <div
              className="pointer-events-none absolute left-14 right-3 z-10 rounded-xl border-2 border-indigo-400 bg-indigo-400/10"
              style={{
                top: (Math.min(rangeSelect.startMin, rangeSelect.endMin) - startMin) * pxPerMin,
                height: Math.max(10, Math.abs(rangeSelect.endMin - rangeSelect.startMin)) * pxPerMin,
              }}
              aria-hidden="true"
            />
          ) : null}
          {dragGhost ? (
            <div
              className={`pointer-events-none fixed z-[999] -translate-x-1/2 -translate-y-1/2 rounded-xl border border-black/15 shadow-2xl ring-2 ring-indigo-500/90 ${
                dragGhost.completed ? 'saturate-[0.85] brightness-[0.97]' : ''
              }`}
              style={{
                left: active?.lastX ?? 0,
                top: active?.lastY ?? 0,
                width: 220,
                height: Math.min(120, dragGhost.height),
                backgroundColor: dragGhost.bg,
              }}
              aria-hidden
            >
              <div className={`px-3 py-2 ${dragGhost.onText}`}>
                <div className="flex items-center gap-2 text-[11px] font-semibold">
                  <span className="shrink-0 opacity-90">
                    {dragGhost.completed ? (
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                        <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                        <path d="M6 10.2l2.3 2.3L14.5 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                        <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                      </svg>
                    )}
                  </span>
                  <span className="min-w-0 truncate opacity-90">{dragGhost.subject}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between gap-2">
                  <div className="min-w-0 truncate text-[12px] font-semibold">{dragGhost.title}</div>
                  <div className="shrink-0 text-[11px] tabular-nums opacity-85">{dragGhost.timeLabel}</div>
                </div>
              </div>
            </div>
          ) : null}

          {/* grid background */}
          {(() => {
            const firstHourMin = Math.ceil(startMin / 60) * 60
            const hourMarks: Array<{ key: string; label: string; top: number }> = []
            for (let m = firstHourMin; m <= endMin; m += 60) {
              const hour = Math.floor(m / 60)
              hourMarks.push({
                key: `h${m}`,
                label: hourToKoLabel(hour),
                top: (m - startMin) * pxPerMin,
              })
            }
            return hourMarks.map((h) => (
              <div key={h.key} className="absolute left-0 right-0 border-t-2 border-slate-200" style={{ top: h.top }}>
                <div className="px-2 text-[11px] font-semibold text-slate-600">{h.label}</div>
              </div>
            ))
          })()}
          {Array.from({ length: Math.floor(windowMinutes / 10) + 1 }).map((_, i) => (
            <div key={`m${i}`} className="absolute left-0 right-0 border-t border-slate-50" style={{ top: i * 10 * pxPerMin }} aria-hidden />
          ))}

          {items.map((it) => {
            const displayDur = timelineDisplayDurationMin(it.durationMin)
            if (it.startMin + displayDur <= startMin) return null
            if (it.startMin >= endMin) return null
            const top = (it.startMin - startMin) * pxPerMin
            const height = displayDur * pxPerMin
            const isCompact = height < 34
            const timeLabel = it.endLabel
              ? `${formatMeridiemHm(it.startLabel) ?? it.startLabel} - ${formatMeridiemHm(it.endLabel) ?? it.endLabel}`
              : `${formatMeridiemHm(it.startLabel) ?? it.startLabel}`
            const durationMinForLabel = isMeaningfulDuration(it.durationMin) ? it.durationMin : it.fallbackDurationMin
            const durationText = isMeaningfulDuration(durationMinForLabel) ? `${formatDurationKoFromMinutes(durationMinForLabel)}` : ''
            const durationLabel = durationText ? `(${durationText})` : ''
            const kindPill = it.kind === 'actual' ? '완료' : '계획'
            const allowWrap = height >= 48 && displayDur >= 40
            const layout = overlapLayout.get(`${it.kind}:${it.id}`) ?? { col: 0, cols: 1 }
            const baseLeft = '3.5rem' // left-14
            const baseRight = '0.75rem' // right-3
            const gutterPx = 2
            const cols = Math.max(1, Math.floor(layout.cols))
            const col = Math.max(0, Math.min(cols - 1, Math.floor(layout.col)))
            const usableW = Math.max(0, containerW || 0)
            const leftPx = remToPx(baseLeft)
            const rightPx = remToPx(baseRight)
            const innerPadPx = 16 // label container left-2/right-2
            const columnW = cols <= 1 ? usableW - leftPx - rightPx : (usableW - leftPx - rightPx - (cols - 1) * gutterPx) / cols
            const availableTextW = Math.max(0, columnW - innerPadPx)
            const fullTextRaw = `${kindPill} ${timeLabel} ${durationLabel}`.trim()
            const durationOnlyRaw = `${kindPill} ${durationText}`.trim()
            const pillChromePx = 48 // pill padding + gap + small icon/spacing variance
            const safetyPx = 10 // prevent "almost fits" overflow due to font/render differences
            const fullNeededPx = pillChromePx + estimateInlineTextPx(fullTextRaw, 11) + safetyPx
            const durNeededPx = pillChromePx + estimateInlineTextPx(durationOnlyRaw, 11) + safetyPx
            const timeDisplayMode: 'full' | 'duration' | 'none' =
              fullTextRaw && fullNeededPx <= availableTextW ? 'full' : durationText && durNeededPx <= availableTextW ? 'duration' : 'none'
            const showTimeRow = timeDisplayMode === 'full'
            const showDurationOnlyRow = timeDisplayMode === 'duration'
            const left =
              cols <= 1
                ? `calc(${baseLeft})`
                : `calc(${baseLeft} + ${col} * ((100% - ${baseLeft} - ${baseRight} - ${(cols - 1) * gutterPx}px) / ${cols} + ${gutterPx}px))`
            const right =
              cols <= 1
                ? `calc(${baseRight})`
                : `calc(${baseRight} + ${(cols - col - 1)} * ((100% - ${baseLeft} - ${baseRight} - ${(cols - 1) * gutterPx}px) / ${cols} + ${gutterPx}px))`
            const bg = it.subjectColor ?? (it.kind === 'actual' ? '#0f172a' : '#e2e8f0')
            const onText = pickOnColorText(bg)
            const isDragging = Boolean(active && active.id === it.id && active.kind === it.kind)
            const completedTone = it.completed ? 'saturate-[0.85] brightness-[0.97]' : ''
            const dragTone = isDragging ? (active?.outside ? 'ring-2 ring-indigo-500 opacity-80 shadow-xl' : 'ring-2 ring-black/20 shadow-lg') : ''
            return (
	              <div
	                key={`${it.kind}:${it.id}`}
	                data-timeline-item="true"
	                className={`absolute select-none rounded-xl border border-black/10 shadow-sm ${onText} ${completedTone} ${dragTone}`}
	                style={{ top, height, left, right, backgroundColor: bg }}
	                onPointerDown={(e) => handlePointerDown(e, it.id, it.kind, 'move')}
                    onContextMenu={(e) => onOpenTaskMenu?.(e, it.id)}
	                role="button"
                tabIndex={0}
                aria-label={`${it.title} ${timeLabel} ${it.kind === 'actual' ? '완료' : '계획'}`}
              >
                {/* bar */}
                <div className="h-full w-full" aria-hidden />

                {/* label: 블록 위에 직접 표시 (알약 제거) */}
                <div
                  className={`pointer-events-none absolute left-2 right-2 ${isCompact ? '-top-6' : 'top-2'}`}
                  style={{ zIndex: 2 }}
                >
                  <div className={`flex items-center gap-2 text-[11px] font-semibold ${allowWrap ? 'items-start' : ''}`}>
                    <button
                      type="button"
                      className="pointer-events-auto shrink-0 opacity-90"
                      aria-label={it.completed ? '완료 해제' : '완료 처리'}
                      onPointerDown={(e) => e.stopPropagation()}
                      onClick={(e) => {
                        e.stopPropagation()
                      onToggleComplete(it.id, it.kind, !it.completed)
                    }}
                  >
                      {it.completed ? (
                        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                          <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                          <path d="M6 10.2l2.3 2.3L14.5 6.6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
                          <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      )}
                    </button>
                    {allowWrap ? (
                      <span className="min-w-0 flex-1">
                        <span className="flex min-w-0 items-center gap-2 leading-tight">
                          <span className="shrink-0 opacity-90">{it.subjectName}</span>
                          <span className="min-w-0 truncate">{it.title}</span>
                        </span>
                        {showDurationOnlyRow ? (
                          <span className="mt-0.5 flex items-center gap-1.5 opacity-85">
                            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] leading-none">{kindPill}</span>
                            <span className="shrink-0 tabular-nums">{durationText}</span>
                          </span>
                        ) : showTimeRow ? (
                          <span className="mt-0.5 flex items-center gap-1.5 opacity-85">
                            <span className="rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] leading-none">{kindPill}</span>
                            <span className="shrink-0 tabular-nums">{timeLabel}</span>
                            {durationLabel ? <span className="shrink-0">{durationLabel}</span> : null}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <>
                        <span className="shrink-0 opacity-90">{it.subjectName}</span>
                        <span className="truncate">{it.title}</span>
                        <span className="shrink-0 opacity-85">
                          <span className="mr-1 rounded-full bg-black/20 px-1.5 py-0.5 text-[10px] leading-none">{kindPill}</span>
                          {showDurationOnlyRow ? (
                            <span className="tabular-nums">{durationText}</span>
                          ) : showTimeRow ? (
                            <>
                              <span className="tabular-nums">{timeLabel}</span>
                              {durationLabel ? <span className="ml-1">{durationLabel}</span> : null}
                            </>
                          ) : null}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* resize handle */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-3 rounded-b-xl ${
                    it.kind === 'actual' ? 'bg-black/10' : 'bg-black/10'
                  } cursor-ns-resize`}
                  onPointerDown={(e) => {
                    e.stopPropagation()
                    handlePointerDown(e, it.id, it.kind, 'resize')
                  }}
                  aria-label="길이 조절 핸들"
                />
              </div>
            )
          })}
        </div>
      </div>
      <div className="mt-2 text-[11px] text-slate-500">완료가 있으면 타임라인은 완료(진한 블록) 기준으로 표시됩니다.</div>
    </div>
  )
}
