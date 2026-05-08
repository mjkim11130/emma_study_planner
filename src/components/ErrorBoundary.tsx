import type { ReactNode } from 'react'
import React from 'react'

export class ErrorBoundary extends React.Component<
  { children: ReactNode },
  { hasError: boolean; message?: string; stack?: string }
> {
  state: { hasError: boolean; message?: string; stack?: string } = { hasError: false }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    }
  }

  componentDidCatch(error: unknown) {
    console.error('App crashed:', error)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="min-h-full bg-slate-50 p-4">
        <div className="mx-auto max-w-xl rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm font-semibold text-slate-900">앱 오류가 발생했어요</div>
          <div className="mt-2 text-xs text-slate-600">{this.state.message}</div>
          <details className="mt-3 rounded-xl bg-slate-100 px-3 py-2 text-xs text-slate-600">
            <summary className="cursor-pointer font-semibold text-slate-700">기술 정보 보기</summary>
            <pre className="mt-2 max-h-56 overflow-auto rounded-xl bg-slate-900 p-3 text-[11px] text-slate-100">
              {this.state.stack ?? '(stack 없음)'}
            </pre>
          </details>
          <div className="mt-3 text-xs text-slate-500">콘솔(Console)에도 동일한 오류를 출력했습니다.</div>
        </div>
      </div>
    )
  }
}
