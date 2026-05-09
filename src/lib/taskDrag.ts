import type { DragEvent } from 'react'

export const TASK_DRAG_MIME = 'text/emma-task-id'

export function setTaskDragData(dataTransfer: DataTransfer, taskId: string) {
  dataTransfer.setData(TASK_DRAG_MIME, taskId)
  dataTransfer.effectAllowed = 'copyMove'
}

export function getTaskDragId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(TASK_DRAG_MIME)
}

export function syncTaskDropEffect(e: DragEvent) {
  e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
}
