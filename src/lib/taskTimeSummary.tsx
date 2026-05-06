import type { ReactNode } from 'react'

export function formatDurationPreciseKo(totalSeconds: number) {
  const clamped = Math.max(0, Math.floor(totalSeconds))
  if (clamped < 60) return '1분 이내'
  const hours = Math.floor(clamped / 3600)
  const minutes = Math.floor((clamped % 3600) / 60)
  const parts: string[] = []
  if (hours > 0) parts.push(`${hours}시간`)
  if (minutes > 0) parts.push(`${minutes}분`)
  if (parts.length === 0) parts.push('0분')
  return parts.join(' ')
}

export function buildTimeSummaryNode({
  start,
  end,
  durationSeconds,
  formatHm,
}: {
  start?: string | null
  end?: string | null
  durationSeconds?: number | null
  formatHm: (hm?: string) => string | null | undefined
}): ReactNode {
  // If the range collapses to the same minute (e.g. 11:41 ~ 11:41), show a single timestamp.
  if (start && end && start === end) {
    return <>{formatHm(start) ?? start}</>
  }
  const rangeText = start ? (end ? `${formatHm(start) ?? start}부터 ${formatHm(end) ?? end}까지` : `${formatHm(start) ?? start}부터`) : ''
  const durationText = typeof durationSeconds === 'number' ? formatDurationPreciseKo(durationSeconds) : ''

  if (rangeText && !end && !durationText) {
    return (
      <>
        {rangeText} 시작
      </>
    )
  }

  if (rangeText && durationText) {
    return (
      <span className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3">
        <span className="min-w-0 truncate">{rangeText}</span>
        <span className="shrink-0 whitespace-nowrap text-right tabular-nums font-semibold">{durationText}</span>
      </span>
    )
  }

  if (durationText) return durationText
  return rangeText
}

