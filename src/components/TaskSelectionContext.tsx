import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { usePlannerStore } from '../store/usePlannerStore'

type TaskSelectionContextValue = {
  selectedTaskIds: string[]
  hasSelection: boolean
  selectedCount: number
  isTaskSelected: (taskId: string) => boolean
  clearTaskSelection: () => void
  toggleTaskSelection: (taskId: string) => void
  handleSelectableTaskClick: (e: ReactMouseEvent, taskId: string, onOpen: () => void) => void
  prepareTaskDragSelection: (taskId: string) => string[]
}

const TaskSelectionContext = createContext<TaskSelectionContextValue | null>(null)

function isEditableTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const field = el.closest('input, textarea, select')
  return Boolean(field)
}

export function TaskSelectionProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const tasks = usePlannerStore((s) => s.tasks)
  const deleteTasks = usePlannerStore((s) => s.deleteTasks)
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([])
  const selectedIdsRef = useRef<Set<string>>(new Set())
  const selectedIdSet = useMemo(() => new Set(selectedTaskIds), [selectedTaskIds])

  useEffect(() => {
    selectedIdsRef.current = new Set(selectedTaskIds)
  }, [selectedTaskIds])

  const clearTaskSelection = useCallback(() => {
    setSelectedTaskIds((current) => (current.length ? [] : current))
  }, [])

  const toggleTaskSelection = useCallback((taskId: string) => {
    if (!taskId) return
    setSelectedTaskIds((current) => {
      if (current.includes(taskId)) return current.filter((id) => id !== taskId)
      return [...current, taskId]
    })
  }, [])

  const isTaskSelected = useCallback((taskId: string) => selectedIdSet.has(taskId), [selectedIdSet])

  const handleSelectableTaskClick = useCallback(
    (e: ReactMouseEvent, taskId: string, onOpen: () => void) => {
      if (e.shiftKey) {
        e.preventDefault()
        e.stopPropagation()
        toggleTaskSelection(taskId)
        return
      }
      if (selectedIdsRef.current.size > 0) {
        e.preventDefault()
        e.stopPropagation()
        return
      }
      onOpen()
    },
    [toggleTaskSelection],
  )

  const prepareTaskDragSelection = useCallback(
    (taskId: string) => {
      if (!taskId) return []
      const selectedSet = selectedIdsRef.current
      if (selectedSet.size > 0 && selectedSet.has(taskId)) return selectedTaskIds
      if (selectedSet.size > 0) setSelectedTaskIds([])
      return [taskId]
    },
    [selectedTaskIds],
  )

  useEffect(() => {
    const validIds = new Set(tasks.map((task) => task.id))
    setSelectedTaskIds((current) => {
      const next = current.filter((id) => validIds.has(id))
      return next.length === current.length ? current : next
    })
  }, [tasks])

  useEffect(() => {
    setSelectedTaskIds([])
  }, [location.pathname, location.search])

  useEffect(() => {
    if (selectedTaskIds.length === 0 || typeof document === 'undefined') return
    let suppressClick = false

    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      const taskEl = target.closest<HTMLElement>('[data-task-selectable="true"][data-task-id]')
      const taskId = taskEl?.dataset.taskId?.trim() ?? ''
      if (taskId) {
        if (e.shiftKey) return
        if (selectedIdsRef.current.has(taskId)) return
      }
      suppressClick = true
      setSelectedTaskIds([])
    }

    const handleClick = (e: MouseEvent) => {
      if (!suppressClick) return
      suppressClick = false
      e.preventDefault()
      e.stopPropagation()
    }

    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('click', handleClick, true)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('click', handleClick, true)
    }
  }, [selectedTaskIds.length])

  useEffect(() => {
    if (selectedTaskIds.length === 0 || typeof document === 'undefined') return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return
      if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return
      if (e.key !== 'Backspace' && e.key !== 'Delete') return
      if (isEditableTarget(e.target)) return
      e.preventDefault()
      e.stopPropagation()
      deleteTasks(selectedTaskIds)
      setSelectedTaskIds([])
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [deleteTasks, selectedTaskIds])

  const value = useMemo<TaskSelectionContextValue>(
    () => ({
      selectedTaskIds,
      hasSelection: selectedTaskIds.length > 0,
      selectedCount: selectedTaskIds.length,
      isTaskSelected,
      clearTaskSelection,
      toggleTaskSelection,
      handleSelectableTaskClick,
      prepareTaskDragSelection,
    }),
    [clearTaskSelection, handleSelectableTaskClick, isTaskSelected, prepareTaskDragSelection, selectedTaskIds, toggleTaskSelection],
  )

  return <TaskSelectionContext.Provider value={value}>{children}</TaskSelectionContext.Provider>
}

export function useTaskSelection() {
  const context = useContext(TaskSelectionContext)
  if (!context) throw new Error('useTaskSelection must be used within TaskSelectionProvider')
  return context
}
