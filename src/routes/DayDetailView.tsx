import { format } from 'date-fns'
import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ymdToDate } from '../lib/dates'
import { formatMinutes } from '../lib/time'
import { Button, Card, CardHeader } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'

function taskSortKey(t: { startTime?: string; createdAt: string }) {
  return t.startTime ? `0_${t.startTime}` : `1_${t.createdAt}`
}

export function DayDetailView() {
  const navigate = useNavigate()
  const params = useParams()
  const date = params.date ?? ''
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const allTasks = usePlannerStore((s) => s.tasks)
  const tasks = useMemo(() => allTasks.filter((t) => t.examId === activeExamId && t.date === date), [allTasks, activeExamId, date])
  const addTask = usePlannerStore((s) => s.addTask)

  const { completed, pending } = useMemo(() => {
    const sorted = tasks.slice().sort((a, b) => taskSortKey(a).localeCompare(taskSortKey(b)))
    return { completed: sorted.filter((t) => t.status === 'completed'), pending: sorted.filter((t) => t.status !== 'completed') }
  }, [tasks])

  const title = date ? format(ymdToDate(date), 'yyyy년 M월 d일') : 'Day Detail'

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title={title} subtitle="시작시간 있는 일정 → 시작시간 없는 미완수 순" />
        <div className="flex items-center justify-between px-4 py-3">
          <Button variant="secondary" onClick={() => navigate('/calendar')}>
            ← 캘린더
          </Button>
          <Button
            onClick={() => {
              const subjectId = subjects[0]?.id
              if (!subjectId || !date) {
                navigate('/subjects')
                return
              }
              const id = addTask({ subjectId, title: '공부', date, plannedMinutes: 60, examId: activeExamId })
              navigate(`/task/${id}`)
            }}
          >
            + 일정 추가
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="완료" />
        <div className="divide-y divide-slate-100">
          {completed.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">완료된 일정이 없어요.</div> : null}
          {completed.map((t) => {
            const subject = subjects.find((s) => s.id === t.subjectId)
            const variance = (t.actualMinutes ?? 0) - t.plannedMinutes
            const varianceText = `${variance >= 0 ? '+' : ''}${variance}m`
            return (
              <Link key={t.id} to={`/task/${t.id}`} className="block px-4 py-3 hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: subject?.color ?? '#94a3b8' }} />
                      <div className="truncate text-sm font-semibold text-slate-900">{t.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {t.startTime} - {t.endTime} · {subject?.name ?? '과목'}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs text-slate-600">
                      목표 {formatMinutes(t.plannedMinutes)} / 실제 {formatMinutes(t.actualMinutes ?? 0)}
                    </div>
                    <div className={`text-xs font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {varianceText}
                    </div>
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
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: subject?.color ?? '#94a3b8' }} />
                      <div className="truncate text-sm font-semibold text-slate-900">{t.title}</div>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">{subject?.name ?? '과목'}</div>
                  </div>
                  <div className="shrink-0 text-xs text-slate-600">목표 {formatMinutes(t.plannedMinutes)}</div>
                </div>
              </Link>
            )
          })}
        </div>
      </Card>
    </div>
  )
}
