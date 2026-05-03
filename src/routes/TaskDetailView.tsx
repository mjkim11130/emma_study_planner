import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Input, Select } from '../components/ui'
import { formatHmsFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'

function clampInt(v: string) {
  const n = Math.floor(Number(v))
  if (!Number.isFinite(n)) return 0
  return Math.max(0, n)
}

function hmToMinutesLocal(hm?: string) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

function minutesToHm(min: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
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

  const plannedSec = Math.max(0, task?.plannedSeconds ?? 0)
  const goalReached = plannedSec > 0 && elapsedSec >= plannedSec

  const [goalToastSeen, setGoalToastSeen] = useState(false)
  useEffect(() => {
    if (!goalReached || goalToastSeen) return
    setGoalToastSeen(true)
    window.setTimeout(() => setGoalToastSeen(false), 2600)
  }, [goalReached, goalToastSeen])

  const variance = useMemo(() => {
    if (!task || task.actualSeconds === undefined) return null
    return task.actualSeconds - task.plannedSeconds
  }, [task])

  const plannedEndTime = useMemo(() => {
    if (!task?.plannedStartTime) return ''
    const s = hmToMinutesLocal(task.plannedStartTime)
    if (s === null) return ''
    return minutesToHm(s + Math.floor((task.plannedSeconds ?? 0) / 60))
  }, [task?.plannedStartTime, task?.plannedSeconds])

  const isInvalidActualRange = useMemo(() => {
    const s = hmToMinutesLocal(task?.actualStartTime)
    const e = hmToMinutesLocal(task?.actualEndTime)
    if (s === null || e === null) return false
    return e < s
  }, [task?.actualStartTime, task?.actualEndTime])

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
        <CardHeader title="Task Detail / Editor" subtitle="목표(연한 블록) + 기록(진한 블록) 함께 관리" />
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
            <Input value={task.dueDate ?? ''} onChange={(v) => updateTask(task.id, { dueDate: v || undefined })} type="date" />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="text-xs font-semibold text-slate-600">일정명</div>
            <Input value={task.title} onChange={(v) => updateTask(task.id, { title: v })} placeholder="예: 미적분 문제풀이" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">목표 시작시간</div>
            <Input value={task.plannedStartTime ?? ''} onChange={(v) => updateTask(task.id, { plannedStartTime: v || undefined })} type="time" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">목표 소요시간 (분)</div>
            <Input
              value={String(Math.floor((task.plannedSeconds ?? 0) / 60))}
              onChange={(v) => updateTask(task.id, { plannedSeconds: clampInt(v) * 60 })}
              type="number"
              min={0}
            />
          </div>
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="text-xs font-semibold text-slate-600">목표 종료시간 (자동)</div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              {task.plannedStartTime ? `${task.plannedStartTime} ~ ${plannedEndTime || '-'}` : '목표 시작시간을 입력하세요.'}
            </div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-600">기록(타이머)</div>
                  <div className="mt-1 text-2xl font-bold text-slate-900">{formatHmsFromSeconds(elapsedSec)}</div>
                  <div className="mt-1 text-xs text-slate-500">
                    목표 {formatHmsFromSeconds(plannedSec)} · {plannedSec > 0 ? Math.round((elapsedSec / plannedSec) * 100) : 0}%
                  </div>
                </div>
                <TimerRing plannedSec={plannedSec} elapsedSec={elapsedSec} />
              </div>

              <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-slate-600">기록 시작시간</div>
                  <Input
                    value={task.actualStartTime ?? ''}
                    onChange={(v) => updateTask(task.id, { actualStartTime: v || undefined })}
                    type="time"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <div className="text-xs font-semibold text-slate-600">기록 종료시간</div>
                  <Input
                    value={task.actualEndTime ?? ''}
                    onChange={(v) => updateTask(task.id, { actualEndTime: v || undefined })}
                    type="time"
                  />
                </div>
              </div>
              {isInvalidActualRange ? (
                <div className="mt-2 text-xs font-semibold text-rose-700">종료시간이 시작시간보다 빠릅니다. 시간을 다시 확인해 주세요.</div>
              ) : null}

              {goalReached ? <div className="mt-2 text-xs font-semibold text-emerald-700">목표 공부시간에 도달했어요.</div> : null}
            </div>

            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2">
                {!isRunning ? (
                  <Button
                    onClick={() => {
                      const now = new Date()
                      const nowHm = minutesToHm(now.getHours() * 60 + now.getMinutes())
                      // 항상 "지금" 기준으로 기록을 재시작
                      updateTask(task.id, { actualStartTime: nowHm, actualEndTime: undefined, actualSeconds: undefined, status: 'pending' })
                      setElapsedSec(0)
                      setIsRunning(true)
                    }}
                  >
                    시작
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      const startMin = hmToMinutesLocal(task.actualStartTime)
                      const endFromTimer = startMin !== null ? startMin + Math.floor(elapsedSec / 60) : null
                      const endHm = endFromTimer !== null ? minutesToHm(endFromTimer) : undefined
                      setIsRunning(false)
                      updateTask(task.id, { actualSeconds: elapsedSec, actualEndTime: endHm, status: 'completed' })
                    }}
                  >
                    기록 저장(완료)
                  </Button>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setIsRunning(false)
                    setElapsedSec(0)
                    updateTask(task.id, { actualStartTime: undefined, actualEndTime: undefined, actualSeconds: undefined, status: 'pending' })
                  }}
                >
                  기록 삭제
                </Button>
              </div>
              <div className="text-xs text-slate-500">시작/종료시간을 수정하면 실제시간이 자동 계산됩니다.</div>

              <div className="mt-2 rounded-2xl bg-slate-50 px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-700">
                  <div>
                    목표: <span className="font-semibold text-slate-900">{formatHmsFromSeconds(task.plannedSeconds)}</span>
                  </div>
                  <div>
                    실제:{' '}
                    <span className="font-semibold text-slate-900">
                      {task.actualSeconds !== undefined ? formatHmsFromSeconds(task.actualSeconds) : '-'}
                    </span>
                  </div>
                  <div>
                    차이:{' '}
                    <span className={`font-semibold ${variance !== null && variance >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {variance === null ? '-' : `${variance >= 0 ? '+' : '-'}${formatHmsFromSeconds(Math.abs(variance))}`}
                    </span>
                  </div>
                  <div>
                    상태: <span className="font-semibold text-slate-900">{task.status === 'completed' ? '완료' : '미완료'}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {goalToastSeen ? (
            <div className="pointer-events-none fixed left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
              목표 공부시간에 도달했어요.
            </div>
          ) : null}
        </div>
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
    return <div className="h-[72px] w-[72px] rounded-full border-4 border-slate-200 bg-slate-50" aria-hidden />
  }

  const remainingRatio = Math.max(0, (clampedPlanned - elapsedSec) / clampedPlanned)
  const overtimeRatioRaw = Math.max(0, (elapsedSec - clampedPlanned) / clampedPlanned)
  const overtimeRatio = Math.min(1, overtimeRatioRaw)

  const activeRatio = remainingRatio > 0 ? remainingRatio : overtimeRatio
  const dashoffset = c * (1 - activeRatio)
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
