import * as XLSX from 'xlsx'
import type { StudyTask, Subject } from '../store/types'
import { durationSecondsFromHmRange } from './time'

type SeasonBackupPayload = {
  version: 1
  exportedAt: string
  season: {
    id: string
    name: string
  }
  subjects: Array<Pick<Subject, 'id' | 'name' | 'color' | 'archived' | 'isRest' | 'createdAt'>>
  tasks: Array<
    Pick<
      StudyTask,
      | 'id'
      | 'subjectId'
      | 'title'
      | 'date'
      | 'dueDate'
      | 'plannedStartTime'
      | 'plannedSeconds'
      | 'actualStartTime'
      | 'actualEndTime'
      | 'actualSeconds'
      | 'recordCompleteOnly'
      | 'status'
      | 'memo'
      | 'createdAt'
      | 'updatedAt'
    >
  >
  subjectOrder: string[]
  lastUsedSubjectId?: string | null
}

export type ImportedSeasonData = {
  sourceSeasonName: string
  subjects: Array<{
    sourceId: string
    name: string
    color: string
    archived?: boolean
    isRest?: boolean
    createdAt?: string
  }>
  tasks: Array<{
    sourceSubjectId: string
    title: string
    date?: string
    dueDate?: string
    plannedStartTime?: string
    plannedSeconds: number
    actualStartTime?: string
    actualEndTime?: string
    actualSeconds?: number
    recordCompleteOnly?: boolean
    status?: 'pending' | 'completed'
    memo?: string
    createdAt?: string
    updatedAt?: string
  }>
  subjectOrderSourceIds?: string[]
  lastUsedSourceSubjectId?: string | null
}

const BACKUP_SHEET_NAME = '엠마_백업'
const BACKUP_MARKER = 'EMMA_SEASON_BACKUP_V1'
const FALLBACK_COLORS = ['#fecaca', '#fde68a', '#bfdbfe', '#c7d2fe', '#bbf7d0', '#fbcfe8', '#ddd6fe', '#fdba74']

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

function parseDurationKo(text: string) {
  const raw = String(text ?? '').trim()
  if (!raw) return null
  const match = /^(?:(\d+)\s*시간)?\s*(?:(\d+)\s*분)?$/.exec(raw)
  if (!match) return null
  const hours = Number(match[1] ?? 0)
  const minutes = Number(match[2] ?? 0)
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  return Math.max(0, hours * 3600 + minutes * 60)
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

function normalizeHm(value: unknown) {
  const raw = String(value ?? '').trim()
  return /^\d{1,2}:\d{2}$/.test(raw) ? raw : undefined
}

function normalizeYmd(value: unknown) {
  const raw = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : undefined
}

function buildVisibleRows(subjects: Subject[], tasks: StudyTask[]) {
  const subjectById = new Map(subjects.map((s) => [s.id, s] as const))
  return tasks
    .map((t) => {
      const subject = subjectById.get(t.subjectId)
      const subjectName = subject?.name ?? '주제'
      const plannedSeconds = typeof t.plannedSeconds === 'number' && Number.isFinite(t.plannedSeconds) ? Math.max(0, t.plannedSeconds) : 0
      const plannedStart = t.plannedStartTime ?? ''
      const plannedEnd = plannedStart ? addSecondsToHm(plannedStart, plannedSeconds) : ''
      const plannedDur = plannedSeconds > 0 ? formatDurationKo(plannedSeconds) : ''
      const actualStart = t.actualStartTime ?? ''
      const actualEnd = t.actualEndTime ?? ''
      const actualSecondsFromTimes = durationSecondsFromHmRange(t.actualStartTime, t.actualEndTime, { allowNextDay: true }) ?? 0
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
}

function buildBackupPayload(opts: {
  seasonId: string
  seasonName: string
  subjects: Subject[]
  tasks: StudyTask[]
  subjectOrder?: string[]
  lastUsedSubjectId?: string | null
}): SeasonBackupPayload {
  const scopedSubjects = opts.subjects.filter((s) => s.examId === opts.seasonId)
  const scopedTasks = opts.tasks.filter((t) => t.examId === opts.seasonId)
  const byId = new Map(scopedSubjects.map((s) => [s.id, s] as const))
  const orderedSubjects: Subject[] = []
  const seen = new Set<string>()
  for (const id of opts.subjectOrder ?? []) {
    const subject = byId.get(id)
    if (!subject || seen.has(id)) continue
    seen.add(id)
    orderedSubjects.push(subject)
  }
  for (const subject of scopedSubjects) {
    if (seen.has(subject.id)) continue
    seen.add(subject.id)
    orderedSubjects.push(subject)
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    season: { id: opts.seasonId, name: opts.seasonName },
    subjects: orderedSubjects.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color,
      archived: s.archived,
      isRest: s.isRest,
      createdAt: s.createdAt,
    })),
    tasks: scopedTasks.map((t) => ({
      id: t.id,
      subjectId: t.subjectId,
      title: t.title,
      date: t.date,
      dueDate: t.dueDate,
      plannedStartTime: t.plannedStartTime,
      plannedSeconds: t.plannedSeconds,
      actualStartTime: t.actualStartTime,
      actualEndTime: t.actualEndTime,
      actualSeconds: t.actualSeconds,
      recordCompleteOnly: t.recordCompleteOnly,
      status: t.status,
      memo: t.memo,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    })),
    subjectOrder: orderedSubjects.map((s) => s.id),
    lastUsedSubjectId: opts.lastUsedSubjectId ?? null,
  }
}

