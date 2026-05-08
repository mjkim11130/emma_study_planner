import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const clampInt = (n: number, min: number, max: number) => Math.max(min, Math.min(max, Math.trunc(n)))

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatDurationKo(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (hours <= 0 && minutes <= 0) return '시간 선택'
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`
  if (hours > 0) return `${hours}시간`
  return `${minutes}분`
}

type DurationPickerProps = {
  valueSeconds: number
  onChangeSeconds: (nextSeconds: number) => void
  maxHours?: number
  buttonClassName?: string
  buttonLabel?: string
  ariaLabel?: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DurationPickerButton({
  valueSeconds,
  onChangeSeconds,
  maxHours = 10,
  buttonClassName,
  buttonLabel,
  ariaLabel,
  open: openProp,
  onOpenChange,
}: DurationPickerProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = typeof openProp === 'boolean' ? openProp : uncontrolledOpen
  const setOpen = (next: boolean) => {
    if (typeof openProp !== 'boolean') setUncontrolledOpen(next)
    onOpenChange?.(next)
  }

  const hours = Math.floor(Math.max(0, valueSeconds) / 3600)
  const minutes = Math.floor((Math.max(0, valueSeconds) % 3600) / 60)

  const initialHour = clampInt(hours, 0, maxHours)
  const initialMinute = useMemo(() => clampInt(minutes, 0, 59), [minutes])
  const minuteCount = 60

  const [draftHour, setDraftHour] = useState(initialHour)
  const [draftMinute, setDraftMinute] = useState(initialMinute)

  const dialogRef = useRef<HTMLDivElement | null>(null)
  const hourListRef = useRef<HTMLDivElement | null>(null)
  const minuteListRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return
    setDraftHour(initialHour)
    setDraftMinute(initialMinute)
    // focus for esc/keyboard
    window.setTimeout(() => dialogRef.current?.focus(), 0)
    window.setTimeout(() => {
      const itemH = 44
      hourListRef.current?.scrollTo({ top: initialHour * itemH, behavior: 'instant' as ScrollBehavior })
      minuteListRef.current?.scrollTo({ top: initialMinute * itemH, behavior: 'instant' as ScrollBehavior })
    }, 0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  useEffect(() => {
    if (!open) return
    const next = clampInt(draftHour, 0, maxHours) * 3600 + clampInt(draftMinute, 0, 59) * 60
    onChangeSeconds(next)
  }, [open, draftHour, draftMinute, maxHours, onChangeSeconds])

  const label = buttonLabel ?? formatDurationKo(valueSeconds)

  return (
    <>
      <button
        type="button"
        className={buttonClassName}
        aria-label={ariaLabel ?? '소요시간 선택'}
        onClick={() => setOpen(true)}
      >
        {label}
      </button>

      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/35 px-4"
              onMouseDown={(e) => {
                e.stopPropagation()
                if (e.target === e.currentTarget) setOpen(false)
              }}
              onTouchStart={(e) => {
                e.stopPropagation()
                if (e.target === e.currentTarget) setOpen(false)
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
              >
                <div className="flex items-center justify-between">
                  <div className="text-base font-semibold text-slate-900">소요시간 선택</div>
                  <button
                    type="button"
                    onClick={() => setOpen(false)}
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
                          const idx = clampInt(Math.round(el.scrollTop / itemH), 0, maxHours)
                          if (idx !== draftHour) setDraftHour(idx)
                        }}
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {Array.from({ length: maxHours + 1 }, (_, h) => h).map((h) => (
                          <button
                            key={h}
                            type="button"
                            onClick={() => {
                              setDraftHour(h)
                              const itemH = 44
                              hourListRef.current?.scrollTo({ top: h * itemH, behavior: 'smooth' })
                            }}
                            className="flex h-11 w-full snap-center items-center justify-center text-base font-semibold text-slate-900"
                            aria-label={`${h}시간 선택`}
                          >
                            {h}시간
                          </button>
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
                          const idx = clampInt(Math.round(el.scrollTop / itemH), 0, minuteCount - 1)
                          if (idx !== draftMinute) setDraftMinute(idx)
                        }}
                        onWheel={(e) => e.stopPropagation()}
                      >
                        {Array.from({ length: minuteCount }, (_, m) => m).map((m) => (
                            <button
                              key={m}
                              type="button"
                              onClick={() => {
                                setDraftMinute(m)
                                const itemH = 44
                                minuteListRef.current?.scrollTo({ top: m * itemH, behavior: 'smooth' })
                              }}
                              className="flex h-11 w-full snap-center items-center justify-center text-base font-medium text-slate-900"
                              aria-label={`${pad2(m)}분 선택`}
                            >
                              {pad2(m)}분
                            </button>
                          ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    {[
                      { label: '+1시간', delta: 60 * 60 },
                      { label: '+30분', delta: 30 * 60 },
                    ].map((q) => (
                      <button
                        key={q.label}
                        type="button"
                        onClick={() => {
                          const cur = clampInt(draftHour, 0, maxHours) * 3600 + clampInt(draftMinute, 0, 59) * 60
                          const next = Math.max(0, Math.min(maxHours * 3600 + 59 * 60, cur + q.delta))
                          const nextH = clampInt(Math.floor(next / 3600), 0, maxHours)
                          const nextM = clampInt(Math.floor((next % 3600) / 60), 0, 59)
                          setDraftHour(nextH)
                          setDraftMinute(nextM)
                          const itemH = 44
                          hourListRef.current?.scrollTo({ top: nextH * itemH, behavior: 'smooth' })
                          minuteListRef.current?.scrollTo({ top: nextM * itemH, behavior: 'smooth' })
                        }}
                        className="rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-200"
                      >
                        {q.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false)
                    }}
                    className="w-full rounded-2xl bg-black/80 px-4 py-3.5 text-base font-semibold text-white transition hover:bg-black/70"
                  >
                    적용
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
