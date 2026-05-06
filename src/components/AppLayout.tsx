import { createContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { usePlannerStore } from '../store/usePlannerStore'
import { formatDurationKoFromSeconds } from '../lib/time'
import { todayYmd } from '../lib/dates'
import { Button } from './ui'
import { TaskDialogContext } from './TaskDialogContext'
import { TaskDialog } from './TaskDialog'
import { SubjectDialog } from './SubjectDialog'

export const SidebarToggleContext = createContext<{ open: boolean; toggle: () => void } | null>(null)

function IconCalendarMonth() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
        fill="currentColor"
      />
    </svg>
  )
}

function IconCalendarViewDay() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M3 5h18v2H3V5zm0 4h7v10H3V9zm9 0h9v2h-9V9zm0 4h9v2h-9v-2zm0 4h9v2h-9v-2z" fill="currentColor" />
    </svg>
  )
}

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z" fill="currentColor" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path
        d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.4.12-.61l-1.92-3.32c-.11-.21-.36-.3-.58-.22l-2.39.96c-.5-.38-1.04-.69-1.63-.92l-.36-2.54A.5.5 0 0 0 14.3 1h-4.6a.5.5 0 0 0-.49.42l-.36 2.54c-.59.23-1.13.54-1.63.92l-2.39-.96c-.22-.09-.47.01-.58.22L1.33 9.46c-.11.21-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.4-.12.61l1.92 3.32c.11.21.36.3.58.22l2.39-.96c.5.38 1.04.69 1.63.92l.36 2.54c.04.24.25.42.49.42h4.6c.24 0 .45-.18.49-.42l.36-2.54c.59-.23 1.13-.54 1.63-.92l2.39.96c.22.09.47-.01.58-.22l1.92-3.32c.11-.21.06-.47-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
        fill="currentColor"
      />
    </svg>
  )
}

const normalizeHex = (color: string) => {
  const raw = color.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
  return raw
}

