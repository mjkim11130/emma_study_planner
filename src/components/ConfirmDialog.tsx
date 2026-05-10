import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

type ConfirmOptions = {
  title?: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmOptions) => Promise<boolean>
}

const ConfirmDialogContext = createContext<ConfirmDialogContextValue | null>(null)

export function useConfirmDialog() {
  const value = useContext(ConfirmDialogContext)
  if (!value) throw new Error('ConfirmDialogContext is missing')
  return value
}

export function ConfirmDialogProvider({ children }: { children: ReactNode }) {
  const resolverRef = useRef<((value: boolean) => void) | null>(null)
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null)
  const [dialog, setDialog] = useState<ConfirmOptions | null>(null)

  const close = (result: boolean) => {
    const resolve = resolverRef.current
    resolverRef.current = null
    setDialog(null)
    resolve?.(result)
  }

  const value = useMemo<ConfirmDialogContextValue>(
    () => ({
      confirm: (options) =>
        new Promise<boolean>((resolve) => {
          resolverRef.current = resolve
          setDialog(options)
        }),
    }),
    [],
  )

  useEffect(() => {
    if (!dialog) return
    confirmButtonRef.current?.focus()
  }, [dialog])

  return (
    <ConfirmDialogContext.Provider value={value}>
      {children}
      {dialog ? (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-slate-900/35 px-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="text-base font-semibold text-slate-900">{dialog.title ?? '삭제할까요?'}</div>
            <div className="mt-2 text-sm leading-6 text-slate-500">{dialog.message}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => close(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-slate-100 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-200"
              >
                {dialog.cancelLabel ?? '취소'}
              </button>
              <button
                type="button"
                onClick={() => close(true)}
                ref={confirmButtonRef}
                className={`inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-semibold ${
                  dialog.danger
                    ? 'bg-rose-600 text-white hover:bg-rose-700'
                    : 'bg-black/80 text-white hover:bg-black/70'
                }`}
              >
                {dialog.confirmLabel ?? '확인'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmDialogContext.Provider>
  )
}
