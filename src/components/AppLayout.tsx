import { createContext, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { usePlannerStore } from '../store/usePlannerStore'
import { formatDurationKoFromSeconds } from '../lib/time'
import { todayYmd } from '../lib/dates'
import { formatDday } from '../lib/dday'
import { Button } from './ui'
import { ConfirmDialogProvider, useConfirmDialog } from './ConfirmDialog'
import { TaskDialogContext, type TaskDialogAddCommitPayload } from './TaskDialogContext'
import { TaskDialog } from './TaskDialog'
import { SubjectDialog } from './SubjectDialog'
import { IconCalendarMonth, IconCalendarViewDay, IconCalendarWeek, IconPlus } from './NavIcons'
import { getTaskDragId, setTaskDragData, setTaskDragPreview, syncTaskDropEffect } from '../lib/taskDrag'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from './ContextMenu'
import { copyTaskToClipboard, getTaskClipboard, pasteTaskFromClipboard } from '../lib/taskClipboard'
import { useTouchContextMenu } from '../lib/useTouchContextMenu'

export const SidebarToggleContext = createContext<{ open: boolean; toggle: () => void } | null>(null)

function IconFolder() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
      <path d="M10 4l2 2h8c1.1 0 2 .9 2 2v10c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2h6z" fill="currentColor" />
    </svg>
  )
}

function IconSettings() {
  return (
    <svg viewBox="0 -960 960 960" className="h-5 w-5" aria-hidden="true">
      <path
        d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z"
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

function truncateText(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max)
}

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5 w-5">
      <path d="M5 7h14M5 12h14M5 17h14" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  )
}

function NavItem({
  to,
  label,
  icon,
  active,
  compact,
}: {
  to: string
  label: string
  icon: ReactNode
  active?: boolean
  compact?: boolean
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => {
        const on = typeof active === 'boolean' ? active : isActive
        if (compact) {
          return `flex h-11 w-full items-center gap-3 rounded-2xl px-3 text-sm font-semibold transition ${
            on ? 'bg-black/80 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
          }`
        }
        return `flex items-center gap-3 rounded-2xl px-3 py-2.5 text-sm font-semibold transition ${on ? 'bg-black/80 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'}`
      }}
      title={compact ? label : undefined}
      aria-label={compact ? label : undefined}
    >
      <span className="inline-flex h-6 w-6 items-center justify-center" aria-hidden="true">
        {icon}
      </span>
      {compact ? null : <span className="truncate">{label}</span>}
    </NavLink>
  )
}

export function AppLayout() {
  return (
    <ConfirmDialogProvider>
      <AppLayoutContent />
    </ConfirmDialogProvider>
  )
}

