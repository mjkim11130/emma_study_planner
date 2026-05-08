import { useMemo } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Input } from '../components/ui'
import { formatHmsFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'

export function ExamDetailView() {
  const navigate = useNavigate()
  const params = useParams()
  const examId = params.examId ?? ''

  const exam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === examId), [examId]))
  const exams = usePlannerStore((s) => s.exams)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)

  const setActiveExam = usePlannerStore((s) => s.setActiveExam)
  const updateExam = usePlannerStore((s) => s.updateExam)
  const setExamStatus = usePlannerStore((s) => s.setExamStatus)
  const deleteExam = usePlannerStore((s) => s.deleteExam)

  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === examId), [subjects, examId])
  const activeExamCount = useMemo(() => exams.filter((item) => item.status === 'active').length, [exams])
  const scopedSubjectIds = useMemo(() => new Set(scopedSubjects.map((s) => s.id)), [scopedSubjects])
  const scopedTasks = useMemo(() => tasks.filter((t) => t.examId === examId && scopedSubjectIds.has(t.subjectId)), [tasks, examId, scopedSubjectIds])

  const stats = useMemo(() => {
    const totalPlanned = scopedTasks.reduce((acc, t) => acc + t.plannedSeconds, 0)
    const totalActual = scopedTasks.reduce((acc, t) => acc + (t.actualSeconds ?? 0), 0)
    const completedCount = scopedTasks.filter((t) => t.status === 'completed').length
    const completionRate = scopedTasks.length === 0 ? 0 : Math.round((completedCount / scopedTasks.length) * 100)
    return { totalPlanned, totalActual, variance: totalActual - totalPlanned, completionRate, taskCount: scopedTasks.length }
  }, [scopedTasks])

  if (!exam) {
    return (
      <Card>
        <CardHeader title="시즌 상세" subtitle="존재하지 않는 시즌입니다." />
        <div className="px-4 py-3">
          <Button variant="secondary" onClick={() => navigate('/settings')}>
            설정으로
          </Button>
        </div>
      </Card>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title="시즌 상세" subtitle="시즌 단위로 주제/일정이 분리됩니다." />
        <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[1fr_180px]">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">시즌 이름</div>
            <Input value={exam.name} onChange={(v) => updateExam(exam.id, { name: v })} />
            <div className="mt-2 text-xs font-semibold text-slate-600">시즌 종료일</div>
            <input
              type="date"
              value={exam.examDate ?? ''}
              onChange={(e) => updateExam(exam.id, { examDate: e.target.value || undefined })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
            <div className="mt-2 grid grid-cols-2 gap-2">
              <Stat label="총 계획" value={formatHmsFromSeconds(stats.totalPlanned)} />
              <Stat label="총 실제" value={formatHmsFromSeconds(stats.totalActual)} />
              <Stat
                label="차이"
                value={`${stats.variance >= 0 ? '+' : '-'}${formatHmsFromSeconds(Math.abs(stats.variance))}`}
                tone={stats.variance >= 0 ? 'good' : 'bad'}
              />
              <Stat label="완료율" value={`${stats.completionRate}%`} />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Button onClick={() => setActiveExam(exam.id)}>현재 시즌으로 선택</Button>
            {exam.status === 'active' ? (
              <Button variant="secondary" onClick={() => setExamStatus(exam.id, 'archived')} disabled={activeExamCount <= 1}>
                보관하기
              </Button>
            ) : (
              <Button variant="secondary" onClick={() => setExamStatus(exam.id, 'active')}>
                진행중으로
              </Button>
            )}
            <Button
              variant="danger"
              disabled={exams.length <= 1}
              onClick={() => {
                if (exams.length <= 1) return
                const ok = window.confirm('이 시즌을 삭제할까요? 해당 시즌의 과목/일정도 함께 삭제됩니다.')
                if (!ok) return
                deleteExam(exam.id)
                navigate('/settings')
              }}
            >
              삭제
            </Button>
            <div className="mt-1 text-xs text-slate-500">주제/일정 수: {scopedSubjects.length} / {stats.taskCount}</div>
            {exam.status === 'active' && activeExamCount <= 1 ? (
              <div className="text-xs text-slate-500">마지막 진행중 시즌은 보관할 수 없어요.</div>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="주제" subtitle={`${scopedSubjects.length}개`} />
        <div className="divide-y divide-slate-100">
          {scopedSubjects.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">주제가 없어요.</div> : null}
          {scopedSubjects.map((s) => (
            <Link key={s.id} to={`/dashboard/${s.id}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                <div className="text-sm font-semibold text-slate-900">{s.name}</div>
              </div>
            </Link>
          ))}
        </div>
      </Card>
    </div>
  )
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'bad' }) {
  const valueClass = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-rose-700' : 'text-slate-900'
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-3 py-2">
      <div className="text-[11px] font-medium text-slate-500">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  )
}
