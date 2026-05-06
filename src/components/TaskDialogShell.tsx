import { createPortal } from 'react-dom'
import type { ReactNode } from 'react'

type TaskDialogShellProps = {
  open: boolean
  onClose: () => void
  titleRow: ReactNode
  children: ReactNode
  footer?: ReactNode
  onBackdropClick?: () => void
}

export function TaskDialogShell({ open, onClose, titleRow, children, footer, onBackdropClick }: TaskDialogShellProps) {
  if (!open || typeof document === 'undefined') return null

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
      <div className="relative w-full max-w-none overflow-x-hidden overflow-y-visible rounded-t-[28px] border border-slate-200 border-b-0 border-x-0 bg-white shadow-2xl md:max-w-2xl md:rounded-[28px] md:border md:translate-y-0">
        {titleRow}
        {children}
        {footer}
      </div>
    </div>,
    document.body,
  )
}
