import { createContext, useContext } from 'react'

type TaskDialogRequest =
  | { mode: 'add'; date?: string; subjectId?: string; plannedStartTime?: string; plannedSeconds?: number }
  | { mode: 'preview'; taskId: string; autoEdit?: boolean; autoCloseAfterComplete?: boolean; autoTimer?: boolean }

type TaskDialogContextValue = {
  openTaskAdd: (input?: { date?: string; subjectId?: string; plannedStartTime?: string; plannedSeconds?: number }) => void
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
