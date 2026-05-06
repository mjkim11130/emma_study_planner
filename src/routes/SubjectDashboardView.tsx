import { addDays, endOfMonth, endOfWeek, format, isWithinInterval, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { MobileTopBar } from '../components/MobileTopBar'
import { useTaskDialog } from '../components/TaskDialogContext'
import { SubjectDialog } from '../components/SubjectDialog'
import { Button } from '../components/ui'
import { todayYmd } from '../lib/dates'
import { formatDurationKoFromMinutes, formatDurationKoFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'
import type { StudyTask, Subject } from '../store/types'

type Period = 'today' | 'week' | 'month' | 'all' | 'archive'

const MIN_TWO_COL_ITEM_PX = 380
const MASONRY_ROW_PX = 2
const MASONRY_GAP_PX = 12

function MasonryGrid({
  minColPx,
  items,
  gapPx = MASONRY_GAP_PX,
  includeGapInSpan = false,
  className = '',
}: {
  minColPx: number
  items: Array<{ key: string; node: React.ReactNode | null }>
  gapPx?: number
  includeGapInSpan?: boolean
  className?: string
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [cols, setCols] = useState(1)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const [spans, setSpans] = useState<Record<string, number>>({})
  const rendered = useMemo(() => items.filter((x) => Boolean(x.node)) as Array<{ key: string; node: React.ReactNode }>, [items])
  const [layoutReady, setLayoutReady] = useState(false)
  const layoutToken = useMemo(() => `${cols}:${rendered.map((x) => x.key).join(',')}`, [cols, rendered])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const calcCols = () => {
      const w = host.getBoundingClientRect().width || 0
      const unit = minColPx + gapPx
      const next = unit > 0 ? Math.max(1, Math.floor((w + gapPx) / unit)) : 1
      setCols(next)
    }
    calcCols()
    const ro = new ResizeObserver(() => calcCols())
    ro.observe(host)
    return () => ro.disconnect()
  }, [minColPx, gapPx])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    const compute = () => {
      const next: Record<string, number> = {}
      for (const { key } of rendered) {
        const el = itemRefs.current.get(key)
        if (!el) continue
        const h = el.scrollHeight || el.getBoundingClientRect().height || 0
        const adjusted = includeGapInSpan ? h + gapPx : h
        const span = Math.max(1, Math.ceil(adjusted / MASONRY_ROW_PX))
        next[key] = span
      }
      setSpans(next)
      setLayoutReady(Object.keys(next).length === rendered.length)
    }
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    schedule()
    const ro = new ResizeObserver(() => schedule())
    for (const { key } of rendered) {
      const el = itemRefs.current.get(key)
      if (el) ro.observe(el)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [rendered, cols, gapPx, includeGapInSpan])

  return (
    <div
      ref={hostRef}
      className={`grid w-full items-start ${className}`}
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gridAutoRows: `${MASONRY_ROW_PX}px`,
        columnGap: `${gapPx}px`,
        rowGap: `${gapPx}px`,
        gridAutoFlow: 'row dense',
        visibility: layoutReady ? 'visible' : 'hidden',
      }}
    >
      {rendered.map(({ key, node }) => (
        <div
          key={key}
          ref={(el) => {
            if (!el) itemRefs.current.delete(key)
            else itemRefs.current.set(key, el)
          }}
          className="self-start"
          style={{ gridRowEnd: `span ${spans[key] ?? 1}` }}
        >
          {node}
        </div>
      ))}
      {/* force relayout for dense packing on some browsers */}
      <span className="hidden" data-layout-token={layoutToken} />
    </div>
  )
}

