import { createContext, useContext } from 'react'
import type { StudyTask } from '../store/types'

export type TaskDialogAddCommitPayload = {
  taskId: string
  task: Pick<StudyTask, 'date' | 'plannedStartTime' | 'actualStartTime' | 'actualEndTime'>
}

type TaskDialogRequest =
    | {
      mode: 'add'
      date?: string
      subjectId?: string
      plannedStartTime?: string
      plannedSeconds?: number
      initialContinuousMode?: boolean
      hideContinuousModeToggle?: boolean
      onCommit?: (payload: TaskDialogAddCommitPayload) => void
    }
  | { mode: 'preview'; taskId: string; autoEdit?: boolean; autoCloseAfterComplete?: boolean; autoTimer?: boolean }

type TaskDialogContextValue = {
  openTaskAdd: (input?: {
    date?: string
    subjectId?: string
    plannedStartTime?: string
    plannedSeconds?: number
    initialContinuousMode?: boolean
    hideContinuousModeToggle?: boolean
    onCommit?: (payload: TaskDialogAddCommitPayload) => void
  }) => void
  openTaskPreview: (taskId: string, opts?: { autoEdit?: boolean; autoCloseAfterComplete?: boolean; autoTimer?: boolean }) => void
  request: TaskDialogRequest | null
  clearRequest: () => void
}

export const TaskDialogContext = createContext<TaskDialogContextValue | null>(null)

export function useTaskDialog() {
  const value = useContext(TaskDialogContext)
  if (!value) throw new Error('TaskDialogContext is missing')
  return value
}
