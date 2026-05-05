import { format } from 'date-fns'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { ymdToDate } from '../lib/dates'
import { formatHmsFromSeconds } from '../lib/time'
import { Button, Card, CardHeader } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'
import { NewTaskSheetContext } from '../components/AppLayout'

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

function snap10(min: number) {
  return Math.max(0, Math.min(24 * 60 - 10, Math.round(min / 10) * 10))
}

type TimelineKind = 'planned' | 'actual'

type TimelineItem = {
  id: string
  kind: TimelineKind
  title: string
  subjectColor?: string
  startMin: number
  durationMin: number
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

export function DayDetailView() {
  const navigate = useNavigate()
  const newTaskSheet = useContext(NewTaskSheetContext)
  const params = useParams()
  const date = params.date ?? ''
  if (!date) return <Navigate to="/calendar" replace />
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const allTasks = usePlannerStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => t.examId === activeExamId && t.date === date), [allTasks, activeExamId, date])
  const updateTask = usePlannerStore((s) => s.updateTask)

  const [timelineWindow, setTimelineWindow] = useState<TimelineWindow>(() => loadTimelineWindow(date))
  useEffect(() => {
    setTimelineWindow(loadTimelineWindow(date))
  }, [date])
  useEffect(() => {
    saveTimelineWindow(date, timelineWindow)
  }, [date, timelineWindow])

  const { completed, pending } = useMemo(() => {
    const sorted = tasks
      .slice()
      .sort((a, b) => (a.actualStartTime ?? a.plannedStartTime ?? '99:99').localeCompare(b.actualStartTime ?? b.plannedStartTime ?? '99:99') || a.createdAt.localeCompare(b.createdAt))
    return { completed: sorted.filter((t) => t.status === 'completed'), pending: sorted.filter((t) => t.status !== 'completed') }
  }, [tasks])

  const timelineItems = useMemo(() => {
    const items: TimelineItem[] = []
    for (const t of tasks) {
      const subject = subjects.find((s) => s.id === t.subjectId)

      const actualStartMin = hmToMinutesLocal(t.actualStartTime)
      const actualEndMin = hmToMinutesLocal(t.actualEndTime)
      const plannedStartMin = hmToMinutesLocal(t.plannedStartTime)

      if (actualStartMin !== null) {
        if (actualEndMin !== null && actualEndMin < actualStartMin) continue
        const durationMinRaw = (t.actualSeconds ?? 0) / 60 || (actualEndMin !== null ? actualEndMin - actualStartMin : 0)
        const d = Math.max(10, snap10(durationMinRaw))
        const startMin = snap10(actualStartMin)
        const endMin = Math.min(24 * 60, startMin + d)
        items.push({
          id: t.id,
          kind: 'actual',
          title: t.title,
          subjectColor: subject?.color,
          startMin,
          durationMin: d,
          startLabel: minutesToHm(startMin),
          endLabel: minutesToHm(endMin),
        })
        continue
      }

      if (plannedStartMin !== null) {
        const d = Math.max(10, snap10((t.plannedSeconds ?? 0) / 60))
        const startMin = snap10(plannedStartMin)
        const endMin = Math.min(24 * 60, startMin + d)
        items.push({
          id: t.id,
          kind: 'planned',
          title: t.title,
          subjectColor: subject?.color,
          startMin,
          durationMin: d,
          startLabel: minutesToHm(startMin),
          endLabel: minutesToHm(endMin),
        })
      }
    }
    return items.sort((a, b) => a.startMin - b.startMin)
  }, [tasks, subjects])

  const dayUnscheduled = useMemo(() => {
    return tasks
      .filter((t) => !t.actualStartTime && !t.plannedStartTime)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [tasks])

  const title = date ? format(ymdToDate(date), 'yyyy년 M월 d일') : 'Day Detail'

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar
        title={title}
        left={
          <Button variant="secondary" onClick={() => navigate('/calendar')}>
            ←
          </Button>
        }
        right={
          <Button onClick={() => newTaskSheet?.openSheet(date ? { date } : undefined)}>
            + 새 일정
          </Button>
        }
      />
      <Card>
        <CardHeader title={title} />
        <div className="hidden items-center justify-between px-4 py-3 md:flex">
          <Button variant="secondary" onClick={() => navigate('/calendar')}>
            ← 캘린더
          </Button>
          <div className="flex items-center gap-2">
            <Button onClick={() => newTaskSheet?.openSheet(date ? { date } : undefined)}>
              + 새 일정
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="타임라인" />
        <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[280px_1fr]">
          <div>
            <div className="text-xs font-semibold text-slate-600">시간 미정(이 날짜)</div>
            <div className="mt-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-3">
              {dayUnscheduled.length === 0 ? (
                <div className="text-sm text-slate-500">시간 미정 일정이 없어요.</div>
              ) : (
                <div className="flex flex-col gap-2">
                  {dayUnscheduled.map((t) => {
                    const subject = subjects.find((s) => s.id === t.subjectId)
                    return (
                      <Link
                        key={t.id}
                        to={`/task/${t.id}`}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/emma-task-id', t.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm hover:bg-slate-50 active:cursor-grabbing"
                        title="타임라인으로 드래그해서 배치"
                      >
                        <span className="min-w-0 truncate">
                          <span
                            className="mr-2 inline-block h-4 w-4 rounded-[5px] border-2 align-middle"
                            style={{ borderColor: subject?.color ?? '#94a3b8' }}
                          />
                          <span className="align-middle font-semibold text-slate-900">{t.title}</span>
                        </span>
                        <span className="shrink-0 text-xs text-slate-500">{formatHmsFromSeconds(t.plannedSeconds)}</span>
                      </Link>
                    )
                  })}
                </div>
              )}
              <div className="mt-2 text-[11px] text-slate-500">타임라인에 드롭하면 목표 시작시간/소요시간이 설정됩니다.</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
              <div className="flex items-end gap-2">
                <div>
                  <div className="text-[11px] font-semibold text-slate-600">보이는 시작</div>
                  <input
                    type="time"
                    value={minutesToHm(timelineWindow.startMin)}
                    onChange={(e) => {
                      const m = hmToMinutesLocal(e.target.value)
                      if (m === null) return
                      const startMin = snap10(m)
                      const endMin = Math.max(startMin + 10, timelineWindow.endMin)
                      setTimelineWindow({ startMin, endMin })
                    }}
                    className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-600">보이는 종료</div>
                  <input
                    type="time"
                    value={minutesToHm(Math.max(timelineWindow.startMin + 10, timelineWindow.endMin))}
                    onChange={(e) => {
                      const m = hmToMinutesLocal(e.target.value)
                      if (m === null) return
                      const endMin = Math.max(timelineWindow.startMin + 10, snap10(m))
                      setTimelineWindow({ startMin: timelineWindow.startMin, endMin })
                    }}
                    className="w-28 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                  />
                </div>
              </div>
              <div className="text-[11px] text-slate-500">이 설정은 날짜별로 저장됩니다.</div>
            </div>
            <DayTimeline
              items={timelineItems}
              viewStartMin={timelineWindow.startMin}
              viewEndMin={timelineWindow.endMin}
              onOpenTask={(taskId) => navigate(`/task/${taskId}`)}
              onUpdate={(taskId, kind, startMin, durationMin) => {
                const startHm = minutesToHm(startMin)
                const endHm = minutesToHm(startMin + durationMin)
                if (kind === 'actual') {
                  updateTask(taskId, { actualStartTime: startHm, actualEndTime: endHm, actualSeconds: durationMin * 60 })
                } else {
                  updateTask(taskId, { plannedStartTime: startHm, plannedSeconds: durationMin * 60 })
                }
              }}
              onDropTask={(taskId, startMin) => {
                const task = tasks.find((x) => x.id === taskId)
                if (!task) return
                const durationMin = Math.max(10, snap10((task.plannedSeconds ?? 60 * 60) / 60))
                updateTask(taskId, { plannedStartTime: minutesToHm(startMin), plannedSeconds: durationMin * 60 })
              }}
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="완료" />
        <div className="divide-y divide-slate-100">
          {completed.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">완료된 일정이 없어요.</div> : null}
          {completed.map((t) => {
            const subject = subjects.find((s) => s.id === t.subjectId)
            const variance = (t.actualSeconds ?? 0) - t.plannedSeconds
            const varianceText = `${variance >= 0 ? '+' : '-'}${formatHmsFromSeconds(Math.abs(variance))}`
            return (
              <Link key={t.id} to={`/task/${t.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-[5px]"
                        style={{ background: subject?.color ?? '#94a3b8' }}
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white">
                          <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <div className="truncate text-sm font-semibold text-slate-900">{t.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t.actualStartTime ?? '-'} - {t.actualEndTime ?? '-'} · {subject?.name ?? '과목'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-slate-600">
                      목표 {formatHmsFromSeconds(t.plannedSeconds)} / 실제 {formatHmsFromSeconds(t.actualSeconds ?? 0)}
                    </div>
                    <div className={`text-xs font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{varianceText}</div>
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="미완수" />
        <div className="divide-y divide-slate-100">
          {pending.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">미완수 일정이 없어요.</div> : null}
          {pending.map((t) => {
            const subject = subjects.find((s) => s.id === t.subjectId)
            return (
              <Link key={t.id} to={`/task/${t.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="inline-block h-4 w-4 rounded-[5px] border-2"
                        style={{ borderColor: subject?.color ?? '#94a3b8' }}
                        aria-hidden="true"
                      />
                      <div className="truncate text-sm font-semibold text-slate-900">{t.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      목표 {t.plannedStartTime ? `${t.plannedStartTime}` : '-'} · {subject?.name ?? '과목'}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-slate-600">목표 {formatHmsFromSeconds(t.plannedSeconds)}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function DayTimeline({
  items,
  onUpdate,
  onDropTask,
  viewStartMin,
  viewEndMin,
  onOpenTask,
}: {
  items: TimelineItem[]
  onUpdate: (taskId: string, kind: TimelineKind, startMin: number, durationMin: number) => void
  onDropTask: (taskId: string, startMin: number) => void
  viewStartMin: number
  viewEndMin: number
  onOpenTask: (taskId: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [active, setActive] = useState<{
    id: string
    kind: TimelineKind
    mode: 'move' | 'resize'
    originY: number
    originX: number
    originStart: number
    originDur: number
    moved: boolean
  } | null>(null)

  const pxPerMin = 1.2 // 10분=12px (모바일에서도 조작 가능)
  const startMin = snap10(viewStartMin)
  const endMin = Math.max(startMin + 10, snap10(viewEndMin))
  const windowMinutes = endMin - startMin
  const viewHeight = Math.max(240, windowMinutes * pxPerMin)

  const handlePointerDown = (e: React.PointerEvent, id: string, kind: TimelineKind, mode: 'move' | 'resize') => {
    const it = items.find((x) => x.id === id && x.kind === kind)
    if (!it) return
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setActive({ id, kind, mode, originY: e.clientY, originX: e.clientX, originStart: it.startMin, originDur: it.durationMin, moved: false })
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!active) return
    const dy = e.clientY - active.originY
    const deltaMinRaw = dy / pxPerMin
    const dx = e.clientX - active.originX
    const moved = active.moved || Math.abs(dy) > 5 || Math.abs(dx) > 5
    if (active.mode === 'move') {
      const nextStart = snap10(active.originStart + deltaMinRaw)
      onUpdate(active.id, active.kind, nextStart, active.originDur)
    } else {
      const nextDur = Math.max(10, snap10(active.originDur + deltaMinRaw))
      onUpdate(active.id, active.kind, active.originStart, nextDur)
    }
    if (moved !== active.moved) setActive((cur) => (cur ? { ...cur, moved } : cur))
  }

  const handlePointerUp = () => {
    if (active && active.mode === 'move' && !active.moved) onOpenTask(active.id)
    setActive(null)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const taskId = e.dataTransfer.getData('text/emma-task-id')
    if (!taskId) return
    const el = containerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const yInViewport = e.clientY - rect.top
    const minutesRaw = yInViewport / pxPerMin
    const dropStart = snap10(startMin + minutesRaw)
    onDropTask(taskId, dropStart)
  }

  return (
    <div>
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white"
        style={{ height: viewHeight }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div className="relative" style={{ height: viewHeight }}>
          {/* grid background */}
          {Array.from({ length: Math.ceil(windowMinutes / 60) + 1 }).map((_, i) => {
            const hStart = Math.floor((startMin + i * 60) / 60)
            const top = i * 60 * pxPerMin
            return (
              <div key={i} className="absolute left-0 right-0 border-t border-slate-100" style={{ top }}>
                <div className="px-2 text-[11px] font-semibold text-slate-500">{String(hStart).padStart(2, '0')}:00</div>
              </div>
            )
          })}
          {Array.from({ length: Math.floor(windowMinutes / 10) + 1 }).map((_, i) => (
            <div key={`m${i}`} className="absolute left-0 right-0 border-t border-slate-50" style={{ top: i * 10 * pxPerMin }} aria-hidden />
          ))}

          {items.map((it) => {
            if (it.startMin + it.durationMin <= startMin) return null
            if (it.startMin >= endMin) return null
            const top = (it.startMin - startMin) * pxPerMin
            const height = it.durationMin * pxPerMin
            const isCompact = height < 34
            const tone = it.kind === 'actual' ? 'bg-slate-900 text-white border-slate-900' : 'bg-slate-200 text-slate-900 border-slate-300'
            return (
              <div
                key={`${it.kind}:${it.id}`}
                className={`absolute left-14 right-3 rounded-xl border ${tone} shadow-sm`}
                style={{ top, height }}
                onPointerDown={(e) => handlePointerDown(e, it.id, it.kind, 'move')}
                role="button"
                tabIndex={0}
                aria-label={`${it.title} ${it.startLabel}-${it.endLabel} ${it.kind === 'actual' ? '기록' : '목표'}`}
              >
                {/* bar */}
                <div className="h-full w-full" aria-hidden />

                {/* label: 짧은(예: 10분) 블록에서도 글씨가 보이도록 블록 위에 오버레이 */}
                <div
                  className={`pointer-events-none absolute left-2 right-2 ${isCompact ? '-top-6' : 'top-2'}`}
                  style={{ zIndex: 2 }}
                >
                  <div
                    className={`inline-flex max-w-full items-center gap-2 rounded-full px-2 py-1 text-[11px] font-semibold shadow-sm ${
                      it.kind === 'actual' ? 'bg-slate-900 text-white' : 'bg-slate-200 text-slate-900 border border-slate-300'
                    }`}
                  >
                    <span className="h-2 w-2 rounded-full" style={{ background: it.subjectColor ?? '#94a3b8' }} />
                    <span className="truncate">{it.title}</span>
                    <span className="shrink-0 opacity-80">
                      {it.startLabel}-{it.endLabel}
                    </span>
                  </div>
                </div>

                {/* resize handle */}
                <div
                  className={`absolute bottom-1 right-1 h-5 w-5 rounded-md ${it.kind === 'actual' ? 'bg-white/15' : 'bg-slate-300'} cursor-ns-resize`}
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
      <div className="mt-2 text-[11px] text-slate-500">기록이 있으면 타임라인은 기록(진한 블록) 기준으로 표시됩니다.</div>
    </div>
  )
}
