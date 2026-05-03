import type { ReactNode } from 'react'

export function MobileTopBar({
  title,
  left,
  center,
  right,
}: {
  title: string
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
}) {
  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur md:hidden">
      {/* iOS safe-area(노치) 영역까지 배경이 채워지도록 */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
        <div className="flex shrink-0 items-center">{left}</div>
        <div className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900">
          {center ?? (title ? <span className="block truncate">{title}</span> : null)}
        </div>
        <div className="flex shrink-0 items-center justify-end">{right}</div>
      </div>
    </div>
  )
}
