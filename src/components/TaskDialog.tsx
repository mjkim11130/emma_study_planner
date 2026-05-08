import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ko } from 'date-fns/locale'
import { format, parseISO } from 'date-fns'
import { Button } from './ui'
import { TaskDialogShell } from './TaskDialogShell'
import { DurationPickerButton } from './DurationPicker'
import { TimePickerModal } from './TimePicker'
import { TaskTimerModal } from './TaskTimerModal'
import { usePlannerStore } from '../store/usePlannerStore'
import type { StudyTask } from '../store/types'
import { useTaskDialog } from './TaskDialogContext'
import { useConfirmDialog } from './ConfirmDialog'
import { buildTimeSummaryNode, formatDurationPreciseKo } from '../lib/taskTimeSummary'
import { formatDday } from '../lib/dday'

const DRAFT_TASK_ID = '__draft__task__'

function hmToMinutes(hm?: string | null) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const hours24 = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return null
  if (hours24 < 0 || hours24 > 23) return null
  if (minutes < 0 || minutes > 59) return null
  return hours24 * 60 + minutes
}

function addSecondsToHm(hm: string, secondsToAdd: number) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const startSeconds = Number(match[1]) * 3600 + Number(match[2]) * 60
  const endTotalMinutes = Math.floor((startSeconds + secondsToAdd) / 60)
  const normalized = ((endTotalMinutes % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function secondsBetweenHm(startHm?: string | null, endHm?: string | null) {
  const start = hmToMinutes(startHm ?? null)
  const end = hmToMinutes(endHm ?? null)
  if (start === null || end === null) return null
  // treat equal as "no duration" (start-only)
  if (end === start) return null
  const diffMin = end > start ? end - start : end + 24 * 60 - start
  return diffMin * 60
}

function formatMeridiemHm(hm?: string) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const hours24 = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return null
  const meridiem = hours24 < 12 ? '오전' : '오후'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${meridiem} ${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

function formatTaskPreviewDate(ymd?: string) {
  if (!ymd) return null
  return format(parseISO(ymd), 'yyyy년 M월 d일 eeee', { locale: ko })
}

function formatDueDateLabel(ymd?: string) {
  if (!ymd) return null
  return `${format(parseISO(ymd), 'M월 d일')}까지 마감`
}

function formatDurationGraphKo(totalSeconds: number) {
  const minutes = Math.max(0, Math.round(totalSeconds / 60))
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}시간${m}분`
  if (h > 0) return `${h}시간`
  return `${m}분`
}

function buildNextTaskTitle(baseTitle: string, tasks: StudyTask[]) {
  const base = (baseTitle || '주제').trim()
  const re = new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s+(\\d+)$`)
  const used = new Set<number>()
  for (const t of tasks) {
    const title = (t.title ?? '').trim()
    const m = re.exec(title)
    if (!m) continue
    const n = Number(m[1])
    if (Number.isFinite(n) && n > 0) used.add(n)
  }
  let i = 1
  while (used.has(i)) i += 1
  return `${base} ${i}`
}

const normalizeHex = (color: string) => {
  const raw = color.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
  return raw
}

const pickReadableTextColor = (bgColor: string) => {
  const hex = normalizeHex(bgColor)
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

function CompareRail({
  goalLabel,
  actualLabel,
  deltaLabel,
  deltaSeconds,
  goalSeconds,
  actualSeconds,
}: {
  goalLabel: string
  actualLabel: string
  deltaLabel: string
  deltaSeconds: number
  goalSeconds: number
  actualSeconds: number
}) {
  const maxSeconds = Math.max(goalSeconds, actualSeconds, 1)
  const goalWidth = `${(goalSeconds / maxSeconds) * 100}%`
  const actualWidth = `${(actualSeconds / maxSeconds) * 100}%`
  return (
    <div className="flex flex-col gap-2.5 py-1">
      <div className="grid grid-cols-[46px_minmax(0,1fr)_98px] items-center gap-3">
        <span className="text-sm font-semibold text-slate-400">계획</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-slate-300" style={{ width: goalWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-500">{goalLabel}</span>
      </div>
      <div className="grid grid-cols-[46px_minmax(0,1fr)_98px] items-center gap-3">
        <span className="text-sm font-semibold text-slate-900">완료</span>
        <div className="h-3.5 overflow-hidden">
          <div className="h-full rounded-full bg-black/80" style={{ width: actualWidth }} />
        </div>
        <span className="text-right text-[15px] font-semibold tabular-nums text-slate-900">{actualLabel}</span>
      </div>
      <div
        className={`pt-1 text-center text-base font-semibold tabular-nums ${
          deltaSeconds > 0 ? 'text-blue-700' : deltaSeconds < 0 ? 'text-rose-700' : 'text-slate-600'
        }`}
      >
        {deltaLabel}
      </div>
    </div>
  )
}

export function TaskDialog() {
  const { request, clearRequest } = useTaskDialog()
  const { confirm } = useConfirmDialog()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const deleteTask = usePlannerStore((s) => s.deleteTask)

  const scopedSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])

  const [addDraft, setAddDraft] = useState<StudyTask | null>(null)
  const [editDraft, setEditDraft] = useState<StudyTask | null>(null)
  const [editTaskId, setEditTaskId] = useState<string | null>(null)
  const [autoCloseAfterCompleteTaskId, setAutoCloseAfterCompleteTaskId] = useState<string | null>(null)

  const [plannedSecondsDraft, setPlannedSecondsDraft] = useState(0)
  const [plannedDurationPickerOpen, setPlannedDurationPickerOpen] = useState(false)
  const [actualSecondsDraft, setActualSecondsDraft] = useState(0)
  const [actualDurationPickerOpen, setActualDurationPickerOpen] = useState(false)
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [timePickerField, setTimePickerField] = useState<'plannedStartTime' | 'plannedEndTime' | 'actualStartTime' | 'actualEndTime'>(
    'plannedStartTime',
  )
  const [editTitleDraft, setEditTitleDraft] = useState('')
  const [editTitleSample, setEditTitleSample] = useState('제목 추가')
  const editTitleOriginalRef = useRef<{ taskId: string; title: string } | null>(null)
  const [editValidationMessage, setEditValidationMessage] = useState<string | null>(null)
  const [editWarningMessage, setEditWarningMessage] = useState<string | null>(null)

  const [datePickerField, setDatePickerField] = useState<null | 'date' | 'dueDate'>(null)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const pickCalendarDay = (d: Date) => {
    if (!previewTask) return
    const ymd = format(d, 'yyyy-MM-dd')
    if (datePickerField === 'date') patchPreviewTask({ date: ymd })
    else if (datePickerField === 'dueDate') patchPreviewTask({ dueDate: ymd })
    setDatePickerField(null)
  }

  const [editExitConfirmOpen, setEditExitConfirmOpen] = useState(false)
  const [timerTaskId, setTimerTaskId] = useState<string | null>(null)

  const storedPreviewTask = useMemo(() => {
    if (!request || request.mode !== 'preview') return null
    return tasks.find((t) => t.id === request.taskId) ?? null
  }, [request, tasks])

  const basePreviewTask = addDraft ?? storedPreviewTask
  const isAddMode = addDraft?.id === DRAFT_TASK_ID
  const isEditingPreview = Boolean(basePreviewTask && editTaskId === basePreviewTask.id)
  const previewTask = isAddMode ? addDraft : isEditingPreview ? editDraft ?? basePreviewTask : basePreviewTask

  const previewSubject = useMemo(
    () => subjects.find((s) => s.id === previewTask?.subjectId) ?? null,
    [subjects, previewTask?.subjectId],
  )

  const openTaskAddLocal = (initial?: { date?: string; subjectId?: string; plannedStartTime?: string; plannedSeconds?: number }) => {
    const fallbackSubjectId =
      (initial?.subjectId && subjects.some((s) => s.id === initial.subjectId) ? initial.subjectId : null) ??
      (lastUsedSubjectIdByExam[activeExamId] && subjects.some((s) => s.id === lastUsedSubjectIdByExam[activeExamId])
        ? lastUsedSubjectIdByExam[activeExamId]
        : null) ??
      subjects.find((s) => s.examId === activeExamId)?.id ??
      subjects[0]?.id ??
      ''
    if (!fallbackSubjectId) return
    const now = new Date().toISOString()
    const draft: StudyTask = {
      id: DRAFT_TASK_ID,
      examId: activeExamId,
      subjectId: fallbackSubjectId,
      title: '',
      date: initial?.date ?? '',
      plannedStartTime: typeof initial?.plannedStartTime === 'string' && initial.plannedStartTime ? initial.plannedStartTime : undefined,
      plannedSeconds: Number.isFinite(initial?.plannedSeconds) ? Math.max(0, Number(initial?.plannedSeconds)) : 0,
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    }
    setAddDraft(draft)
    setEditTaskId(DRAFT_TASK_ID)
    setAutoCloseAfterCompleteTaskId(null)
  }

  useEffect(() => {
    if (!request) return
    if (request.mode === 'add') {
      openTaskAddLocal({
        date: request.date,
        subjectId: request.subjectId,
        plannedStartTime: request.plannedStartTime,
        plannedSeconds: request.plannedSeconds,
      })
      return
    }
    setAddDraft(null)
    setEditDraft(null)
    if (request.mode === 'preview') {
      setEditTaskId(request.autoEdit ? request.taskId : null)
      setAutoCloseAfterCompleteTaskId(request.autoCloseAfterComplete ? request.taskId : null)
      setTimerTaskId(request.autoTimer ? request.taskId : null)
    }
  }, [request])

  const close = () => {
    setAddDraft(null)
    setEditDraft(null)
    setEditTaskId(null)
    setAutoCloseAfterCompleteTaskId(null)
    setEditValidationMessage(null)
    setTimerTaskId(null)
    setTimePickerOpen(false)
    setDatePickerField(null)
    clearRequest()
  }

  const patchPreviewTask = (patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => {
    if (!previewTask) return
    if (isAddMode) {
      setAddDraft((cur) => (cur ? { ...cur, ...patch, updatedAt: new Date().toISOString() } : cur))
      return
    }
    if (isEditingPreview) {
      setEditDraft((cur) => {
        const base = cur ?? storedPreviewTask
        return base ? { ...base, ...patch, updatedAt: new Date().toISOString() } : cur
      })
      return
    }
    // Safety: never apply edits to the store unless user explicitly commits via "완료".
    // (Prevents "취소" being ineffective due to live updates.)
    return
  }

  const commitEditDraft = (original: StudyTask, draft: StudyTask) => {
    const patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>> = {}
    const keys: Array<keyof Omit<StudyTask, 'id' | 'createdAt'>> = [
      'examId',
      'subjectId',
      'title',
      'date',
      'dueDate',
      'plannedStartTime',
      'plannedSeconds',
      'actualStartTime',
      'actualEndTime',
      'actualSeconds',
      'recordCompleteOnly',
      'status',
      'updatedAt',
    ]
    for (const key of keys) {
      if (draft[key] !== original[key]) patch[key] = draft[key] as never
    }
    if (Object.keys(patch).length === 0) return
    updateTask(original.id, patch)
  }

  const commitAddDraft = (draft: StudyTask) => {
    const id = addTask({
      examId: draft.examId,
      subjectId: draft.subjectId,
      title: draft.title,
      date: draft.date,
      dueDate: draft.dueDate,
      plannedStartTime: draft.plannedStartTime,
      plannedSeconds: draft.plannedSeconds,
      actualStartTime: draft.actualStartTime,
      actualEndTime: draft.actualEndTime,
      actualSeconds: draft.actualSeconds,
      recordCompleteOnly: draft.recordCompleteOnly,
    })
    return id
  }

  useEffect(() => {
    if (isAddMode) return
    if (!storedPreviewTask) return
    if (editTaskId !== storedPreviewTask.id) return
    setEditDraft({ ...storedPreviewTask })
  }, [editTaskId, storedPreviewTask?.id, isAddMode])

  useEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    setPlannedSecondsDraft(Math.max(0, previewTask.plannedSeconds ?? 0))
  }, [previewTask?.id, editTaskId])

  useEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    const byRange = secondsBetweenHm(previewTask.actualStartTime ?? null, previewTask.actualEndTime ?? null)
    const base = typeof previewTask.actualSeconds === 'number' ? previewTask.actualSeconds : null
    const seconds = byRange ?? base ?? 0
    setActualSecondsDraft(Math.max(0, seconds))
    // normalize legacy "start==end" into "start-only"
    if (previewTask.actualStartTime && previewTask.actualEndTime && previewTask.actualStartTime === previewTask.actualEndTime) {
      patchPreviewTask({ actualEndTime: undefined, actualSeconds: undefined })
    }
  }, [previewTask?.id, editTaskId])

  useEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    const currentTitle = previewTask.title ?? ''
    editTitleOriginalRef.current = { taskId: previewTask.id, title: currentTitle }
    setEditTitleDraft(currentTitle)
    if (isAddMode) setEditTitleSample('제목 추가')
    else setEditTitleSample(currentTitle || '제목 추가')
  }, [previewTask?.id, editTaskId, isAddMode])

  useLayoutEffect(() => {
    if (!previewTask) return
    if (editTaskId !== previewTask.id) return
    if (!previewTask.subjectId) return
    // noop: original used scrollIntoView, optional
  }, [previewTask?.id, previewTask?.subjectId, editTaskId])

  const previewPlannedEnd = useMemo(() => {
    if (!previewTask?.plannedStartTime || !(previewTask.plannedSeconds > 0)) return null
    return addSecondsToHm(previewTask.plannedStartTime, previewTask.plannedSeconds)
  }, [previewTask?.plannedStartTime, previewTask?.plannedSeconds])

  const previewActualSummary = useMemo(() => {
    if (!previewTask) return null
    if (typeof previewTask.actualSeconds !== 'number') return null
    if (previewTask.actualSeconds < 60) return null
    // 계획 소요시간이 없으면(시작시간만 있는 케이스 포함) 비교 그래프를 띄우지 않음.
    if (!(previewTask.plannedSeconds > 0)) return null

    const variance = previewTask.actualSeconds - previewTask.plannedSeconds
    if (variance === 0) {
      return {
        goalLabel: formatDurationGraphKo(previewTask.plannedSeconds),
        actualLabel: formatDurationGraphKo(previewTask.actualSeconds),
        deltaLabel: '정확히 완료',
        deltaSeconds: 0,
        goalSeconds: previewTask.plannedSeconds,
        actualSeconds: previewTask.actualSeconds,
      }
    }
    return {
      goalLabel: formatDurationGraphKo(previewTask.plannedSeconds),
      actualLabel: formatDurationGraphKo(previewTask.actualSeconds),
      deltaLabel: variance < 0 ? `- ${formatDurationGraphKo(Math.abs(variance))}` : `+ ${formatDurationGraphKo(Math.abs(variance))}`,
      deltaSeconds: variance,
      goalSeconds: previewTask.plannedSeconds,
      actualSeconds: previewTask.actualSeconds,
    }
  }, [previewTask])

  const previewHeadlineTimes = useMemo(() => {
    if (!previewTask) return []
    const showGraph = Boolean(previewActualSummary)
    const items: Array<{ kind: '계획' | '완료'; badge: string; text: ReactNode; key: string }> = []

    const buildNode = (input: { start?: string | null; end?: string | null; durationSeconds?: number | null }) =>
      buildTimeSummaryNode({ ...input, formatHm: (hm) => formatMeridiemHm(hm) })

    if (previewTask.plannedStartTime || previewTask.plannedSeconds > 0) {
      const plannedText = previewTask.plannedStartTime
        ? showGraph
          ? buildNode({ start: previewTask.plannedStartTime, end: previewPlannedEnd, durationSeconds: null })
          : buildNode({
              start: previewTask.plannedStartTime,
              end: previewPlannedEnd,
              durationSeconds: previewTask.plannedSeconds > 0 ? previewTask.plannedSeconds : null,
            })
        : previewTask.plannedSeconds > 0
          ? showGraph
            ? null
            : formatDurationPreciseKo(previewTask.plannedSeconds)
          : null
      if (plannedText) items.push({ key: 'planned', kind: '계획', badge: '계획', text: plannedText })
    }
    if (previewTask.actualStartTime || typeof previewTask.actualSeconds === 'number') {
      const actualText = showGraph
        ? buildNode({ start: previewTask.actualStartTime, end: previewTask.actualEndTime, durationSeconds: null })
        : buildNode({
            start: previewTask.actualStartTime,
            end: previewTask.actualEndTime,
            durationSeconds: typeof previewTask.actualSeconds === 'number' ? previewTask.actualSeconds : null,
          })
      if (actualText) items.push({ key: 'actual', kind: '완료', badge: '완료', text: actualText })
    }
    if (!items.some((i) => i.kind === '완료') && previewTask.status === 'completed') {
      items.push({ key: 'completed', kind: '완료', badge: '완료', text: '완료 처리' })
    }
    return items
  }, [previewActualSummary, previewPlannedEnd, previewTask])

  const hasPreviewCompare = Boolean(previewActualSummary)
  const hasPreviewMeta = Boolean(isEditingPreview || previewHeadlineTimes.length || previewTask?.dueDate)

  if (!request || !previewTask) return null

  return (
    <>
      <TaskDialogShell
        open
        onClose={close}
        onBackdropClick={() => {
          if (isAddMode) {
            close()
            return
          }
          if (!isEditingPreview) {
            close()
            return
          }
          const start = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualStartTime ?? null)
          const end = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualEndTime ?? null)
          const hasOnlyOne = !previewTask.recordCompleteOnly && ((start === null) !== (end === null))
          const invalidRange = !previewTask.recordCompleteOnly && start !== null && end !== null && end < start
          if (hasOnlyOne || invalidRange) {
            setEditExitConfirmOpen(true)
            return
          }
          setEditTaskId(null)
          setEditDraft(null)
        }}
        titleRow={null}
        footer={null}
      >
        <div className="px-5 py-5 md:px-6">
          {(() => {
            const isEditing = editTaskId === previewTask.id
            return (
              <>
                <div className="flex items-center justify-between gap-3">
                  {isEditing ? (
                    <div className="no-scrollbar -mx-1 flex min-w-0 flex-1 gap-1.5 overflow-x-auto overflow-y-visible px-1 py-1">
                      {scopedSubjects.map((subject) => {
                        const selected = subject.id === previewTask.subjectId
                        return (
                          <button
                            key={subject.id}
                            type="button"
                            onClick={() => {
                              patchPreviewTask({ subjectId: subject.id })
                              if (!editTitleDraft.trim() && isAddMode) setEditTitleSample('제목 추가')
                            }}
                            className={`shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition ${
                              selected ? 'ring-2 ring-slate-900/15 ring-offset-1 opacity-100' : 'border border-slate-200/70 opacity-45 saturate-[0.75]'
                            }`}
                            style={{ background: subject.color, color: pickReadableTextColor(subject.color) }}
                            aria-label={`주제 ${subject.name} 선택`}
                          >
                            {subject.name}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flex min-w-0 items-center gap-2">
                      {(() => {
                        const hasAnyRecord = Boolean(
                          previewTask.actualStartTime || previewTask.actualEndTime || typeof previewTask.actualSeconds === 'number',
                        )
                        const isCompleted = previewTask.status === 'completed' || hasAnyRecord
                        const color = previewSubject?.color ?? '#94a3b8'
                        return (
                          <button
                            type="button"
                            className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px]"
                            style={isCompleted ? { background: color } : { borderColor: color, borderWidth: 2, borderStyle: 'solid' }}
                            aria-label={isCompleted ? '완료 해제' : '완료 처리'}
                            onClick={() => {
                              const applyPatch = (patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => {
                                if (isAddMode || isEditingPreview) {
                                  patchPreviewTask(patch)
                                  return
                                }
                                if (!previewTask) return
                                updateTask(previewTask.id, patch)
                              }
                              if (isCompleted) {
                                applyPatch({
                                  status: 'pending',
                                  recordCompleteOnly: false,
                                  actualStartTime: undefined,
                                  actualEndTime: undefined,
                                  actualSeconds: undefined,
                                })
                              } else {
                                const hasRecordedTime =
                                  Boolean(previewTask.actualStartTime && previewTask.actualEndTime) ||
                                  typeof previewTask.actualSeconds === 'number'
                                applyPatch({ status: 'completed', recordCompleteOnly: !hasRecordedTime })
                              }
                            }}
                          >
                            {isCompleted ? (
                              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-white" aria-hidden="true">
                                <path
                                  d="M20 6L9 17l-5-5"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="3"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            ) : null}
                          </button>
                        )
                      })()}
                      <span className="truncate text-sm font-semibold text-slate-500">{previewSubject?.name ?? '주제'}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={close}
                    className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                    aria-label="닫기"
                  >
                    <span aria-hidden="true" className="text-xl leading-none">
                      ×
                    </span>
                  </button>
                </div>

                {isEditing ? (
                  <div className="mt-2.5 rounded-2xl bg-slate-50 px-4 py-3">
                    <input
                      value={editTitleDraft}
                      onChange={(e) => setEditTitleDraft(e.target.value)}
                      placeholder={editTitleSample || '제목 추가'}
                      className="w-full bg-transparent text-2xl font-semibold leading-tight text-slate-900 outline-none placeholder:text-slate-400 md:text-[30px]"
                    />
                  </div>
                ) : (
                  <div className="mt-2.5 text-2xl font-semibold leading-tight text-slate-900 md:text-[30px]">{previewTask.title}</div>
                )}
              </>
            )
          })()}

          {isEditingPreview ? (
            <div className="mt-2 px-4">
              <button
                type="button"
                onClick={() => setDatePickerField('date')}
                className="inline-flex cursor-pointer items-center gap-2 text-base font-medium text-slate-500 underline decoration-slate-200 decoration-dotted underline-offset-4 transition hover:text-slate-700 hover:decoration-slate-400"
                aria-label="날짜 선택"
              >
                <span>{formatTaskPreviewDate(previewTask.date) ?? '날짜 선택'}</span>
                {previewTask.date ? (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation()
                      patchPreviewTask({ date: '' })
                    }}
                    className="shrink-0 text-base font-semibold text-slate-400 no-underline transition hover:text-slate-600"
                    aria-label="날짜 삭제"
                  >
                    ×
                  </span>
                ) : null}
              </button>
            </div>
          ) : previewTask.date ? (
            <div className="mt-2 text-base text-slate-500">{formatTaskPreviewDate(previewTask.date)}</div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-5 md:grid-cols-2 md:px-6">
          {hasPreviewMeta ? (
            <div className="pt-2 md:col-span-2">
              <div className="space-y-3">
                {isEditingPreview ? (
                  <div className="space-y-3">
                    <div className="flex flex-nowrap items-center gap-2.5 text-base font-medium text-indigo-700">
                      <button
                        type="button"
                        onClick={() => setDatePickerField('dueDate')}
                        className="shrink-0 cursor-pointer rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700 transition hover:bg-indigo-100"
                        aria-label="디데이 선택"
                      >
                        {formatDday(previewTask.dueDate) || '마감'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDatePickerField('dueDate')}
                        className={`min-w-0 cursor-pointer whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.03em] ${
                          previewTask.dueDate ? 'text-indigo-700 decoration-indigo-200 hover:decoration-indigo-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                        }`}
                        aria-label="마감 날짜 선택"
                      >
                        {previewTask.dueDate ? formatDueDateLabel(previewTask.dueDate) : '마감 날짜 선택'}
                      </button>
                      {previewTask.dueDate ? (
                        <button
                          type="button"
                          onClick={() => patchPreviewTask({ dueDate: undefined })}
                          className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
                          aria-label="디데이 삭제"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>

                    {editValidationMessage ? <div className="text-sm font-semibold text-rose-700">{editValidationMessage}</div> : null}
                    {editWarningMessage ? <div className="text-sm font-semibold text-amber-700">{editWarningMessage}</div> : null}

                    <div className="flex min-w-0 flex-nowrap items-center gap-2 text-base font-medium text-slate-700">
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-500">계획</span>
                      <button
                        type="button"
                        onClick={() => {
                          setTimePickerField('plannedStartTime')
                          setTimePickerOpen(true)
                        }}
                        className={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
                          previewTask.plannedStartTime ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                        }`}
                        aria-label="시작시간 입력"
                      >
                        {previewTask.plannedStartTime ? `${formatMeridiemHm(previewTask.plannedStartTime) ?? previewTask.plannedStartTime}부터` : '시작시간 입력'}
                      </button>
                      {previewTask.plannedStartTime ? (
                        <button
                          type="button"
                          onClick={() => patchPreviewTask({ plannedStartTime: undefined })}
                          className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
                          aria-label="계획 시작시간 삭제"
                        >
                          ×
                        </button>
                      ) : null}
                      <span className="shrink-0 px-1 text-slate-400">·</span>
                      <DurationPickerButton
                        valueSeconds={plannedSecondsDraft}
                        onChangeSeconds={(nextSeconds) => setPlannedSecondsDraft(nextSeconds)}
                        maxHours={10}
                        buttonLabel={plannedSecondsDraft > 0 ? formatDurationPreciseKo(plannedSecondsDraft) : '소요시간 입력'}
                        buttonClassName={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left text-base font-medium tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
                          plannedSecondsDraft > 0 ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                        }`}
                        ariaLabel="소요시간 입력"
                        open={plannedDurationPickerOpen}
                        onOpenChange={(next) => {
                          setPlannedDurationPickerOpen(next)
                          if (!next) patchPreviewTask({ plannedSeconds: plannedSecondsDraft })
                        }}
                      />
                      <span className="shrink-0 px-1 text-slate-400">·</span>
                      <button
                        type="button"
                        onClick={() => {
                          if (!previewTask.plannedStartTime) return
                          setTimePickerField('plannedEndTime')
                          setTimePickerOpen(true)
                        }}
                        className={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
                          previewTask.plannedStartTime && plannedSecondsDraft > 0
                            ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400'
                            : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                        } ${previewTask.plannedStartTime ? '' : 'pointer-events-none'}`}
                        aria-label="종료시간 입력"
                      >
                        {previewTask.plannedStartTime && plannedSecondsDraft > 0
                          ? `${formatMeridiemHm(addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft) ?? '') ?? addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft)}까지`
                          : '종료시간 입력'}
                      </button>
                      {previewTask.plannedStartTime && plannedSecondsDraft > 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            setPlannedSecondsDraft(0)
                            patchPreviewTask({ plannedSeconds: 0 })
                          }}
                          className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
                          aria-label="계획 종료/소요시간 삭제"
                        >
                          ×
                        </button>
                      ) : null}
                    </div>

                    <div className="flex flex-col gap-2 md:flex-row md:items-center">
                      <div className="flex min-w-0 flex-nowrap items-center gap-3 text-base font-medium text-slate-700 md:flex-1">
                        <span className="shrink-0 whitespace-nowrap rounded-full bg-black/80 px-3 py-1.5 text-sm font-semibold text-white">완료</span>
                        {previewTask.recordCompleteOnly &&
                        !previewTask.actualStartTime &&
                        !previewTask.actualEndTime &&
                        !(typeof previewTask.actualSeconds === 'number' && previewTask.actualSeconds > 0) ? (
                          <span className="min-w-0 truncate whitespace-nowrap tracking-[-0.02em] text-slate-700 md:tracking-[-0.04em]">완료 처리</span>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                setTimePickerField('actualStartTime')
                                setTimePickerOpen(true)
                              }}
                              className={`min-w-0 truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] cursor-pointer ${
                                previewTask.actualStartTime ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                              }`}
                              aria-label="시작시간 입력"
                            >
                              {previewTask.actualStartTime ? `${formatMeridiemHm(previewTask.actualStartTime) ?? previewTask.actualStartTime}부터` : '시작시간 입력'}
                            </button>
                            {previewTask.actualStartTime ? (
                              <button
                                type="button"
                                onClick={() => {
                                  patchPreviewTask({
                                    actualStartTime: undefined,
                                    actualEndTime: undefined,
                                    actualSeconds: undefined,
                                    recordCompleteOnly: false,
                                    status: 'pending',
                                  })
                                  setActualSecondsDraft(0)
                                }}
                                className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
                                aria-label="완료 시작시간 삭제"
                              >
                                ×
                              </button>
                            ) : null}
                            <span className="shrink-0 px-1 text-slate-400">·</span>
                            <DurationPickerButton
                              valueSeconds={actualSecondsDraft}
                              onChangeSeconds={(nextSeconds) => setActualSecondsDraft(nextSeconds)}
                              maxHours={10}
                              buttonLabel={actualSecondsDraft > 0 ? formatDurationPreciseKo(actualSecondsDraft) : '소요시간 입력'}
                              buttonClassName={`min-w-0 cursor-pointer truncate whitespace-nowrap text-left text-base font-medium tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] ${
                                actualSecondsDraft > 0 ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                              }`}
                              ariaLabel="완료 소요시간 입력"
                              open={actualDurationPickerOpen}
                              onOpenChange={(next) => {
                                setActualDurationPickerOpen(next)
                                if (next) return
                                if (!previewTask.actualStartTime) {
                                  patchPreviewTask({ actualSeconds: actualSecondsDraft, status: 'completed', recordCompleteOnly: false })
                                  return
                                }
                                const end = actualSecondsDraft > 0 ? addSecondsToHm(previewTask.actualStartTime, actualSecondsDraft) : null
                                patchPreviewTask({
                                  actualSeconds: actualSecondsDraft > 0 ? actualSecondsDraft : undefined,
                                  actualEndTime: end ?? previewTask.actualEndTime,
                                  status: 'completed',
                                  recordCompleteOnly: false,
                                })
                              }}
                            />
                            <span className="shrink-0 px-1 text-slate-400">·</span>
                            <button
                              type="button"
                              onClick={() => {
                                setTimePickerField('actualEndTime')
                                setTimePickerOpen(true)
                              }}
                              className={`min-w-0 truncate whitespace-nowrap text-left tracking-[-0.02em] underline decoration-dotted underline-offset-4 transition md:tracking-[-0.04em] cursor-pointer ${
                                previewTask.actualEndTime ? 'text-slate-700 decoration-slate-200 hover:decoration-slate-400' : 'text-slate-400 decoration-slate-200 hover:decoration-slate-300'
                              }`}
                              aria-label="종료시간 입력"
                            >
                              {previewTask.actualEndTime ? `${formatMeridiemHm(previewTask.actualEndTime) ?? previewTask.actualEndTime}까지` : '종료시간 입력'}
                            </button>
                            {previewTask.actualEndTime || actualSecondsDraft > 0 || typeof previewTask.actualSeconds === 'number' ? (
                              <button
                                type="button"
                                onClick={() => {
                                  patchPreviewTask({
                                    actualEndTime: undefined,
                                    actualSeconds: undefined,
                                  })
                                  setActualSecondsDraft(0)
                                }}
                                className="shrink-0 cursor-pointer text-base font-semibold text-slate-400 transition hover:text-slate-600"
                                aria-label="완료 종료/소요시간 삭제"
                              >
                                ×
                              </button>
                            ) : null}
                          </>
                        )}
                      </div>
                      <label className="flex w-fit cursor-pointer items-center gap-2 self-end text-sm font-semibold text-slate-600 md:ml-auto md:self-auto">
                        <input
                          type="checkbox"
                          checked={Boolean(
                            previewTask.status === 'completed' ||
                              previewTask.recordCompleteOnly ||
                              previewTask.actualStartTime ||
                              previewTask.actualEndTime ||
                              typeof previewTask.actualSeconds === 'number',
                          )}
                          onChange={(e) => {
                            const checked = e.target.checked
                            const hasRecordedTime =
                              Boolean(previewTask.actualStartTime && previewTask.actualEndTime) || typeof previewTask.actualSeconds === 'number'
                            if (checked) {
                              if (hasRecordedTime) {
                                patchPreviewTask({ status: 'completed', recordCompleteOnly: false })
                                return
                              }
                              const plannedStart = previewTask.plannedStartTime
                              const plannedSeconds = previewTask.plannedSeconds ?? 0
                              const plannedEnd = plannedStart && plannedSeconds > 0 ? addSecondsToHm(plannedStart, plannedSeconds) : null
                              patchPreviewTask({
                                status: 'completed',
                                recordCompleteOnly: true,
                                actualStartTime: plannedStart && plannedEnd ? plannedStart : undefined,
                                actualEndTime: plannedStart && plannedEnd ? plannedEnd : undefined,
                                actualSeconds: undefined,
                              })
                              return
                            }
                            patchPreviewTask({
                              recordCompleteOnly: false,
                              status: 'pending',
                              actualStartTime: undefined,
                              actualEndTime: undefined,
                              actualSeconds: undefined,
                            })
                          }}
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        완료 처리
                      </label>
                    </div>
                  </div>
                ) : (
                  <>
                    {previewTask.dueDate ? (
                      <div className="flex flex-nowrap items-center gap-2.5 text-base font-medium text-indigo-700">
                        <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-sm font-semibold text-indigo-700">{formatDday(previewTask.dueDate)}</span>
                        <span className="min-w-0 whitespace-nowrap tracking-[-0.02em] md:tracking-[-0.03em] text-indigo-700">{formatDueDateLabel(previewTask.dueDate)}</span>
                      </div>
                    ) : null}
                    <div className={`grid gap-3 ${previewHeadlineTimes.length > 1 && hasPreviewCompare ? 'md:grid-cols-2' : 'md:grid-cols-1'}`}>
                      {previewHeadlineTimes.map((item) => (
                        <div
                          key={item.key}
                          className={`flex w-full min-w-0 flex-nowrap items-center gap-2.5 text-base font-medium ${
                            item.kind === '계획' ? 'text-slate-400' : 'text-slate-700'
                          }`}
                        >
                          <span
                            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold ${
                            item.kind === '완료' ? 'bg-black/80 text-white' : 'bg-slate-100 text-slate-500'
                            }`}
                          >
                            {item.badge}
                          </span>
                          {item.text ? <span className="min-w-0 flex-1 tracking-[-0.02em] md:tracking-[-0.04em]">{item.text}</span> : null}
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {!isEditingPreview && hasPreviewCompare ? (
            <div className="pt-3 md:col-span-2">
              <div className="py-1 text-center">
                {previewActualSummary ? (
                  <CompareRail
                    goalLabel={previewActualSummary.goalLabel}
                    actualLabel={previewActualSummary.actualLabel}
                    deltaLabel={previewActualSummary.deltaLabel}
                    deltaSeconds={previewActualSummary.deltaSeconds}
                    goalSeconds={previewActualSummary.goalSeconds}
                    actualSeconds={previewActualSummary.actualSeconds}
                  />
                ) : null}
              </div>
            </div>
          ) : null}
        </div>

        {isEditingPreview ? (
          <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (!previewTask) return
                  setEditWarningMessage(null)
                  const draft = editTitleDraft.trim()
                  const original = (editTitleOriginalRef.current?.taskId === previewTask.id ? editTitleOriginalRef.current.title : previewTask.title ?? '').trim()
                  const addFallbackTitle = buildNextTaskTitle((previewSubject?.name ?? '').trim(), tasks)
                  const nextTitle = isAddMode ? draft || addFallbackTitle : draft || original || (previewSubject?.name ?? '').trim()
                  if (!previewTask.recordCompleteOnly) {
                    // start-only completion is allowed; only validate when both exist.
                  }
                  const start = hmToMinutes(previewTask.actualStartTime ?? null)
                  const end = hmToMinutes(previewTask.actualEndTime ?? null)
                  if (start !== null && end !== null) {
                    if (end === start) {
                      setEditValidationMessage('완료 종료시간을 시작시간과 동일하게 설정할 수 없어요.')
                      return
                    }
                    const diffMin = end > start ? end - start : end + 24 * 60 - start
                    if (diffMin > 10 * 60) {
                      setEditValidationMessage('완료 시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.')
                      return
                    }
                    if (end < start) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
                  }
                  setEditValidationMessage(null)
                  if (isAddMode) {
                    const createdId = commitAddDraft({ ...previewTask, title: nextTitle })
                    if (!createdId) return
                    setEditTaskId(null)
                    setEditDraft(null)
                    close()
                    return
                  }
                  if (!storedPreviewTask) return
                  commitEditDraft(storedPreviewTask, { ...(previewTask as StudyTask), title: nextTitle })
                  setEditTaskId(null)
                  setEditDraft(null)
                  if (autoCloseAfterCompleteTaskId === previewTask.id) setAutoCloseAfterCompleteTaskId(null)
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-black/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-black/70 disabled:bg-black/30"
              >
                {isAddMode ? '등록' : '완료'}
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!previewTask) return
                  if (isAddMode) {
                    close()
                    return
                  }
                  const start = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualStartTime ?? null)
                  const end = previewTask.recordCompleteOnly ? null : hmToMinutes(previewTask.actualEndTime ?? null)
                  const hasOnlyOne = !previewTask.recordCompleteOnly && ((start === null) !== (end === null))
                  const invalidRange = !previewTask.recordCompleteOnly && start !== null && end !== null && end < start
                  if (hasOnlyOne || invalidRange) {
                    setEditExitConfirmOpen(true)
                    return
                  }
                  setEditTaskId(null)
                  setEditDraft(null)
                  setEditValidationMessage(null)
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
              >
                {isAddMode ? '등록 취소' : '편집 취소'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTimerTaskId(previewTask.id)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-black/80 px-3 text-sm font-semibold text-white transition hover:bg-black/70"
              >
                타이머
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditTaskId(previewTask.id)
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-3 text-sm font-semibold text-slate-900 transition hover:bg-slate-200"
              >
                편집
              </button>
              <button
                type="button"
                onClick={async () => {
                  const ok = await confirm({
                    title: '일정을 삭제할까요?',
                    message: '이 작업은 되돌릴 수 없어요.',
                    confirmLabel: '삭제',
                    danger: true,
                  })
                  if (!ok) return
                  deleteTask(previewTask.id)
                  close()
                }}
                className="inline-flex h-10 items-center justify-center rounded-xl px-3 text-sm font-semibold text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
                aria-label="태스크 삭제"
              >
                삭제
              </button>
            </div>
          </div>
        )}
      </TaskDialogShell>

      {isEditingPreview && datePickerField ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/35 px-4"
          onMouseDown={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setDatePickerField(null)
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setDatePickerField(null)
          }}
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-900">{datePickerField === 'date' ? '날짜 선택' : '디데이 선택'}</div>
              <button type="button" onClick={() => setDatePickerField(null)} className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100" aria-label="닫기">
                닫기
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCalendarMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() - 1, 1))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                aria-label="이전 달"
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-slate-900">{format(calendarMonth, 'yyyy년 M월')}</div>
              <button
                type="button"
                onClick={() => setCalendarMonth((cur) => new Date(cur.getFullYear(), cur.getMonth() + 1, 1))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                aria-label="다음 달"
              >
                ›
              </button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-[11px] font-semibold text-slate-400">
              {['일', '월', '화', '수', '목', '금', '토'].map((d) => (
                <div key={d}>{d}</div>
              ))}
            </div>
            {(() => {
              const first = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1)
              const offset = first.getDay()
              const start = new Date(first)
              start.setDate(first.getDate() - offset)
              const days = Array.from({ length: 42 }, (_, i) => {
                const d = new Date(start)
                d.setDate(start.getDate() + i)
                return d
              })
              return (
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {days.map((d) => (
                    <button
                      key={d.toISOString()}
                      type="button"
                      onClick={() => pickCalendarDay(d)}
                      className="h-10 rounded-xl text-sm font-semibold text-slate-900 hover:bg-slate-100"
                      aria-label={format(d, 'yyyy년 M월 d일')}
                    >
                      {d.getDate()}
                    </button>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      {isEditingPreview && timePickerOpen ? (
        <TimePickerModal
          open
          title={
            timePickerField === 'actualStartTime'
              ? '완료 시작시간'
              : timePickerField === 'actualEndTime'
                ? '완료 종료시간'
                : timePickerField === 'plannedEndTime'
                  ? '계획 종료시간'
                  : '계획 시작시간'
          }
          initialHm={
            (() => {
              if (!previewTask) return null
              return timePickerField === 'actualStartTime'
                ? previewTask.actualStartTime ?? previewTask.actualEndTime ?? null
                : timePickerField === 'actualEndTime'
                  ? previewTask.actualEndTime ?? previewTask.actualStartTime ?? null
                  : timePickerField === 'plannedEndTime'
                    ? (previewTask.plannedStartTime && plannedSecondsDraft > 0
                        ? addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft)
                        : null) ?? null
                    : previewTask.plannedStartTime ?? null
            })()
          }
          onApply={(hm) => {
            if (!previewTask) return
            setEditWarningMessage(null)
            if (timePickerField === 'actualStartTime') {
              const startMin = hmToMinutes(hm)
              const endMin = hmToMinutes(previewTask.actualEndTime ?? null)
              if (startMin === null) return
              let nextActualSeconds = previewTask.actualEndTime ? actualSecondsDraft : undefined
              if (endMin !== null) {
                if (endMin === startMin) return
                const diffMin = endMin > startMin ? endMin - startMin : endMin + 24 * 60 - startMin
                if (diffMin > 10 * 60) return
                if (endMin < startMin) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
                nextActualSeconds = Math.max(0, diffMin * 60)
                setActualSecondsDraft(nextActualSeconds)
              }
              patchPreviewTask({
                actualStartTime: hm,
                // do not auto-fill end time; start-only is allowed
                actualSeconds: nextActualSeconds,
                recordCompleteOnly: false,
                status: 'completed',
              })
            } else if (timePickerField === 'actualEndTime') {
              const startMin = hmToMinutes(previewTask.actualStartTime ?? null)
              const endMin = hmToMinutes(hm)
              if (endMin === null) return
              if (startMin !== null) {
                if (endMin === startMin) return
                const diffMin = endMin > startMin ? endMin - startMin : endMin + 24 * 60 - startMin
                if (diffMin > 10 * 60) return
                if (endMin < startMin) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
                const nextSeconds = Math.max(0, diffMin * 60)
                setActualSecondsDraft(nextSeconds)
                patchPreviewTask({
                  actualEndTime: hm,
                  actualSeconds: nextSeconds > 0 ? nextSeconds : undefined,
                  recordCompleteOnly: false,
                  status: 'completed',
                })
                return
              }
              // end without start: treat as start-only
              patchPreviewTask({ actualStartTime: hm, actualEndTime: undefined, actualSeconds: undefined, recordCompleteOnly: false, status: 'completed' })
            } else if (timePickerField === 'plannedEndTime') {
              if (!previewTask.plannedStartTime) return
              const startMin = hmToMinutes(previewTask.plannedStartTime ?? null)
              const endMin = hmToMinutes(hm)
              if (startMin === null || endMin === null) return
              if (endMin === startMin) return
              const diffMin = endMin > startMin ? endMin - startMin : endMin + 24 * 60 - startMin
              if (diffMin > 10 * 60) return
              if (endMin < startMin) setEditWarningMessage('종료시간이 시작시간보다 빨라서, 다음날까지 진행한 것으로 계산돼요.')
              const nextSeconds = diffMin * 60
              setPlannedSecondsDraft(nextSeconds)
              patchPreviewTask({ plannedSeconds: nextSeconds })
            } else {
              const end = previewTask.plannedStartTime && plannedSecondsDraft > 0 ? addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft) : null
              patchPreviewTask({ plannedStartTime: hm })
              if (end) {
                const nextSeconds = secondsBetweenHm(hm, end) ?? 0
                setPlannedSecondsDraft(nextSeconds)
                patchPreviewTask({ plannedSeconds: nextSeconds })
              } else if (plannedSecondsDraft > 0) {
                // keep duration, recompute end implicitly
                patchPreviewTask({ plannedSeconds: plannedSecondsDraft })
              }
            }
          }}
          onClose={() => setTimePickerOpen(false)}
          validate={(hm) => {
            const proposedMin = hmToMinutes(hm)
            if (proposedMin === null) return null
            if (timePickerField === 'actualStartTime') {
              const endMin = hmToMinutes(previewTask?.actualEndTime ?? null)
              if (endMin !== null) {
                if (endMin === proposedMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
                const diffMin = endMin > proposedMin ? endMin - proposedMin : endMin + 24 * 60 - proposedMin
                if (diffMin > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
              }
            }
            if (timePickerField === 'actualEndTime') {
              const startMin = hmToMinutes(previewTask?.actualStartTime ?? null)
              if (startMin !== null && proposedMin === startMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
              if (startMin !== null) {
                const diffMin = proposedMin > startMin ? proposedMin - startMin : proposedMin + 24 * 60 - startMin
                if (diffMin > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
              }
            }
            if (timePickerField === 'plannedEndTime') {
              const startMin = hmToMinutes(previewTask?.plannedStartTime ?? null)
              if (startMin !== null) {
                if (proposedMin === startMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
                const diffMin = proposedMin > startMin ? proposedMin - startMin : proposedMin + 24 * 60 - startMin
                if (diffMin > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
              }
            }
            if (timePickerField === 'plannedStartTime') {
              const endHm = previewTask?.plannedStartTime && plannedSecondsDraft > 0 ? addSecondsToHm(previewTask.plannedStartTime, plannedSecondsDraft) : null
              const endMin = hmToMinutes(endHm ?? null)
              if (endMin !== null) {
                if (endMin === proposedMin) return '종료시간을 시작시간과 동일하게 설정할 수 없어요.'
                const diffMin = endMin > proposedMin ? endMin - proposedMin : endMin + 24 * 60 - proposedMin
                if (diffMin > 10 * 60) return '시작/종료 간격이 10시간을 넘어서 저장할 수 없어요.'
              }
            }
            return null
          }}
        />
      ) : null}

      {isEditingPreview && editExitConfirmOpen ? (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">편집을 취소할까요?</div>
            <div className="mt-2 text-sm text-slate-500">완료 시작시간과 종료시간이 아직 완성되지 않았어요. 편집을 취소하거나 계속 편집할 수 있어요.</div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setEditExitConfirmOpen(false)}>
                계속 편집
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setEditExitConfirmOpen(false)
                  setEditTaskId(null)
                  setEditDraft(null)
                  setEditValidationMessage(null)
                }}
              >
                편집 취소
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {previewTask && !isAddMode && timerTaskId === previewTask.id ? (
        <TaskTimerModal
          plannedSeconds={previewTask.plannedSeconds ?? 0}
          subjectName={previewSubject?.name ?? '주제'}
          taskTitle={previewTask.title ?? ''}
          subjectColor={previewSubject?.color ?? '#94a3b8'}
          onClose={() => setTimerTaskId(null)}
          onRecord={(result) => {
            updateTask(previewTask.id, { actualStartTime: result.actualStartTime, actualEndTime: result.actualEndTime, actualSeconds: result.actualSeconds })
          }}
        />
      ) : null}
    </>
  )
}
