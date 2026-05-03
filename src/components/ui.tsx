import type { PropsWithChildren } from 'react'

export function Card({ children }: PropsWithChildren) {
  return <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">{children}</div>
}

export function CardHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="border-b border-slate-100 px-4 py-3">
      <div className="text-sm font-semibold text-slate-900">{title}</div>
      {subtitle ? <div className="mt-0.5 text-xs text-slate-500">{subtitle}</div> : null}
    </div>
  )
}

export function Button({
  children,
  variant = 'primary',
  type = 'button',
  onClick,
  disabled,
}: PropsWithChildren<{
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}>) {
  const base = 'inline-flex items-center justify-center rounded-xl px-3 py-2 text-sm font-medium transition'
  const styles =
    variant === 'primary'
      ? 'bg-slate-900 text-white hover:bg-slate-800 disabled:bg-slate-300'
      : variant === 'secondary'
        ? 'bg-slate-100 text-slate-900 hover:bg-slate-200 disabled:bg-slate-100 disabled:text-slate-400'
        : variant === 'danger'
          ? 'bg-rose-600 text-white hover:bg-rose-500 disabled:bg-rose-200'
          : 'bg-transparent text-slate-700 hover:bg-slate-100 disabled:text-slate-300'
  return (
    <button type={type} onClick={onClick} disabled={disabled} className={`${base} ${styles}`}>
      {children}
    </button>
  )
}

export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  min,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  type?: string
  min?: number
}) {
  return (
    <input
      type={type}
      min={min}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
    />
  )
}

export function Select({
  value,
  onChange,
  children,
}: PropsWithChildren<{ value: string; onChange: (v: string) => void }>) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
    >
      {children}
    </select>
  )
}

