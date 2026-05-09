import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '../lib/useEscapeKey'

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(n)))

function parseHm(value: string | null | undefined) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? '')
  if (!m) return null
  const h = clampInt(Number(m[1]), 0, 23)
  const mm = clampInt(Number(m[2]), 0, 59)
  return { hour: h, minute: mm }
}

function buildMinuteValues(stepMinutes: number) {
  const values: number[] = []
  for (let minute = 0; minute < 60; minute += stepMinutes) values.push(minute)
  return values
}

function snapMinuteToStep(minute: number, stepMinutes: number) {
  const values = buildMinuteValues(stepMinutes)
  return values.reduce((closest, current) => (Math.abs(current - minute) < Math.abs(closest - minute) ? current : closest), values[0] ?? 0)
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

function formatMeridiemHourPartsKo(hour24: number) {
  const h = clampInt(hour24, 0, 23)
  const meridiem = h < 12 ? '오전' : '오후'
  const hour12 = h % 12 === 0 ? 12 : h % 12
  return { meridiem, hourLabel: `${hour12}시` }
}

type TimePickerModalProps = {
  open: boolean
  title: string
  initialHm?: string | null
  stepMinutes?: number
  onApply: (hm: string) => void
  onClose: () => void
  validate?: (hm: string) => string | null
}

export function TimePickerModal({
  open,
  title,
  initialHm,
  stepMinutes = 1,
  onApply,
  onClose,
  validate,
}: TimePickerModalProps) {
  const step = useMemo(() => clampInt(stepMinutes, 1, 60), [stepMinutes])
  const minuteValues = useMemo(() => buildMinuteValues(step), [step])
  const minuteCount = minuteValues.length

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const hourListRef = useRef<HTMLDivElement | null>(null)
  const minuteListRef = useRef<HTMLDivElement | null>(null)
  const closeQueuedRef = useRef(false)

  const [draftHour, setDraftHour] = useState(0)
  const [draftMinute, setDraftMinute] = useState(0)

  useEffect(() => {
    if (!open) return
    const fallbackHm = nowHmRoundedTo(step)
    const parsed = parseHm(initialHm) ?? parseHm(fallbackHm)
    const h = parsed ? clampInt(parsed.hour, 0, 23) : 0
    const snappedMinute = snapMinuteToStep(clampInt(parsed?.minute ?? 0, 0, 59), step)
    setDraftHour(h)
    setDraftMinute(snappedMinute)
    window.setTimeout(() => {
      dialogRef.current?.focus()
      const itemH = 44
      hourListRef.current?.scrollTo({ top: h * itemH, behavior: 'instant' as ScrollBehavior })
      const minuteIndex = Math.max(0, minuteValues.indexOf(snappedMinute))
      minuteListRef.current?.scrollTo({ top: minuteIndex * itemH, behavior: 'instant' as ScrollBehavior })
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEscapeKey(open, onClose, 90)

  const hm = `${String(clampInt(draftHour, 0, 23)).padStart(2, '0')}:${String(snapMinuteToStep(clampInt(draftMinute, 0, 59), step)).padStart(2, '0')}`
  const validationMessage = validate?.(hm) ?? null
  const invalid = Boolean(validationMessage)

  const queueClose = () => {
    if (closeQueuedRef.current) return
    closeQueuedRef.current = true
    window.setTimeout(() => {
      closeQueuedRef.current = false
      onClose()
    }, 0)
  }

  if (!open || typeof document === 'undefined') return null

  return createPortal(
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 px-4"
      onPointerDownCapture={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        e.stopPropagation()
        queueClose()
      }}
      onMouseDownCapture={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        e.stopPropagation()
      }}
      onTouchStartCapture={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        e.stopPropagation()
        queueClose()
      }}
      onClickCapture={(e) => {
        if (e.target !== e.currentTarget) return
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl outline-none"
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (invalid) return
            onApply(hm)
            onClose()
          }
        }}
      >
        <div className="flex items-center justify-between">
          <div className="text-base font-semibold text-slate-900">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm font-semibold text-slate-500 hover:bg-slate-100"
            aria-label="닫기"
          >
            닫기
          </button>
        </div>

        <div className="mt-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="relative overflow-hidden rounded-2xl border border-slate-200">
              <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-11 -translate-y-1/2 bg-slate-900/5" />
              <div
                ref={hourListRef}
                className="h-56 snap-y snap-mandatory overflow-y-auto overscroll-contain py-[88px] scroll-smooth"
                onScroll={(e) => {
                  const el = e.currentTarget
                  const itemH = 44
                  const idx = clampInt(Math.round(el.scrollTop / itemH), 0, 23)
                  if (idx !== draftHour) setDraftHour(idx)
                }}
                onWheel={(e) => e.stopPropagation()}
              >
                {Array.from({ length: 24 }, (_, h) => h).map((h) => {
                  const parts = formatMeridiemHourPartsKo(h)
                  const label = `${parts.meridiem} ${parts.hourLabel}`
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => {
                        setDraftHour(h)
                        const itemH = 44
                        hourListRef.current?.scrollTo({ top: h * itemH, behavior: 'smooth' })
                      }}
                      className="flex h-11 w-full snap-center items-center justify-center text-base font-semibold text-slate-900"
                      aria-label={`${label} 선택`}
                    >
                      <span className="font-medium text-slate-500">{parts.meridiem}</span>
                      <span className="ml-1 font-semibold text-slate-900">{parts.hourLabel}</span>
                    </button>
                  )
                })}
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
                  const idx = clampInt(Math.round(el.scrollTop / itemH), 0, minuteCount - 1)
                  const nextMinute = minuteValues[idx] ?? 0
                  if (nextMinute !== draftMinute) setDraftMinute(nextMinute)
                }}
                onWheel={(e) => e.stopPropagation()}
              >
                {minuteValues.map((m, idx) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => {
                        setDraftMinute(m)
                        const itemH = 44
                        minuteListRef.current?.scrollTo({ top: idx * itemH, behavior: 'smooth' })
                      }}
                      className="flex h-11 w-full snap-center items-center justify-center text-base font-medium text-slate-900"
                      aria-label={`${String(m).padStart(2, '0')}분 선택`}
                    >
                      {String(m).padStart(2, '0')}분
                    </button>
                  ))}
              </div>
            </div>
          </div>

        </div>

        {validationMessage ? (
          <div className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">{validationMessage}</div>
        ) : null}

        <div className="mt-3 grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={invalid}
            onClick={() => {
              if (invalid) return
              onApply(hm)
              onClose()
            }}
            className="w-full rounded-2xl bg-black/80 px-4 py-3 text-sm font-semibold text-white transition hover:bg-black/70 disabled:bg-black/30"
          >
            선택
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-2xl bg-slate-100 px-4 py-3 text-sm font-semibold text-slate-900 hover:bg-slate-200"
          >
            취소
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
