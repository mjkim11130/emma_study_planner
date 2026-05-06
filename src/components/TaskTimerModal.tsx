import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const pad2 = (n: number) => String(n).padStart(2, '0')

function formatHm(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
}

function formatHms(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hh = Math.floor(s / 3600)
  const mm = Math.floor((s % 3600) / 60)
  const ss = s % 60
  return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`
}

function formatDurationKo(totalSeconds: number) {
  const s = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(s / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (hours <= 0 && minutes <= 0) return '0분'
  if (hours > 0 && minutes > 0) return `${hours}시간 ${minutes}분`
  if (hours > 0) return `${hours}시간`
  return `${minutes}분`
}

function formatMeridiemHmString(hm: string) {
  const [hourText, minuteText] = hm.split(':')
  const hours = Number(hourText)
  const minutes = Number(minuteText)
  const meridiem = hours < 12 ? '오전' : '오후'
  const hour12 = hours % 12 === 0 ? 12 : hours % 12
  return `${meridiem} ${hour12}:${pad2(minutes)}`
}

function pickReadableTextColor(bgColor: string) {
  const raw = bgColor.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  const normalized =
    /^[0-9a-fA-F]{3}$/.test(hex)
      ? `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
      : /^[0-9a-fA-F]{6}$/.test(hex)
        ? `#${hex}`.toLowerCase()
        : null
  if (!normalized) return '#0f172a'
  const r = parseInt(normalized.slice(1, 3), 16) / 255
  const g = parseInt(normalized.slice(3, 5), 16) / 255
  const b = parseInt(normalized.slice(5, 7), 16) / 255
  const srgb = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
  const L = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
  return L > 0.5 ? '#0f172a' : '#ffffff'
}

type TaskTimerModalProps = {
  plannedSeconds: number
  subjectName: string
  taskTitle: string
  subjectColor: string
  onClose: () => void
  onRecord: (result: { actualStartTime: string; actualEndTime: string; actualSeconds: number }) => void
}

