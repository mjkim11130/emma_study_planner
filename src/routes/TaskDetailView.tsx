import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Input, Select } from '../components/ui'
import { formatHmsFromSeconds, formatMinutes } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'

type Mode = 'direct' | 'timer'

function clampInt(v: string) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

export function TaskDetailView() {
  const navigate = useNavigate()
  const params = useParams()
  const taskId = params.taskId ?? ''
  const task = usePlannerStore(useMemo(() => (s) => s.tasks.find((x) => x.id === taskId), [taskId]))
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const visibleSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const updateTask = usePlannerStore((s) => s.updateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)
  const setActiveExam = usePlannerStore((s) => s.setActiveExam)

  const [mode, setMode] = useState<Mode>('timer')
  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const tickerRef = useRef<number | null>(null)

  useEffect(() => {
    if (!isRunning) return
    const startedAt = Date.now()
    const base = elapsedSec
    tickerRef.current = window.setInterval(() => {
      const delta = Math.floor((Date.now() - startedAt) / 1000)
      setElapsedSec(base + delta)
    }, 250)
    return () => {
      if (tickerRef.current) window.clearInterval(tickerRef.current)
      tickerRef.current = null
    }
  }, [isRunning, elapsedSec])

  const plannedMinutes = task?.plannedMinutes ?? 0
  const plannedSec = Math.max(0, plannedMinutes * 60)
  const elapsedMinutes = Math.floor(elapsedSec / 60)
  const goalReached = plannedSec > 0 && elapsedSec >= plannedSec

  const [goalToastSeen, setGoalToastSeen] = useState(false)
  useEffect(() => {
    if (!goalReached || goalToastSeen) return
    setGoalToastSeen(true)
    window.setTimeout(() => setGoalToastSeen(false), 2600)
  }, [goalReached, goalToastSeen])

  const variance = useMemo(() => {
    if (!task || task.actualMinutes === undefined) return null
    return task.actualMinutes - task.plannedMinutes
  }, [task])

  if (!task) {
    return (
      <Card>
        <CardHeader title="Task Detail" subtitle="존재하지 않는 일정입니다." />
        <div className="px-4 py-3">
          <Button variant="secondary" onClick={() => navigate('/calendar')}>
            캘린더로
          </Button>
        </div>
      </Card>
    )
  }

  useEffect(() => {
    if (task.examId !== activeExamId) setActiveExam(task.examId)
  }, [task.examId, activeExamId, setActiveExam])

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title="Task Detail / Editor" subtitle="직접 입력 모드 + 스톱워치(count-up) 모드" />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <Button variant="secondary" onClick={() => navigate(`/day/${task.date}`)}>
            ← Day
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              deleteTask(task.id)
              navigate(`/day/${task.date}`)
            }}
          >
            삭제
          </Button>
        </div>
      </Card>

      <Card>
        <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">과목</div>
            <Select value={task.subjectId} onChange={(v) => updateTask(task.id, { subjectId: v })}>
              {visibleSubjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">날짜</div>
            <Input value={task.date} onChange={(v) => updateTask(task.id, { date: v })} type="date" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">마감일 (선택 · D-day)</div>
            <Input
              value={task.dueDate ?? ''}
              onChange={(v) => updateTask(task.id, { dueDate: v || undefined })}
              type="date"
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="text-xs font-semibold text-slate-600">일정명</div>
            <Input value={task.title} onChange={(v) => updateTask(task.id, { title: v })} placeholder="예: 미적분 문제풀이" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">목표시간 (분)</div>
            <Input
              value={String(task.plannedMinutes)}
              onChange={(v) => updateTask(task.id, { plannedMinutes: clampInt(v) })}
              type="number"
              min={0}
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">메모</div>
            <Input value={task.memo ?? ''} onChange={(v) => updateTask(task.id, { memo: v })} placeholder="짧은 메모" />
          </div>
        </div>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="text-sm font-semibold text-slate-900">기록 모드</div>
          <div className="flex gap-2">
            <Button variant={mode === 'timer' ? 'primary' : 'secondary'} onClick={() => setMode('timer')}>
              스톱워치
            </Button>
            <Button variant={mode === 'direct' ? 'primary' : 'secondary'} onClick={() => setMode('direct')}>
              직접 입력
            </Button>
          </div>
        </div>

        {mode === 'direct' ? (
          <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-2">
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-slate-600">시작시간</div>
              <Input value={task.startTime ?? ''} onChange={(v) => updateTask(task.id, { startTime: v || undefined })} type="time" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-xs font-semibold text-slate-600">종료시간</div>
              <Input value={task.endTime ?? ''} onChange={(v) => updateTask(task.id, { endTime: v || undefined })} type="time" />
            </div>
            <div className="md:col-span-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                <div>
                  목표: <span className="font-semibold text-slate-900">{formatMinutes(task.plannedMinutes)}</span>
                </div>
                <div>
                  실제: <span className="font-semibold text-slate-900">{task.actualMinutes !== undefined ? formatMinutes(task.actualMinutes) : '-'}</span>
                </div>
                <div>
                  차이:{' '}
                  <span className={`font-semibold ${variance !== null && variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {variance === null ? '-' : `${variance >= 0 ? '+' : ''}${variance}m`}
                  </span>
                </div>
                <div>
                  상태: <span className="font-semibold text-slate-900">{task.status === 'completed' ? '완료' : '미완료'}</span>
                </div>
              </div>
              <div className="mt-1 text-xs text-slate-500">시작/종료시간이 모두 입력되면 실제시간이 자동 계산되고 완료로 처리됩니다.</div>
            </div>
          </div>
        ) : (
          <div className="px-4 py-4">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_240px]">
              <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs font-semibold text-slate-600">진행</div>
                    <div className="mt-1 text-2xl font-bold text-slate-900">{formatHmsFromSeconds(elapsedSec)}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      목표 {formatMinutes(plannedMinutes)} · {plannedSec > 0 ? Math.round((elapsedSec / plannedSec) * 100) : 0}%
                    </div>
                  </div>
                  <TimerRing plannedSec={plannedSec} elapsedSec={elapsedSec} />
                </div>
                {goalReached ? <div className="mt-2 text-xs font-semibold text-emerald-700">목표 공부시간에 도달했어요.</div> : null}
              </div>
              <div className="flex flex-col gap-2">
                <Button onClick={() => setIsRunning((r) => !r)}>{isRunning ? '일시정지' : '시작'}</Button>
                <Button variant="secondary" onClick={() => setElapsedSec(0)} disabled={isRunning}>
                  리셋
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    updateTask(task.id, { actualMinutes: elapsedMinutes, status: 'completed' })
                    navigate(`/day/${task.date}`)
                  }}
                >
                  기록 저장(완료)
                </Button>
                <div className="text-xs text-slate-500">스톱워치는 count-up으로 기록하고, 목표 대비 진행률을 보여줍니다.</div>
              </div>
            </div>

            {goalToastSeen ? (
              <div className="pointer-events-none fixed left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
                목표 공부시간에 도달했어요.
              </div>
            ) : null}
          </div>
        )}
      </Card>
    </div>
  )
}

function TimerRing({ plannedSec, elapsedSec }: { plannedSec: number; elapsedSec: number }) {
  const size = 72
  const stroke = 8
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const clampedPlanned = Math.max(0, plannedSec)

  if (clampedPlanned <= 0) {
    return (
      <div className="h-[72px] w-[72px] rounded-full border-4 border-slate-200 bg-slate-50" aria-hidden />
    )
  }

  // Google Pomodoro 느낌:
  // - 목표시간 동안: 빨간 링이 "꽉 찬 상태"에서 역시계방향으로 줄어듦(남은 시간 표시)
  // - 목표 이후(오버타임): 짙은 회색 링이 0에서 시작해 역시계방향으로 늘어남(초과 시간 표시)
  const remainingRatio = Math.max(0, (clampedPlanned - elapsedSec) / clampedPlanned) // 1 -> 0
  const overtimeRatioRaw = Math.max(0, (elapsedSec - clampedPlanned) / clampedPlanned) // 0 -> ...
  const overtimeRatio = Math.min(1, overtimeRatioRaw) // 한 바퀴 채우면 고정 (MVP)

  const activeRatio = remainingRatio > 0 ? remainingRatio : overtimeRatio
  const dashoffset = c * (1 - activeRatio) // 0(full) -> c(empty)
  const isOvertime = remainingRatio <= 0

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e2e8f0" strokeWidth={stroke} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={isOvertime ? '#334155' : '#ef4444'}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={dashoffset}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 200ms linear' }}
      />
    </svg>
  )
}
