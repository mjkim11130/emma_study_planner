import { addMonths, differenceInCalendarDays, format, getDay, isSameDay, isSameMonth, parseISO, startOfMonth, subMonths } from 'date-fns'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from './ui'
import { DurationPickerButton } from './DurationPicker'
import { usePlannerStore } from '../store/usePlannerStore'

type NewTaskSheetDraft = {
  subjectId: string
  title: string
  date: string
  dueDate: string
  plannedStartTime: string
  plannedSeconds: number
}

export type NewTaskSheetInitial = Partial<NewTaskSheetDraft>

function supportsInputType(type: string) {
  if (typeof document === 'undefined') return true
  const input = document.createElement('input')
  input.setAttribute('type', type)
  return input.type === type
}

function parseYmd(value: string) {
  if (!value) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null
  const d = parseISO(value)
  return Number.isNaN(d.getTime()) ? null : d
}

function toYmd(d: Date) {
  return format(d, 'yyyy-MM-dd')
}

function clampInt(n: number, min: number, max: number) {
  const nn = Number.isFinite(n) ? Math.trunc(n) : min
  return Math.max(min, Math.min(max, nn))
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

function buildDraft(initial: NewTaskSheetInitial | null | undefined, defaultSubjectId: string) {
  return {
    subjectId: initial?.subjectId || defaultSubjectId,
    title: initial?.title ?? '',
    date: initial?.date ?? '',
    dueDate: initial?.dueDate ?? '',
    plannedStartTime: initial?.plannedStartTime ?? '',
    plannedSeconds: Math.max(0, Math.floor(initial?.plannedSeconds ?? 0)),
  }
}

function formatDateButtonLabel(value: string) {
  if (!value) return '날짜 선택'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  return `${Number(match[2])}월 ${Number(match[3])}일`
}

function formatDueDateButtonLabel(value: string) {
  if (!value) return '+ 마감일'
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) return value
  const due = parseISO(value)
  if (Number.isNaN(due.getTime())) return `${Number(match[2])}월 ${Number(match[3])}일`
  const today = new Date()
  const diff = differenceInCalendarDays(due, today)
  if (diff === 0) return 'D-day'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

function formatStartTimeButtonLabel(value: string) {
  if (!value) return '□시부터'
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return value
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  const meridiem = hour24 < 12 ? '오전' : '오후'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${meridiem} ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')}부터`
}

function formatDurationButtonLabel(totalSeconds: number) {
  if (!totalSeconds) return '□시간동안'
  const totalMinutes = Math.max(0, Math.floor(totalSeconds / 60))
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (!parts.length) parts.push('0분')
  return `${parts.join(' ')}동안`
}

function nowHmRoundedTo(stepMinutes: number) {
  const step = Math.max(1, Math.min(60, Math.trunc(stepMinutes)))
  const now = new Date()
  const hour = now.getHours()
  const minute = now.getMinutes()
  const rounded = Math.round(minute / step) * step
  const carryHour = rounded >= 60 ? 1 : 0
  const hh = String((hour + carryHour) % 24).padStart(2, '0')
  const mm = String((rounded % 60) || 0).padStart(2, '0')
  return `${hh}:${mm}`
}

export function NewTaskSheet({
  open,
  initial,
  taskId,
  onClose,
}: {
  open: boolean
  initial?: NewTaskSheetInitial | null
  taskId?: string | null
  onClose: () => void
}) {
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const lastUsedSubjectIdByExam = usePlannerStore((s) => s.lastUsedSubjectIdByExam)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const visibleSubjects = useMemo(() => subjects.filter((s) => s.examId === activeExamId), [subjects, activeExamId])
  const lastUsedSubjectId = lastUsedSubjectIdByExam[activeExamId]
  const defaultSubjectId =
    (lastUsedSubjectId && visibleSubjects.some((s) => s.id === lastUsedSubjectId) ? lastUsedSubjectId : null) ??
    visibleSubjects[0]?.id ??
    subjects[0]?.id ??
    ''

  const [draft, setDraft] = useState<NewTaskSheetDraft>(() => buildDraft(initial, defaultSubjectId))
  const [initialDraft, setInitialDraft] = useState<NewTaskSheetDraft>(() => buildDraft(initial, defaultSubjectId))
  const [confirmCloseOpen, setConfirmCloseOpen] = useState(false)
  const [isClosing, setIsClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const [isSubjectManuallySelected, setIsSubjectManuallySelected] = useState(false)
  const dragStartYRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)
  const subjectListRef = useRef<HTMLDivElement | null>(null)
  const subjectButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  // Always use custom pickers for consistent UX across OS/browsers.
  useMemo(() => supportsInputType('date'), [])
  useMemo(() => supportsInputType('time'), [])

  const [datePickerField, setDatePickerField] = useState<null | 'date' | 'dueDate'>(null)
  const [timePickerOpen, setTimePickerOpen] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => startOfMonth(new Date()))
  const timeDialogRef = useRef<HTMLDivElement | null>(null)
  const hourListRef = useRef<HTMLDivElement | null>(null)
  const minuteListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    const next = buildDraft(initial, defaultSubjectId)
    if (!taskId && !next.plannedStartTime) {
      next.plannedStartTime = nowHmRoundedTo(5)
    }
    setDraft(next)
    setInitialDraft(next)
    setConfirmCloseOpen(false)
    setIsClosing(false)
    setDragY(0)
    setIsDragging(false)
    setIsSubjectManuallySelected(false)
    setDatePickerField(null)
    setTimePickerOpen(false)
    setCalendarMonth(startOfMonth(new Date()))
  }, [open, initial, defaultSubjectId, taskId])

  useLayoutEffect(() => {
    if (!open) return
    if (taskId) return
    if (isSubjectManuallySelected) return
    if (!draft.subjectId) return
    const el = subjectButtonRefs.current[draft.subjectId]
    if (!el) return
    el.scrollIntoView({ behavior: 'instant' as ScrollBehavior, block: 'nearest', inline: 'center' })
  }, [open, taskId, isSubjectManuallySelected, draft.subjectId])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    }
  }, [])

  const selectedSubject = visibleSubjects.find((s) => s.id === draft.subjectId) ?? subjects.find((s) => s.id === draft.subjectId)
  const isDirty = JSON.stringify(draft) !== JSON.stringify(initialDraft)

  const openCalendarFor = (field: 'date' | 'dueDate') => {
    setDatePickerField(field)
    const current = parseYmd(field === 'date' ? draft.date : draft.dueDate)
    setCalendarMonth(startOfMonth(current ?? new Date()))
  }

  const pickCalendarDay = (d: Date) => {
    const ymd = toYmd(d)
    if (datePickerField === 'date') setDraft((cur) => ({ ...cur, date: ymd }))
    if (datePickerField === 'dueDate') setDraft((cur) => ({ ...cur, dueDate: ymd }))
    setDatePickerField(null)
  }

  const timeDraft = useMemo(() => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(draft.plannedStartTime)
    const h = m ? clampInt(Number(m[1]), 0, 23) : 0
    const mm = m ? clampInt(Number(m[2]), 0, 59) : 0
    const step = 5
    const snappedMinute = Math.round(mm / step) * step
    return { hour: h, minute: clampInt(snappedMinute, 0, 55) }
  }, [draft.plannedStartTime])

  const setTimeDraft = (nextHour: number, nextMinute: number) => {
    const h = clampInt(nextHour, 0, 23)
    const m = clampInt(nextMinute, 0, 59)
    setDraft((cur) => ({ ...cur, plannedStartTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}` }))
  }

  useEffect(() => {
    if (!timePickerOpen) return
    window.setTimeout(() => {
      timeDialogRef.current?.focus()
      const itemH = 44
      hourListRef.current?.scrollTo({ top: timeDraft.hour * itemH, behavior: 'instant' as ScrollBehavior })
      minuteListRef.current?.scrollTo({ top: (timeDraft.minute / 5) * itemH, behavior: 'instant' as ScrollBehavior })
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timePickerOpen])

  const snapTimeToPicker = () => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(draft.plannedStartTime)
    const h = m ? clampInt(Number(m[1]), 0, 23) : 0
    const mm = m ? clampInt(Number(m[2]), 0, 59) : 0
    const snapped = clampInt(Math.round(mm / 5) * 5, 0, 55)
    setDraft((cur) => ({ ...cur, plannedStartTime: `${String(h).padStart(2, '0')}:${String(snapped).padStart(2, '0')}` }))
    const itemH = 44
    hourListRef.current?.scrollTo({ top: h * itemH, behavior: 'smooth' })
    minuteListRef.current?.scrollTo({ top: (snapped / 5) * itemH, behavior: 'smooth' })
  }

  const finishClose = () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => {
      onClose()
    }, 180)
  }

  const animateClose = () => {
    setConfirmCloseOpen(false)
    setIsDragging(false)
    setIsClosing(true)
    setDragY(520)
    finishClose()
  }

  const saveTask = () => {
    if (!draft.subjectId) return
    const fallbackTitle = selectedSubject?.name?.trim() || '새 일정'
    if (taskId) {
      updateTask(taskId, {
        subjectId: draft.subjectId,
        title: draft.title.trim() || fallbackTitle,
        date: draft.date.trim() || '',
        dueDate: draft.dueDate.trim() || undefined,
        plannedStartTime: draft.plannedStartTime.trim() || undefined,
        plannedSeconds: draft.plannedSeconds,
      })
    } else {
      addTask({
        subjectId: draft.subjectId,
        title: draft.title.trim() || fallbackTitle,
        date: draft.date.trim() || undefined,
        dueDate: draft.dueDate.trim() || undefined,
        plannedStartTime: draft.plannedStartTime.trim() || undefined,
        plannedSeconds: draft.plannedSeconds,
        examId: activeExamId,
      })
    }
    animateClose()
  }

  const requestClose = () => {
    if (!isDirty) {
      animateClose()
      return
    }
    setConfirmCloseOpen(true)
  }

  useEffect(() => {
    if (!isDragging) return
    const onMove = (event: PointerEvent) => {
      if (dragStartYRef.current === null) return
      setDragY(Math.max(0, event.clientY - dragStartYRef.current))
    }
    const onUp = () => {
      setIsDragging(false)
      if (dragY > 90) {
        requestClose()
      } else {
        setDragY(0)
      }
      dragStartYRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [isDragging, dragY])

  if (!open) return null

  const subjectPillBase = 'shrink-0 rounded-full px-3 py-2 text-sm font-semibold transition'
  const fieldButtonBase =
    'relative flex min-h-12 w-full items-center justify-center rounded-2xl px-4 py-3 text-center text-sm font-semibold transition'

  return (
    <>
      <div
        className={`fixed inset-0 z-50 bg-slate-900/30 transition-opacity duration-150 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={requestClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[60] mx-auto w-full max-w-3xl rounded-t-[28px] border border-slate-200 bg-white shadow-2xl"
        style={{
          transform: `translateY(${dragY}px)`,
          transition: isDragging ? 'none' : 'transform 180ms ease-out',
        }}
      >
        <div
          className="flex justify-center px-4 pb-2 pt-3"
          onPointerDown={(event) => {
            dragStartYRef.current = event.clientY - dragY
            setIsDragging(true)
          }}
          style={{ touchAction: 'none' }}
        >
          <div className="h-1.5 w-12 rounded-full bg-slate-200" />
        </div>

        <div className="max-h-[78vh] overflow-y-auto px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          <div className="grid grid-cols-1 gap-5 py-2">
            <div>
              <input
                value={draft.title}
                onChange={(e) => setDraft((cur) => ({ ...cur, title: e.target.value }))}
                onBlur={() => {
                  const trimmed = draft.title.trim()
                  if (trimmed) return
                  const fallback = selectedSubject?.name?.trim()
                  if (!fallback) return
                  setDraft((cur) => ({ ...cur, title: fallback }))
                }}
                placeholder={isSubjectManuallySelected ? (selectedSubject?.name ?? '제목 입력') : '제목 입력'}
                className="w-full border-b border-slate-200 bg-transparent pb-3 text-3xl font-semibold tracking-[-0.03em] text-slate-900 outline-none placeholder:text-slate-300"
              />
            </div>

            <div ref={subjectListRef} className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
              {visibleSubjects.map((subject) => {
                const selected = subject.id === draft.subjectId
                const textColor = pickReadableTextColor(subject.color)
                return (
                  <button
                    key={subject.id}
                    type="button"
                    ref={(el) => {
                      subjectButtonRefs.current[subject.id] = el
                    }}
                    onClick={() => {
                      setIsSubjectManuallySelected(true)
                      setDraft((cur) => ({ ...cur, subjectId: subject.id }))
                    }}
                    className={`${subjectPillBase} ${selected ? 'ring-2 ring-slate-900/15 ring-offset-1 opacity-100' : 'border border-slate-200/80 opacity-45 saturate-[0.75]'}`}
                    style={{
                      background: subject.color,
                      color: textColor,
                      boxShadow: selected ? '0 0 0 1px rgba(15,23,42,0.04)' : undefined,
                    }}
                  >
                    {subject.name}
                  </button>
                )
              })}
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold text-slate-400">날짜</div>
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => openCalendarFor('date')}
                  className="min-w-0 flex-1 truncate text-left text-2xl font-semibold tracking-[-0.03em] text-slate-900"
                  aria-label="날짜 선택"
                >
                  {formatDateButtonLabel(draft.date)}
                </button>

                <div className="relative shrink-0">
                  <button
                    type="button"
                    onClick={() => openCalendarFor('dueDate')}
                    className={`rounded-full px-3 py-2 text-sm font-semibold ${
                      draft.dueDate ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                    aria-label="마감일 선택"
                  >
                    {formatDueDateButtonLabel(draft.dueDate)}
                  </button>
                  {draft.dueDate ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDraft((cur) => ({ ...cur, dueDate: '' }))
                      }}
                      className="absolute -right-1 -top-1 z-20 h-6 w-6 rounded-full bg-slate-900 text-sm font-semibold text-white"
                      aria-label="마감일 삭제"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold text-slate-400">목표</div>
              <div className="grid grid-cols-2 gap-3">
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setTimePickerOpen(true)}
                    className={`${fieldButtonBase} ${draft.plannedStartTime ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'} w-full text-left`}
                    aria-label="목표 시작시간 선택"
                  >
                    {formatStartTimeButtonLabel(draft.plannedStartTime)}
                  </button>
                  {draft.plannedStartTime ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDraft((cur) => ({ ...cur, plannedStartTime: '' }))
                      }}
                      className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/18 px-2 py-0.5 text-xs font-semibold text-white"
                      aria-label="목표 시작시간 삭제"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
                <div className="relative">
                  <DurationPickerButton
                    valueSeconds={draft.plannedSeconds}
                    onChangeSeconds={(nextSeconds) => setDraft((cur) => ({ ...cur, plannedSeconds: nextSeconds }))}
                    maxHours={99}
                    minuteStep={5}
                    buttonLabel={formatDurationButtonLabel(draft.plannedSeconds)}
                    buttonClassName={`${fieldButtonBase} ${draft.plannedSeconds > 0 ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}
                    ariaLabel="목표 소요시간 선택"
                  />
                  {draft.plannedSeconds > 0 ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        setDraft((cur) => ({ ...cur, plannedSeconds: 0 }))
                      }}
                      className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full bg-white/18 px-2 py-0.5 text-xs font-semibold text-white"
                      aria-label="목표 소요시간 삭제"
                    >
                      ×
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </div>

          <div className="sticky bottom-0 mt-5 bg-white/95 py-3 backdrop-blur">
            <button
              type="button"
              onClick={saveTask}
              disabled={!draft.subjectId}
              className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
            >
              입력 완료
            </button>
          </div>
        </div>
      </div>

      {datePickerField ? (
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
              <div className="text-base font-semibold text-slate-900">
                {datePickerField === 'date' ? '날짜 선택' : '마감일 선택'}
              </div>
              <button
                type="button"
                onClick={() => setDatePickerField(null)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                닫기
              </button>
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setCalendarMonth((cur) => startOfMonth(subMonths(cur, 1)))}
                className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200"
                aria-label="이전 달"
              >
                ‹
              </button>
              <div className="text-sm font-semibold text-slate-900">{format(calendarMonth, 'yyyy년 M월')}</div>
              <button
                type="button"
                onClick={() => setCalendarMonth((cur) => startOfMonth(addMonths(cur, 1)))}
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
              const first = startOfMonth(calendarMonth)
              const offset = getDay(first) // 0(Sun) - 6(Sat)
              const start = new Date(first)
              start.setDate(first.getDate() - offset)
              const selected =
                parseYmd(datePickerField === 'date' ? draft.date : draft.dueDate) ??
                (datePickerField === 'date' ? null : null)
              const today = new Date()
              const days = Array.from({ length: 42 }, (_, i) => {
                const d = new Date(start)
                d.setDate(start.getDate() + i)
                return d
              })
              return (
                <div className="mt-2 grid grid-cols-7 gap-1">
                  {days.map((d) => {
                    const inMonth = isSameMonth(d, calendarMonth)
                    const isSelected = selected ? isSameDay(d, selected) : false
                    const isToday = isSameDay(d, today)
                    return (
                      <button
                        key={d.toISOString()}
                        type="button"
                        onClick={() => pickCalendarDay(d)}
                        className={`relative rounded-xl py-2 text-sm font-semibold transition ${
                          isSelected
                            ? 'bg-slate-900 text-white'
                            : inMonth
                              ? 'text-slate-900 hover:bg-slate-100'
                              : 'text-slate-300 hover:bg-slate-50'
                        } ${!isSelected && isToday ? 'ring-1 ring-slate-900/25' : ''}`}
                        aria-label={`${format(d, 'yyyy-MM-dd')} 선택`}
                      >
                        {d.getDate()}
                        {!isSelected && isToday ? (
                          <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-slate-900/45" />
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              )
            })()}
          </div>
        </div>
      ) : null}

      {timePickerOpen ? (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/35 px-4"
          onMouseDown={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setTimePickerOpen(false)
          }}
          onTouchStart={(e) => {
            e.stopPropagation()
            if (e.target === e.currentTarget) setTimePickerOpen(false)
          }}
        >
          <div
            ref={timeDialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl outline-none"
            onMouseDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <div className="text-base font-semibold text-slate-900">시작시간 선택</div>
              <button
                type="button"
                onClick={() => setTimePickerOpen(false)}
                className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                닫기
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="relative overflow-hidden rounded-2xl border border-slate-200">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 bg-slate-900/5" />
                <div
                  ref={hourListRef}
                  className="h-56 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] scroll-smooth"
                  onScroll={(e) => {
                    const el = e.currentTarget
                    const itemH = 44
                    const idx = clampInt(Math.round(el.scrollTop / itemH), 0, 23)
                    if (idx !== timeDraft.hour) {
                      setTimeDraft(idx, timeDraft.minute)
                    }
                  }}
                  onWheel={(e) => {
                    // prevent page scroll while interacting
                    e.stopPropagation()
                  }}
                >
                  {Array.from({ length: 24 }, (_, h) => h).map((h) => (
                    <div key={h} className="flex h-11 snap-center items-center justify-center text-base font-semibold text-slate-900">
                      {String(h).padStart(2, '0')}시
                    </div>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-2xl border border-slate-200">
                <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 bg-slate-900/5" />
                <div
                  ref={minuteListRef}
                  className="h-56 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] scroll-smooth"
                  onScroll={(e) => {
                    const el = e.currentTarget
                    const itemH = 44
                    const idx = clampInt(Math.round(el.scrollTop / itemH), 0, 11)
                    const mm = idx * 5
                    if (mm !== timeDraft.minute) {
                      setTimeDraft(timeDraft.hour, mm)
                    }
                  }}
                  onWheel={(e) => e.stopPropagation()}
                >
                  {Array.from({ length: 12 }, (_, i) => i * 5).map((m) => (
                    <div key={m} className="flex h-11 snap-center items-center justify-center text-base font-semibold text-slate-900">
                      {String(m).padStart(2, '0')}분
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-4">
              <button
                type="button"
                onClick={() => {
                  snapTimeToPicker()
                  setTimePickerOpen(false)
                }}
                className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800"
              >
                적용
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmCloseOpen ? (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">일정을 저장할까요?</div>
            <div className="mt-2 text-sm text-slate-500">아직 입력 완료를 누르지 않았어요. 저장하고 닫거나, 취소하고 작성 중인 내용을 버릴 수 있어요.</div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setConfirmCloseOpen(false)}>
                계속 작성
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setConfirmCloseOpen(false)
                  animateClose()
                }}
              >
                취소
              </Button>
              <Button
                onClick={() => {
                  setConfirmCloseOpen(false)
                  saveTask()
                }}
                disabled={!draft.subjectId}
              >
                저장
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
