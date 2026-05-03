import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { useMemo } from 'react'
import { usePlannerStore } from '../store/usePlannerStore'

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'}`
      }
    >
      {label}
    </NavLink>
  )
}

export function AppLayout() {
  const location = useLocation()
  const hideBottom = location.pathname.startsWith('/task/')
  const exams = usePlannerStore((s) => s.exams)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const setActiveExam = usePlannerStore((s) => s.setActiveExam)

  const activeExams = useMemo(() => exams.filter((e) => e.status === 'active'), [exams])

  return (
    <div className="h-full">
      <div className="mx-auto grid h-full max-w-6xl grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white p-3 md:block">
          <div className="px-2 py-2 text-sm font-semibold text-slate-900">엠마 스터디플래너</div>
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2">
            <div className="text-[11px] font-semibold text-slate-600">현재 시험</div>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={activeExamId}
              onChange={(e) => setActiveExam(e.target.value)}
            >
              {activeExams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <NavItem to="/calendar" label="캘린더" />
            <NavItem to="/dashboard" label="대시보드" />
            <NavItem to="/subjects" label="과목 관리" />
            <NavItem to="/settings" label="설정" />
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
            목표시간 vs 실제시간을 비교 기록하세요.
          </div>
        </aside>
        <main className="min-h-0 overflow-auto p-3 pb-20 md:pb-3">
          <Outlet />
        </main>
      </div>

      {hideBottom ? null : (
        <nav className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
          <div className="mx-auto max-w-2xl p-2">
            <select
              className="mb-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={activeExamId}
              onChange={(e) => setActiveExam(e.target.value)}
            >
              {activeExams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>

            <div className="grid grid-cols-4 gap-1">
              <NavLink
                to="/calendar"
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
              }
            >
              캘린더
            </NavLink>
            <NavLink
              to="/dashboard"
              className={({ isActive }) =>
                `rounded-xl px-3 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
              }
            >
              대시보드
            </NavLink>
              <NavLink
                to="/subjects"
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
                }
              >
                과목
              </NavLink>
              <NavLink
                to="/settings"
                className={({ isActive }) =>
                  `rounded-xl px-3 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
                }
              >
                설정
              </NavLink>
            </div>
          </div>
        </nav>
      )}
    </div>
  )
}
