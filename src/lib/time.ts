type DiffHmOptions = {
  allowNextDay?: boolean
  equalAsZero?: boolean
}

export function hmToMinutes(hm?: string | null) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm.trim())
  if (!match) return null
  const h = Number(match[1])
  const m = Number(match[2])
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null
  if (h < 0 || h > 23 || m < 0 || m > 59) return null
  return h * 60 + m
}

export function minutesToHm(totalMinutes: number) {
  const normalized = ((Math.floor(totalMinutes) % (24 * 60)) + 24 * 60) % (24 * 60)
  const h = Math.floor(normalized / 60)
  const m = normalized % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function diffMinutesBetweenHm(startHm?: string | null, endHm?: string | null, opts: DiffHmOptions = {}) {
  const start = hmToMinutes(startHm)
  const end = hmToMinutes(endHm)
  if (start === null || end === null) return null

  if (end === start) {
    return { minutes: opts.equalAsZero === false ? null : 0, wraps: false }
  }

  if (end > start) return { minutes: end - start, wraps: false }
  if (!opts.allowNextDay) return null
  return { minutes: end + 24 * 60 - start, wraps: true }
}

export function durationSecondsFromHmRange(startHm?: string | null, endHm?: string | null, opts: DiffHmOptions = {}) {
  const diff = diffMinutesBetweenHm(startHm, endHm, opts)
  if (!diff || diff.minutes === null) return undefined
  return diff.minutes * 60
}

export function addSecondsToHm(hm: string, secondsToAdd: number) {
  const startMinutes = hmToMinutes(hm)
  if (startMinutes === null) return null
  const seconds = Number.isFinite(secondsToAdd) ? secondsToAdd : 0
  return minutesToHm(startMinutes + seconds / 60)
}

export function formatMinutes(totalMinutes: number) {
  const sign = totalMinutes < 0 ? '-' : ''
  const abs = Math.abs(totalMinutes)
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h <= 0) return `${sign}${m}m`
  if (m === 0) return `${sign}${h}h`
  return `${sign}${h}h ${m}m`
}

export function formatHmsFromSeconds(totalSeconds: number) {
  const sign = totalSeconds < 0 ? '-' : ''
  const abs = Math.abs(totalSeconds)
  const h = Math.floor(abs / 3600)
  const m = Math.floor((abs % 3600) / 60)
  const s = abs % 60
  if (h > 0) return `${sign}${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${sign}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function formatDurationKoFromMinutes(totalMinutes: number) {
  if (!Number.isFinite(totalMinutes)) return ''
  const sign = totalMinutes < 0 ? '-' : ''
  const abs = Math.abs(Math.round(totalMinutes))
  const h = Math.floor(abs / 60)
  const m = abs % 60
  if (h <= 0) return `${sign}${m}분`
  if (m === 0) return `${sign}${h}시간`
  return `${sign}${h}시간 ${m}분`
}

export function formatDurationKoFromSeconds(totalSeconds: number) {
  if (!Number.isFinite(totalSeconds)) return ''
  const minutes = Math.round(Math.abs(totalSeconds) / 60)
  const sign = totalSeconds < 0 ? '-' : ''
  return `${sign}${formatDurationKoFromMinutes(minutes).replace(/^-/, '')}`
}

export function formatRoundedDurationKoFromSeconds(totalSeconds: number) {
  const absSeconds = Math.abs(totalSeconds)
  const minutesRaw = absSeconds / 60

  // < 1h: round to nearest 10 minutes
  if (minutesRaw < 60) {
    const step = minutesRaw <= 10 ? 1 : 5
    const minutesRounded = Math.round(minutesRaw / step) * step
    if (minutesRounded >= 60) return '1시간'
    return `${minutesRounded}분`
  }

  // >= 1h: round to nearest 0.5 hours
  const hoursRaw = minutesRaw / 60
  const hoursRounded = Math.round(hoursRaw * 2) / 2
  if (Number.isInteger(hoursRounded)) return `${hoursRounded}시간`
  return `${hoursRounded}시간`
}

export function formatRoundedDurationShortFromSeconds(totalSeconds: number) {
  const absSeconds = Math.abs(totalSeconds)
  const minutesRaw = absSeconds / 60

  if (minutesRaw < 60) {
    const step = minutesRaw <= 10 ? 1 : 5
    const minutesRounded = Math.round(minutesRaw / step) * step
    if (minutesRounded >= 60) return '1h'
    return `${minutesRounded}m`
  }

  const hoursRaw = minutesRaw / 60
  const hoursRounded = Math.round(hoursRaw * 2) / 2
  return `${hoursRounded}h`
}