function AppLayoutContent() {
  const location = useLocation()
  const navigate = useNavigate()
  const { confirm } = useConfirmDialog()
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [hasBottomSafeArea, setHasBottomSafeArea] = useState(false)
  const hideBottom = false
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const subjectOrderByExam = usePlannerStore((s) => s.subjectOrderByExam)
  const setSubjectOrder = usePlannerStore((s) => s.setSubjectOrder)
  const tasks = usePlannerStore((s) => s.tasks)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const duplicateTask = usePlannerStore((s) => s.duplicateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const isCalendarPage = location.pathname === '/' || location.pathname.startsWith('/calendar')
  const isWeekPage = location.pathname.startsWith('/week')
  const isDayPage = location.pathname.startsWith('/day/')
  const isDashboardPage = location.pathname.startsWith('/dashboard')
  const dayPageMatch = /^\/day\/(\d{4}-\d{2}-\d{2})$/.exec(location.pathname)
  const dayPageDate = dayPageMatch?.[1] ?? ''
  const [taskDialogRequest, setTaskDialogRequest] = useState<
    | null
    | {
        mode: 'add'
        date?: string
        subjectId?: string
        plannedStartTime?: string
        plannedSeconds?: number
        initialContinuousMode?: boolean
        hideContinuousModeToggle?: boolean
        onCommit?: (payload: TaskDialogAddCommitPayload) => void
      }
    | { mode: 'preview'; taskId: string; autoEdit?: boolean; autoCloseAfterComplete?: boolean; autoTimer?: boolean }
  >(null)
  const [subjectDialogOpen, setSubjectDialogOpen] = useState(false)
  const [subjectDialogForTaskCreate, setSubjectDialogForTaskCreate] = useState(false)
  const [pendingTaskCreate, setPendingTaskCreate] = useState<null | { date?: string }>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const taskTouchContextMenu = useTouchContextMenu()
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

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const probe = document.createElement('div')
    probe.style.position = 'fixed'
    probe.style.left = '0'
    probe.style.bottom = '0'
    probe.style.visibility = 'hidden'
    probe.style.pointerEvents = 'none'
    probe.style.paddingBottom = 'env(safe-area-inset-bottom)'
    document.body.appendChild(probe)

    const measure = () => {
      const inset = Number.parseFloat(window.getComputedStyle(probe).paddingBottom || '0')
      setHasBottomSafeArea(inset > 0.5)
    }

    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)

    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
      probe.remove()
    }
  }, [])

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
      setSubjectDialogForTaskCreate(true)
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
      setSubjectDialogForTaskCreate(true)
      setSubjectDialogOpen(true)
      return
    }
    setTaskDialogRequest({ mode: 'add', subjectId: fallbackSubjectId, date })
  }

  const openTaskPreview = (taskId: string, opts?: { autoEdit?: boolean; autoCloseAfterComplete?: boolean; autoTimer?: boolean }) => {
    setTaskDialogRequest({ mode: 'preview', taskId, ...opts })
  }

  const openContextMenu = (e: ReactMouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }

  const buildSidebarTaskMenuItems = (taskId: string) => {
    const task = tasks.find((it) => it.id === taskId)
    if (!task) return null
    const subjectColor = subjects.find((s) => s.id === task.subjectId)?.color ?? '#94a3b8'
    const items: ContextMenuItem[] = [
      { key: 'timer', label: '타이머', onSelect: () => openTaskPreview(taskId, { autoTimer: true }) },
      { key: 'copy', label: '일정 복사', onSelect: () => copyTaskToClipboard(task) },
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
    ]
    return { items, header: { title: task.title || '제목 없음', color: subjectColor } }
  }

  const openSidebarTaskMenu = (e: ReactMouseEvent, taskId: string) => {
    const menu = buildSidebarTaskMenuItems(taskId)
    if (!menu) return
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, ...menu })
  }

  const openSidebarTaskMenuAt = (x: number, y: number, taskId: string) => {
    const menu = buildSidebarTaskMenuItems(taskId)
    if (!menu) return
    setContextMenu({ x, y, ...menu })
  }

  const openSidebarUnassignedMenu = (e: ReactMouseEvent) => {
    const items: ContextMenuItem[] = [{ key: 'add', label: '일정 추가', icon: <IconPlus className="h-4 w-4" />, onSelect: createTaskAndOpen }]
    if (getTaskClipboard()) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { date: '' })
        },
      })
    }
    openContextMenu(e, items)
  }

  const openSidebarDayUnscheduledMenu = (e: ReactMouseEvent) => {
    const items: ContextMenuItem[] = [
      { key: 'add', label: '일정 추가', icon: <IconPlus className="h-4 w-4" />, onSelect: () => createTaskAndOpenForDay(dayPageDate) },
    ]
    if (getTaskClipboard()) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { date: dayPageDate, plannedStartTime: undefined })
        },
      })
    }
    openContextMenu(e, items)
  }

  const openUnscheduledDay = () => {
    navigate('/day/unscheduled?view=planned')
  }

  useEffect(() => {
    const preventContextMenu = (e: MouseEvent) => {
      e.preventDefault()
    }
    window.addEventListener('contextmenu', preventContextMenu)
    return () => window.removeEventListener('contextmenu', preventContextMenu)
  }, [])

  const unassignedPending = useMemo(
    () => tasks.filter((t) => t.examId === activeExamId && t.status !== 'completed' && (!t.date || t.date === '')),
    [tasks, activeExamId],
  )

  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const scopedSubjectOrder = useMemo(() => subjectOrderByExam[activeExamId] ?? [], [subjectOrderByExam, activeExamId])
  const scopedSubjectsOrdered = useMemo(() => {
    const byId = new Map(scopedSubjects.map((s) => [s.id, s] as const))
    const out: typeof scopedSubjects = []
    const seen = new Set<string>()
    for (const id of scopedSubjectOrder) {
      const s = byId.get(id)
      if (!s) continue
      out.push(s)
      seen.add(id)
    }
    for (const s of scopedSubjects) if (!seen.has(s.id)) out.push(s)
    return out
  }, [scopedSubjects, scopedSubjectOrder])
  const subjectOrderIndex = useMemo(() => {
    const map = new Map<string, number>()
    scopedSubjectsOrdered.forEach((s, idx) => map.set(s.id, idx))
    return map
  }, [scopedSubjectsOrdered])

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
    groups.sort((a, b) => {
      const ai = subjectOrderIndex.get(a.subjectId) ?? 999999
      const bi = subjectOrderIndex.get(b.subjectId) ?? 999999
      if (ai !== bi) return ai - bi
      return b.newest.localeCompare(a.newest)
    })
    return groups
  }, [unassignedPending, subjectOrderIndex])

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
        <div
          className="h-full [--bottom-nav-h:72px]"
          style={{
            ['--bottom-nav-safe-gap' as string]: hasBottomSafeArea ? 'var(--ios-bottom-swipe-gap)' : '0px',
            ['--bottom-safe-inset' as string]: hasBottomSafeArea ? 'env(safe-area-inset-bottom)' : '0px',
            ['--bottom-overlay-offset' as string]: 'calc(var(--bottom-safe-inset, 0px) + var(--bottom-nav-safe-gap, 0px))',
          }}
        >
          <div
            className={`grid h-full w-full grid-cols-1 ${
              sidebarOpen ? 'md:grid-cols-[260px_1fr]' : 'md:grid-cols-[72px_1fr]'
            }`}
          >
            <aside className="hidden border-r border-slate-200 bg-white md:flex md:min-h-0 md:flex-col">
            <div className={sidebarOpen ? 'p-3' : 'p-2'}>
              <div className={sidebarOpen ? 'flex justify-end px-2 py-2' : 'px-1 py-1'}>
                <button
                  type="button"
                  onClick={() => setSidebarOpen((cur) => !cur)}
                  className={`inline-flex h-11 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 ${
                    sidebarOpen ? 'w-11' : 'w-full gap-3 px-3'
                  }`}
                  aria-label={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
                  title={sidebarOpen ? '사이드바 닫기' : '사이드바 열기'}
                >
                  <HamburgerIcon />
                </button>
              </div>

              <div className={sidebarOpen ? 'mt-3 flex flex-col gap-1.5' : 'mt-2 flex flex-col gap-1.5'}>
                <NavItem to="/" label="월간" icon={<IconCalendarMonth />} compact={!sidebarOpen} />
                <NavItem to="week" label="주간" icon={<IconCalendarWeek />} compact={!sidebarOpen} />
                <NavItem to={`/day/${todayYmd()}`} label="일간" icon={<IconCalendarViewDay />} active={isDayPage} compact={!sidebarOpen} />
                <NavItem to="dashboard" label="주제" icon={<IconFolder />} compact={!sidebarOpen} />
                <NavItem to="settings" label="설정" icon={<IconSettings />} compact={!sidebarOpen} />
              </div>
            </div>

            {sidebarOpen && (isCalendarPage || isWeekPage) ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openUnscheduledDay}
                      className="flex items-center gap-1.5 rounded-lg px-1 py-1 text-[12px] font-semibold text-slate-900 hover:bg-slate-50"
                      aria-label="날짜 미정 상세 보기"
                    >
                      <svg viewBox="0 -960 960 960" className="h-4 w-4 text-slate-800" aria-hidden="true">
                        <path
                          d="m388-212-56-56 92-92-92-92 56-56 92 92 92-92 56 56-92 92 92 92-56 56-92-92-92 92ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>날짜 미정</span>
                    </button>
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
                  onClick={(e) => {
                    const target = e.target as HTMLElement | null
                    if (target?.closest('button')) return
                    openUnscheduledDay()
                  }}
                  onContextMenu={openSidebarUnassignedMenu}
                  onDragOver={(e) => {
                    e.preventDefault()
                    syncTaskDropEffect(e)
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const taskId = getTaskDragId(e.dataTransfer)
                    if (!taskId) return
                    if (e.altKey) duplicateTask(taskId, { date: '' })
                    else updateTask(taskId, { date: '' })
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
                                      onClick={() => {
                                        if (taskTouchContextMenu.shouldIgnoreClick()) return
                                        openTaskPreview(t.id)
                                      }}
                                      onContextMenu={(e) => openSidebarTaskMenu(e, t.id)}
                                      draggable
                                      onDragStart={(e) => {
                                        setTaskDragData(e.dataTransfer, t.id)
                                        setTaskDragPreview(e.dataTransfer, e.currentTarget, e.clientX, e.clientY)
                                      }}
                                      {...taskTouchContextMenu.bind(`sidebar-unassigned:${t.id}`, ({ x, y }) => openSidebarTaskMenuAt(x, y, t.id))}
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

            {sidebarOpen && dayPageDate ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-900">
                      <svg viewBox="0 -960 960 960" className="h-4 w-4 text-slate-800" aria-hidden="true">
                        <path
                          d="M612-292 440-464v-216h80v184l148 148-56 56Zm-498-25q-13-29-21-60t-11-63h81q3 21 8.5 42t13.5 41l-71 40ZM82-520q3-32 11-63.5t22-60.5l70 40q-8 20-13.5 41t-8.5 43H82Zm165 366q-27-20-50-43.5T154-248l70-40q14 18 29.5 33.5T287-225l-40 71Zm-22-519-71-40q20-27 43-50t50-43l40 71q-17 14-32.5 29.5T225-673ZM440-82q-32-3-63.5-11T316-115l40-70q20 8 41 13.5t43 8.5v81Zm-84-693-40-70q29-14 60.5-22t63.5-11v81q-22 3-43 8.5T356-775ZM520-82v-81q22-3 43-8.5t41-13.5l40 70q-29 14-60.5 22T520-82Zm84-693q-20-8-41-13.5t-43-8.5v-81q32 3 63.5 11t60.5 22l-40 70Zm109 621-40-71q17-14 32.5-29.5T735-287l71 40q-20 27-43 50.5T713-154Zm22-519q-14-17-29.5-32.5T673-735l40-71q27 19 50 42t42 50l-70 41Zm62 153q-3-22-8.5-43T775-604l70-41q13 30 21.5 61.5T878-520h-81Zm48 204-70-40q8-20 13.5-41t8.5-43h81q-3 32-11 63.5T845-316Z"
                          fill="currentColor"
                        />
                      </svg>
                      <span>시간 미정</span>
                    </div>
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
                  onContextMenu={openSidebarDayUnscheduledMenu}
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
                        const groups = Array.from(bySubject.values()).sort((a, b) => {
                          const ai = subjectOrderIndex.get(a.subjectId) ?? 999999
                          const bi = subjectOrderIndex.get(b.subjectId) ?? 999999
                          if (ai !== bi) return ai - bi
                          return a.subjectName.localeCompare(b.subjectName)
                        })
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
                                        onClick={() => {
                                          if (taskTouchContextMenu.shouldIgnoreClick()) return
                                          openTaskPreview(t.id)
                                        }}
                                        onContextMenu={(e) => openSidebarTaskMenu(e, t.id)}
                                        draggable
                                        onDragStart={(e) => {
                                          setTaskDragData(e.dataTransfer, t.id)
                                          setTaskDragPreview(e.dataTransfer, e.currentTarget, e.clientX, e.clientY)
                                        }}
                                        {...taskTouchContextMenu.bind(`sidebar-day:${t.id}`, ({ x, y }) => openSidebarTaskMenuAt(x, y, t.id))}
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

            {sidebarOpen && isDashboardPage ? (
              <div className="mt-3 flex min-h-0 flex-1 flex-col bg-white">
                <div className="flex items-center justify-between px-3 py-2">
                  <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-900">
                    <svg viewBox="0 -960 960 960" className="h-4 w-4 text-slate-800" aria-hidden="true">
                      <path
                        d="M80-160v-280h360v280H80Zm0-360v-280h360v280H80Zm80-80h200v-120H160v120Zm560 440L520-360l56-56 104 103v-487h80v487l104-103 56 56-200 200Z"
                        fill="currentColor"
                      />
                    </svg>
                    <span>주제 순서</span>
                  </div>
                  <Button
                    variant="primary"
                    onClick={() => {
                      setPendingTaskCreate(null)
                      setSubjectDialogForTaskCreate(false)
                      setSubjectDialogOpen(true)
                    }}
                  >
                    + 주제 등록
                  </Button>
                </div>
                <div className="min-h-0 flex-1 border-t border-slate-100 p-2">
                  <div className="h-full min-h-0 overflow-y-auto overscroll-contain pr-1">
                    <div className="space-y-2">
                      {scopedSubjectsOrdered.map((s, idx) => (
                        <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-2.5 py-2">
                          <div className="min-w-0">
                            <div className="flex min-w-0 items-center gap-2">
                              <span className="h-4 w-2" style={{ background: s.color }} aria-hidden="true" />
                              <div className="min-w-0 truncate text-[12px] font-semibold text-slate-900">{s.name}</div>
                            </div>
                          </div>
                          <div className="flex shrink-0 items-center gap-1">
                            <button
                              type="button"
                              disabled={idx === 0}
                              onClick={() => {
                                const next = scopedSubjectsOrdered.map((x) => x.id)
                                ;[next[idx - 1], next[idx]] = [next[idx], next[idx - 1]]
                                setSubjectOrder(activeExamId, next)
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                              aria-label="위로"
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              disabled={idx === scopedSubjectsOrdered.length - 1}
                              onClick={() => {
                                const next = scopedSubjectsOrdered.map((x) => x.id)
                                ;[next[idx + 1], next[idx]] = [next[idx], next[idx + 1]]
                                setSubjectOrder(activeExamId, next)
                              }}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-30"
                              aria-label="아래로"
                            >
                              ↓
                            </button>
                          </div>
                        </div>
                      ))}
                      {scopedSubjectsOrdered.length === 0 ? <div className="px-1 py-2 text-xs text-slate-400">비어있음</div> : null}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
            </aside>
            <main className="min-h-0 overflow-auto px-0 py-0 pb-[calc(var(--bottom-nav-h)+var(--bottom-overlay-offset,0px))] md:p-3 md:pb-3">
              <Outlet />
            </main>
          </div>

          {!hideBottom ? (
            <div
              className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white shadow-[0_-12px_40px_rgba(15,23,42,0.08)] md:hidden"
            >
              <div style={{ paddingBottom: 'var(--bottom-overlay-offset, 0px)' }}>
                <div className="mx-auto grid max-w-xl grid-cols-5 px-2 pb-2 pt-2">
	                  <BottomNavItem
	                    to="/"
	                    label="월간"
	                    icon={
	                      <svg viewBox="0 -960 960 960" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M480-400q-17 0-28.5-11.5T440-440q0-17 11.5-28.5T480-480q17 0 28.5 11.5T520-440q0 17-11.5 28.5T480-400Zm-188.5-11.5Q280-423 280-440t11.5-28.5Q303-480 320-480t28.5 11.5Q360-457 360-440t-11.5 28.5Q337-400 320-400t-28.5-11.5ZM640-400q-17 0-28.5-11.5T600-440q0-17 11.5-28.5T640-480q17 0 28.5 11.5T680-440q0 17-11.5 28.5T640-400ZM480-240q-17 0-28.5-11.5T440-280q0-17 11.5-28.5T480-320q17 0 28.5 11.5T520-280q0 17-11.5 28.5T480-240Zm-188.5-11.5Q280-263 280-280t11.5-28.5Q303-320 320-320t28.5 11.5Q360-297 360-280t-11.5 28.5Q337-240 320-240t-28.5-11.5ZM640-240q-17 0-28.5-11.5T600-280q0-17 11.5-28.5T640-320q17 0 28.5 11.5T680-280q0 17-11.5 28.5T640-240ZM200-80q-33 0-56.5-23.5T120-160v-560q0-33 23.5-56.5T200-800h40v-80h80v80h320v-80h80v80h40q33 0 56.5 23.5T840-720v560q0 33-23.5 56.5T760-80H200Zm0-80h560v-400H200v400Z"
                          fill="currentColor"
                        />
                      </svg>
                    }
                  />
                  <BottomNavItem
                    to="week"
                    label="주간"
                    icon={
                      <svg viewBox="0 -960 960 960" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M160-160q-33 0-56.5-23.5T80-240v-480q0-33 23.5-56.5T160-800h640q33 0 56.5 23.5T880-720v480q0 33-23.5 56.5T800-160H160Zm0-360h160v-200H160v200Zm240 0h160v-200H400v200Zm240 0h160v-200H640v200ZM320-240v-200H160v200h160Zm80 0h160v-200H400v200Zm240 0h160v-200H640v200Z"
                          fill="currentColor"
                        />
                      </svg>
                    }
                  />
                  <BottomNavItem
                    to={`/day/${todayYmd()}`}
                    label="일간"
                    active={isDayPage}
                    icon={
                      <svg viewBox="0 -960 960 960" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="M200-280q-33 0-56.5-23.5T120-360v-240q0-33 23.5-56.5T200-680h560q33 0 56.5 23.5T840-600v240q0 33-23.5 56.5T760-280H200Zm-80-480v-80h720v80H120Zm0 640v-80h720v80H120Z"
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
                      <svg viewBox="0 -960 960 960" className="h-6 w-6" aria-hidden="true">
                        <path
                          d="m370-80-16-128q-13-5-24.5-12T307-235l-119 50L78-375l103-78q-1-7-1-13.5v-27q0-6.5 1-13.5L78-585l110-190 119 50q11-8 23-15t24-12l16-128h220l16 128q13 5 24.5 12t22.5 15l119-50 110 190-103 78q1 7 1 13.5v27q0 6.5-2 13.5l103 78-110 190-118-50q-11 8-23 15t-24 12L590-80H370Zm112-260q58 0 99-41t41-99q0-58-41-99t-99-41q-59 0-99.5 41T342-480q0 58 40.5 99t99.5 41Z"
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
          <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
        </div>
      </SidebarToggleContext.Provider>

        <SubjectDialog
          open={subjectDialogOpen}
          mode="add"
          onClose={() => {
            setSubjectDialogOpen(false)
            setPendingTaskCreate(null)
            setSubjectDialogForTaskCreate(false)
          }}
          onAfterAdd={(subjectId) => {
            const pending = pendingTaskCreate
            setSubjectDialogOpen(false)
            setPendingTaskCreate(null)
            if (subjectDialogForTaskCreate) setTaskDialogRequest({ mode: 'add', subjectId, date: pending?.date })
            setSubjectDialogForTaskCreate(false)
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
              className={`absolute bottom-0 h-1 w-10 rounded-full bg-black/80 transition-opacity ${
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
