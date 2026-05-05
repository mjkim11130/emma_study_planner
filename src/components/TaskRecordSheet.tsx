import { useEffect, useMemo, useRef, useState } from 'react'
import { formatHmsFromSeconds } from '../lib/time'
import { usePlannerStore } from '../store/usePlannerStore'

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

function formatTimeButtonLabel(value: string, emptyLabel: string) {
  if (!value) return emptyLabel
  const match = /^(\d{1,2}):(\d{2})$/.exec(value)
  if (!match) return value
  const hour24 = Number(match[1])
  const minute = Number(match[2])
  const meridiem = hour24 < 12 ? '오전' : '오후'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return `${meridiem} ${String(hour12).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

export function TaskRecordSheet({
  taskId,
  open,
  onClose,
}: {
  taskId: string | null
  open: boolean
  onClose: () => void
}) {
  const task = usePlannerStore(useMemo(() => (s) => s.tasks.find((x) => x.id === taskId), [taskId]))
  const updateTask = usePlannerStore((s) => s.updateTask)
  const subjects = usePlannerStore((s) => s.subjects)
  const subject = useMemo(() => subjects.find((s) => s.id === task?.subjectId) ?? null, [subjects, task?.subjectId])

  const [isClosing, setIsClosing] = useState(false)
  const [dragY, setDragY] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const dragStartYRef = useRef<number | null>(null)
  const closeTimerRef = useRef<number | null>(null)

  const [isRunning, setIsRunning] = useState(false)
  const [elapsedSec, setElapsedSec] = useState(0)
  const [actualStartDraft, setActualStartDraft] = useState('')
  const [actualEndDraft, setActualEndDraft] = useState('')
  const tickerRef = useRef<number | null>(null)
  const startInputRef = useRef<HTMLInputElement | null>(null)
  const endInputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!open || !task) return
    setIsClosing(false)
    setDragY(0)
    setIsDragging(false)
    setIsRunning(false)
    setElapsedSec(task.actualSeconds ?? 0)
    setActualStartDraft(task.actualStartTime ?? '')
    setActualEndDraft(task.actualEndTime ?? '')
  }, [open, task?.id])

  useEffect(() => {
    return () => {
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
      if (tickerRef.current) window.clearInterval(tickerRef.current)
    }
  }, [])

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
    if (!isDragging) return
    const onMove = (event: PointerEvent) => {
      if (dragStartYRef.current === null) return
      setDragY(Math.max(0, event.clientY - dragStartYRef.current))
    }
    const onUp = () => {
      setIsDragging(false)
      if (dragY > 90) requestClose()
      else setDragY(0)
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

  if (!open || !task) return null

  const openNativePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current
    if (!el) return
    if (typeof el.showPicker === 'function') {
      el.showPicker()
      return
    }
    el.click()
  }

  const isInvalidActualRange = (() => {
    const s = hmToSecondsLocal(actualStartDraft || undefined)
    const e = hmToSecondsLocal(actualEndDraft || undefined)
    if (s === null || e === null) return false
    return e < s
  })()
  const hasAnyRecord = Boolean(task.actualStartTime || task.actualEndTime || task.actualSeconds !== undefined)
  const canClearRecord = hasAnyRecord || task.status === 'completed'
  const hasRecordInputChanges = actualStartDraft !== (task.actualStartTime ?? '') || actualEndDraft !== (task.actualEndTime ?? '')
  const canSaveTypedRecord = Boolean(actualStartDraft && actualEndDraft) && !isInvalidActualRange
  const plannedSec = Math.max(0, task.plannedSeconds ?? 0)

  const animateClose = () => {
    setIsClosing(true)
    setDragY(520)
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current)
    closeTimerRef.current = window.setTimeout(() => onClose(), 180)
  }

  const requestClose = () => {
    if (isRunning) return
    animateClose()
  }

  const saveTypedRecord = () => {
    if (!canSaveTypedRecord) return
    updateTask(task.id, {
      actualStartTime: actualStartDraft || undefined,
      actualEndTime: actualEndDraft || undefined,
      actualSeconds: undefined,
      status: 'completed',
    })
    animateClose()
  }

  const clearRecord = () => {
    setIsRunning(false)
    setElapsedSec(0)
    setActualStartDraft('')
    setActualEndDraft('')
    updateTask(task.id, {
      actualStartTime: undefined,
      actualEndTime: undefined,
      actualSeconds: undefined,
      status: 'pending',
    })
    animateClose()
  }

  const fieldButtonBase =
    'relative flex min-h-12 w-full items-center justify-center rounded-2xl px-4 py-3 text-center text-sm font-semibold transition'

  return (
    <>
      <div
        className={`fixed inset-0 z-[70] bg-slate-900/30 transition-opacity duration-150 ${isClosing ? 'opacity-0' : 'opacity-100'}`}
        onClick={requestClose}
      />
      <div
        className="fixed inset-x-0 bottom-0 z-[80] mx-auto w-full max-w-3xl rounded-t-[28px] border border-slate-200 bg-white shadow-2xl"
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
          <input
            ref={startInputRef}
            type="time"
            value={actualStartDraft}
            onChange={(e) => setActualStartDraft(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />
          <input
            ref={endInputRef}
            type="time"
            value={actualEndDraft}
            onChange={(e) => setActualEndDraft(e.target.value)}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
          />

          <div className="grid grid-cols-1 gap-5 py-2">
            <div>
              <div className="text-3xl font-semibold tracking-[-0.03em] text-slate-900">{task.title}</div>
              <div className="mt-2 text-sm font-medium text-slate-500">{subject?.name ?? '과목'}</div>
            </div>

            <div className="rounded-3xl bg-slate-50 px-5 py-5 text-center">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">record timer</div>
              <div className="mt-2 text-4xl font-semibold tracking-[-0.03em] text-slate-900">{formatHmsFromSeconds(elapsedSec)}</div>
              <div className="mt-2 text-sm text-slate-500">
                목표 {plannedSec > 0 ? formatHmsFromSeconds(plannedSec) : '-'}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              <div className="text-[11px] font-semibold text-slate-400">기록</div>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => openNativePicker(startInputRef)}
                  className={`${fieldButtonBase} ${actualStartDraft ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}
                >
                  {formatTimeButtonLabel(actualStartDraft, '기록 시작시간')}
                </button>
                <button
                  type="button"
                  onClick={() => openNativePicker(endInputRef)}
                  className={`${fieldButtonBase} ${actualEndDraft ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-400'}`}
                >
                  {formatTimeButtonLabel(actualEndDraft, '기록 종료시간')}
                </button>
              </div>
              {isInvalidActualRange ? <div className="text-sm font-semibold text-rose-700">종료시간이 시작시간보다 빨라요.</div> : null}
            </div>

            <div className="sticky bottom-0 mt-5 bg-white/95 py-3 backdrop-blur">
              {isRunning ? (
                <button
                  type="button"
                  onClick={() => {
                    const startSec = hmToSecondsLocal(task.actualStartTime)
                    const endFromTimer = startSec !== null ? startSec + elapsedSec : null
                    const endHm = endFromTimer !== null ? minutesToHm(Math.floor(endFromTimer / 60)) : undefined
                    setIsRunning(false)
                    updateTask(task.id, { actualSeconds: elapsedSec, actualEndTime: endHm, status: 'completed' })
                    animateClose()
                  }}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800"
                >
                  타이머 기록 저장
                </button>
              ) : hasRecordInputChanges ? (
                <button
                  type="button"
                  disabled={!canSaveTypedRecord}
                  onClick={saveTypedRecord}
                  className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800 disabled:bg-slate-300"
                >
                  입력한 기록 저장
                </button>
              ) : canClearRecord ? (
                <button
                  type="button"
                  onClick={clearRecord}
                  className="w-full rounded-2xl bg-rose-600 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-rose-500"
                >
                  기록 삭제
                </button>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const now = new Date()
                      const nowHm = minutesToHm(now.getHours() * 60 + now.getMinutes())
                      setActualStartDraft(nowHm)
                      setActualEndDraft('')
                      updateTask(task.id, { actualStartTime: nowHm, actualEndTime: undefined, actualSeconds: undefined, status: 'pending' })
                      setElapsedSec(0)
                      setIsRunning(true)
                    }}
                    className="w-full rounded-2xl bg-slate-900 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-slate-800"
                  >
                    타이머 기록 시작
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateTask(task.id, { actualStartTime: undefined, actualEndTime: undefined, actualSeconds: undefined, status: 'completed' })
                      animateClose()
                    }}
                    className="w-full rounded-2xl bg-slate-100 px-4 py-3.5 text-base font-semibold text-slate-900 transition hover:bg-slate-200"
                  >
                    완료 처리
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
