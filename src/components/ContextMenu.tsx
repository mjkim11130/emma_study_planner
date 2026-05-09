import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useEscapeKey } from '../lib/useEscapeKey'

export type ContextMenuItem = {
  key: string
  label: string
  onSelect: () => void
  danger?: boolean
  icon?: ReactNode
}

export type ContextMenuState = {
  x: number
  y: number
  items: ContextMenuItem[]
  header?: {
    title: string
    color?: string
  }
}

export function ContextMenu({
  menu,
  onClose,
}: {
  menu: ContextMenuState | null
  onClose: () => void
}) {
  const menuRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: 0, top: 0 })

  useEscapeKey(Boolean(menu), onClose, 140)

  useLayoutEffect(() => {
    if (!menu || !menuRef.current || typeof window === 'undefined') return
    const rect = menuRef.current.getBoundingClientRect()
    const pad = 8
    const left = Math.max(pad, Math.min(menu.x, window.innerWidth - rect.width - pad))
    const top = Math.max(pad, Math.min(menu.y, window.innerHeight - rect.height - pad))
    setPosition({ left, top })
  }, [menu])

  useEffect(() => {
    if (!menu || typeof window === 'undefined') return

    const handleScroll = () => onClose()
    const handleResize = () => onClose()

    window.addEventListener('scroll', handleScroll, true)
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('scroll', handleScroll, true)
      window.removeEventListener('resize', handleResize)
    }
  }, [menu, onClose])

  if (!menu || typeof document === 'undefined') return null

  return createPortal(
    <>
      <div
        className="fixed inset-0 z-[139]"
        onPointerDown={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onClose()
        }}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
        }}
        onContextMenu={(e) => e.preventDefault()}
        aria-hidden="true"
      />
      <div
        ref={menuRef}
        className="fixed z-[140] min-w-[196px] overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-2xl ring-1 ring-black/5"
        style={{ left: position.left, top: position.top }}
        onContextMenu={(e) => e.preventDefault()}
        role="menu"
        aria-label="컨텍스트 메뉴"
      >
        {menu.header ? (
          <div className="mb-1 flex items-center gap-2 rounded-lg px-3 py-2 text-left">
            <span className="h-4 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: menu.header.color ?? '#94a3b8' }} aria-hidden="true" />
            <span className="min-w-0 truncate text-[12px] font-semibold text-slate-900">{menu.header.title}</span>
          </div>
        ) : null}
        {menu.items.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold ${
              item.danger ? 'text-rose-600 hover:bg-rose-50' : 'text-slate-800 hover:bg-slate-100'
            }`}
            onClick={() => {
              onClose()
              item.onSelect()
            }}
            role="menuitem"
          >
            {item.icon ? <span className="inline-flex h-4 w-4 shrink-0 items-center justify-center" aria-hidden="true">{item.icon}</span> : null}
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
          </button>
        ))}
      </div>
    </>,
    document.body,
  )
}
