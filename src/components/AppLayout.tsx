import { useMemo } from 'react'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { usePlannerStore } from '../store/usePlannerStore'
import { formatRoundedDurationKoFromSeconds } from '../lib/time'

const normalizeHex = (color: string) => {
  const raw = color.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
  return raw
}

const pickReadableTextColor = (bg: string) => {
  const hex = normalizeHex(bg)
  const m = /^#([0-9a-f]{6})$/i.exec(hex)
  if (!m) return '#0f172a'
  const v = m[1]
  const r = parseInt(v.slice(0, 2), 16)
  const g = parseInt(v.slice(2, 4), 16)
  const b = parseInt(v.slice(4, 6), 16)
  const srgb = [r, g, b].map((x) => {
    const c = x / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  })
  const L = 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2]
  return L < 0.45 ? '#ffffff' : '#0f172a'
}

function formatDday(dueDate?: string) {
  if (!dueDate) return ''
  const today = new Date()
  const d = new Date(`${dueDate}T00:00:00`)
  if (Number.isNaN(d.getTime())) return ''
  const diff = Math.round((d.getTime() - today.setHours(0, 0, 0, 0)) / (24 * 60 * 60 * 1000))
  if (diff === 0) return 'D-DAY'
  if (diff > 0) return `D-${diff}`
  return `D+${Math.abs(diff)}`
}

function truncateText(s: string, max: number) {
  if (s.length <= max) return s
  return s.slice(0, max)
}

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
  const hideBottom = location.pathname.includes('/task/')
  const exams = usePlannerStore((s) => s.exams)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const setActiveExam = usePlannerStore((s) => s.setActiveExam)
  const subjects = usePlannerStore((s) => s.subjects)

  const unassignedPending = usePlannerStore(
    useMemo(
      () => (s) =>
        s.tasks.filter((t) => t.examId === activeExamId && t.status !== 'completed' && (!t.date || t.date === '')),
      [activeExamId],
    ),
  )

  const unassignedBySubject = useMemo(() => {
    const map = new Map<string, typeof unassignedPending>()
    for (const t of unassignedPending) {
      const arr = map.get(t.subjectId) ?? []
      arr.push(t)
      map.set(t.subjectId, arr)
    }
    const groups = Array.from(map.entries()).map(([subjectId, list]) => ({
      subjectId,
      newest: list.reduce((acc, cur) => (cur.createdAt > acc ? cur.createdAt : acc), list[0]?.createdAt ?? ''),
      list: list.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    }))
    groups.sort((a, b) => b.newest.localeCompare(a.newest))
    return groups
  }, [unassignedPending])

  return (
    <div className="h-full [--bottom-nav-h:72px]">
      <div className="grid h-full w-full grid-cols-1 md:grid-cols-[260px_1fr]">
        <aside className="hidden border-r border-slate-200 bg-white p-3 md:block">
          <div className="px-2 py-2 text-sm font-semibold text-slate-900">엠마 스터디플래너</div>
          <div className="mt-2 rounded-2xl border border-slate-200 bg-white p-2">
            <div className="text-[11px] font-semibold text-slate-600">현재 시험</div>
            <select
              className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
              value={activeExamId}
              onChange={(e) => setActiveExam(e.target.value)}
            >
              {exams
                .filter((e) => e.status === 'active')
                .map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </select>
          </div>
          <div className="mt-2 flex flex-col gap-1">
            <NavItem to="calendar" label="캘린더" />
            <NavItem to="dashboard" label="대시보드" />
            <NavItem to="subjects" label="과목 관리" />
            <NavItem to="settings" label="설정" />
          </div>
          <div className="mt-6 rounded-2xl bg-slate-50 p-3 text-xs text-slate-600">
            목표시간 vs 실제시간을 비교 기록하세요.
          </div>

          <div className="mt-3 rounded-2xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-3 py-2">
              <div className="text-[12px] font-semibold text-slate-900">시작 예정</div>
              {unassignedPending.length ? (
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 tabular-nums">
                  {unassignedPending.length}
                </div>
              ) : null}
            </div>
            <div className="border-t border-slate-100 p-2">
              <div className="max-h-[calc(100dvh-380px)] overflow-y-auto pr-1">
                <div className="space-y-2">
                  {unassignedBySubject.map((g) => {
                    const subject = subjects.find((s) => s.id === g.subjectId)
                    return (
                      <div key={g.subjectId}>
                        <div className="mb-1 overflow-hidden whitespace-nowrap text-[11px] font-semibold text-slate-700">
                          {truncateText(subject?.name ?? '과목', 18)}
                        </div>
                        <div className="flex flex-col gap-1">
                          {g.list.slice(0, 12).map((t) => {
                            const sub = subjects.find((s) => s.id === t.subjectId)
                            const bg = sub?.color ?? '#94a3b8'
                            const textColor = pickReadableTextColor(bg)
                            const dday = formatDday(t.dueDate)
                            const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                            const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                            const timeLabelKo = formatRoundedDurationKoFromSeconds(secondsToShow)
                            return (
                              <Link
                                key={t.id}
                                to={`/task/${t.id}`}
                                className="block rounded-[3px] px-2 py-1 text-[11px] leading-none hover:brightness-95"
                                style={{ background: bg, color: textColor }}
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <span className="min-w-0 overflow-hidden whitespace-nowrap">{truncateText(t.title, 16)}</span>
                                  <span className="shrink-0 text-[10px] tabular-nums opacity-90">
                                    <span className="bg-white/60 px-1 py-[1px] text-slate-700">{timeLabelKo}</span>
                                    {dday ? (
                                      <span className="ml-1 bg-white/60 px-1 py-[1px] font-semibold text-indigo-700">
                                        {dday}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              </Link>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                  {!unassignedBySubject.length ? <div className="px-1 py-2 text-xs text-slate-400">비어있음</div> : null}
                </div>
              </div>
            </div>
          </div>
        </aside>
        <main className="min-h-0 overflow-auto px-0 py-0 pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] md:p-3 md:pb-3">
          <Outlet />
        </main>
      </div>

      {hideBottom ? null : (
        <nav
          className="fixed bottom-0 left-0 right-0 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden"
          style={{ height: 'calc(var(--bottom-nav-h) + env(safe-area-inset-bottom))' }}
        >
          <div className="w-full px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
            <div className="grid grid-cols-4 gap-1">
              <NavLink
                to="calendar"
                className={({ isActive }) =>
                  `rounded-xl px-2 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
                }
              >
                캘린더
              </NavLink>
              <NavLink
                to="dashboard"
                className={({ isActive }) =>
                  `rounded-xl px-2 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
                }
              >
                대시보드
              </NavLink>
              <NavLink
                to="subjects"
                className={({ isActive }) =>
                  `rounded-xl px-2 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
                }
              >
                과목
              </NavLink>
              <NavLink
                to="settings"
                className={({ isActive }) =>
                  `rounded-xl px-2 py-2 text-center text-sm font-medium ${isActive ? 'bg-slate-900 text-white' : 'text-slate-700'}`
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
