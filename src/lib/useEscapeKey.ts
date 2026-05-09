import { useEffect, useRef } from 'react'

type EscapeEntry = {
  id: number
  priority: number
  order: number
  onEscape: () => void
}

let nextId = 1
let nextOrder = 1
let isListening = false
const escapeStack: EscapeEntry[] = []

const handleWindowKeyDown = (e: KeyboardEvent) => {
  if (e.key !== 'Escape') return
  let topEntry: EscapeEntry | null = null
  for (const entry of escapeStack) {
    if (!topEntry || entry.priority > topEntry.priority || (entry.priority === topEntry.priority && entry.order > topEntry.order)) {
      topEntry = entry
    }
  }
  if (!topEntry) return
  e.preventDefault()
  e.stopPropagation()
  topEntry.onEscape()
}

const syncListener = () => {
  if (typeof window === 'undefined') return
  if (escapeStack.length > 0 && !isListening) {
    window.addEventListener('keydown', handleWindowKeyDown)
    isListening = true
    return
  }
  if (escapeStack.length === 0 && isListening) {
    window.removeEventListener('keydown', handleWindowKeyDown)
    isListening = false
  }
}

export function useEscapeKey(enabled: boolean, onEscape: () => void, priority = 0) {
  const onEscapeRef = useRef(onEscape)

  useEffect(() => {
    onEscapeRef.current = onEscape
  }, [onEscape])

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return
    const entry: EscapeEntry = {
      id: nextId++,
      priority,
      order: nextOrder++,
      onEscape: () => onEscapeRef.current(),
    }
    escapeStack.push(entry)
    syncListener()
    return () => {
      const index = escapeStack.findIndex((item) => item.id === entry.id)
      if (index >= 0) escapeStack.splice(index, 1)
      syncListener()
    }
  }, [enabled, priority])
}
