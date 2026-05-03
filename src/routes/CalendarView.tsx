import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { monthGridDays, todayYmd } from '../lib/dates'
import { formatHmsFromSeconds } from '../lib/time'
import { Button, Card, CardHeader } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'

export function CalendarView() {
  const navigate = useNavigate()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const today = useMemo(() => parseISO(todayYmd()), [])

  const colorToRgba = (color: string, alpha: number) => {
    const raw = color.trim()
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      const r = parseInt(hex[0] + hex[0], 16)
      const g = parseInt(hex[1] + hex[1], 16)
      const b = parseInt(hex[2] + hex[2], 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) {
      const r = parseInt(hex.slice(0, 2), 16)
      const g = parseInt(hex.slice(2, 4), 16)
      const b = parseInt(hex.slice(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }
    return raw
  }

  const formatDday = (dueDate?: string) => {
    if (!dueDate) return null
    const end = parseISO(dueDate)
    const diffDays = differenceInCalendarDays(end, today) // due - today
    if (diffDays === 0) return 'D-Day'
    return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
  }

  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const { days, currentMonth } = useMemo(() => monthGridDays(month), [month])
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

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
  const unassignedPending = useMemo(
    () =>
      tasks
        .filter((t) => t.examId === activeExamId && !t.date && t.status !== 'completed')
        .slice()
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    [tasks, activeExamId],
  )

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of scopedTasks) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return map
  }, [scopedTasks])

  // 일정 추가는 캘린더에서 하지 않고, 대시보드/과목 디테일에서 생성 후 날짜 배치하도록 유도

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar
        title=""
        left={
          <Button
            variant="secondary"
            onClick={() => setMonth(format(addMonths(parseISO(`${month}-01`), -1), 'yyyy-MM'))}
          >
            이전
          </Button>
        }
        center={
          <div className="flex items-center justify-center gap-2">
            <div className="text-sm font-semibold text-slate-900">{month}</div>
            <Button variant="secondary" onClick={() => setMonth(format(new Date(), 'yyyy-MM'))}>
              오늘
            </Button>
          </div>
        }
        right={
          <Button variant="secondary" onClick={() => setMonth(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))}>
            다음
          </Button>
        }
      />
      <Card>
        <CardHeader title="캘린더" subtitle={examCountdown ? `시험일 ${examCountdown.examDate} · ${examCountdown.dday}` : undefined} />
        <div className="hidden items-center justify-between gap-2 px-4 py-3 md:flex">
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              onClick={() => setMonth(format(addMonths(parseISO(`${month}-01`), -1), 'yyyy-MM'))}
            >
              이전
            </Button>
            <div className="text-sm font-semibold text-slate-900">{month}</div>
            <Button
              variant="secondary"
              onClick={() => setMonth(format(addMonths(parseISO(`${month}-01`), 1), 'yyyy-MM'))}
            >
              다음
            </Button>
          </div>
          <Button variant="secondary" onClick={() => setMonth(format(new Date(), 'yyyy-MM'))}>
            오늘
          </Button>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-600">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
            <div key={d} className="px-1 py-2 md:px-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((ymd) => {
            const dayMonth = ymd.slice(0, 7)
            const isCurrentMonth = dayMonth === currentMonth
            const isToday = ymd === todayYmd()
            const cellTasks = (tasksByDate.get(ymd) ?? []).slice().sort((a, b) => a.createdAt.localeCompare(b.createdAt))
            const visible = cellTasks.slice(0, 2)
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
                className={`min-h-[92px] cursor-pointer border-b border-r border-slate-100 p-1.5 md:min-h-[108px] md:p-2 ${
                  isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                } ${
                  isToday ? 'ring-1 ring-slate-300' : ''
                } ${dragOverDate === ymd ? 'outline outline-2 outline-slate-400' : ''}`}
                aria-label={`${ymd} 일간 기록 보기`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                    {Number(ymd.slice(8, 10))}
                  </div>
                </div>

                <div className="mt-1 flex flex-col gap-1">
                  {visible.map((t) => {
                    const sub = subjects.find((s) => s.id === t.subjectId)
                    const dday = formatDday(t.dueDate)
                    return (
                      <Link
                        key={t.id}
                        to={`/task/${t.id}`}
                        onClick={(e) => e.stopPropagation()}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/emma-task-id', t.id)
                          e.dataTransfer.effectAllowed = 'move'
                        }}
                        onDragEnd={() => setDragOverDate(null)}
                        className="-mx-1.5 block border border-slate-200 px-1.5 py-1 text-left text-[10px] leading-snug text-slate-900 hover:brightness-95 active:cursor-grabbing md:-mx-2 md:px-2"
                        style={{
                          background: colorToRgba(sub?.color ?? '#94a3b8', 0.18),
                          borderColor: colorToRgba(sub?.color ?? '#94a3b8', 0.35),
                        }}
                      >
                        <div className="flex items-center gap-1">
                          <span className="line-clamp-2 break-words">{t.title}</span>
                        </div>
                        <div className="mt-0.5 flex items-center justify-between gap-2 text-[9px] text-slate-600">
                          <span className="hidden md:block">목표 {formatHmsFromSeconds(t.plannedSeconds)}</span>
                          {dday ? <span className="font-semibold text-slate-600">{dday}</span> : null}
                        </div>
                      </Link>
                    )
                  })}
                  {more > 0 ? <div className="text-[11px] text-slate-400">+{more}</div> : null}
                </div>

                {/* 캘린더에서는 일정 생성 UI를 제공하지 않음 */}
              </div>
            )
          })}
        </div>
      </Card>

      <Card>
        <CardHeader title="미할당 미완료 일정" subtitle="드래그해서 달력 날짜 칸에 놓으면 배치됩니다." />
        <div
          className="px-4 py-3"
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
          {unassignedPending.length === 0 ? (
            <div className="text-sm text-slate-500">미할당 미완료 일정이 없어요.</div>
          ) : (
            <div
              className={`flex flex-wrap gap-2 rounded-2xl ${dragOverDate === '__unassigned__' ? 'outline outline-2 outline-slate-400' : ''}`}
            >
              {unassignedPending.map((t) => {
                const sub = subjects.find((s) => s.id === t.subjectId)
                return (
                  <Link
                    key={t.id}
                    to={`/task/${t.id}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/emma-task-id', t.id)
                      e.dataTransfer.effectAllowed = 'move'
                    }}
                    onDragEnd={() => setDragOverDate(null)}
                    className="inline-flex items-center gap-2 rounded-full border px-3 py-2 text-[12px] text-slate-900 shadow-sm hover:brightness-95 active:cursor-grabbing"
                    style={{
                      background: colorToRgba(sub?.color ?? '#94a3b8', 0.18),
                      borderColor: colorToRgba(sub?.color ?? '#94a3b8', 0.35),
                    }}
                    title="드래그해서 날짜에 배치"
                  >
                    <span className="max-w-[220px] truncate">{t.title}</span>
                    <span className="text-[11px] text-slate-700">({formatHmsFromSeconds(t.plannedSeconds)})</span>
                  </Link>
                )
              })}
            </div>
          )}
          <div className="mt-2 text-[11px] text-slate-500">배치된 일정도 여기로 드롭하면 미할당으로 돌아갑니다.</div>
        </div>
      </Card>
    </div>
  )
}
