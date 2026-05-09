import type { DragEvent } from 'react'

export const TASK_DRAG_MIME = 'text/emma-task-id'

export function setTaskDragData(dataTransfer: DataTransfer, taskId: string) {
  dataTransfer.setData(TASK_DRAG_MIME, taskId)
  dataTransfer.effectAllowed = 'copyMove'
}

export function setTaskDragPreview(dataTransfer: DataTransfer, sourceEl: HTMLElement, clientX?: number, clientY?: number) {
  if (typeof document === 'undefined' || typeof dataTransfer.setDragImage !== 'function') return
  const rect = sourceEl.getBoundingClientRect()
  const clone = sourceEl.cloneNode(true) as HTMLElement
  clone.setAttribute('aria-hidden', 'true')
  clone.style.position = 'fixed'
  clone.style.left = '0'
  clone.style.top = '0'
  clone.style.transform = 'translate3d(-200vw, -200vh, 0)'
  clone.style.margin = '0'
  clone.style.pointerEvents = 'none'
  clone.style.zIndex = '2147483647'
  clone.style.width = `${rect.width}px`
  clone.style.height = `${rect.height}px`
  clone.style.boxSizing = 'border-box'
  document.body.appendChild(clone)
  const offsetX = clientX == null ? rect.width / 2 : Math.max(0, Math.min(rect.width, clientX - rect.left))
  const offsetY = clientY == null ? rect.height / 2 : Math.max(0, Math.min(rect.height, clientY - rect.top))
  try {
    dataTransfer.setDragImage(clone, offsetX, offsetY)
  } catch {
    clone.remove()
    return
  }
  window.requestAnimationFrame(() => {
    clone.remove()
  })
}

export function getTaskDragId(dataTransfer: DataTransfer) {
  return dataTransfer.getData(TASK_DRAG_MIME)
}

export function syncTaskDropEffect(e: DragEvent) {
  e.dataTransfer.dropEffect = e.altKey ? 'copy' : 'move'
}
