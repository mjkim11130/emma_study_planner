import type { StudyTask } from '../store/types'

export type TaskClipboardItem = Pick<
  StudyTask,
  | 'examId'
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
>

let clipboard: TaskClipboardItem | null = null

function hmToMinutes(hm?: string) {
  if (!hm) return null
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null
  return hours * 60 + minutes
}

function addMinutesToHm(hm: string, deltaMinutes: number) {
  const base = hmToMinutes(hm)
  if (base === null) return hm
  const next = ((base + deltaMinutes) % (24 * 60) + 24 * 60) % (24 * 60)
  const hours = Math.floor(next / 60)
  const minutes = next % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

export function copyTaskToClipboard(task: StudyTask) {
  clipboard = {
    examId: task.examId,
    subjectId: task.subjectId,
    title: task.title,
    date: task.date,
    dueDate: task.dueDate,
    plannedStartTime: task.plannedStartTime,
    plannedSeconds: task.plannedSeconds,
    actualStartTime: task.actualStartTime,
    actualEndTime: task.actualEndTime,
    actualSeconds: task.actualSeconds,
    recordCompleteOnly: task.recordCompleteOnly,
    status: task.status,
    memo: task.memo,
  }
}

export function getTaskClipboard() {
  return clipboard
}

export function pasteTaskFromClipboard(
  addTask: (input: TaskClipboardItem) => string,
  patch?: Partial<TaskClipboardItem>,
) {
  if (!clipboard) return null
  return addTask({ ...clipboard, ...patch })
}

export function buildClipboardTaskAtTime(startHm: string) {
  if (!clipboard) return null
  const primaryStart = clipboard.actualStartTime ?? clipboard.plannedStartTime ?? null
  if (!primaryStart) {
    return {
      ...clipboard,
      plannedStartTime: startHm,
    }
  }
  const targetMinutes = hmToMinutes(startHm)
  const primaryMinutes = hmToMinutes(primaryStart)
  if (targetMinutes === null || primaryMinutes === null) return clipboard
  const delta = targetMinutes - primaryMinutes
  return {
    ...clipboard,
    plannedStartTime: clipboard.plannedStartTime ? addMinutesToHm(clipboard.plannedStartTime, delta) : clipboard.plannedStartTime,
    actualStartTime: clipboard.actualStartTime ? addMinutesToHm(clipboard.actualStartTime, delta) : clipboard.actualStartTime,
    actualEndTime: clipboard.actualEndTime ? addMinutesToHm(clipboard.actualEndTime, delta) : clipboard.actualEndTime,
  }
}
