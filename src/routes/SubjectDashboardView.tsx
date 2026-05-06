import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Input, Select } from '../components/ui'
import { formatHmsFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'
import { useTaskDialog } from '../components/TaskDialogContext'

type Tab = 'all' | 'completed' | 'pending'

export function SubjectDashboardView() {
  const navigate = useNavigate()
  const params = useParams()
  const subjects = usePlannerStore((s) => s.subjects)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const allTasks = usePlannerStore((s) => s.tasks)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const { openTaskAdd, openTaskPreview } = useTaskDialog()
  const subjectIdFromRoute = params.subjectId ?? ''

  const createTaskAndClose = (input: { subjectId?: string; date?: string; plannedSeconds?: number }) => {
    const fallbackSubjectId =
      input.subjectId ??
      ((lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
        subjects.find((s) => s.examId === activeExamId)?.id ??
        subjects[0]?.id ??
        '')
    if (!fallbackSubjectId) return
    openTaskAdd({ date: input.date, subjectId: fallbackSubjectId })
  }

  if (!subjectIdFromRoute) {
    return (
      <AllSubjectsDashboard
        subjects={subjects}
        allTasks={allTasks}
        activeExamId={activeExamId}
        onCreateTask={(input) => createTaskAndClose(input)}
        onOpenSubject={(id) => navigate(`/dashboard/${id}`)}
        onOpenTask={(id) => openTaskPreview(id)}
        onManageSubjects={() => navigate('/subjects')}
      />
    )
  }

  return (
    <SingleSubjectDashboard
      subjectId={subjectIdFromRoute}
      subjects={subjects}
      allTasks={allTasks}
      activeExamId={activeExamId}
      onNavigate={(path) => navigate(path)}
      onCreateTask={(input) => createTaskAndClose(input)}
      onOpenTask={(id) => openTaskPreview(id)}
      onManageSubjects={() => navigate('/subjects')}
    />
  )
}

function AllSubjectsDashboard({
  subjects,
  allTasks,
  activeExamId,
  onCreateTask,
  onOpenSubject,
  onOpenTask,
  onManageSubjects,
}: {
  subjects: { id: string; examId: string; name: string; color: string }[]
  allTasks: {
    id: string
    examId: string
    subjectId: string
    plannedSeconds: number
    plannedStartTime?: string
    actualSeconds?: number
    actualStartTime?: string
    status: string
    date: string
    title: string
  }[]
  activeExamId: string
  onCreateTask: (input: { subjectId: string; title: string; date?: string; plannedSeconds: number }) => void
  onOpenSubject: (subjectId: string) => void
  onOpenTask: (taskId: string) => void
  onManageSubjects: () => void
}) {
  const [date, setDate] = useState('')
  const [title, setTitle] = useState('공부')
  const [planned, setPlanned] = useState(60)
  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const [subjectId, setSubjectId] = useState(() => scopedSubjects[0]?.id ?? subjects[0]?.id ?? '')

  const subjectStats = useMemo(() => {
    return scopedSubjects.map((s) => {
      const tasks = allTasks.filter((t) => t.examId === activeExamId && t.subjectId === s.id)
      const totalPlanned = tasks.reduce((acc, t) => acc + t.plannedSeconds, 0)
      const totalActual = tasks.reduce((acc, t) => acc + (t.actualSeconds ?? 0), 0)
      const completedCount = tasks.filter((t) => t.status === 'completed').length
      const completionRate = tasks.length === 0 ? 0 : Math.round((completedCount / tasks.length) * 100)
      const sortedTasks = tasks
        .slice()
        .sort((a, b) => {
          const ak = `${a.date || '9999-99-99'}_${a.actualStartTime ?? a.plannedStartTime ?? '99:99'}_${a.title}`
          const bk = `${b.date || '9999-99-99'}_${b.actualStartTime ?? b.plannedStartTime ?? '99:99'}_${b.title}`
          return ak.localeCompare(bk)
        })
      return {
        subject: s,
        tasks,
        sortedTasks,
        totalPlanned,
        totalActual,
        variance: totalActual - totalPlanned,
        completionRate,
      }
    })
  }, [subjects, allTasks])

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar
        title="과목별"
        right={
          <Button variant="secondary" onClick={onManageSubjects}>
            과목관리
          </Button>
        }
      />
      <Card>
        <CardHeader title="과목별" />
        <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[220px_1fr_140px_120px_120px]">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">과목</div>
            <Select value={subjectId} onChange={setSubjectId}>
              {scopedSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">일정명</div>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">날짜</div>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
            <div className="mt-1 text-[11px] text-slate-500">비워두면 “미배치”로 생성됩니다.</div>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">계획(분)</div>
            <input
              type="number"
              min={0}
              value={planned}
              onChange={(e) => setPlanned(Math.max(0, Math.floor(Number(e.target.value))))}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>
          <div className="flex items-end">
            <Button
              onClick={() => {
                if (!subjectId) return
                const d = date.trim() ? date : undefined
                onCreateTask({ subjectId, title, date: d, plannedSeconds: planned * 60 })
              }}
            >
              + 일정 추가
            </Button>
          </div>
        </div>
        <div className="px-4 pb-4 text-xs text-slate-500">
          날짜를 입력하면 캘린더(`/calendar`)에 자동 배치되고, 비워두면 Task Detail에서 날짜를 지정할 때까지 미배치로 남습니다.
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {subjectStats.map((s) => (
          <Card key={s.subject.id}>
            <div className="flex items-center justify-between px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: s.subject.color }} />
                  <div className="truncate text-sm font-semibold text-slate-900">{s.subject.name}</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">{s.tasks.length}개 일정</div>
              </div>
              <Button variant="secondary" onClick={() => onOpenSubject(s.subject.id)}>
                자세히
              </Button>
            </div>
            <div className="grid grid-cols-2 gap-2 px-4 pb-4 md:grid-cols-4">
              <Metric label="총 계획" value={formatHmsFromSeconds(s.totalPlanned)} />
              <Metric label="총 실제" value={formatHmsFromSeconds(s.totalActual)} />
              <Metric
                label="차이"
                value={`${s.variance >= 0 ? '+' : '-'}${formatHmsFromSeconds(Math.abs(s.variance))}`}
                tone={s.variance >= 0 ? 'good' : 'bad'}
              />
              <Metric label="완료율" value={`${s.completionRate}%`} />
            </div>
            <div className="border-t border-slate-100 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="text-xs font-semibold text-slate-700">일정 리스트</div>
                <div className="text-[11px] text-slate-500">최대 5개</div>
              </div>
              <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-100 bg-white">
                {s.sortedTasks.length === 0 ? (
                  <div className="px-3 py-3 text-sm text-slate-500">일정이 없어요.</div>
                ) : (
                  s.sortedTasks.slice(0, 5).map((t) => (
                    <button key={t.id} type="button" onClick={() => onOpenTask(t.id)} className="block w-full px-3 py-2 text-left hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-medium text-slate-900">{t.title}</div>
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {t.date ? t.date : '미배치'}
                            {t.actualStartTime || t.plannedStartTime ? ` · ${t.actualStartTime ?? t.plannedStartTime}` : ''} · 계획 {formatHmsFromSeconds(t.plannedSeconds)} ·{' '}
                            {t.status === 'completed' ? '완료' : '미완료'}
                          </div>
                        </div>
                        {t.actualSeconds !== undefined ? (
                          <div className="shrink-0 text-[11px] font-semibold text-slate-700">
                            실제 {formatHmsFromSeconds(t.actualSeconds)}
                          </div>
                        ) : null}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  )
}

function SingleSubjectDashboard({
  subjectId,
  subjects,
  allTasks,
  activeExamId,
  onNavigate,
  onCreateTask,
  onOpenTask,
  onManageSubjects,
}: {
  subjectId: string
  subjects: { id: string; examId: string; name: string; color: string }[]
  allTasks: {
    id: string
    examId: string
    subjectId: string
    plannedSeconds: number
    plannedStartTime?: string
    actualSeconds?: number
    actualStartTime?: string
    status: string
    date: string
    title: string
  }[]
  activeExamId: string
  onNavigate: (path: string) => void
  onCreateTask: (input: { subjectId: string; title: string; date?: string; plannedSeconds: number }) => void
  onOpenTask: (taskId: string) => void
  onManageSubjects: () => void
}) {
  const [tab, setTab] = useState<Tab>('all')
  const subject = subjects.find((x) => x.id === subjectId)
  const tasksForActiveExam = useMemo(
    () => allTasks.filter((t) => t.examId === activeExamId && t.subjectId === subjectId),
    [allTasks, activeExamId, subjectId],
  )

  const stats = useMemo(() => {
    const totalPlanned = tasksForActiveExam.reduce((acc, t) => acc + t.plannedSeconds, 0)
    const totalActual = tasksForActiveExam.reduce((acc, t) => acc + (t.actualSeconds ?? 0), 0)
    const completedCount = tasksForActiveExam.filter((t) => t.status === 'completed').length
    const completionRate = tasksForActiveExam.length === 0 ? 0 : Math.round((completedCount / tasksForActiveExam.length) * 100)
    return {
      totalPlanned,
      totalActual,
      variance: totalActual - totalPlanned,
      completedCount,
      completionRate,
      count: tasksForActiveExam.length,
    }
  }, [tasksForActiveExam])

  const [newTitle, setNewTitle] = useState('공부')
  const [newDate, setNewDate] = useState('')
  const [newPlanned, setNewPlanned] = useState('60')
  const [createdToast, setCreatedToast] = useState(false)

  const filtered = useMemo(() => {
    const sorted = tasksForActiveExam
      .slice()
      .sort((a, b) =>
        (a.date + (a.actualStartTime ?? a.plannedStartTime ?? '99:99')).localeCompare(b.date + (b.actualStartTime ?? b.plannedStartTime ?? '99:99')),
      )
    if (tab === 'completed') return sorted.filter((t) => t.status === 'completed')
    if (tab === 'pending') return sorted.filter((t) => t.status !== 'completed')
    return sorted
  }, [tasksForActiveExam, tab])

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar title="과목별" right={<Button variant="secondary" onClick={onManageSubjects}>과목관리</Button>} />
      <Card>
        <CardHeader title="과목별" />
        <div className="grid grid-cols-1 gap-3 px-4 py-3 md:grid-cols-[1fr_260px]">
          <div className="flex flex-col gap-2">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_200px]">
              <Select value={subjectId} onChange={(v) => onNavigate(`/dashboard/${v}`)}>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
              <div className="grid grid-cols-3 gap-2">
                <Button variant={tab === 'all' ? 'primary' : 'secondary'} onClick={() => setTab('all')}>
                  전체
                </Button>
                <Button variant={tab === 'completed' ? 'primary' : 'secondary'} onClick={() => setTab('completed')}>
                  완료
                </Button>
                <Button variant={tab === 'pending' ? 'primary' : 'secondary'} onClick={() => setTab('pending')}>
                  미완료
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <Metric label="총 계획" value={formatHmsFromSeconds(stats.totalPlanned)} />
              <Metric label="총 실제" value={formatHmsFromSeconds(stats.totalActual)} />
              <Metric
                label="차이"
                value={`${stats.variance >= 0 ? '+' : '-'}${formatHmsFromSeconds(Math.abs(stats.variance))}`}
                tone={stats.variance >= 0 ? 'good' : 'bad'}
              />
              <Metric label="완료율" value={`${stats.completionRate}%`} />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-3">
              <div className="text-xs font-semibold text-slate-700">이 과목에 일정 추가</div>
              <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_120px_120px]">
                <Input value={newTitle} onChange={setNewTitle} placeholder="일정명" />
                <Input value={newDate} onChange={setNewDate} type="date" />
                <Input value={newPlanned} onChange={setNewPlanned} type="number" />
                <Button
                  onClick={() => {
                    const plannedMinutes = Math.max(0, Math.floor(Number(newPlanned || 0)))
                    onCreateTask({
                      subjectId,
                      title: newTitle.trim() || '공부',
                      date: newDate.trim() ? newDate : undefined,
                      plannedSeconds: plannedMinutes * 60,
                    })
                    setCreatedToast(true)
                    window.setTimeout(() => setCreatedToast(false), 1600)
                  }}
                >
                  추가
                </Button>
              </div>
              <div className="mt-1 text-[11px] text-slate-500">날짜는 비워두면 미배치로 생성됩니다.</div>
            </div>
          </div>

          <div className="h-44">
            <CompletionDonut
              percent={stats.completionRate}
              color={subject?.color ?? '#16a34a'}
              caption={`${stats.completedCount}/${stats.count}`}
            />
          </div>
        </div>
      </Card>

      {createdToast ? (
        <div className="pointer-events-none fixed left-1/2 top-3 z-50 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          일정이 추가됐어요.
        </div>
      ) : null}

      <Card>
        <CardHeader title={`${subject?.name ?? '과목'} 일정`} subtitle={`${filtered.length}개`} />
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">일정이 없어요.</div> : null}
          {filtered.map((t) => {
            const variance = (t.actualSeconds ?? 0) - t.plannedSeconds
            return (
              <button key={t.id} type="button" onClick={() => onOpenTask(t.id)} className="block w-full px-4 py-3 text-left hover:bg-slate-50">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">
                      {t.date} · {t.title}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      계획 {formatHmsFromSeconds(t.plannedSeconds)}
                      {t.actualSeconds !== undefined ? ` / 실제 ${formatHmsFromSeconds(t.actualSeconds)}` : ''} ·{' '}
                      {t.status === 'completed' ? '완료' : '미완료'}
                    </div>
                  </div>
                  {t.actualSeconds !== undefined ? (
                    <div className={`shrink-0 text-xs font-semibold ${variance >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {variance >= 0 ? '+' : '-'}
                      {formatHmsFromSeconds(Math.abs(variance))}
                    </div>
                  ) : null}
                </div>
              </button>
            )
          })}
        </div>
      </Card>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const valueClass = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}

function CompletionDonut({ percent, color, caption }: { percent: number; color: string; caption: string }) {
  const size = 176
  const stroke = 18
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, percent))
  const dash = (p / 100) * c
  const gap = c - dash

  return (
    <div className="flex h-full items-center justify-center">
      <div className="relative">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${gap}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div className="text-2xl font-bold text-slate-900">{p}%</div>
          <div className="mt-1 text-xs font-medium text-slate-500">{caption}</div>
        </div>
      </div>
    </div>
  )
}
