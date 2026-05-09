import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'

type TouchPoint = { x: number; y: number }

type TouchContextMenuState = {
  key: string
  pointerId: number
  startX: number
  startY: number
  lastX: number
  lastY: number
  moved: boolean
  armed: boolean
  timer: number | null
  onOpen: ((point: TouchPoint) => void) | null
}

export function useTouchContextMenu(options?: {
  delayMs?: number
  moveThresholdPx?: number
  suppressClickMs?: number
}) {
  const delayMs = options?.delayMs ?? 420
  const moveThresholdPx = options?.moveThresholdPx ?? 8
  const suppressClickMs = options?.suppressClickMs ?? 350
  const stateRef = useRef<TouchContextMenuState>({
    key: '',
    pointerId: -1,
    startX: 0,
    startY: 0,
    lastX: 0,
    lastY: 0,
    moved: false,
    armed: false,
    timer: null,
    onOpen: null,
  })
  const suppressUntilRef = useRef(0)

  const cancel = () => {
    if (stateRef.current.timer) window.clearTimeout(stateRef.current.timer)
    stateRef.current = {
      key: '',
      pointerId: -1,
      startX: 0,
      startY: 0,
      lastX: 0,
      lastY: 0,
      moved: false,
      armed: false,
      timer: null,
      onOpen: null,
    }
  }

  useEffect(() => cancel, [])

  const bind = (key: string, onOpen: (point: TouchPoint) => void) => ({
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.pointerType !== 'touch') return
      cancel()
      stateRef.current = {
        key,
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        lastX: e.clientX,
        lastY: e.clientY,
        moved: false,
        armed: false,
        timer: window.setTimeout(() => {
          if (stateRef.current.key !== key || stateRef.current.moved) return
          stateRef.current.armed = true
          stateRef.current.timer = null
        }, delayMs),
        onOpen,
      }
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const current = stateRef.current
      if (e.pointerType !== 'touch' || current.key !== key || current.pointerId !== e.pointerId) return
      current.lastX = e.clientX
      current.lastY = e.clientY
      const dx = e.clientX - current.startX
      const dy = e.clientY - current.startY
      if (Math.hypot(dx, dy) <= moveThresholdPx) return
      current.moved = true
      current.armed = false
      if (current.timer) window.clearTimeout(current.timer)
      current.timer = null
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const current = stateRef.current
      if (e.pointerType !== 'touch' || current.key !== key || current.pointerId !== e.pointerId) return
      current.lastX = e.clientX
      current.lastY = e.clientY
      const shouldOpen = current.armed && !current.moved
      const open = current.onOpen
      cancel()
      if (!shouldOpen || !open) return
      suppressUntilRef.current = Date.now() + suppressClickMs
      open({ x: e.clientX, y: e.clientY })
    },
    onPointerCancel: () => {
      cancel()
    },
  })

  const shouldIgnoreClick = () => Date.now() < suppressUntilRef.current

  return { bind, cancel, shouldIgnoreClick }
}
