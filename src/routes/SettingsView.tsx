import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, Input, Select } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { useAuth } from '../auth/AuthContext'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'

function hmToMinutesLocal(hm?: string) {
  if (!hm) return null
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!m) return null
  const h = Number(m[1])
  const mm = Number(m[2])
  if (!Number.isFinite(h) || !Number.isFinite(mm)) return null
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return null
  return h * 60 + mm
}

function minutesToHm(min: number) {
  const clamped = Math.max(0, Math.min(24 * 60, Math.floor(min)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

function snap10(min: number) {
  return Math.max(0, Math.min(24 * 60 - 10, Math.round(min / 10) * 10))
}

type TimelineWindow = { startMin: number; endMin: number }

function loadDefaultTimelineWindow(): TimelineWindow {
  const fallback: TimelineWindow = { startMin: 9 * 60, endMin: 24 * 60 }
  try {
    const raw = window.localStorage.getItem('emma-study-planner:defaultTimelineWindow:v1')
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    const startMin = Number(parsed?.startMin)
    const endMin = Number(parsed?.endMin)
    if (!Number.isFinite(startMin) || !Number.isFinite(endMin)) return fallback
    if (endMin <= startMin) return fallback
    return {
      startMin: Math.max(0, Math.min(23 * 60, snap10(startMin))),
      endMin: Math.max(10, Math.min(24 * 60, snap10(endMin))),
    }
  } catch {
    return fallback
  }
}

function saveDefaultTimelineWindow(win: TimelineWindow) {
  try {
    window.localStorage.setItem('emma-study-planner:defaultTimelineWindow:v1', JSON.stringify(win))
  } catch {
    // ignore
  }
}

export function SettingsView() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const exams = usePlannerStore((s) => s.exams)
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const setActiveExam = usePlannerStore((s) => s.setActiveExam)
  const addExam = usePlannerStore((s) => s.addExam)
  const updateExam = usePlannerStore((s) => s.updateExam)
  const setExamStatus = usePlannerStore((s) => s.setExamStatus)
  const deleteExam = usePlannerStore((s) => s.deleteExam)

  const [newExamName, setNewExamName] = useState('')
  const activeExams = useMemo(() => exams.filter((e) => e.status === 'active'), [exams])
  const archivedExams = useMemo(() => exams.filter((e) => e.status === 'archived'), [exams])

  const [defaultTimelineWindow, setDefaultTimelineWindow] = useState<TimelineWindow>(() => loadDefaultTimelineWindow())
  useEffect(() => {
    saveDefaultTimelineWindow(defaultTimelineWindow)
  }, [defaultTimelineWindow])

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <CardHeader title="계정" subtitle="로그인 상태는 브라우저에 저장됩니다." />
        <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="text-sm text-slate-700">{user?.email ?? '로그인 사용자'}</div>
          <Button
            variant="secondary"
            onClick={async () => {
              if (!supabaseConfigOk) return
              await getSupabase().auth.signOut()
              navigate('/login', { replace: true })
            }}
          >
            로그아웃
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="Settings" subtitle="시험을 만들고, 진행중/보관을 관리합니다." />
        <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-2">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">현재 시험</div>
            <Select value={activeExamId} onChange={setActiveExam}>
              {activeExams.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">시험 명 수정</div>
            <Input
              value={activeExam?.name ?? ''}
              onChange={(v) => updateExam(activeExamId, { name: v })}
              placeholder="시험 이름"
            />
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Day 타임라인 기본 구간" subtitle="Day 페이지에서 처음 보이는 시간대를 기본값으로 사용합니다." />
        <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[160px_160px_1fr]">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">기본 시작</div>
            <input
              type="time"
              value={minutesToHm(defaultTimelineWindow.startMin)}
              onChange={(e) => {
                const m = hmToMinutesLocal(e.target.value)
                if (m === null) return
                const startMin = snap10(m)
                const endMin = Math.max(startMin + 10, defaultTimelineWindow.endMin)
                setDefaultTimelineWindow({ startMin, endMin })
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">기본 종료</div>
            <input
              type="time"
              value={minutesToHm(Math.max(defaultTimelineWindow.startMin + 10, defaultTimelineWindow.endMin))}
              onChange={(e) => {
                const m = hmToMinutesLocal(e.target.value)
                if (m === null) return
                const endMin = Math.max(defaultTimelineWindow.startMin + 10, snap10(m))
                setDefaultTimelineWindow({ startMin: defaultTimelineWindow.startMin, endMin })
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
            />
          </div>
          <div className="text-sm text-slate-600 md:self-end">
            기본값: <span className="font-semibold">09:00 ~ 24:00</span> (날짜별로는 Day 페이지에서 별도 설정 가능)
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="시험 관리" subtitle="시험 단위로 과목/일정이 분리됩니다." />
        <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_120px]">
          <Input value={newExamName} onChange={setNewExamName} placeholder="예: 2026-1 중간고사" />
          <Button
            onClick={() => {
              const id = addExam(newExamName)
              setNewExamName('')
              setActiveExam(id)
            }}
          >
            + 시험 추가
          </Button>
        </div>

        <div className="divide-y divide-slate-100">
          {activeExams.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">진행중 시험이 없어요.</div> : null}
          {activeExams.map((e) => (
            <div key={e.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_360px]">
              <div className="min-w-0">
                <Link to={`/exams/${e.id}`} className="text-sm font-semibold text-slate-900 hover:underline">
                  {e.name}
                </Link>
                <div className="mt-1 text-xs text-slate-500">ID: {e.id}</div>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_160px_80px_80px_80px]">
                <Input value={e.name} onChange={(v) => updateExam(e.id, { name: v })} />
                <input
                  type="date"
                  value={e.examDate ?? ''}
                  onChange={(ev) => updateExam(e.id, { examDate: ev.target.value || undefined })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
                <Button variant="secondary" onClick={() => setActiveExam(e.id)}>
                  선택
                </Button>
                <Button variant="secondary" onClick={() => setExamStatus(e.id, 'archived')}>
                  보관
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    const ok = window.confirm('이 시험을 삭제할까요? 해당 시험의 과목/일정도 함께 삭제됩니다.')
                    if (!ok) return
                    deleteExam(e.id)
                  }}
                >
                  삭제
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-100">
          <div className="px-4 py-3 text-xs font-semibold text-slate-700">보관함</div>
          <div className="divide-y divide-slate-100">
            {archivedExams.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">보관된 시험이 없어요.</div> : null}
            {archivedExams.map((e) => (
              <div key={e.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_280px]">
                <div className="min-w-0">
                  <Link to={`/exams/${e.id}`} className="text-sm font-semibold text-slate-900 hover:underline">
                    {e.name}
                  </Link>
                  <div className="mt-1 text-xs text-slate-500">ID: {e.id}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="secondary" onClick={() => setExamStatus(e.id, 'active')}>
                    진행중으로
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => {
                      const ok = window.confirm('이 보관된 시험을 삭제할까요? 해당 시험의 과목/일정도 함께 삭제됩니다.')
                      if (!ok) return
                      deleteExam(e.id)
                    }}
                  >
                    삭제
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  )
}
