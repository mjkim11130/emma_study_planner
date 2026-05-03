import { addMonths, differenceInCalendarDays, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { monthGridDays, todayYmd } from '../lib/dates'
import { formatMinutes } from '../lib/time'
import { Button, Card, CardHeader } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'

export function CalendarView() {
  const navigate = useNavigate()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const updateTask = usePlannerStore((s) => s.updateTask)

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
  }, [scopedTasks, tasks])

  // 일정 추가는 캘린더에서 하지 않고, 대시보드/과목 디테일에서 생성 후 날짜 배치하도록 유도

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader
          title="Monthly Calendar View"
          subtitle={
            examCountdown
              ? `시험일 ${examCountdown.examDate} · ${examCountdown.dday} · 남은 ${examCountdown.weeksLeft}주`
              : '날짜 클릭 → Day Detail, 일정 클릭 → Task Detail'
          }
        />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
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
            <div key={d} className="px-2 py-2">
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
                className={`min-h-[108px] cursor-pointer border-b border-r border-slate-100 p-2 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'} ${
                  isToday ? 'ring-1 ring-slate-300' : ''
                } ${dragOverDate === ymd ? 'outline outline-2 outline-slate-400' : ''}`}
                aria-label={`${ymd} 일간 기록 보기`}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                    {Number(ymd.slice(8, 10))}
                  </div>
                  <div className="text-[11px] text-slate-400 md:hidden">Day</div>
                </div>

                <div className="mt-1 flex flex-col gap-1">
                  {visible.map((t) => {
                    const sub = subjects.find((s) => s.id === t.subjectId)
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
                        className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-left text-[11px] text-slate-800 hover:bg-slate-100 active:cursor-grabbing"
                      >
                        <div className="flex items-center gap-1">
                          <span className="h-2 w-2 rounded-full" style={{ background: sub?.color ?? '#94a3b8' }} />
                          <span className="truncate">{t.title}</span>
                        </div>
                        <div className="mt-0.5 hidden text-[10px] text-slate-500 md:block">목표 {formatMinutes(t.plannedMinutes)}</div>
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
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm hover:bg-slate-50 active:cursor-grabbing"
                    title="드래그해서 날짜에 배치"
                  >
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: sub?.color ?? '#94a3b8' }} />
                    <span className="max-w-[220px] truncate">{t.title}</span>
                    <span className="text-[11px] text-slate-500">({formatMinutes(t.plannedMinutes)})</span>
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