const pickReadableTextColor = (bg: string) => {
  const hex = normalizeHex(bg)
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#0f172a'
  const v = m[1]
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  const srgb = [r, g, b].map((x) => {
    const c = x / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  return L < 0.45 ? '#ffffff' : '#0f172a'
}

function formatDday(dueDate?: string) {
  if (!dueDate) return ''
  const today = new Date()
  const d = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Math.round((d.getTime() - today.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'D-DAY'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

function truncateText(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max)
}

function NavItem({ to, label, icon, active }: { to: string; label: string; icon: ReactNode; active?: boolean }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => {
        const on = typeof active === 'boolean' ? active : isActive
        return `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${
          on ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
        }`
      }}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      <span className="truncate">{label}</span>
    </NavLink>
  )
}

export function AppLayout() {
  const location = useLocation()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const hideBottom = false
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const isCalendarPage = location.pathname.startsWith('/calendar')
  const isDayPage = location.pathname.startsWith('/day/')
  const dayPageMatch = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(location.pathname)
  const dayPageDate = dayPageMatch?.[1] ?? ''
  const dayView = new URLSearchParams(location.search).get('view')
  const isDayTimelineMode = Boolean(dayPageDate) && (dayView === null || dayView === '' || dayView === 'timeline')
  const [taskDialogRequest, setTaskDialogRequest] = useState<null | { mode: 'add'; date?: string; subjectId?: string } | { mode: 'preview'; taskId: string; autoEdit?: boolean; autoCloseAfterComplete?: boolean }>(null)
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)
  const [pendingTaskCreate, setPendingTaskCreate] = useState<null | { date?: string }>(null)
  const [sidebarSubjectGroupsOpen, setSidebarSubjectGroupsOpen] = useState(() => {
    try {
      const raw = window.localStorage.getItem('emma-study-planner:sidebarSubjectGroupsOpen:v1')
      if (!raw) return { calendar: {} as Record<string, boolean>, day: {} as Record<string, boolean> }
      const parsed = JSON.parse(raw) as { calendar?: Record<string, boolean>; day?: Record<string, boolean> }
      return { calendar: parsed.calendar ?? {}, day: parsed.day ?? {} }
    } catch {
      return { calendar: {} as Record<string, boolean>, day: {} as Record<string, boolean> }
    }
  })
  useEffect(() => {
    try {
      window.localStorage.setItem('emma-study-planner:sidebarSubjectGroupsOpen:v1', JSON.stringify(sidebarSubjectGroupsOpen))
    } catch {
      // ignore
    }
  }, [sidebarSubjectGroupsOpen])

  const createTaskAndOpen = () => {
    const fallbackSubjectId =
      (lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
      subjects.find((s) => s.examId === activeExamId)?.id ??
      subjects[0]?.id ??
      ''
    if (!fallbackSubjectId) {
      setPendingTaskCreate({})
      setSubjectDialogOpen(true)
      return
    }
    setTaskDialogRequest({ mode: 'add', subjectId: fallbackSubjectId })
  }

  const createTaskAndOpenForDay = (date: string) => {
    const fallbackSubjectId =
      (lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
      subjects.find((s) => s.examId === activeExamId)?.id ??
      subjects[0]?.id ??
      ''
    if (!fallbackSubjectId) {
      setPendingTaskCreate({ date })
      setSubjectDialogOpen(true)
      return
    }
    setTaskDialogRequest({ mode: 'add', subjectId: fallbackSubjectId, date })
  }

  const openTaskPreview = (taskId: string) => {
    setTaskDialogRequest({ mode: 'preview', taskId })
  }

  const unassignedPending = useMemo(
    () => tasks.filter((t) => t.examId === activeExamId && t.status !== 'completed' && (!t.date || t.date === '')),
    [tasks, activeExamId],
  )

  const unassignedBySubject = useMemo(() => {
    const map = new Map<string, typeof unassignedPending>()
    for (const t of unassignedPending) {
      const arr = map.get(t.subjectId) ?? []
      arr.push(t)
      map.set(t.subjectId, arr)
    }
    const groups = Array.from(map.entries()).map(([subjectId, list]) => ({
      subjectId,
      newest: list.reduce((acc, cur) => (cur.createdAt > acc ? cur.createdAt : acc), list[0]?.createdAt ?? ''),
      list: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    groups.sort((a, b) => b.newest.localeCompare(a.newest))
    return groups
  }, [unassignedPending])

  const dayUnscheduled = useMemo(() => {
    if (!dayPageDate) return []
    return tasks
      .filter((t) => t.examId === activeExamId && t.date === dayPageDate && !t.actualStartTime && !t.plannedStartTime)
      .slice()
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  }, [tasks, activeExamId, dayPageDate])

  return (
    <TaskDialogContext.Provider
      value={{
        openTaskAdd: (input) => setTaskDialogRequest({ mode: 'add', ...input }),
        openTaskPreview: (taskId, opts) => setTaskDialogRequest({ mode: 'preview', taskId, ...opts }),
        request: taskDialogRequest,
        clearRequest: () => setTaskDialogRequest(null),
      }}
    >
      <SidebarToggleContext.Provider value={{ open: sidebarOpen, toggle: () => setSidebarOpen((cur) => !cur) }}>
        <div className="h-full [--bottom-nav-h:72px]">
          <div className={`grid h-full w-full grid-cols-1 ${sidebarOpen ? 'md:grid-cols-[260px_1fr]' : 'md:grid-cols-[1fr]'}`}>
            <aside className={`${sidebarOpen ? 'md:flex' : 'md:hidden'} hidden border-r border-slate-200 bg-white p-3 md:min-h-0 md:flex-col`}>
            <div className="px-2 py-2 text-sm font-semibold text-slate-900">엠마 스터디플래너</div>
            <div className="mt-3 flex flex-col gap-1.5">
              <NavItem to="calendar" label="월별" icon={<IconCalendarMonth />} />
              <NavItem to={`/day/${todayYmd()}`} label="일별" icon={<IconCalendarViewDay />} active={isDayPage} />
              <NavItem to="dashboard" label="주제" icon={<IconFolder />} />
              <NavItem to="settings" label="설정" icon={<IconSettings />} />
            </div>

            {isCalendarPage ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] font-semibold text-slate-900">시작 예정</div>
                    {unassignedPending.length ? (
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                        {unassignedPending.length}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button onClick={createTaskAndOpen}>+ 일정 추가</Button>
                  </div>
                </div>
                <div
                  className="min-h-0 flex-1 border-t border-slate-100 p-2"
                  onDragOver={(e) => {
                    e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const taskId = e.dataTransfer.getData('text/emma-task-id')
                    if (taskId) updateTask(taskId, { date: '' })
                  }}
                >
                  <div className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1">
                    <div className="space-y-2">
                      {unassignedBySubject.map((g) => {
                        const subject = subjects.find((s) => s.id === g.subjectId)
                        const isOpen = sidebarSubjectGroupsOpen.calendar[g.subjectId] ?? true
                        return (
                          <div key={g.subjectId}>
                            <button
                              type="button"
                              onClick={() =>
                                setSidebarSubjectGroupsOpen((prev) => ({
                                  ...prev,
                                  calendar: { ...prev.calendar, [g.subjectId]: !(prev.calendar[g.subjectId] ?? true) },
                                }))
                              }
                              className="mb-1 flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-[12px] font-semibold text-slate-700 hover:bg-slate-50"
                              aria-label={isOpen ? '주제 접기' : '주제 펼치기'}
                            >
                              <span className="min-w-0 overflow-hidden whitespace-nowrap">{truncateText(subject?.name ?? '주제', 18)}</span>
                              <span className="shrink-0 text-[11px] font-semibold text-slate-500 tabular-nums">{g.list.length}</span>
                            </button>
                            {isOpen ? (
                              <div className="grid grid-cols-1 gap-2">
                                {g.list.map((t) => {
                                  const sub = subjects.find((s) => s.id === t.subjectId)
                                  const bg = sub?.color ?? '#94a3b8'
                                  const textColor = pickReadableTextColor(bg)
                                  const dday = formatDday(t.dueDate)
                                  const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                                  const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                                  const timeLabelKo = formatDurationKoFromSeconds(secondsToShow)
                                  return (
                                    <button
                                      key={t.id}
                                      type="button"
                                      onClick={() => openTaskPreview(t.id)}
                                      draggable
                                      onDragStart={(e) => {
                                        e.dataTransfer.setData('text/emma-task-id', t.id)
                                        e.dataTransfer.effectAllowed = 'move'
                                      }}
                                      className="block min-w-0 select-none rounded-lg px-3 py-2 text-left text-[12px] leading-tight"
                                      style={{ background: bg, color: textColor }}
                                    >
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="min-w-0 overflow-hidden whitespace-nowrap">{truncateText(t.title, 16)}</span>
                                        <span className="shrink-0 text-[11px] tabular-nums opacity-90">
                                          <span className="rounded-md bg-white/70 px-1.5 py-0.5 text-slate-700">{timeLabelKo}</span>
                                          {dday ? (
                                            <span className="ml-1 rounded-md bg-white/70 px-1.5 py-0.5 font-semibold text-indigo-700">{dday}</span>
                                          ) : null}
                                        </span>
                                      </div>
                                    </button>
                                  )
                                })}
                              </div>
                            ) : null}
                          </div>
                        )
                      })}
                      {!unassignedBySubject.length ? <div className="px-1 py-2 text-xs text-slate-400">비어있음</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {dayPageDate && isDayTimelineMode ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="text-[12px] font-semibold text-slate-900">시간 미정</div>
                    {dayUnscheduled.length ? (
                      <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                        {dayUnscheduled.length}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-1">
                    <Button onClick={() => createTaskAndOpenForDay(dayPageDate)}>+ 일정 추가</Button>
                  </div>
                </div>
                <div
                  className="min-h-0 flex-1 border-t border-slate-100 p-2"
                  data-unscheduled-dropzone="true"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const taskId = e.dataTransfer.getData('text/emma-task-id')
                    if (taskId) updateTask(taskId, { plannedStartTime: undefined })
                  }}
                >
                  <div className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1">
                    <div className="space-y-2">
                    {(() => {
                        type DayUnscheduledTask = (typeof dayUnscheduled)[number]
                        const bySubject = new Map<
                          string,
                          { subjectId: string; subjectName: string; subjectColor: string; items: DayUnscheduledTask[] }
                        >()
                        for (const t of dayUnscheduled) {
                          const sub = subjects.find((s) => s.id === t.subjectId)
                          const subjectId = sub?.id ?? 'unknown'
                          const subjectName = sub?.name ?? '주제'
                          const subjectColor = sub?.color ?? '#94a3b8'
                          const key = `${subjectId}:${subjectName}:${subjectColor}`
                          const g = bySubject.get(key) ?? { subjectId, subjectName, subjectColor, items: [] as DayUnscheduledTask[] }
                          g.items.push(t)
                          bySubject.set(key, g)
                        }
                        const groups = Array.from(bySubject.values()).sort((a, b) => a.subjectName.localeCompare(b.subjectName))
                        return groups.map((g) => {
                          const isOpen = sidebarSubjectGroupsOpen.day[g.subjectId] ?? true
                          return (
                            <div key={g.subjectId} className="space-y-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setSidebarSubjectGroupsOpen((prev) => ({
                                    ...prev,
                                    day: { ...prev.day, [g.subjectId]: !(prev.day[g.subjectId] ?? true) },
                                  }))
                                }
                                className="flex w-full items-center justify-between gap-2 rounded-lg px-1 py-1 text-left text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                                aria-label={isOpen ? '주제 접기' : '주제 펼치기'}
                              >
                                <span className="min-w-0 overflow-hidden whitespace-nowrap">{g.subjectName}</span>
                                <span className="shrink-0 text-[11px] font-semibold text-slate-500 tabular-nums">{g.items.length}</span>
                              </button>
                              {isOpen
                                ? g.items.map((t) => {
                                    const bg = g.subjectColor
                                    const textColor = pickReadableTextColor(bg)
                                    const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
                                    const isCompleted = t.status === 'completed' || hasAnyRecord
                                    const timeLabelKo = t.plannedSeconds ? formatDurationKoFromSeconds(t.plannedSeconds) : ''
                                    return (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => openTaskPreview(t.id)}
                                        draggable
                                        onDragStart={(e) => {
                                          e.dataTransfer.setData('text/emma-task-id', t.id)
                                          e.dataTransfer.effectAllowed = 'move'
                                        }}
                                        className={`block w-full min-w-0 select-none rounded-lg px-3 py-2 text-left text-[12px] leading-tight shadow-sm ${
                                          isCompleted ? 'saturate-[0.85] brightness-[0.97]' : ''
                                        }`}
                                        style={{ background: bg, color: textColor }}
                                        title="타임라인으로 드래그해서 배치"
                                      >
                                        <div className="flex min-h-[36px] items-center justify-between gap-2">
                                          <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                            <button
                                              type="button"
                                              className="mr-2 inline-flex h-4 w-4 items-center justify-center align-middle"
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
                                                  <path
                                                    d="M6 10.2l2.3 2.3L14.5 6.6"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                  />
                                                </svg>
                                              ) : (
                                                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" aria-hidden="true">
                                                  <rect x="2.5" y="2.5" width="15" height="15" rx="2.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                                </svg>
                                              )}
                                            </button>
                                            <span className="align-middle font-semibold">{truncateText(t.title, 32)}</span>
                                          </span>
                                          <span className="shrink-0 text-[11px] tabular-nums opacity-90">
                                            {timeLabelKo ? <span className="font-semibold">{timeLabelKo}</span> : null}
                                          </span>
                                        </div>
                                      </button>
                                    )
                                  })
                                : null}
                            </div>
                          )
                        })
                      })()}
                      {!dayUnscheduled.length ? <div className="px-1 py-2 text-xs text-slate-400">비어있음</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            </aside>
            <main className="min-h-0 overflow-auto px-0 py-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:p-3 md:pb-3">
              <Outlet />
            </main>
          </div>
          {!hideBottom ? (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 shadow-[0_-12px_40px_rgba(15,23,42,0.08)] backdrop-blur md:hidden">
              <div style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
                <div className="mx-auto grid max-w-xl grid-cols-4 px-2 pb-2 pt-2">
                  <BottomNavItem
                    to="calendar"
                    label="월별"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"
                          fill="currentColor"
                        />
                      </svg>
                    }
                  />
                  <BottomNavItem
                    to={`/day/${todayYmd()}`}
                    label="일별"
                    active={isDayPage}
                    icon={
                      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M3 5h18v2H3V5zm0 4h7v10H3V9zm9 0h9v2h-9V9zm0 4h9v2h-9v-2zm0 4h9v2h-9v-2z"
                          fill="currentColor"
                        />
                      </svg>
                    }
                  />
                  <BottomNavItem
                    to="dashboard"
                    label="주제"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                        <path d="M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z" fill="currentColor" />
                      </svg>
                    }
                  />
                  <BottomNavItem
                    to="settings"
                    label="설정"
                    icon={
                      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M19.14 12.94c.04-.31.06-.63.06-.94s-.02-.63-.06-.94l2.03-1.58c.18-.14.23-.4.12-.61l-1.92-3.32c-.11-.21-.36-.3-.58-.22l-2.39.96c-.5-.38-1.04-.69-1.63-.92l-.36-2.54A.5.5 0 0 0 14.3 1h-4.6a.5.5 0 0 0-.49.42l-.36 2.54c-.59.23-1.13.54-1.63.92l-2.39-.96c-.22-.09-.47.01-.58.22L1.33 9.46c-.11.21-.06.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58c-.18.14-.23.4-.12.61l1.92 3.32c.11.21.36.3.58.22l2.39-.96c.5.38 1.04.69 1.63.92l.36 2.54c.04.24.25.42.49.42h4.6c.24 0 .45-.18.49-.42l.36-2.54c.59-.23 1.13-.54 1.63-.92l2.39.96c.22.09.47-.01.58-.22l1.92-3.32c.11-.21.06-.47-.12-.61l-2.03-1.58zM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5z"
                          fill="currentColor"
                        />
                      </svg>
                    }
                  />
                </div>
              </div>
            </div>
          ) : null}
          <TaskDialog />
        </div>
      </SidebarToggleContext.Provider>

      <SubjectDialog
        open={subjectDialogOpen}
        mode="add"
        onClose={() => {
          setSubjectDialogOpen(false)
          setPendingTaskCreate(null)
        }}
        onAfterAdd={(subjectId) => {
          const pending = pendingTaskCreate
          setSubjectDialogOpen(false)
          setPendingTaskCreate(null)
          setTaskDialogRequest({ mode: 'add', subjectId, date: pending?.date })
        }}
      />
    </TaskDialogContext.Provider>
  )
}

function BottomNavItem({
  to,
  label,
  icon,
  active,
}: {
  to: string
  label: string
  icon: ReactNode
  active?: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => {
        const on = typeof active === 'boolean' ? active : isActive
        return `group relative mx-1 flex h-[56px] flex-col items-center justify-center gap-1 rounded-2xl px-2 ${
          on ? 'text-slate-900' : 'text-slate-400'
        }`
      }}
    >
      {({ isActive }) => {
        const on = typeof active === 'boolean' ? active : isActive
        return (
          <>
            <div
              className={`flex h-7 w-12 items-center justify-center rounded-2xl transition ${
                on ? 'bg-slate-900/5' : 'group-hover:bg-slate-900/5'
              }`}
            >
              {icon}
            </div>
            <div className={`text-[11px] font-semibold tracking-tight ${on ? 'text-slate-900' : 'text-slate-400'}`}>{label}</div>
            <div
              className={`absolute bottom-0 h-1 w-10 rounded-full bg-slate-900 transition-opacity ${
                on ? 'opacity-100' : 'opacity-0'
              }`}
              aria-hidden="true"
            />
          </>
        )
      }}
    </NavLink>
  )
}