function MasonryColumns({
  minColPx,
  items,
  gapPx = MASONRY_GAP_PX,
}: {
  minColPx: number
  items: Array<{ key: string; node: React.ReactNode | null }>
  gapPx?: number
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const itemRefs = useRef(new Map<string, HTMLDivElement>())
  const rendered = useMemo(() => items.filter((x) => Boolean(x.node)) as Array<{ key: string; node: React.ReactNode }>, [items])

  const [cols, setCols] = useState(1)
  const [layoutReady, setLayoutReady] = useState(false)
  const [assignment, setAssignment] = useState<Record<string, number>>({})

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const calcCols = () => {
      const w = host.getBoundingClientRect().width || 0
      const unit = minColPx + gapPx
      const next = unit > 0 ? Math.max(1, Math.floor((w + gapPx) / unit)) : 1
      setCols(next)
    }
    calcCols()
    const ro = new ResizeObserver(() => calcCols())
    ro.observe(host)
    return () => ro.disconnect()
  }, [minColPx, gapPx])

  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    let raf = 0
    const compute = () => {
      const heights: Record<string, number> = {}
      for (const { key } of rendered) {
        const el = itemRefs.current.get(key)
        if (!el) continue
        heights[key] = el.scrollHeight || el.getBoundingClientRect().height || 0
      }
      if (Object.keys(heights).length !== rendered.length) {
        setLayoutReady(false)
        return
      }
      const colHeights = Array.from({ length: cols }, () => 0)
      const nextAssign: Record<string, number> = {}
      for (const { key } of rendered) {
        let minIdx = 0
        for (let i = 1; i < cols; i++) if (colHeights[i] < colHeights[minIdx]) minIdx = i
        nextAssign[key] = minIdx
        colHeights[minIdx] += heights[key] + gapPx
      }
      setAssignment(nextAssign)
      setLayoutReady(true)
    }
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf)
      raf = requestAnimationFrame(compute)
    }
    schedule()
    const ro = new ResizeObserver(() => schedule())
    for (const { key } of rendered) {
      const el = itemRefs.current.get(key)
      if (el) ro.observe(el)
    }
    return () => {
      if (raf) cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [rendered, cols, gapPx])

  const columns = useMemo(() => {
    const out: Array<Array<{ key: string; node: React.ReactNode }>> = Array.from({ length: cols }, () => [])
    for (const it of rendered) {
      const idx = assignment[it.key] ?? 0
      out[Math.min(cols - 1, Math.max(0, idx))].push(it)
    }
    return out
  }, [assignment, cols, rendered])

  return (
    <div ref={hostRef} className="w-full">
      {/* measurement layer */}
      <div className="pointer-events-none absolute -left-[10000px] top-0 w-[1px] overflow-hidden opacity-0" aria-hidden="true">
        {rendered.map(({ key, node }) => (
          <div
            key={key}
            ref={(el) => {
              if (!el) itemRefs.current.delete(key)
              else itemRefs.current.set(key, el)
            }}
            style={{ width: '600px' }}
          >
            {node}
          </div>
        ))}
      </div>

      <div className="flex w-full items-start" style={{ gap: `${gapPx}px`, visibility: layoutReady ? 'visible' : 'hidden' }}>
        {columns.map((col, i) => (
          <div key={i} className="flex min-w-0 flex-1 flex-col" style={{ gap: `${gapPx}px` }}>
            {col.map(({ key, node }) => (
              <div key={key}>{node}</div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

function hmToMinutes(hm?: string | null) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

function secondsBetweenHm(start?: string | null, end?: string | null) {
  const s = hmToMinutes(start ?? null)
  const e = hmToMinutes(end ?? null)
  if (s == null || e == null) return null
  if (e <= s) return null
  return (e - s) * 60
}

function formatMeridiemHm(hm?: string | null) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h24 = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h24) || !Number.isFinite(mm)) return null
  const meridiem = h24 < 12 ? '오전' : '오후'
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12
  return `${meridiem} ${String(h12).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

function formatDdayLabel(dueDate?: string) {
  if (!dueDate) return ''
  const today = parseISO(todayYmd())
  const due = parseISO(dueDate)
  if (Number.isNaN(due.getTime())) return ''
  const diff = Math.round((due.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'D-day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

function formatDueDateKo(dueDate?: string) {
  if (!dueDate) return ''
  const d = parseISO(dueDate)
  if (Number.isNaN(d.getTime())) return ''
  return `${format(d, 'M월 d일')} 마감`
}

function formatTaskDateLine(ymd?: string) {
  if (!ymd) return ''
  const today = todayYmd()
  if (ymd === today) return '오늘'
  const yesterday = format(addDays(parseISO(today), -1), 'yyyy-MM-dd')
  if (ymd === yesterday) return '어제'
  const tomorrow = format(addDays(parseISO(today), 1), 'yyyy-MM-dd')
  if (ymd === tomorrow) return '내일'
  const d = parseISO(ymd)
  if (Number.isNaN(d.getTime())) return ymd
  return format(d, 'yyyy년 M월 d일 EEEE', { locale: ko })
}

function isTaskCompleted(t: StudyTask) {
  const hasAnyActual = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
  return t.status === 'completed' || hasAnyActual
}

function taskPlannedSortKey(t: StudyTask) {
  const date = t.date || '9999-99-99'
  const time = t.plannedStartTime ?? '99:99'
  return `${date}_${time}_${t.updatedAt || t.createdAt}`
}

function taskCompletedSortKey(t: StudyTask) {
  const date = t.date || '0000-00-00'
  const time = t.actualEndTime ?? t.actualStartTime ?? t.plannedStartTime ?? '00:00'
  return `${date}_${time}_${t.updatedAt || t.createdAt}`
}

function formatDurationKo(totalSeconds: number) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  if (minutes <= 0) return '0분'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}시간 ${m}분`
  if (h > 0) return `${h}시간`
  return `${m}분`
}

function formatPeriodLabel(period: Period) {
  if (period !== 'today' && period !== 'week' && period !== 'month') return ''
  const range = getPeriodRange(period)
  if (!range) return ''
  if (period === 'today') return format(range.start, 'yyyy년 M월 d일')
  const sameYear = format(range.start, 'yyyy') === format(range.end, 'yyyy')
  const startFmt = sameYear ? format(range.start, 'M월 d일') : format(range.start, 'yyyy년 M월 d일')
  const endFmt = sameYear ? format(range.end, 'M월 d일') : format(range.end, 'yyyy년 M월 d일')
  return `${startFmt} - ${endFmt}`
}

function getPeriodRange(period: Period) {
  const today = parseISO(todayYmd())
  if (period === 'all' || period === 'archive') return null
  if (period === 'today') {
    const ymd = format(today, 'yyyy-MM-dd')
    return { start: today, end: today, ymdStart: ymd, ymdEnd: ymd }
  }
  if (period === 'month') {
    const start = startOfMonth(today)
    const end = endOfMonth(today)
    return { start, end, ymdStart: format(start, 'yyyy-MM-dd'), ymdEnd: format(end, 'yyyy-MM-dd') }
  }
  const start = startOfWeek(today, { weekStartsOn: 0 })
  const end = endOfWeek(today, { weekStartsOn: 0 })
  return { start, end, ymdStart: format(start, 'yyyy-MM-dd'), ymdEnd: format(end, 'yyyy-MM-dd') }
}

function withinPeriodDate(ymd: string, period: Period) {
  if (!ymd) return false
  const range = getPeriodRange(period)
  if (!range) return true
  return isWithinInterval(parseISO(ymd), { start: range.start, end: addDays(range.end, 1) })
}

function TaskRow({ t, subjectColor, onOpen }: { t: StudyTask; subjectColor: string; onOpen: () => void }) {
  const updateTask = usePlannerStore((s) => s.updateTask)
  const dday = formatDdayLabel(t.dueDate)
  const dueText = formatDueDateKo(t.dueDate)
  const dateLine = formatTaskDateLine(t.date)
  const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
  const isCompleted = t.status === 'completed' || hasAnyRecord

  const plannedSeconds = Number.isFinite(t.plannedSeconds) ? Math.max(0, t.plannedSeconds) : 0
  const hasPlannedDuration = plannedSeconds > 0
  const actualSecondsFromTimes = (() => {
    const s = hmToMinutes(t.actualStartTime ?? null)
    const e = hmToMinutes(t.actualEndTime ?? null)
    if (s === null || e === null) return 0
    if (e < s) return 0
    return (e - s) * 60
  })()
  const actualSeconds =
    typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
      ? Math.max(0, t.actualSeconds)
      : t.recordCompleteOnly
        ? plannedSeconds
        : actualSecondsFromTimes
  const hasActualDuration = actualSeconds > 0
  const deltaMin = hasActualDuration && hasPlannedDuration ? Math.round((actualSeconds - plannedSeconds) / 60) : 0

  const plannedStartMin = hmToMinutes(t.plannedStartTime ?? null)
  const plannedEndComputed =
    plannedStartMin !== null && hasPlannedDuration ? (() => {
      const endMin = plannedStartMin + plannedSeconds / 60
      const h = Math.floor(endMin / 60) % 24
      const m = Math.floor(endMin % 60)
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
    })() : null

  const actualStartMin = hmToMinutes(t.actualStartTime ?? null)
  const actualEndMin = hmToMinutes(t.actualEndTime ?? null)
  const actualIsTinyRange = actualStartMin !== null && actualEndMin !== null ? Math.max(0, actualEndMin - actualStartMin) < 1 : false
  const plannedIsTinyRange = hasPlannedDuration ? plannedSeconds / 60 < 1 : false
  const timeLabel =
    t.actualStartTime || t.actualEndTime
      ? actualIsTinyRange
        ? `${formatMeridiemHm(t.actualStartTime ?? undefined) ?? (t.actualStartTime ?? '-')}`
        : `${formatMeridiemHm(t.actualStartTime ?? undefined) ?? (t.actualStartTime ?? '-')}-${formatMeridiemHm(t.actualEndTime ?? undefined) ?? (t.actualEndTime ?? '-')}`
      : t.plannedStartTime
        ? hasPlannedDuration && plannedEndComputed
          ? plannedIsTinyRange
            ? `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}`
            : `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}-${formatMeridiemHm(plannedEndComputed) ?? plannedEndComputed}`
          : `${formatMeridiemHm(t.plannedStartTime) ?? t.plannedStartTime}`
        : ''

  return (
    <button
      type="button"
      onClick={onOpen}
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
            style={{ color: subjectColor }}
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
              if (hasRecordedTime) {
                updateTask(t.id, { status: 'completed', recordCompleteOnly: false })
                return
              }
              updateTask(t.id, { status: 'completed', recordCompleteOnly: true })
            }}
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
        {dateLine ? (
          <span className="pl-7 text-left text-[11px] font-semibold text-slate-500 opacity-90">{dateLine}</span>
        ) : (
          <span className="pl-7 text-left text-[11px] font-semibold text-slate-500 opacity-0">날짜</span>
        )}
        <span className="pl-7 text-left text-[11px] font-semibold tabular-nums opacity-80">
          {timeLabel ? timeLabel : <span className="invisible">오후 11:00-오후 11:40</span>}
        </span>
      </span>
      <span className="shrink-0 self-stretch overflow-hidden">
        <span
          className={`flex max-w-[220px] flex-col gap-1 overflow-hidden text-xs tabular-nums opacity-90 ${
            dday ? 'items-end justify-start' : 'items-end justify-center'
          }`}
          style={{ height: '100%' }}
        >
          {dday ? (
            <span className="inline-flex items-center gap-2 text-[11px] font-semibold tabular-nums">
              <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] leading-none text-indigo-700 ring-1 ring-indigo-200">{dday}</span>
              {dueText ? <span className="min-w-0 truncate text-slate-600">{dueText}</span> : null}
            </span>
          ) : null}
          {hasPlannedDuration && hasActualDuration ? (
            <>
              <span className="flex items-center justify-end gap-2 text-right">
                <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">계획</span>
                <span className="opacity-70">{formatDurationKoFromSeconds(plannedSeconds)}</span>
              </span>
              <span className="flex items-center justify-end gap-2 text-right">
                {deltaMin === 0 ? null : (
                  <span
                    className={`inline-block rounded-full bg-white/70 px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                      deltaMin > 0 ? 'text-rose-700' : 'text-emerald-700'
                    }`}
                  >
                    {deltaMin > 0 ? `+ ${formatDurationKoFromMinutes(deltaMin)}` : `- ${formatDurationKoFromMinutes(Math.abs(deltaMin))}`}
                  </span>
                )}
                <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
                <span className="font-semibold text-slate-900">{formatDurationKoFromSeconds(actualSeconds)}</span>
              </span>
            </>
          ) : hasActualDuration ? (
            <span className="flex items-center justify-end gap-2 text-right">
              <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
              <span className="font-semibold text-slate-900">{formatDurationKoFromSeconds(actualSeconds)}</span>
            </span>
          ) : hasPlannedDuration ? (
            t.recordCompleteOnly && !t.plannedStartTime ? (
              <>
                <span className="flex items-center justify-end gap-2 text-right">
                  <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">계획</span>
                  <span className="opacity-70">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                </span>
                <span className="flex items-center justify-end gap-2 text-right">
                  <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none">완료</span>
                  <span className="font-semibold text-slate-900">{formatDurationKoFromSeconds(plannedSeconds)}</span>
                </span>
              </>
            ) : (
              <span className="flex items-center justify-end gap-2 text-right">
                <span className="rounded-full bg-black/15 px-1.5 py-0.5 text-[10px] leading-none text-slate-500">계획</span>
                <span className="opacity-70">{formatDurationKoFromSeconds(plannedSeconds)}</span>
              </span>
            )
          ) : (
            <span />
          )}
        </span>
      </span>
    </button>
  )
}

function buildSubjectBuckets(subjectTasks: StudyTask[], period: Period) {
  const nowYmd = todayYmd()

  const completed: StudyTask[] = []
  const planned: StudyTask[] = []
  const past: StudyTask[] = []
  const upcoming: StudyTask[] = []

  for (const t of subjectTasks) {
    const completedFlag = isTaskCompleted(t)
    const hasDate = Boolean(t.date)
    const isInPeriod = !hasDate ? true : withinPeriodDate(t.date, period)

    if (!isInPeriod) continue

    if (completedFlag) {
      completed.push(t)
      continue
    }

    // pending
    if (!hasDate) {
      const due = t.dueDate ?? ''
      if (due) {
        if (due < nowYmd) {
          // overdue with no scheduled date belongs to "지난"
          past.push(t)
          continue
        }
        upcoming.push(t)
      } else {
        upcoming.push(t)
      }
      continue
    }

    // has date
    if (t.date < nowYmd) {
      past.push(t)
      continue
    }
    if (t.date === nowYmd) {
      planned.push(t)
      continue
    }
    // future
    planned.push(t)
  }

  completed.sort((a, b) => taskCompletedSortKey(b).localeCompare(taskCompletedSortKey(a)))
  planned.sort((a, b) => taskPlannedSortKey(a).localeCompare(taskPlannedSortKey(b)))
  past.sort((a, b) => taskPlannedSortKey(b).localeCompare(taskPlannedSortKey(a)))
  upcoming.sort((a, b) => {
    const aDue = a.dueDate ?? ''
    const bDue = b.dueDate ?? ''
    if (aDue && bDue && aDue !== bDue) return aDue.localeCompare(bDue)
    if (aDue && !bDue) return -1
    if (!aDue && bDue) return 1
    return (b.updatedAt || b.createdAt).localeCompare(a.updatedAt || a.createdAt)
  })

  return { completed, planned, past, upcoming }
}

function SubjectCard({
  subject,
  tasks,
  period,
  onEditSubject,
  onOpenTask,
  onAddTask,
  limit,
  forceExpanded,
}: {
  subject: Subject
  tasks: StudyTask[]
  period: Period
  onEditSubject: () => void
  onOpenTask: (taskId: string) => void
  onAddTask: () => void
  limit: number | null
  forceExpanded?: boolean
}) {
  const buckets = useMemo(() => buildSubjectBuckets(tasks, period), [tasks, period])
  const plannedSecondsCompletedOnly = buckets.completed.reduce((acc, t) => {
    const v = typeof t.plannedSeconds === 'number' && Number.isFinite(t.plannedSeconds) ? t.plannedSeconds : 0
    return acc + Math.max(0, v)
  }, 0)
  const completedSecondsCompletedOnly = buckets.completed.reduce((acc, t) => {
    const byRange = secondsBetweenHm(t.actualStartTime ?? null, t.actualEndTime ?? null)
    const bySec = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds) ? t.actualSeconds : null
    const v = byRange ?? bySec ?? 0
    return acc + (Number.isFinite(v) ? Math.max(0, v) : 0)
  }, 0)
  const completedCount = buckets.completed.length
  const plannedCount = buckets.planned.length + buckets.past.length + buckets.upcoming.length

  const maxSecondsRaw = Math.max(plannedSecondsCompletedOnly, completedSecondsCompletedOnly, 1)
  const maxSeconds = Number.isFinite(maxSecondsRaw) && maxSecondsRaw > 0 ? maxSecondsRaw : 1
  const pct = (v: number) => {
    if (!Number.isFinite(v) || v <= 0) return 0
    const raw = (v / maxSeconds) * 100
    const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
    // keep tiny-but-nonzero values visible
    return clamped > 0 && clamped < 3 ? 3 : clamped
  }
  const plannedPct = pct(plannedSecondsCompletedOnly)
  const completedPct = pct(completedSecondsCompletedOnly)
  const varianceSeconds = completedSecondsCompletedOnly - plannedSecondsCompletedOnly
  const varianceLabel = (() => {
    if (!completedCount) return ''
    if (varianceSeconds === 0) return '정확히 완료'
    const abs = Math.abs(varianceSeconds)
    const base = formatDurationKo(abs)
    return varianceSeconds > 0 ? `+ ${base}` : `- ${base}`
  })()

  const [collapsed, setCollapsed] = useState<{ completed: boolean; planned: boolean; past: boolean; upcoming: boolean }>({
    completed: true,
    planned: true,
    past: true,
    upcoming: true,
  })

  useEffect(() => {
    if (!forceExpanded) return
    setCollapsed({ completed: false, planned: false, past: false, upcoming: false })
  }, [forceExpanded])

  const section = (
    sectionKey: 'completed' | 'planned' | 'past' | 'upcoming',
    title: string,
    items: StudyTask[],
    tone: 'planned' | 'completed' | 'muted',
  ) => {
    if (items.length === 0) return null
    const isCollapsed = collapsed[sectionKey]
    const shown = isCollapsed ? [] : items
    return (
      <div className={limit == null ? 'bg-white' : ''}>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 py-2"
          aria-label={isCollapsed ? `${title} 열기` : `${title} 닫기`}
          onClick={(e) => {
            e.stopPropagation()
            setCollapsed((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }))
          }}
        >
          <div
            className={`text-[12px] font-semibold ${
              tone === 'completed' ? 'text-slate-900' : tone === 'planned' ? 'text-slate-700' : 'text-slate-500'
            }`}
          >
            {title} {items.length ? <span className="ml-1 text-slate-400">({items.length})</span> : null}
          </div>
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <svg
              viewBox="0 0 20 20"
              className={`h-4 w-4 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
              aria-hidden="true"
            >
              <path
                d="M5.5 7.5L10 12l4.5-4.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </button>
        {isCollapsed ? null : (
          <div className="divide-y divide-slate-200">
            {shown.map((t) => (
              <TaskRow key={t.id} t={t} subjectColor={subject.color} onOpen={() => onOpenTask(t.id)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-3">
      <div className="w-full text-left">
        <div className="flex w-full min-w-0 items-center justify-between gap-3 py-1.5 pl-1.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="h-5 w-[9px] shrink-0" style={{ background: subject.color }} aria-hidden="true" />
            <div className="min-w-0 truncate text-xl font-semibold text-slate-900">{subject.name}</div>
          </div>
          <div className="flex shrink-0 items-center gap-x-4 gap-y-1 text-[12px] font-semibold tabular-nums text-slate-600">
            <span className="inline-flex items-center gap-2">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-500">남은 계획</span>
              <span className="text-[15px] font-semibold text-slate-900">{plannedCount}개</span>
            </span>
            <span className="inline-flex items-center gap-2">
              <span className="rounded-full bg-slate-900 px-2 py-0.5 text-white">완료</span>
              <span className="text-[15px] font-semibold text-slate-900">{completedCount}개</span>
            </span>
          </div>
        </div>

        {completedCount ? (
          <div className="mt-2">
            <div className="flex items-center justify-between">
              <div className="text-[12px] font-semibold text-slate-700">📊 소요시간 분석</div>
            </div>
            <div className="mt-2 w-full pl-6 pr-3">
            <div className="flex flex-col gap-2.5 py-0.5">
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-sm font-semibold text-slate-400">계획</span>
                <div className="h-1.5 w-full overflow-hidden rounded-full">
                  <div className="h-full rounded-full bg-slate-300" style={{ width: `${plannedPct}%` }} />
                </div>
                <span className="ml-2 text-right text-[15px] font-semibold tabular-nums text-slate-500">
                  {formatDurationKo(plannedSecondsCompletedOnly)}
                </span>
              </div>
              <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2">
                <span className="text-sm font-semibold text-slate-900">완료</span>
                <div className="h-1.5 w-full overflow-hidden rounded-full">
                  <div className="h-full rounded-full bg-slate-900" style={{ width: `${completedPct}%` }} />
                </div>
                <span className="ml-2 text-right text-[15px] font-semibold tabular-nums text-slate-900">
                  {formatDurationKo(completedSecondsCompletedOnly)}
                </span>
              </div>
              {varianceLabel ? (
                <div
                  className={`pt-0.5 text-center text-[13px] font-semibold tabular-nums ${
                    varianceSeconds > 0 ? 'text-blue-700' : varianceSeconds < 0 ? 'text-rose-700' : 'text-slate-600'
                  }`}
                >
                  {varianceLabel}
                </div>
              ) : null}
            </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-2" />
      <MasonryGrid
        minColPx={MIN_TWO_COL_ITEM_PX}
        gapPx={limit == null ? 1 : 0}
        className={limit == null ? 'bg-slate-200 p-px' : ''}
        items={[
          { key: 'completed', node: section('completed', '✔️ 완료', buckets.completed, 'completed') },
          { key: 'planned', node: section('planned', '📆 다가오는 계획', buckets.planned, 'planned') },
          { key: 'past', node: section('past', '💾 지나간 계획', buckets.past, 'muted') },
          { key: 'upcoming', node: section('upcoming', '💭 시작 예정', buckets.upcoming, 'muted') },
        ]}
      />

      <div className="mt-3 flex w-full items-stretch gap-2">
        <button
          type="button"
          onClick={onEditSubject}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
          aria-label="주제 편집"
        >
          주제 편집
        </button>
        <button
          type="button"
          onClick={onAddTask}
          className="inline-flex h-10 flex-1 items-center justify-center rounded-xl px-4 text-sm font-semibold transition hover:opacity-90"
          style={{ background: '#0f172a', color: '#ffffff' }}
        >
          + 일정 추가
        </button>
      </div>
    </div>
  )
}

export function SubjectDashboardView() {
  const subjects = usePlannerStore((s) => s.subjects)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const tasks = usePlannerStore((s) => s.tasks)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const { openTaskAdd, openTaskPreview } = useTaskDialog()

  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])

  const createTask = (input?: { subjectId?: string; date?: string }) => {
    const fallbackSubjectId =
      input?.subjectId ??
      ((lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
        subjects.find((s) => s.examId === activeExamId)?.id ??
        subjects[0]?.id ??
        '')
    if (!fallbackSubjectId) return
    openTaskAdd({ date: input?.date ?? '', subjectId: fallbackSubjectId })
  }

  const [period, setPeriod] = useState<Period>('week')
  const [query, setQuery] = useState('')

  // mobile swipe tabs (same UX as day topbar tabs)
  const dashSwipeRef = useRef<{ isDown: boolean; startX: number; startY: number }>({ isDown: false, startX: 0, startY: 0 })
  const dashSwipeLockRef = useRef<'none' | 'h' | 'v'>('none')
  const dashSwipeHostRef = useRef<HTMLDivElement | null>(null)
  const [dashSwipeX, setDashSwipeX] = useState(0)
  const [dashIsSwiping, setDashIsSwiping] = useState(false)
  const dashScrollStopRef = useRef<{ active: boolean; onTouchMove?: (e: TouchEvent) => void; onWheel?: (e: WheelEvent) => void }>({
    active: false,
  })
  const startDashScrollStop = () => {
    if (dashScrollStopRef.current.active) return
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
    }
    dashScrollStopRef.current.active = true
    dashScrollStopRef.current.onTouchMove = onTouchMove
    dashScrollStopRef.current.onWheel = onWheel
    window.addEventListener('touchmove', onTouchMove, { passive: false })
    window.addEventListener('wheel', onWheel, { passive: false })
  }
  const stopDashScrollStop = () => {
    if (!dashScrollStopRef.current.active) return
    const onTouchMove = dashScrollStopRef.current.onTouchMove
    const onWheel = dashScrollStopRef.current.onWheel
    dashScrollStopRef.current.active = false
    dashScrollStopRef.current.onTouchMove = undefined
    dashScrollStopRef.current.onWheel = undefined
    if (onTouchMove) window.removeEventListener('touchmove', onTouchMove as any)
    if (onWheel) window.removeEventListener('wheel', onWheel as any)
  }

  const dashTabsRef = useRef<HTMLDivElement | null>(null)
  const [dashTabsW, setDashTabsW] = useState(0)
  useLayoutEffect(() => {
    const el = dashTabsRef.current
    if (!el) return
    const calc = () => setDashTabsW(el.getBoundingClientRect().width || 0)
    calc()
    const ro = new ResizeObserver(() => calc())
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scrollHostRef = useRef<HTMLDivElement | null>(null)
  const scrollTopByTabRef = useRef<{ today: number; week: number; month: number; all: number; archive: number }>({
    today: 0,
    week: 0,
    month: 0,
    all: 0,
    archive: 0,
  })
  useEffect(() => {
    const el = scrollHostRef.current
    if (!el) return
    const top = scrollTopByTabRef.current[period] ?? 0
    el.scrollTop = top
  }, [period])

  const tasksBySubject = useMemo(() => {
    const out = new Map<string, StudyTask[]>()
    for (const t of tasks) {
      if (t.examId !== activeExamId) continue
      const arr = out.get(t.subjectId) ?? []
      arr.push(t)
      out.set(t.subjectId, arr)
    }
    return out
  }, [tasks, activeExamId])

  const queryNorm = query.trim().toLowerCase()
  const matchedTaskIdsBySubject = useMemo(() => {
    if (!queryNorm) return new Map<string, Set<string>>()
    const out = new Map<string, Set<string>>()
    for (const t of tasks) {
      if (t.examId !== activeExamId) continue
      const hay = `${t.title ?? ''} ${t.memo ?? ''}`.toLowerCase()
      if (!hay.includes(queryNorm)) continue
      const set = out.get(t.subjectId) ?? new Set<string>()
      set.add(t.id)
      out.set(t.subjectId, set)
    }
    return out
  }, [queryNorm, tasks, activeExamId])

  const aggregate = useMemo(() => {
    if (period === 'archive') return null
    const nonArchivedSubjects = scopedSubjects.filter((s) => !s.archived)
    const nonArchivedSubjectIds = new Set(nonArchivedSubjects.map((s) => s.id))
    let plannedCount = 0
    let completedCount = 0
    let plannedSecondsCompletedOnly = 0
    let completedSecondsCompletedOnly = 0
    const plannedBySubject: Array<{ subjectId: string; seconds: number; color: string }> = []
    const completedBySubject: Array<{ subjectId: string; seconds: number; color: string }> = []
    for (const subjectId of nonArchivedSubjectIds) {
      const list = tasksBySubject.get(subjectId) ?? []
      const buckets = buildSubjectBuckets(list, period)
      completedCount += buckets.completed.length
      plannedCount += buckets.planned.length + buckets.past.length + buckets.upcoming.length
      const plannedSec = buckets.completed.reduce((acc, t) => {
        const v = typeof t.plannedSeconds === 'number' && Number.isFinite(t.plannedSeconds) ? t.plannedSeconds : 0
        return acc + Math.max(0, v)
      }, 0)
      const completedSec = buckets.completed.reduce((acc, t) => {
        const byRange = secondsBetweenHm(t.actualStartTime ?? null, t.actualEndTime ?? null)
        const bySec = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds) ? t.actualSeconds : null
        const v = byRange ?? bySec ?? 0
        return acc + (Number.isFinite(v) ? Math.max(0, v) : 0)
      }, 0)
      plannedSecondsCompletedOnly += plannedSec
      completedSecondsCompletedOnly += completedSec
      const color = nonArchivedSubjects.find((s) => s.id === subjectId)?.color ?? '#94a3b8'
      if (plannedSec > 0) plannedBySubject.push({ subjectId, seconds: plannedSec, color })
      if (completedSec > 0) completedBySubject.push({ subjectId, seconds: completedSec, color })
    }
    const maxSecondsRaw = Math.max(plannedSecondsCompletedOnly, completedSecondsCompletedOnly, 1)
    const maxSeconds = Number.isFinite(maxSecondsRaw) && maxSecondsRaw > 0 ? maxSecondsRaw : 1
    const pct = (v: number) => {
      if (!Number.isFinite(v) || v <= 0) return 0
      const raw = (v / maxSeconds) * 100
      const clamped = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 0
      return clamped > 0 && clamped < 3 ? 3 : clamped
    }
    const plannedPct = pct(plannedSecondsCompletedOnly)
    const completedPct = pct(completedSecondsCompletedOnly)
    const varianceSeconds = completedSecondsCompletedOnly - plannedSecondsCompletedOnly
    const varianceLabel = (() => {
      if (!completedCount) return ''
      if (varianceSeconds === 0) return '정확히 완료'
      const abs = Math.abs(varianceSeconds)
      const base = formatDurationKo(abs)
      return varianceSeconds > 0 ? `+ ${base}` : `- ${base}`
    })()
    return {
      plannedCount,
      completedCount,
      plannedSecondsCompletedOnly,
      completedSecondsCompletedOnly,
      plannedBySubject,
      completedBySubject,
      plannedPct,
      completedPct,
      varianceSeconds,
      varianceLabel,
    }
  }, [period, scopedSubjects, tasksBySubject])

  const completedLegend = useMemo(() => {
    if (!aggregate?.completedBySubject?.length) return []
    const subjectNameById = new Map(scopedSubjects.map((s) => [s.id, s.name] as const))
    const total = Math.max(aggregate.completedSecondsCompletedOnly, 1)
    const sorted = aggregate.completedBySubject
      .slice()
      .sort((a, b) => b.seconds - a.seconds)
      .map((seg) => ({
        subjectId: seg.subjectId,
        name: subjectNameById.get(seg.subjectId) ?? '주제',
        color: seg.color,
        share: seg.seconds / total,
      }))
    const keep: typeof sorted = []
    for (const seg of sorted) {
      if (keep.length >= 3) break
      if (seg.share < 0.12 && keep.length > 0) continue
      keep.push(seg)
    }
    return keep
  }, [aggregate, scopedSubjects])

  const visibleSubjects = useMemo(() => {
    const wantArchived = period === 'archive'
    const scoped = scopedSubjects.filter((s) => (wantArchived ? Boolean(s.archived) : !s.archived))
    if (!queryNorm) return scoped
    return scoped.filter((s) => {
      const nameHit = s.name.toLowerCase().includes(queryNorm)
      const taskHit = matchedTaskIdsBySubject.has(s.id)
      return nameHit || taskHit
    })
  }, [scopedSubjects, period, queryNorm, matchedTaskIdsBySubject])

  const pageTitle = '주제별'

  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)
  const [subjectDialogMode, setSubjectDialogMode] = useState<'add' | 'edit'>('edit')
  const [subjectDialogSubjectId, setSubjectDialogSubjectId] = useState<string | null>(null)

  return (
    <div className="flex h-[calc(100dvh-72px-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      <MobileTopBar
        title={pageTitle}
        right={
          <div />
        }
        bottom={
          <div>
            {(() => {
              const order: Period[] = ['today', 'week', 'month', 'all', 'archive']
              const idx = order.indexOf(period)
              const w = dashTabsW || 1
              const progress = idx + -dashSwipeX / w
              const clamped = Math.max(0, Math.min(order.length - 1, progress))
              const leftPct = (clamped / order.length) * 100
              return (
                <div ref={dashTabsRef} className="relative flex w-full select-none items-stretch justify-between">
                  <div
                    className="absolute bottom-0 h-[3px] bg-slate-900"
                    style={{
                      width: `${100 / order.length}%`,
                      left: `${leftPct}%`,
                      transition: dashIsSwiping ? 'none' : 'left 220ms cubic-bezier(0.16, 1, 0.3, 1)',
                    }}
                    aria-hidden="true"
                  />
                  {[
                    { k: 'today' as const, label: '오늘' },
                    { k: 'week' as const, label: '주간' },
                    { k: 'month' as const, label: '월간' },
                    { k: 'all' as const, label: '전체' },
                    { k: 'archive' as const, label: '보관' },
                  ].map((t) => (
                    <button
                      key={t.k}
                      type="button"
                      onClick={() => setPeriod(t.k)}
                      className={`flex-1 py-2 text-center text-base font-medium ${
                        period === t.k ? 'text-slate-900' : 'text-slate-500'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        }
      />

      <div
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overscroll-contain px-4 py-3 md:px-6"
        ref={(el) => {
          scrollHostRef.current = el
          dashSwipeHostRef.current = el
        }}
        onScroll={(e) => (scrollTopByTabRef.current[period] = (e.currentTarget as HTMLDivElement).scrollTop)}
        onPointerDown={(e) => {
          if (e.pointerType !== 'touch') return
          const target = e.target as HTMLElement | null
          if (target?.closest('button,input,select,textarea,[role=\"button\"],a,[data-no-dash-swipe=\"true\"]')) return
          dashSwipeRef.current.isDown = true
          dashSwipeRef.current.startX = e.clientX
          dashSwipeRef.current.startY = e.clientY
          dashSwipeLockRef.current = 'none'
          setDashIsSwiping(true)
          setDashSwipeX(0)
          if (dashSwipeHostRef.current) dashSwipeHostRef.current.style.touchAction = 'pan-y'
          stopDashScrollStop()
        }}
        onPointerMove={(e) => {
          if (e.pointerType !== 'touch') return
          if (!dashSwipeRef.current.isDown) return
          const dx = e.clientX - dashSwipeRef.current.startX
          const dy = e.clientY - dashSwipeRef.current.startY
          if (dashSwipeLockRef.current === 'none') {
            if (Math.abs(dx) > Math.abs(dy) * 1.08) dashSwipeLockRef.current = 'h'
            else if (Math.abs(dy) > Math.abs(dx) * 1.08) dashSwipeLockRef.current = 'v'
            if (dashSwipeLockRef.current === 'h') {
              if (dashSwipeHostRef.current) dashSwipeHostRef.current.style.touchAction = 'pan-x'
              startDashScrollStop()
            } else if (dashSwipeLockRef.current === 'v') {
              if (dashSwipeHostRef.current) dashSwipeHostRef.current.style.touchAction = 'pan-y'
              stopDashScrollStop()
            }
          }
          if (dashSwipeLockRef.current === 'v') return
          setDashSwipeX(dx)
        }}
        onPointerUp={(e) => {
          if (e.pointerType !== 'touch') return
          if (!dashSwipeRef.current.isDown) return
          dashSwipeRef.current.isDown = false
          const dx = e.clientX - dashSwipeRef.current.startX
          setDashIsSwiping(false)
          setDashSwipeX(0)
          if (dashSwipeHostRef.current) dashSwipeHostRef.current.style.touchAction = 'pan-y'
          stopDashScrollStop()
          if (dashSwipeLockRef.current !== 'h') return
          const order: Period[] = ['today', 'week', 'month', 'all', 'archive']
          const idx = order.indexOf(period)
          const threshold = Math.min(140, (dashTabsW || 360) * 0.2)
          if (dx < -threshold && idx < order.length - 1) setPeriod(order[idx + 1]!)
          else if (dx > threshold && idx > 0) setPeriod(order[idx - 1]!)
        }}
        onPointerCancel={() => {
          dashSwipeRef.current.isDown = false
          dashSwipeLockRef.current = 'none'
          setDashIsSwiping(false)
          setDashSwipeX(0)
          if (dashSwipeHostRef.current) dashSwipeHostRef.current.style.touchAction = 'pan-y'
          stopDashScrollStop()
        }}
      >
        {period === 'archive' ? (
          <div className="w-full">
            <div className="hidden" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="주제/일정 검색"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
        ) : (
          <>
            <div className="hidden" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="주제/일정 검색"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400 focus:border-slate-400"
            />
            {aggregate ? (
              <div className="py-5">
                <div className="flex w-full min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0 text-[12px] font-semibold tabular-nums text-slate-600">
                    {formatPeriodLabel(period)}
                  </div>
                  <div />
                </div>
                {aggregate.completedCount ? (
                  <div className="mt-4 w-full pl-3 pr-1">
                    <div className="flex flex-col gap-2.5 py-1">
                      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="text-sm font-semibold text-slate-400">계획</span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-transparent">
                          <div className="h-full overflow-hidden rounded-full" style={{ width: `${aggregate.plannedPct}%` }}>
                            <div className="flex h-full w-full overflow-hidden rounded-full">
                              {aggregate.plannedBySubject.length ? (
                                aggregate.plannedBySubject.map((seg) => (
                                  <div
                                    key={seg.subjectId}
                                    className="h-full"
                                    style={{
                                    background: seg.color,
                                    opacity: 0.35,
                                    width: `${(seg.seconds / Math.max(aggregate.plannedSecondsCompletedOnly, 1)) * 100}%`,
                                    minWidth: seg.seconds > 0 ? 1 : undefined,
                                  }}
                                />
                                ))
                              ) : null}
                            </div>
                          </div>
                        </div>
                        <span className="ml-2 text-right text-[15px] font-semibold tabular-nums text-slate-500">
                          {formatDurationKo(aggregate.plannedSecondsCompletedOnly)}
                        </span>
                      </div>
                      <div className="grid grid-cols-[40px_minmax(0,1fr)_auto] items-center gap-2">
                        <span className="text-sm font-semibold text-slate-900">완료</span>
                        <div className="flex min-w-0 flex-col">
                          <div className="h-1.5 w-full overflow-hidden rounded-full bg-transparent">
                            <div className="h-full overflow-hidden rounded-full" style={{ width: `${aggregate.completedPct}%` }}>
                              <div className="flex h-full w-full overflow-hidden rounded-full">
                                {aggregate.completedBySubject.length ? (
                                  aggregate.completedBySubject.map((seg) => (
                                    <div
                                      key={seg.subjectId}
                                      className="h-full"
                                      style={{
                                        background: seg.color,
                                        width: `${(seg.seconds / Math.max(aggregate.completedSecondsCompletedOnly, 1)) * 100}%`,
                                        minWidth: seg.seconds > 0 ? 1 : undefined,
                                      }}
                                    />
                                  ))
                                ) : null}
                              </div>
                            </div>
                          </div>
                          {completedLegend.length ? (
                            <div className="mt-2 flex min-w-0 flex-wrap items-center gap-1.5">
                              {completedLegend.map((seg) => (
                                <span
                                  key={seg.subjectId}
                                  className="inline-flex items-center gap-1 rounded-full bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-700 ring-1 ring-slate-200"
                                >
                                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: seg.color }} aria-hidden="true" />
                                  {seg.name}
                                </span>
                              ))}
                            </div>
                          ) : null}
                        </div>
                        <span className="ml-2 text-right text-[15px] font-semibold tabular-nums text-slate-900">
                          {formatDurationKo(aggregate.completedSecondsCompletedOnly)}
                        </span>
                      </div>
                      {aggregate.varianceLabel ? (
                        <div
                          className={`pt-0.5 text-center text-[13px] font-semibold tabular-nums ${
                            aggregate.varianceSeconds > 0 ? 'text-blue-700' : aggregate.varianceSeconds < 0 ? 'text-rose-700' : 'text-slate-600'
                          }`}
                        >
                          {aggregate.varianceLabel}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}
          </>
        )}

        {period === 'archive' ? null : (
          <div className="flex justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                setSubjectDialogMode('add')
                setSubjectDialogSubjectId(null)
                setSubjectDialogOpen(true)
              }}
            >
              + 주제 등록
            </Button>
          </div>
        )}

        <div className="space-y-3">
          <MasonryColumns
            minColPx={MIN_TWO_COL_ITEM_PX}
            items={visibleSubjects.map((s) => ({
              key: s.id,
              node: (
                <SubjectCard
                  subject={s}
                  tasks={
                    queryNorm && matchedTaskIdsBySubject.has(s.id)
                      ? (tasksBySubject.get(s.id) ?? []).filter((t) => matchedTaskIdsBySubject.get(s.id)?.has(t.id))
                      : tasksBySubject.get(s.id) ?? []
                  }
                  period={period}
                  onEditSubject={() => {
                    setSubjectDialogMode('edit')
                    setSubjectDialogSubjectId(s.id)
                    setSubjectDialogOpen(true)
                  }}
                  onOpenTask={(id) => openTaskPreview(id)}
                  onAddTask={() => createTask({ subjectId: s.id })}
                  limit={3}
                  forceExpanded={Boolean(queryNorm && matchedTaskIdsBySubject.has(s.id))}
                />
              ),
            }))}
          />
          {visibleSubjects.length === 0 ? (
            <div className="px-2 py-8 text-center text-sm font-semibold text-slate-500">과목이 없어요.</div>
          ) : null}
        </div>
      </div>

      <SubjectDialog
        open={subjectDialogOpen}
        mode={subjectDialogMode}
        subjectId={subjectDialogSubjectId}
        onClose={() => setSubjectDialogOpen(false)}
      />
    </div>
  )
}
