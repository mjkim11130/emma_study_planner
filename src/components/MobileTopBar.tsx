import { useContext, type ReactNode } from 'react'
import { SidebarToggleContext } from './AppLayout'

function HamburgerIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M5 7h14M5 12h14M5 17h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function MobileTopBar({
  title,
  left,
  center,
  right,
  bottom,
}: {
  title: string
  left?: ReactNode
  center?: ReactNode
  right?: ReactNode
  bottom?: ReactNode
}) {
  const sidebar = useContext(SidebarToggleContext)

  return (
    <div className="sticky top-0 z-40 border-b border-slate-200 bg-slate-50/95 backdrop-blur">
      {/* iOS safe-area(노치) 영역까지 배경이 채워지도록 */}
      <div style={{ height: 'env(safe-area-inset-top)' }} />
      <div className="flex min-h-12 items-center justify-between gap-2 px-3 py-2">
        <div className="flex shrink-0 items-center gap-2">
          {sidebar ? (
            <button
              type="button"
              onClick={sidebar.toggle}
              className="hidden items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-700 hover:bg-slate-100 md:inline-flex"
              aria-label={sidebar.open ? '사이드바 닫기' : '사이드바 열기'}
            >
              <HamburgerIcon />
            </button>
          ) : null}
          {left}
        </div>
        <div className="min-w-0 flex-1 text-center text-sm font-semibold text-slate-900">
          {center ?? (title ? <span className="block truncate">{title}</span> : null)}
        </div>
        <div className="flex shrink-0 items-center justify-end">{right}</div>
      </div>
      {bottom ? <div className="px-3">{bottom}</div> : null}
    </div>
  )
}