export function TaskTimerModal({ plannedSeconds, subjectName, taskTitle, subjectColor, onClose, onRecord }: TaskTimerModalProps) {
  const totalSeconds = Math.max(0, Math.floor(plannedSeconds || 0))
  const [running, setRunning] = useState(false)
  const [elapsedMs, setElapsedMs] = useState(0)
  const [result, setResult] = useState<null | { actualStartTime: string; actualEndTime: string; actualSeconds: number }>(null)
  const startWallClockRef = useRef<Date | null>(null)
  const tickTimerRef = useRef<number | null>(null)
  const recordTimerRef = useRef<number | null>(null)
  const lastRecordedMinuteRef = useRef<number | null>(null)
  const onRecordRef = useRef(onRecord)

  useEffect(() => {
    onRecordRef.current = onRecord
  }, [onRecord])

  const accentFg = useMemo(() => pickReadableTextColor(subjectColor), [subjectColor])

  const elapsedSeconds = useMemo(() => Math.max(0, Math.floor(elapsedMs / 1000)), [elapsedMs])
  const remainingSeconds = useMemo(() => (totalSeconds > 0 ? totalSeconds - elapsedSeconds : 0), [elapsedSeconds, totalSeconds])
  const isOvertime = totalSeconds > 0 && remainingSeconds <= 0 && elapsedSeconds > 0

  const displayLabel = useMemo(() => {
    if (totalSeconds <= 0) return `+${formatHms(elapsedSeconds)}`
    if (remainingSeconds > 0) return formatHms(remainingSeconds)
    const overtime = Math.max(0, elapsedSeconds - totalSeconds)
    return `+${formatHms(overtime)}`
  }, [elapsedSeconds, remainingSeconds, totalSeconds])
  const isPlusState = displayLabel.startsWith('+')
  const resultDurationLabel = useMemo(() => {
    const seconds = result?.actualSeconds ?? 0
    if (seconds < 60) return '1분 이내'
    return formatDurationKo(seconds)
  }, [result?.actualSeconds])

  const ringState = useMemo(() => {
    if (totalSeconds <= 0) {
      const cycleSeconds = 30 * 60
      const cycle = elapsedSeconds % cycleSeconds
      return { phase: 'fill' as const, progress: cycle === 0 ? 0 : cycle / cycleSeconds }
    }
    if (elapsedSeconds <= 0) return { phase: 'cut' as const, progress: 0 }
    const cycle = elapsedSeconds % totalSeconds
    const loops = Math.floor(elapsedSeconds / totalSeconds)
    if (loops === 0) {
      return { phase: 'cut' as const, progress: cycle === 0 ? 1 : 1 - cycle / totalSeconds }
    }
    return { phase: 'fill' as const, progress: cycle === 0 ? 0 : cycle / totalSeconds }
  }, [elapsedSeconds, totalSeconds])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (running) stopAndRecord()
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [elapsedMs, onClose, running])

  useEffect(() => {
    if (!running) {
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current)
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current)
      tickTimerRef.current = null
      recordTimerRef.current = null
      return
    }

    const startAt = startWallClockRef.current ?? new Date()
    startWallClockRef.current = startAt

    const tick = () => {
      setElapsedMs(Date.now() - startAt.getTime())
    }
    tickTimerRef.current = window.setInterval(tick, 250)
    tick()

    const recordNow = () => {
      const start = startWallClockRef.current ?? new Date()
      const end = new Date()
      const seconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000))
      onRecordRef.current({ actualStartTime: formatHm(start), actualEndTime: formatHm(end), actualSeconds: seconds })
      const minuteKey = end.getFullYear() * 100000000 + (end.getMonth() + 1) * 1000000 + end.getDate() * 10000 + end.getHours() * 100 + end.getMinutes()
      lastRecordedMinuteRef.current = minuteKey
    }

    // Start immediately records start/end as "now", then keeps updating end time each minute.
    recordNow()
    recordTimerRef.current = window.setInterval(() => {
      const end = new Date()
      const minuteKey = end.getFullYear() * 100000000 + (end.getMonth() + 1) * 1000000 + end.getDate() * 10000 + end.getHours() * 100 + end.getMinutes()
      if (lastRecordedMinuteRef.current !== minuteKey) recordNow()
    }, 1000)

    return () => {
      if (tickTimerRef.current) window.clearInterval(tickTimerRef.current)
      if (recordTimerRef.current) window.clearInterval(recordTimerRef.current)
      tickTimerRef.current = null
      recordTimerRef.current = null
    }
  }, [running])

  const stopAndRecord = () => {
    const startAt = startWallClockRef.current ?? new Date()
    const endAt = new Date()
    const seconds = Math.max(0, Math.floor((endAt.getTime() - startAt.getTime()) / 1000))
    const nextResult = { actualStartTime: formatHm(startAt), actualEndTime: formatHm(endAt), actualSeconds: seconds }
    onRecordRef.current(nextResult)
    setResult(nextResult)
    setRunning(false)
    startWallClockRef.current = null
    lastRecordedMinuteRef.current = null
  }

  if (typeof document === 'undefined') return null

  const size = 360
  const ringThickness = 3
  const progressPercent = Math.max(0, Math.min(100, Math.round(ringState.progress * 100)))
  const ringGradient =
    ringState.phase === 'cut'
      ? `conic-gradient(from 0deg, ${subjectColor} 0deg ${progressPercent * 3.6}deg, #0f172a 0deg 360deg)`
      : `conic-gradient(from 0deg, ${subjectColor} 0deg ${progressPercent * 3.6}deg, #0f172a ${progressPercent * 3.6}deg 360deg)`

  return createPortal(
    <div className="fixed inset-0 z-[95] flex flex-col bg-slate-950 text-white">
      <div className="flex items-start justify-between gap-3 px-5 pt-6">
        <div className="min-w-0">
          <div className="text-sm font-semibold opacity-90">{subjectName}</div>
          <div className="mt-1 truncate text-2xl font-semibold">{taskTitle || '태스크'}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            if (running) stopAndRecord()
            onClose()
          }}
          className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-white/10 text-2xl leading-none transition hover:bg-white/20"
          aria-label="닫기"
        >
          ×
        </button>
      </div>

      <div className="flex flex-1 items-center justify-center px-6">
        <div className="relative" style={{ width: size, height: size }}>
          <div
            className={`absolute inset-0 rounded-full ${isPlusState && totalSeconds > 0 ? 'task-timer-fill-blink' : ''}`}
            style={{
              background: ringGradient,
              padding: ringThickness,
              WebkitMask:
                'radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 2px))',
              mask: 'radial-gradient(circle, transparent calc(50% - 3px), #000 calc(50% - 2px))',
          }}
        />
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-center">
            {result ? (
              <>
                <div className="text-4xl font-semibold tabular-nums">{resultDurationLabel}</div>
                <div className="mt-2 text-sm font-medium text-white/80">
                  {formatMeridiemHmString(result.actualStartTime)}부터 {formatMeridiemHmString(result.actualEndTime)}까지
                </div>
              </>
            ) : (
              <>
                <div className={`text-3xl font-semibold tabular-nums ${isOvertime ? 'opacity-95' : ''}`}>{displayLabel}</div>
                {totalSeconds > 0 ? (
                  <div className="mt-2 flex items-center justify-center gap-2 text-sm font-semibold opacity-80">
                    <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-xs font-semibold tracking-[-0.01em]">
                      계획
                    </span>
                    <span>{formatDurationKo(totalSeconds)}</span>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>

      <div className="px-6 pb-8">
        <button
          type="button"
          onClick={() => {
            if (result) {
                onClose()
                return
            }
            if (!running) {
              startWallClockRef.current = new Date()
              setElapsedMs(0)
              setRunning(true)
              return
            }
            stopAndRecord()
          }}
          className="w-full rounded-2xl px-4 py-4 text-base font-semibold transition"
          style={{
            backgroundColor: running ? 'rgba(255,255,255,0.12)' : subjectColor,
            color: running ? '#ffffff' : accentFg,
          }}
        >
          {result ? '닫기' : running ? '정지' : '시작'}
        </button>
      </div>
    </div>,
    document.body,
  )
}