export function exportSeasonTasksToXlsx(opts: {
  seasonId: string
  seasonName: string
  subjects: Subject[]
  tasks: StudyTask[]
  subjectOrder?: string[]
  lastUsedSubjectId?: string | null
}) {
  const scopedSubjects = opts.subjects.filter((s) => s.examId === opts.seasonId)
  const scopedTasks = opts.tasks.filter((t) => t.examId === opts.seasonId)
  const rows = buildVisibleRows(scopedSubjects, scopedTasks)

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

  const data: string[][] = [header]
  for (const row of rows) {
    data.push([
      row.subjectName,
      row.title,
      row.date,
      row.dueDate,
      row.plannedStart,
      row.plannedEnd,
      row.plannedDur,
      row.actualStart,
      row.actualEnd,
      row.actualDur,
      row.compare,
    ])
  }

  const ws = XLSX.utils.aoa_to_sheet(data)
  const backup = buildBackupPayload(opts)
  const wsBackup = XLSX.utils.aoa_to_sheet([[BACKUP_MARKER], [JSON.stringify(backup)]])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, '일정')
  XLSX.utils.book_append_sheet(wb, wsBackup, BACKUP_SHEET_NAME)
  wb.Workbook = {
    Sheets: [
      { name: '일정', Hidden: 0 },
      { name: BACKUP_SHEET_NAME, Hidden: 1 },
    ],
  }

  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  const blob = new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeFileName(opts.seasonName)}-일정.xlsx`
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

function parseBackupPayload(raw: unknown): ImportedSeasonData {
  const parsed = raw as Partial<SeasonBackupPayload> | null | undefined
  const subjects = Array.isArray(parsed?.subjects) ? parsed.subjects : []
  const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : []
  return {
    sourceSeasonName: String(parsed?.season?.name ?? '불러온 시즌'),
    subjects: subjects.map((subject) => ({
      sourceId: String(subject.id ?? ''),
      name: String(subject.name ?? '주제'),
      color: String(subject.color ?? '#94a3b8'),
      archived: Boolean(subject.archived),
      isRest: Boolean(subject.isRest),
      createdAt: typeof subject.createdAt === 'string' ? subject.createdAt : undefined,
    })),
    tasks: tasks.map((task) => ({
      sourceSubjectId: String(task.subjectId ?? ''),
      title: String(task.title ?? ''),
      date: normalizeYmd(task.date),
      dueDate: normalizeYmd(task.dueDate),
      plannedStartTime: normalizeHm(task.plannedStartTime),
      plannedSeconds: Math.max(0, Math.floor(Number(task.plannedSeconds) || 0)),
      actualStartTime: normalizeHm(task.actualStartTime),
      actualEndTime: normalizeHm(task.actualEndTime),
      actualSeconds: typeof task.actualSeconds === 'number' && Number.isFinite(task.actualSeconds) ? Math.max(0, Math.floor(task.actualSeconds)) : undefined,
      recordCompleteOnly: Boolean(task.recordCompleteOnly),
      status: task.status === 'completed' ? 'completed' : 'pending',
      memo: typeof task.memo === 'string' ? task.memo : undefined,
      createdAt: typeof task.createdAt === 'string' ? task.createdAt : undefined,
      updatedAt: typeof task.updatedAt === 'string' ? task.updatedAt : undefined,
    })),
    subjectOrderSourceIds: Array.isArray(parsed?.subjectOrder) ? parsed.subjectOrder.map((id) => String(id ?? '')) : undefined,
    lastUsedSourceSubjectId: typeof parsed?.lastUsedSubjectId === 'string' ? parsed.lastUsedSubjectId : null,
  }
}

function parseVisibleSheet(workbook: XLSX.WorkBook): ImportedSeasonData {
  const sheet = workbook.Sheets['일정'] ?? workbook.Sheets[workbook.SheetNames[0] ?? '']
  if (!sheet) throw new Error('불러올 시트를 찾지 못했어요.')
  const rows = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, { raw: false, defval: '' })
  const subjectIdsByName = new Map<string, string>()
  const subjects: ImportedSeasonData['subjects'] = []
  const ensureSubject = (nameRaw: string) => {
    const name = String(nameRaw || '').trim() || '주제'
    const existing = subjectIdsByName.get(name)
    if (existing) return existing
    const sourceId = `subject:${subjects.length}`
    subjectIdsByName.set(name, sourceId)
    subjects.push({
      sourceId,
      name,
      color: FALLBACK_COLORS[subjects.length % FALLBACK_COLORS.length],
      archived: false,
      isRest: false,
    })
    return sourceId
  }

  const tasks: ImportedSeasonData['tasks'] = rows.map((row) => {
    const sourceSubjectId = ensureSubject(row['주제'] ?? '')
    const plannedStartTime = normalizeHm(row['계획 시작'])
    const plannedEndTime = normalizeHm(row['계획 종료'])
    const actualStartTime = normalizeHm(row['완료 시작'])
    const actualEndTime = normalizeHm(row['완료 종료'])
    const plannedSeconds =
      durationSecondsFromHmRange(plannedStartTime, plannedEndTime, { allowNextDay: true }) ??
      parseDurationKo(row['계획 소요시간'] ?? '') ??
      0
    const actualSeconds =
      durationSecondsFromHmRange(actualStartTime, actualEndTime, { allowNextDay: true }) ??
      parseDurationKo(row['완료 소요시간'] ?? '') ??
      undefined
    return {
      sourceSubjectId,
      title: String(row['이름'] ?? ''),
      date: normalizeYmd(row['날짜']),
      dueDate: normalizeYmd(row['마감일']),
      plannedStartTime,
      plannedSeconds: Math.max(0, Math.floor(plannedSeconds)),
      actualStartTime,
      actualEndTime,
      actualSeconds: typeof actualSeconds === 'number' ? Math.max(0, Math.floor(actualSeconds)) : undefined,
      recordCompleteOnly: false,
      status: actualStartTime || actualEndTime || typeof actualSeconds === 'number' ? ('completed' as const) : ('pending' as const),
    }
  })

  return {
    sourceSeasonName: '불러온 시즌',
    subjects,
    tasks,
    subjectOrderSourceIds: subjects.map((subject) => subject.sourceId),
    lastUsedSourceSubjectId: subjects[0]?.sourceId ?? null,
  }
}

export async function importSeasonTasksFromXlsx(file: File): Promise<ImportedSeasonData> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array' })
  const backupSheet = workbook.Sheets[BACKUP_SHEET_NAME]
  if (backupSheet) {
    const rows = XLSX.utils.sheet_to_json<(string | number | boolean | null)[]>(backupSheet, { header: 1, raw: false, defval: '' })
    const marker = String(rows[0]?.[0] ?? '').trim()
    const rawJson = String(rows[1]?.[0] ?? '').trim()
    if (marker === BACKUP_MARKER && rawJson) {
      return parseBackupPayload(JSON.parse(rawJson))
    }
  }
  return parseVisibleSheet(workbook)
}
