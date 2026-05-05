import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Button, Card, CardHeader, Input } from '../components/ui'
import { DurationPickerButton } from '../components/DurationPicker'
import { formatHmsFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'

function hmToSecondsLocal(value?: string) {
  if (!value) return null
  const match = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  const s = Number(match[3] ?? '0')
  if (!Number.isFinite(h) || !Number.isFinite(m) || !Number.isFinite(s)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null
  return h * 3600 + m * 60 + s
}

function minutesToHm(min: number) {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.floor(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function clampInt(value: string, min: number, max: number) {
  const n = Math.floor(Number(value))
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, n))
}

function hmsToDurationLabel(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  return `${hours}시간 ${String(minutes).padStart(2, '0')}분`
}

function formatDurationPreciseKo(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const seconds = clamped % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}초`)
  return parts.join(' ')
}

function formatMeridiemHm(totalSeconds: number) {
  const normalized = ((Math.floor(totalSeconds / 60) % (24 * 60)) + 24 * 60) % (24 * 60)
  const hours24 = Math.floor(normalized / 60)
  const minutes = normalized % 60
  const meridiem = hours24 < 12 ? '오전' : '오후'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${meridiem} ${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function pickReadableTextColor(bgColor: string) {
  const raw = bgColor.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  const normalized =
    /^[0-9a-fA-F]{3}$/.test(hex)
      ? `${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`
      : /^[0-9a-fA-F]{6}$/.test(hex)
        ? hex
        : null
  if (!normalized) return '#0f172a'
  const r = parseInt(normalized.slice(0, 2), 16) / 255
  const g = parseInt(normalized.slice(2, 4), 16) / 255
  const b = parseInt(normalized.slice(4, 6), 16) / 255
  const srgb = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const luminance = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
  return luminance > 0.5 ? '#0f172a' : '#ffffff'
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
  const [titleDraft, setTitleDraft] = useState('')
  const [actualStartDraft, setActualStartDraft] = useState('')
  const [actualEndDraft, setActualEndDraft] = useState('')
  const [pendingLeaveDialog, setPendingLeaveDialog] = useState<null | { mode: 'save-or-revert' | 'discard'; target: 'back' | 'editor' }>(null)
  const [recordEditorOpen, setRecordEditorOpen] = useState(false)
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

  useEffect(() => {
    if (!task) return
    setTitleDraft(task.title === '공부' || task.title === '새 일정' ? '' : task.title)
  }, [task?.id, task?.title])

  useEffect(() => {
    if (!task) return
    setActualStartDraft(task.actualStartTime ?? '')
    setActualEndDraft(task.actualEndTime ?? '')
  }, [task?.id, task?.actualStartTime, task?.actualEndTime])

  const plannedSec = Math.max(0, task?.plannedSeconds ?? 0)
  const plannedHours = Math.floor(plannedSec / 3600)
  const plannedMinutes = Math.floor((plannedSec % 3600) / 60)
  const plannedSecondsOnly = plannedSec % 60
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

  const recordSummary = useMemo(() => {
    if (!task) return null

    const hasStoredActual = task.actualSeconds !== undefined
    const completedWithoutTime = task.status === 'completed' && !hasStoredActual && !task.actualStartTime && !task.actualEndTime
    if (completedWithoutTime) {
      return { kind: 'tooltip-only' as const, text: '완료했어요!' }
    }

    if (!hasStoredActual) return null

    if (plannedSec <= 0) {
      return {
        kind: 'tooltip-only' as const,
        text: `${formatDurationPreciseKo(task.actualSeconds ?? 0)}동안 집중했어요!`,
      }
    }

    if (variance === null) return null

    return {
      kind: 'with-metrics' as const,
      text:
        variance < 0
          ? `${formatDurationPreciseKo(Math.abs(variance))}이나 일찍 끝냈어요!`
          : variance > 0
            ? `${formatDurationPreciseKo(Math.abs(variance))}이나 오래 했어요!`
            : '목표 시간에 딱 맞게 끝냈어요!',
    }
  }, [task, plannedSec, variance])

  const selectedSubject = useMemo(() => visibleSubjects.find((s) => s.id === task?.subjectId) ?? subjects.find((s) => s.id === task?.subjectId), [
    visibleSubjects,
    subjects,
    task?.subjectId,
  ])

  const plannedTimeHint = useMemo(() => {
    if (!task?.plannedStartTime && plannedSec <= 0) return '목표 시작시간/소요시간이 없어요.'
    if (!task?.plannedStartTime) return `목표 소요시간 ${hmsToDurationLabel(plannedSec)}`
    const startSeconds = hmToSecondsLocal(task.plannedStartTime)
    if (startSeconds === null) return '목표 시작시간을 다시 확인해 주세요.'
    const endSeconds = startSeconds + plannedSec
    return `${formatMeridiemHm(startSeconds)} ~ ${formatMeridiemHm(endSeconds)} (${hmsToDurationLabel(plannedSec)})`
  }, [task?.plannedStartTime, plannedSec])

  const isInvalidActualRange = useMemo(() => {
    const s = hmToSecondsLocal(actualStartDraft || undefined)
    const e = hmToSecondsLocal(actualEndDraft || undefined)
    if (s === null || e === null) return false
    return e < s
  }, [actualStartDraft, actualEndDraft])

  const hasAnyRecord = Boolean(task?.actualStartTime || task?.actualEndTime || task?.actualSeconds !== undefined)
  const canClearRecord = hasAnyRecord || task?.status === 'completed'
  const hasRecordInputChanges = actualStartDraft !== (task?.actualStartTime ?? '') || actualEndDraft !== (task?.actualEndTime ?? '')
  const hasAnyRecordDraft = Boolean(actualStartDraft || actualEndDraft)
  const hasIncompleteRecordDraft = hasAnyRecordDraft && !(actualStartDraft && actualEndDraft)
  const canSaveTypedRecord = Boolean(actualStartDraft && actualEndDraft) && !isInvalidActualRange

  const backTo = task?.date ? `/day/${task.date}` : '/calendar'

  const commitTitleFallback = () => {
    if (!task) return
    const trimmed = titleDraft.trim()
    const fallback = selectedSubject?.name?.trim() || '새 일정'
    updateTask(task.id, { title: trimmed || fallback })
  }

  const restoreRecordDraft = () => {
    setActualStartDraft(task?.actualStartTime ?? '')
    setActualEndDraft(task?.actualEndTime ?? '')
  }

  const saveTypedRecord = () => {
    if (!task || !canSaveTypedRecord) return false
    updateTask(task.id, {
      actualStartTime: actualStartDraft || undefined,
      actualEndTime: actualEndDraft || undefined,
      actualSeconds: undefined,
      status: 'completed',
    })
    setRecordEditorOpen(false)
    return true
  }

  const handleNavigateBack = () => {
    commitTitleFallback()
    if (hasRecordInputChanges) {
      if (canSaveTypedRecord) {
        setPendingLeaveDialog({ mode: 'save-or-revert', target: 'back' })
      } else {
        setPendingLeaveDialog({ mode: 'discard', target: 'back' })
      }
      return
    }
    navigate(backTo)
  }

  const handleCloseRecordEditor = () => {
    if (isRunning) return
    if (hasRecordInputChanges) {
      if (canSaveTypedRecord) {
        setPendingLeaveDialog({ mode: 'save-or-revert', target: 'editor' })
      } else {
        setPendingLeaveDialog({ mode: 'discard', target: 'editor' })
      }
      return
    }
    restoreRecordDraft()
    setRecordEditorOpen(false)
  }

  useEffect(() => {
    if (task && task.examId !== activeExamId) setActiveExam(task.examId)
  }, [task, activeExamId, setActiveExam])

  useEffect(() => {
    if (isRunning || hasRecordInputChanges) {
      setRecordEditorOpen(true)
    }
  }, [isRunning, hasRecordInputChanges])

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

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar
        title=""
        left={
          <Button
            variant="secondary"
            onClick={handleNavigateBack}
          >
            ←
          </Button>
        }
        right={
          <Button
            variant="danger"
            onClick={() => {
              deleteTask(task.id)
              navigate(backTo)
            }}
          >
            삭제
          </Button>
        }
      />

      <Card>
        <div className="grid grid-cols-1 gap-4 px-4 py-4 md:grid-cols-2">
          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs font-semibold text-slate-600">과목</div>
              {(() => {
                const selectedSubject = visibleSubjects.find((s) => s.id === task.subjectId) ?? subjects.find((s) => s.id === task.subjectId)
                const color = selectedSubject?.color ?? '#94a3b8'
                const hasAnyRecord = Boolean(task.actualStartTime || task.actualEndTime || task.actualSeconds !== undefined)
                const isCompleted = task.status === 'completed' || hasAnyRecord
                return (
                  <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                    {isCompleted ? (
                      <span
                        className="inline-flex h-4 w-4 items-center justify-center rounded-[5px]"
                        style={{ background: color }}
                        aria-hidden="true"
                      >
                        <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white">
                          <path d="M20 6L9 17l-5-5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : (
                      <span className="inline-block h-4 w-4 rounded-[5px] border-2" style={{ borderColor: color }} aria-hidden="true" />
                    )}
                    <span className="max-w-[40vw] truncate md:max-w-[360px]">{selectedSubject?.name ?? '과목'}</span>
                  </div>
                )
              })()}
            </div>
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {visibleSubjects.map((subject) => {
                const selected = subject.id === task.subjectId
                return (
                  <button
                    key={subject.id}
                    type="button"
                    onClick={() => updateTask(task.id, { subjectId: subject.id })}
                    className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition ${selected ? 'ring-2 ring-slate-900/15 ring-offset-1' : 'opacity-85'}`}
                    style={{
                      background: subject.color,
                      color: pickReadableTextColor(subject.color),
                    }}
                  >
                    {subject.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div className="flex flex-col gap-2 md:col-span-2">
            <div className="text-xs font-semibold text-slate-600">일정명</div>
            <input
              value={titleDraft}
              onChange={(e) => {
                const next = e.target.value
                setTitleDraft(next)
                updateTask(task.id, { title: next })
              }}
              onBlur={commitTitleFallback}
              placeholder={selectedSubject?.name ?? '과목명'}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">날짜</div>
            <Input value={task.date} onChange={(v) => updateTask(task.id, { date: v })} type="date" />
          </div>
          <div className="flex flex-col gap-2">
            <div className="text-xs font-semibold text-slate-600">마감일 (선택 · D-day)</div>
            <Input value={task.dueDate ?? ''} onChange={(v) => updateTask(task.id, { dueDate: v || undefined })} type="date" />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-600">목표 시작시간</div>
              <button
                type="button"
                onClick={() => updateTask(task.id, { plannedStartTime: undefined })}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
              >
                삭제
              </button>
            </div>
            <input
              type="time"
              value={task.plannedStartTime ?? ''}
              onChange={(e) => updateTask(task.id, { plannedStartTime: e.target.value || undefined })}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-slate-600">목표 소요시간</div>
              <button
                type="button"
                onClick={() => updateTask(task.id, { plannedSeconds: 0 })}
                className="text-[11px] font-medium text-slate-400 hover:text-slate-600"
              >
                삭제
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <DurationPickerButton
                valueSeconds={plannedHours * 3600 + plannedMinutes * 60}
                onChangeSeconds={(nextSeconds) => updateTask(task.id, { plannedSeconds: nextSeconds + plannedSecondsOnly })}
                maxHours={99}
                minuteStep={5}
                buttonClassName="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 outline-none focus:border-slate-400"
                buttonLabel={plannedSec > 0 ? `${hmsToDurationLabel(plannedHours * 3600 + plannedMinutes * 60)}동안` : '□시간동안'}
                ariaLabel="목표 소요시간 선택"
              />

              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
                <input
                  type="number"
                  min={0}
                  max={59}
                  value={plannedSecondsOnly}
                  onChange={(e) => {
                    const nextSeconds = clampInt(e.target.value, 0, 59)
                    updateTask(task.id, { plannedSeconds: plannedHours * 3600 + plannedMinutes * 60 + nextSeconds })
                  }}
                  className="w-full min-w-0 bg-transparent text-sm text-slate-900 outline-none"
                />
                <span className="shrink-0 text-xs font-semibold text-slate-500">초</span>
              </label>
            </div>
          </div>
          <div className="md:col-span-2">
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-500">{plannedTimeHint}</div>
          </div>
        </div>

        <div className="px-4 py-4">
          <div className="flex flex-col gap-3">
            <div className="rounded-2xl bg-slate-50 px-3 py-3 text-sm">
              {recordSummary?.kind === 'with-metrics' ? (
                <div className="flex flex-col gap-1 text-slate-700">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <div>
                      목표: <span className="font-semibold text-slate-900">{formatHmsFromSeconds(task.plannedSeconds)}</span>
                    </div>
                    <div>
                      실제: <span className="font-semibold text-slate-900">{formatHmsFromSeconds(task.actualSeconds ?? 0)}</span>
                    </div>
                  </div>
                  <div className={`text-xs font-semibold ${variance !== null && variance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                    {recordSummary.text}
                  </div>
                </div>
              ) : recordSummary?.kind === 'tooltip-only' ? (
                <div className="text-xs font-semibold text-slate-700">{recordSummary.text}</div>
              ) : null}
            </div>

            {!recordEditorOpen ? (
              <div className="flex justify-start">
                <Button variant="secondary" onClick={() => setRecordEditorOpen(true)}>
                  기록하기
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_260px]">
                <div className="rounded-2xl border border-slate-200 bg-white p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-semibold text-slate-600">기록(타이머)</div>
                      <div className="mt-1 text-2xl font-bold text-slate-900">{formatHmsFromSeconds(elapsedSec)}</div>
                      <div className="mt-1 text-xs text-slate-500">
                        목표 {plannedSec > 0 ? formatHmsFromSeconds(plannedSec) : '-'} · {plannedSec > 0 ? Math.round((elapsedSec / plannedSec) * 100) : 0}%
                      </div>
                    </div>
                    <TimerRing plannedSec={plannedSec} elapsedSec={elapsedSec} />
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-slate-600">기록 시작시간</div>
                      <Input value={actualStartDraft} onChange={setActualStartDraft} type="time" />
                    </div>
                    <div className="flex flex-col gap-2">
                      <div className="text-xs font-semibold text-slate-600">기록 종료시간</div>
                      <Input value={actualEndDraft} onChange={setActualEndDraft} type="time" />
                    </div>
                  </div>
                  {isInvalidActualRange ? (
                    <div className="mt-2 text-xs font-semibold text-rose-700">종료시간이 시작시간보다 빠릅니다. 시간을 다시 확인해 주세요.</div>
                  ) : null}

                  {goalReached ? <div className="mt-2 text-xs font-semibold text-emerald-700">목표 공부시간에 도달했어요.</div> : null}
                </div>

                <div className="flex flex-col gap-2">
                  {!isRunning ? (
                    <div className="flex justify-end">
                      <Button variant="ghost" onClick={handleCloseRecordEditor}>
                        닫기
                      </Button>
                    </div>
                  ) : null}
                  {isRunning ? (
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        onClick={() => {
                          const startSec = hmToSecondsLocal(task.actualStartTime)
                          const endFromTimer = startSec !== null ? startSec + elapsedSec : null
                          const endHm = endFromTimer !== null ? minutesToHm(Math.floor(endFromTimer / 60)) : undefined
                          setIsRunning(false)
                          setRecordEditorOpen(false)
                          updateTask(task.id, { actualSeconds: elapsedSec, actualEndTime: endHm, status: 'completed' })
                        }}
                      >
                        타이머 기록 저장
                      </Button>
                    </div>
                  ) : hasRecordInputChanges ? (
                    <div className="grid grid-cols-1 gap-2">
                      <Button disabled={!canSaveTypedRecord} onClick={() => saveTypedRecord()}>
                        입력한 기록 저장
                      </Button>
                    </div>
                  ) : canClearRecord ? (
                    <div className="grid grid-cols-1 gap-2">
                      <Button
                        variant="danger"
                        onClick={() => {
                          setIsRunning(false)
                          setElapsedSec(0)
                          setActualStartDraft('')
                          setActualEndDraft('')
                          setRecordEditorOpen(false)
                          updateTask(task.id, { actualStartTime: undefined, actualEndTime: undefined, actualSeconds: undefined, status: 'pending' })
                        }}
                      >
                        기록 삭제
                      </Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        onClick={() => {
                          const now = new Date()
                          const nowHm = minutesToHm(now.getHours() * 60 + now.getMinutes())
                          setActualStartDraft(nowHm)
                          setActualEndDraft('')
                          updateTask(task.id, { actualStartTime: nowHm, actualEndTime: undefined, actualSeconds: undefined, status: 'pending' })
                          setElapsedSec(0)
                          setIsRunning(true)
                        }}
                      >
                        타이머 기록 시작
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setIsRunning(false)
                          setElapsedSec(0)
                          setActualStartDraft('')
                          setActualEndDraft('')
                          setRecordEditorOpen(false)
                          updateTask(task.id, { actualStartTime: undefined, actualEndTime: undefined, actualSeconds: undefined, status: 'completed' })
                        }}
                      >
                        완료 처리
                      </Button>
                    </div>
                  )}
                  <div className="text-xs text-slate-500">
                    {hasIncompleteRecordDraft
                      ? '기록 시작시간과 종료시간을 모두 입력해야 저장할 수 있어요.'
                      : '시작/종료시간을 입력한 뒤 저장하면 실제시간이 계산됩니다.'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {goalToastSeen ? (
            <div className="pointer-events-none fixed left-1/2 top-3 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
              목표 공부시간에 도달했어요.
            </div>
          ) : null}
        </div>
      </Card>
      {pendingLeaveDialog ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">
              {pendingLeaveDialog.mode === 'save-or-revert' ? '기록을 저장하고 나갈까요?' : '입력한 기록을 버리고 나갈까요?'}
            </div>
            <div className="mt-2 text-sm text-slate-500">
              {pendingLeaveDialog.mode === 'save-or-revert'
                ? '저장하면 현재 입력값으로 덮어쓰고, 저장 안 함을 누르면 기존 기록으로 복원합니다.'
                : '기록 시작시간과 종료시간이 아직 완성되지 않았어요. 지금 나가면 입력 중인 값은 사라집니다.'}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setPendingLeaveDialog(null)}>
                계속 편집
              </Button>
              {pendingLeaveDialog.mode === 'save-or-revert' ? (
                <>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      restoreRecordDraft()
                      setPendingLeaveDialog(null)
                      if (pendingLeaveDialog.target === 'back') navigate(backTo)
                      else setRecordEditorOpen(false)
                    }}
                  >
                    저장 안 함
                  </Button>
                  <Button
                    onClick={() => {
                      if (!saveTypedRecord()) return
                      setPendingLeaveDialog(null)
                      if (pendingLeaveDialog.target === 'back') navigate(backTo)
                    }}
                  >
                    저장하고 나가기
                  </Button>
                </>
              ) : (
                <Button
                  variant="danger"
                  onClick={() => {
                    restoreRecordDraft()
                    setPendingLeaveDialog(null)
                    if (pendingLeaveDialog.target === 'back') navigate(backTo)
                    else setRecordEditorOpen(false)
                  }}
                >
                  {pendingLeaveDialog.target === 'back' ? '버리고 나가기' : '버리고 닫기'}
                </Button>
              )}
            </div>
          </div>
        </div>
      ) : null}
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
