import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'
import { useEscapeKey } from '../lib/useEscapeKey'

type TaskDialogShellProps = {
  open: boolean
  onClose: () => void
  titleRow: ReactNode
  children: ReactNode
  footer?: ReactNode
  onBackdropClick?: () => void
  outsideTopBar?: ReactNode
  outsideTopLeft?: ReactNode
  outsideTopRight?: ReactNode
}

export function TaskDialogShell({ open, onClose, titleRow, children, footer, onBackdropClick, outsideTopBar, outsideTopLeft, outsideTopRight }: TaskDialogShellProps) {
  useEscapeKey(open, onClose, 50)

  if (!open || typeof document === 'undefined') return null

  const hasOutsideTop = Boolean(outsideTopBar || outsideTopLeft || outsideTopRight)

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/30 pt-20 md:items-center md:p-6">
      <div
        className="absolute inset-0"
        onClick={() => {
          onBackdropClick?.()
          onClose()
        }}
        aria-hidden="true"
      />
      <div className={`relative w-full max-w-none md:max-w-2xl ${hasOutsideTop ? 'pt-12 md:pt-11' : ''}`}>
        {outsideTopBar ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-20 px-3 md:px-0">
            <div className="pointer-events-auto">{outsideTopBar}</div>
          </div>
        ) : null}
        {outsideTopLeft ? (
          <div className="pointer-events-none absolute left-3 top-0 z-20 md:left-0">
            <div className="pointer-events-auto">{outsideTopLeft}</div>
          </div>
        ) : null}
        {outsideTopRight ? (
          <div className="pointer-events-none absolute right-3 top-0 z-20 md:right-0">
            <div className="pointer-events-auto">{outsideTopRight}</div>
          </div>
        ) : null}
        <div className="relative w-full overflow-x-hidden overflow-y-visible rounded-t-[28px] border border-slate-200 border-b-0 border-x-0 bg-white shadow-2xl md:rounded-[28px] md:border md:translate-y-0">
          {titleRow}
          {children}
          {footer}
        </div>
      </div>
    </div>,
    document.body,
  )
}
