import { addMonths, format, parseISO } from 'date-fns'
import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { monthGridDays, todayYmd } from '../lib/dates'
import { formatMinutes } from '../lib/time'
import { Button, Card, CardHeader, Select } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'

export function CalendarView() {
  const navigate = useNavigate()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const addTask = usePlannerStore((s) => s.addTask)

  const [month, setMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const { days, currentMonth } = useMemo(() => monthGridDays(month), [month])

  const scopedTasks = useMemo(() => tasks.filter((t) => t.examId === activeExamId && t.date), [tasks, activeExamId])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of scopedTasks) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return map
  }, [scopedTasks, tasks])

  const visibleSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const [quickSubjectId, setQuickSubjectId] = useState(() => visibleSubjects[0]?.id ?? '')

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title="Monthly Calendar View" subtitle="날짜 클릭 → Day Detail, 일정 클릭 → Task Detail" />
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
                className={`min-h-[108px] border-b border-r border-slate-100 p-2 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'} ${
                  isToday ? 'ring-1 ring-slate-300' : ''
                }`}
              >
                <button className="flex w-full items-center justify-between gap-1" onClick={() => navigate(`/day/${ymd}`)}>
                  <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                    {Number(ymd.slice(8, 10))}
                  </div>
                  <div className="text-[11px] text-slate-400 md:hidden">보기</div>
                </button>

                <div className="mt-1 flex flex-col gap-1">
                  {visible.map((t) => {
                    const sub = subjects.find((s) => s.id === t.subjectId)
                    return (
                      <Link
                        key={t.id}
                        to={`/task/${t.id}`}
                        className="rounded-lg border border-slate-100 bg-slate-50 px-2 py-1 text-left text-[11px] text-slate-800 hover:bg-slate-100"
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

                <div className="mt-2 flex items-center gap-1">
                  <div className="hidden flex-1 md:block">
                    <Select value={quickSubjectId} onChange={setQuickSubjectId}>
                      {visibleSubjects.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const subjectId = quickSubjectId || visibleSubjects[0]?.id || subjects[0]?.id
                      if (!subjectId) {
                        navigate('/subjects')
                        return
                      }
                      const id = addTask({ subjectId, title: '공부', date: ymd, plannedMinutes: 60, examId: activeExamId })
                      navigate(`/task/${id}`)
                    }}
                  >
                    + 일정
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
