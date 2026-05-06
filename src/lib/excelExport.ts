import * as XLSX from 'xlsx'
import type { StudyTask, Subject } from '../store/types'

function hmToMinutes(hm?: string) {
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
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function addSecondsToHm(hm?: string, seconds?: number) {
  const startMin = hmToMinutes(hm)
  if (startMin == null) return ''
  const sec = typeof seconds === 'number' && Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  if (sec <= 0) return ''
  return minutesToHm(startMin + sec / 60)
}

function formatDurationKo(totalSeconds: number) {
  const minutes = Math.max(0, Math.floor(totalSeconds / 60))
  if (minutes <= 0) return '0분'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}시간 ${m}분`
  if (h > 0) return `${h}시간`
  return `${m}분`
}

function compareLabel(plannedSeconds: number | null, actualSeconds: number | null) {
  if (!plannedSeconds || !actualSeconds) return ''
  const diff = actualSeconds - plannedSeconds
  if (!Number.isFinite(diff) || diff === 0) return '0분'
  const abs = Math.abs(diff)
  const base = formatDurationKo(abs)
  return diff > 0 ? `+ ${base}` : `- ${base}`
}

function safeFileName(name: string) {
  const trimmed = (name ?? '').trim() || 'season'
  return trimmed.replace(/[\\/:*?"<>|]+/g, '_').slice(0, 80)
}

export function exportSeasonTasksToXlsx(opts: {
  seasonId: string
  seasonName: string
  subjects: Subject[]
  tasks: StudyTask[]
}) {
  const { seasonId, seasonName, subjects, tasks } = opts
  const subjectById = new Map(subjects.filter((s) => s.examId === seasonId).map((s) => [s.id, s] as const))
  const scoped = tasks.filter((t) => t.examId === seasonId)

  const rows = scoped
    .map((t) => {
      const subject = subjectById.get(t.subjectId)
      const subjectName = subject?.name ?? '주제'

      const plannedSeconds = typeof t.plannedSeconds === 'number' && Number.isFinite(t.plannedSeconds) ? Math.max(0, t.plannedSeconds) : 0
      const plannedStart = t.plannedStartTime ?? ''
      const plannedEnd = plannedStart ? addSecondsToHm(plannedStart, plannedSeconds) : ''
      const plannedDur = plannedSeconds > 0 ? formatDurationKo(plannedSeconds) : ''

      const actualStart = t.actualStartTime ?? ''
      const actualEnd = t.actualEndTime ?? ''
      const actualSecondsFromTimes = (() => {
        const s = hmToMinutes(t.actualStartTime)
        const e = hmToMinutes(t.actualEndTime)
        if (s == null || e == null) return 0
        if (e < s) return 0
        return (e - s) * 60
      })()
      const actualSeconds =
        typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
          ? Math.max(0, t.actualSeconds)
          : t.recordCompleteOnly
            ? plannedSeconds
            : actualSecondsFromTimes
      const actualDur = actualSeconds > 0 ? formatDurationKo(actualSeconds) : ''

      return {
        subjectName,
        title: t.title ?? '',
        date: t.date ?? '',
        dueDate: t.dueDate ?? '',
        plannedStart,
        plannedEnd,
        plannedDur,
        actualStart,
        actualEnd,
        actualDur,
        compare: compareLabel(plannedSeconds || null, actualSeconds || null),
      }
    })
    .sort((a, b) => {
      const s = a.subjectName.localeCompare(b.subjectName, 'ko')
      if (s !== 0) return s
      const d = (a.date || '').localeCompare(b.date || '')
      if (d !== 0) return d
      const as = (a.actualStart || '').localeCompare(b.actualStart || '')
      if (as !== 0) return as
      const ps = (a.plannedStart || '').localeCompare(b.plannedStart || '')
      if (ps !== 0) return ps
      return a.title.localeCompare(b.title, 'ko')
    })

  const header = [
    '주제',
    '이름',
    '날짜',
    '마감일',
    '계획 시작',
    '계획 종료',
    '계획 소요시간',
    '완료 시작',
    '완료 종료',
    '완료 소요시간',
    '계획-완료 차이',
  ]

  const data: any[][] = [header]
  for (const r of rows) {
    data.push([
      r.subjectName,
      r.title,
      r.date,
      r.dueDate,
      r.plannedStart,
      r.plannedEnd,
      r.plannedDur,
      r.actualStart,
      r.actualEnd,
      r.actualDur,
      r.compare,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '일정')

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(seasonName)}-일정.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

