import { addDays, differenceInCalendarDays, format, isSameDay, isValid, parseISO, startOfWeek } from 'date-fns'
import { ko } from 'date-fns/locale'
import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ContextMenu, type ContextMenuItem, type ContextMenuState } from '../components/ContextMenu'
import { useConfirmDialog } from '../components/ConfirmDialog'
import { MobileTopBar } from '../components/MobileTopBar'
import { IconCalendarMonth, IconCalendarViewDay, IconChecklist, IconPlus } from '../components/NavIcons'
import { Button } from '../components/ui'
import { todayYmd } from '../lib/dates'
import { useTaskDialog } from '../components/TaskDialogContext'
import { usePlannerStore } from '../store/usePlannerStore'
import type { StudyTask } from '../store/types'
import { getTaskDragId, setTaskDragData, setTaskDragPreview, syncTaskDropEffect } from '../lib/taskDrag'
import { copyTaskToClipboard, getTaskClipboard, pasteTaskFromClipboard } from '../lib/taskClipboard'
import { useTouchContextMenu } from '../lib/useTouchContextMenu'

function hmToMinutes(hm?: string | null) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  return h * 60 + mm
}

function normalizeHex(color: string) {
  const raw = color.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
  return raw
}

function pickReadableTextColor(bg: string) {
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

function isTaskCompleted(t: StudyTask) {
  const hasAnyRecord = Boolean(t.actualStartTime || t.actualEndTime || typeof t.actualSeconds === 'number')
  return t.status === 'completed' || hasAnyRecord
}

function weekOfMonthLabel(d: Date) {
  const weekStart = startOfWeek(d, { weekStartsOn: 1 })
  const weekIndex = Math.max(1, Math.floor((weekStart.getDate() - 1) / 7) + 1)
  return `${format(weekStart, 'M월')} ${weekIndex}주차`
}

function dayHeaderLabel(d: Date) {
  // e.g. "4 수"
  const dayNum = format(d, 'd')
  const dow = format(d, 'EEE', { locale: ko })
  return `${dayNum} ${dow}`
}

export function WeekView() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const weekStartParam = searchParams.get('weekStart') ?? ''

  const { openTaskAdd, openTaskPreview } = useTaskDialog()
  const { confirm } = useConfirmDialog()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const duplicateTask = usePlannerStore((s) => s.duplicateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)

  const weekStartDate = useMemo(() => {
    const parsed = weekStartParam ? parseISO(weekStartParam) : null
    const base = parsed && isValid(parsed) ? parsed : parseISO(todayYmd())
    return startOfWeek(base, { weekStartsOn: 1 })
  }, [weekStartParam])

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStartDate, i)), [weekStartDate])
  const ymds = useMemo(() => days.map((d) => format(d, 'yyyy-MM-dd')), [days])
  const today = useMemo(() => parseISO(todayYmd()), [])

  const subjectById = useMemo(() => new Map(subjects.filter((s) => s.examId === activeExamId).map((s) => [s.id, s] as const)), [subjects, activeExamId])

  const tasksByDate = useMemo(() => {
    const out = new Map<string, StudyTask[]>()
    for (const ymd of ymds) out.set(ymd, [])
    const unassigned: StudyTask[] = []
    for (const t of tasks) {
      if (t.examId !== activeExamId) continue
      const ymd = (t.date ?? '').trim()
      if (!ymd) {
        if (!isTaskCompleted(t)) unassigned.push(t)
        continue
      }
      const bucket = out.get(ymd)
      if (!bucket) continue
      bucket.push(t)
    }
    const sortKey = (t: StudyTask) => {
      const completed = isTaskCompleted(t)
      const time = t.plannedStartTime ?? ''
      const m = hmToMinutes(time)
      const timeKey = m === null ? 9999 : m
      return `${completed ? 1 : 0}_${String(timeKey).padStart(4, '0')}_${t.updatedAt || t.createdAt}`
    }
    for (const [ymd, bucket] of out) {
      bucket.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      out.set(ymd, bucket)
    }
    unassigned.sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
    return { out, unassigned }
  }, [tasks, ymds, activeExamId])

  const [dragOverKey, setDragOverKey] = useState<string | null>(null)
  const [flashTaskId, setFlashTaskId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const taskTouchContextMenu = useTouchContextMenu()
  const flashTask = (taskId: string) => {
    setFlashTaskId(taskId)
    window.setTimeout(() => {
      setFlashTaskId((cur) => (cur === taskId ? null : cur))
    }, 1200)
  }
  const openWeekTaskAdd = (input?: { date?: string; subjectId?: string; plannedStartTime?: string; plannedSeconds?: number }) => {
    openTaskAdd({
      ...input,
      onCommit: ({ taskId }) => {
        flashTask(taskId)
      },
    })
  }
  const openContextMenu = (e: ReactMouseEvent, items: ContextMenuItem[]) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, items })
  }
  const openContextMenuAt = (x: number, y: number, items: ContextMenuItem[]) => {
    setContextMenu({ x, y, items })
  }
  const touchLongPressRef = useRef<{
    timer: number | null
    armed: boolean
    keyId: string | null
    startX: number
    startY: number
    moved: boolean
  }>({ timer: null, armed: false, keyId: null, startX: 0, startY: 0, moved: false })
  const suppressTouchClickUntilRef = useRef(0)
  const suppressTouchClick = () => {
    suppressTouchClickUntilRef.current = Date.now() + 350
  }
  const shouldIgnoreTouchClick = () => Date.now() < suppressTouchClickUntilRef.current
  const setWeekStart = (d: Date) => {
    const next = format(startOfWeek(d, { weekStartsOn: 1 }), 'yyyy-MM-dd')
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev)
      p.set('weekStart', next)
      return p
    })
  }

  const openUnscheduledDay = () => {
    navigate('/day/unscheduled?view=planned')
  }

  useEffect(() => {
    // ensure param exists so prev/next works consistently
    if (!weekStartParam) setWeekStart(weekStartDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const title = weekOfMonthLabel(weekStartDate)

  const examCountdown = useMemo(() => {
    if (!activeExam?.examDate) return null
    const today = parseISO(todayYmd())
    const examDate = parseISO(activeExam.examDate)
    const diffDays = differenceInCalendarDays(examDate, today) // exam - today
    const dday = diffDays === 0 ? 'D-Day' : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
    const weeksLeft = diffDays > 0 ? Math.ceil(diffDays / 7) : 0
    return { dday, weeksLeft, examDate: activeExam.examDate }
  }, [activeExam])

  const examMetaLabel = useMemo(() => {
    if (!activeExam) return null
    if (!examCountdown) return activeExam.name?.trim() || null
    const name = activeExam.name?.trim() || '시즌'
    const weeksLeft = typeof examCountdown.weeksLeft === 'number' ? examCountdown.weeksLeft : null
    const weekLabel = weeksLeft !== null ? `${name} ${weeksLeft}주 전` : name
    return `${weekLabel} · ${examCountdown.dday}`
  }, [activeExam, examCountdown])

  const buildTaskMenuItems = (t: StudyTask) =>
    ({
      header: { title: t.title || '제목 없음', color: subjectById.get(t.subjectId)?.color ?? '#94a3b8' },
      items: [
      { key: 'timer', label: '타이머', onSelect: () => openTaskPreview(t.id, { autoTimer: true }) },
      { key: 'copy', label: '일정 복사', onSelect: () => copyTaskToClipboard(t) },
      { key: 'edit', label: '편집', onSelect: () => openTaskPreview(t.id, { autoEdit: true }) },
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
          deleteTask(t.id)
        },
      },
      ] satisfies ContextMenuItem[],
    })

  const openTaskMenu = (e: ReactMouseEvent, t: StudyTask) => {
    const menu = buildTaskMenuItems(t)
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, ...menu })
  }

  const openTaskMenuAt = (x: number, y: number, t: StudyTask) => {
    setContextMenu({ x, y, ...buildTaskMenuItems(t) })
  }

  const openDateMenu = (e: ReactMouseEvent, ymd: string) => {
    const items: ContextMenuItem[] = [{ key: 'add', label: '일정 추가', icon: <IconPlus className="h-4 w-4" />, onSelect: () => openWeekTaskAdd({ date: ymd }) }]
    if (getTaskClipboard()) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { date: ymd })
        },
      })
    }
    if (!ymd) {
      items.push({ key: 'planned', label: '날짜 미정 보기', icon: <IconChecklist className="h-4 w-4" />, onSelect: openUnscheduledDay })
    }
    if (ymd) {
      items.push(
        { key: 'month', label: '월간 캘린더 보기', icon: <IconCalendarMonth className="h-4 w-4" />, onSelect: () => navigate(`/?month=${encodeURIComponent(ymd.slice(0, 7))}`) },
        { key: 'timeline', label: '타임라인 보기', icon: <IconCalendarViewDay className="h-4 w-4" />, onSelect: () => navigate(`/day/${ymd}`) },
        { key: 'planned', label: '일일 계획 보기', icon: <IconChecklist className="h-4 w-4" />, onSelect: () => navigate(`/day/${ymd}?view=planned`) },
      )
    }
    openContextMenu(e, items)
  }

  const openDateMenuAt = (x: number, y: number, ymd: string) => {
    const items: ContextMenuItem[] = [{ key: 'add', label: '일정 추가', icon: <IconPlus className="h-4 w-4" />, onSelect: () => openWeekTaskAdd({ date: ymd }) }]
    if (getTaskClipboard()) {
      items.push({
        key: 'paste',
        label: '일정 붙여넣기',
        onSelect: () => {
          pasteTaskFromClipboard(addTask, { date: ymd })
        },
      })
    }
    if (!ymd) {
      items.push({ key: 'planned', label: '날짜 미정 보기', icon: <IconChecklist className="h-4 w-4" />, onSelect: openUnscheduledDay })
    }
    if (ymd) {
      items.push(
        { key: 'month', label: '월간 캘린더 보기', icon: <IconCalendarMonth className="h-4 w-4" />, onSelect: () => navigate(`/?month=${encodeURIComponent(ymd.slice(0, 7))}`) },
        { key: 'timeline', label: '타임라인 보기', icon: <IconCalendarViewDay className="h-4 w-4" />, onSelect: () => navigate(`/day/${ymd}`) },
        { key: 'planned', label: '일일 계획 보기', icon: <IconChecklist className="h-4 w-4" />, onSelect: () => navigate(`/day/${ymd}?view=planned`) },
      )
    }
    openContextMenuAt(x, y, items)
  }

  const renderTask = (t: StudyTask) => {
    const sub = subjectById.get(t.subjectId)
    const bg = sub?.color ?? '#e2e8f0'
    const onText = pickReadableTextColor(bg)
    const completed = isTaskCompleted(t)
    return (
      <button
        key={t.id}
        type="button"
        onClick={() => {
          if (taskTouchContextMenu.shouldIgnoreClick()) return
          openTaskPreview(t.id)
        }}
        draggable
        onDragStart={(e) => {
          setTaskDragData(e.dataTransfer, t.id)
          setTaskDragPreview(e.dataTransfer, e.currentTarget, e.clientX, e.clientY)
        }}
        onContextMenu={(e) => openTaskMenu(e, t)}
        {...taskTouchContextMenu.bind(`week-task:${t.id}`, ({ x, y }) => openTaskMenuAt(x, y, t))}
        data-task-card="true"
        className={`flex w-full select-none items-center gap-1 rounded-[4px] border border-black/10 px-1.5 py-1 text-left text-[11px] font-semibold leading-tight shadow-sm ${
          flashTaskId === t.id ? 'emma-flash-3' : ''
        }`}
        style={{ backgroundColor: bg, color: onText }}
      >
        <span className="min-w-0 flex-1 overflow-hidden whitespace-nowrap text-clip">{t.title || '제목 없음'}</span>
        {completed ? (
          <span className="shrink-0 tabular-nums opacity-95" aria-label="완료" title="완료">
            ✓
          </span>
        ) : null}
      </button>
    )
  }

  const Cell = ({
    keyId,
    header,
    tone,
    onAdd,
    onOpenDay,
    items,
    isToday,
    canOpenDay = true,
    onContextMenu,
  }: {
    keyId: string
    header: React.ReactNode
    tone?: 'muted'
    onAdd: () => void
    onOpenDay: () => void
    items: StudyTask[]
    isToday?: boolean
    canOpenDay?: boolean
    onContextMenu?: (e: ReactMouseEvent) => void
  }) => (
    <div
      className={`relative flex min-h-0 flex-col border border-slate-200 bg-white ${
        dragOverKey === keyId ? 'ring-2 ring-slate-400' : ''
      } ${tone === 'muted' ? 'bg-slate-50 saturate-[0.92]' : ''} ${canOpenDay ? 'cursor-pointer' : ''}`}
      onClick={(e) => {
        if (shouldIgnoreTouchClick()) return
        if (!canOpenDay) return
        const target = e.target as HTMLElement
        if (target.closest('[data-task-card="true"]') || target.closest('[data-cell-action="add"]')) return
        onOpenDay()
      }}
      onPointerDown={(e) => {
        if (e.pointerType !== 'touch') return
        const target = e.target as HTMLElement
        if (target.closest('[data-task-card="true"]') || target.closest('[data-cell-action="add"]')) return
        if (touchLongPressRef.current.timer) window.clearTimeout(touchLongPressRef.current.timer)
        touchLongPressRef.current.armed = false
        touchLongPressRef.current.keyId = keyId
        touchLongPressRef.current.startX = e.clientX
        touchLongPressRef.current.startY = e.clientY
        touchLongPressRef.current.moved = false
        touchLongPressRef.current.timer = window.setTimeout(() => {
          touchLongPressRef.current.timer = null
          touchLongPressRef.current.armed = true
        }, 420)
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch') return
        if (touchLongPressRef.current.keyId !== keyId) return
        const dx = e.clientX - touchLongPressRef.current.startX
        const dy = e.clientY - touchLongPressRef.current.startY
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return
        touchLongPressRef.current.moved = true
        if (touchLongPressRef.current.timer) window.clearTimeout(touchLongPressRef.current.timer)
        touchLongPressRef.current.timer = null
        touchLongPressRef.current.armed = false
      }}
      onPointerUp={(e) => {
        if (e.pointerType !== 'touch') return
        if (touchLongPressRef.current.timer) window.clearTimeout(touchLongPressRef.current.timer)
        const armed = touchLongPressRef.current.armed
        const moved = touchLongPressRef.current.moved
        touchLongPressRef.current.timer = null
        touchLongPressRef.current.armed = false
        touchLongPressRef.current.keyId = null
        if (moved || !armed) return
        suppressTouchClick()
        openDateMenuAt(e.clientX, e.clientY, keyId === '__unassigned__' ? '' : keyId)
      }}
      onPointerCancel={() => {
        if (touchLongPressRef.current.timer) window.clearTimeout(touchLongPressRef.current.timer)
        touchLongPressRef.current.timer = null
        touchLongPressRef.current.armed = false
        touchLongPressRef.current.keyId = null
      }}
      onDragOver={(e) => {
        e.preventDefault()
        syncTaskDropEffect(e)
        setDragOverKey(keyId)
      }}
      onDragLeave={() => setDragOverKey((cur) => (cur === keyId ? null : cur))}
      onDrop={(e) => {
        e.preventDefault()
        setDragOverKey(null)
        const taskId = getTaskDragId(e.dataTransfer)
        if (!taskId) return
        const nextDate = keyId === '__unassigned__' ? '' : keyId
        if (e.altKey) duplicateTask(taskId, { date: nextDate })
        else updateTask(taskId, { date: nextDate })
      }}
      onContextMenu={onContextMenu}
    >
      {isToday ? <div className="pointer-events-none absolute inset-0 z-10 border-2 border-slate-300" /> : null}
      <div
        className={`relative z-0 flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left ${
          tone === 'muted' ? 'bg-slate-50' : 'bg-white'
        }`}
      >
        <button
          type="button"
          onClick={onOpenDay}
          className={`min-w-0 text-left text-[12px] font-semibold ${
            tone === 'muted' ? 'text-slate-500' : 'text-slate-900'
          } ${canOpenDay ? '' : 'cursor-default'}`}
        >
          {header}
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onAdd()
          }}
          data-cell-action="add"
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
          aria-label="일정 추가"
        >
          +
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0 py-0.5">
        <div className="space-y-0.5">{items.map(renderTask)}</div>
      </div>
    </div>
  )

  return (
    <div className="flex h-[calc(100dvh-var(--bottom-nav-h,72px)-var(--bottom-overlay-offset,0px))] flex-col overflow-hidden">
      <MobileTopBar
        title=""
        center={
          <button
            type="button"
            onClick={() => {
              setWeekStart(today)
            }}
            className="flex w-full flex-col items-center justify-center gap-0.5 py-1.5 text-center"
            aria-label="이번 주로 이동"
          >
            <div className="block truncate text-sm font-semibold text-slate-900">{title}</div>
            {examMetaLabel ? (
              <div className="block truncate text-[11px] font-medium text-slate-600">{examMetaLabel}</div>
            ) : null}
          </button>
        }
        left={
          <Button
            variant="secondary"
            onClick={() => {
              setWeekStart(addDays(weekStartDate, -7))
            }}
          >
            이전
          </Button>
        }
        right={
          <Button
            variant="secondary"
            onClick={() => {
              setWeekStart(addDays(weekStartDate, 7))
            }}
          >
            다음
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-hidden px-0 py-0">
        <div
          className="grid h-full min-h-0 gap-0 overflow-hidden"
          style={{
            gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
            gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
            gridAutoFlow: 'row',
          }}
        >
          {(() => {
            // Explicit 4×2 layout:
            // Row1: 월~목, Row2: 금~일 + 날짜 미정
            const panels = [
              ...days.map((d) => {
                const ymd = format(d, 'yyyy-MM-dd')
                const bucket = tasksByDate.out.get(ymd) ?? []
                const isToday = isSameDay(d, today)
                const isSat = format(d, 'i') === '6'
                const isSun = format(d, 'i') === '7'
                const headerTone = isSun ? 'text-rose-600' : isSat ? 'text-blue-600' : 'text-slate-900'
                return (
                  <Cell
                    key={ymd}
                    keyId={ymd}
                    header={<span className={headerTone}>{dayHeaderLabel(d)}</span>}
                    onAdd={() => openWeekTaskAdd({ date: ymd })}
                    onOpenDay={() => navigate(`/day/${ymd}`)}
                    items={bucket}
                    isToday={isToday}
                    onContextMenu={(e) => openDateMenu(e, ymd)}
                  />
                )
              }),
              <Cell
                key="__unassigned__"
                keyId="__unassigned__"
                header={<span className="text-slate-500">날짜미정</span>}
                tone="muted"
                onAdd={() => openWeekTaskAdd({ date: '' })}
                onOpenDay={openUnscheduledDay}
                items={tasksByDate.unassigned}
                onContextMenu={(e) => openDateMenu(e, '')}
              />,
            ]
            // Keep exactly 8 cells even if something changes unexpectedly.
            while (panels.length < 8) {
              const k = `__empty__${panels.length}`
              panels.push(
                <div key={k} className="border border-slate-200 bg-white" aria-hidden="true" />
              )
            }
            return panels.slice(0, 8)
          })()}
        </div>
      </div>
      <ContextMenu menu={contextMenu} onClose={() => setContextMenu(null)} />
    </div>
  )
}
