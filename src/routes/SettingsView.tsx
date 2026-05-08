import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Card, CardHeader, Input } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { useAuth } from '../auth/AuthContext'
import { getSupabase, supabaseConfigOk } from '../lib/supabaseClient'
import { MobileTopBar } from '../components/MobileTopBar'
import { TimePickerModal } from '../components/TimePicker'
import { exportSeasonTasksToXlsx } from '../lib/excelExport'

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

function formatMeridiemHm(hm: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(hm)
  if (!match) return hm
  const hours24 = Number(match[1])
  const minutes = Number(match[2])
  if (!Number.isFinite(hours24) || !Number.isFinite(minutes)) return hm
  const meridiem = hours24 < 12 ? '오전' : '오후'
  const hours12 = hours24 % 12 === 0 ? 12 : hours24 % 12
  return `${meridiem} ${String(hours12).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
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
  const setActiveExam = usePlannerStore((s) => s.setActiveExam)
  const addExam = usePlannerStore((s) => s.addExam)
  const updateExam = usePlannerStore((s) => s.updateExam)
  const deleteExam = usePlannerStore((s) => s.deleteExam)
  const resetAll = usePlannerStore((s) => s.resetAll)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)

  const activeExams = useMemo(() => exams.filter((e) => e.status === 'active'), [exams])

  const [defaultTimelineWindow, setDefaultTimelineWindow] = useState<TimelineWindow>(() => loadDefaultTimelineWindow())
  useEffect(() => {
    saveDefaultTimelineWindow(defaultTimelineWindow)
  }, [defaultTimelineWindow])

  const [timelinePickerOpen, setTimelinePickerOpen] = useState(false)
  const [timelinePickerField, setTimelinePickerField] = useState<'start' | 'end'>('start')

  const [examEditorOpen, setExamEditorOpen] = useState(false)
  const [examEditorMode, setExamEditorMode] = useState<'add' | 'edit'>('edit')
  const [examEditorId, setExamEditorId] = useState<string | null>(null)
  const editingExam = useMemo(() => exams.find((e) => e.id === examEditorId) ?? null, [exams, examEditorId])
  const [examEditorName, setExamEditorName] = useState('')
  const [examEditorDate, setExamEditorDate] = useState<string>('')
  useEffect(() => {
    if (!examEditorOpen) return
    if (examEditorMode === 'edit' && editingExam) {
      setExamEditorName(editingExam.name ?? '')
      setExamEditorDate(editingExam.examDate ?? '')
      return
    }
    setExamEditorName('')
    setExamEditorDate('')
  }, [examEditorOpen, examEditorMode, editingExam])

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar title="설정" />
      <Card>
        <CardHeader title="계정" />
        <div className="flex flex-col gap-2 px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <div className="text-sm font-semibold text-slate-900">{user?.email ?? '로그인 사용자'}</div>
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
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
            <Button
              variant="secondary"
              onClick={async () => {
                if (!supabaseConfigOk || !user) return
                const ok = window.confirm('이 계정의 모든 시즌, 주제, 일정을 초기화할까요? 이 작업은 되돌릴 수 없어요.')
                if (!ok) return
                // 1) Reset local immediately
                try {
                  window.localStorage.removeItem('emma-study-planner:v1')
                } catch {
                  // ignore
                }
                resetAll()
                // 2) Overwrite server snapshot for this account
                const state = usePlannerStore.getState() as any
                const data = {
                  exams: state.exams,
                  activeExamId: state.activeExamId,
                  subjects: state.subjects,
                  tasks: state.tasks,
                  lastUsedSubjectIdByExam: state.lastUsedSubjectIdByExam,
                  subjectOrderByExam: state.subjectOrderByExam,
                }
                await getSupabase().from('planner_state').upsert({ user_id: user.id, data })
                navigate('/', { replace: true })
              }}
            >
              이 계정 데이터 초기화
            </Button>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="타임라인 범위" />
        <div className="grid grid-cols-1 gap-3 px-4 py-4 md:grid-cols-[160px_160px_1fr]">
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">시작</div>
            <button
              type="button"
              onClick={() => {
                setTimelinePickerField('start')
                setTimelinePickerOpen(true)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 outline-none hover:bg-slate-50 focus:border-slate-400"
            >
              {formatMeridiemHm(minutesToHm(defaultTimelineWindow.startMin))}
            </button>
          </div>
          <div>
            <div className="mb-1 text-xs font-semibold text-slate-600">종료</div>
            <button
              type="button"
              onClick={() => {
                setTimelinePickerField('end')
                setTimelinePickerOpen(true)
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-left text-sm font-semibold text-slate-900 outline-none hover:bg-slate-50 focus:border-slate-400"
            >
              {formatMeridiemHm(minutesToHm(Math.max(defaultTimelineWindow.startMin + 10, defaultTimelineWindow.endMin)))}
            </button>
          </div>
          <div />
        </div>
      </Card>

      <Card>
        <CardHeader title="시즌 관리" subtitle="시즌 단위로 주제/일정이 분리됩니다." />
        <div className="flex items-center justify-between gap-2 px-4 py-3">
          <div className="text-sm font-semibold text-slate-700">시즌을 1개 선택하면 전체 데이터에 적용됩니다.</div>
          <Button
            onClick={() => {
              setExamEditorMode('add')
              setExamEditorId(null)
              setExamEditorOpen(true)
            }}
          >
            + 시즌 등록
          </Button>
        </div>

        <div className="divide-y divide-slate-100 px-2 pb-2">
          {activeExams.length === 0 ? <div className="px-4 py-4 text-sm text-slate-500">진행중 시즌이 없어요.</div> : null}
          {activeExams.map((e) => (
            <div
              key={e.id}
              className={`flex items-center justify-between gap-3 rounded-2xl px-3 py-3 transition ${
                e.id === activeExamId ? 'bg-black/80 text-white' : 'bg-slate-50 text-slate-900 opacity-60 hover:opacity-100'
              }`}
            >
              <button
                type="button"
                onClick={() => setActiveExam(e.id)}
                className="min-w-0 flex-1 text-left"
                aria-label="시즌 선택"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`inline-flex h-5 w-5 items-center justify-center rounded-full border ${
                      e.id === activeExamId ? 'border-white/70 bg-white/15' : 'border-slate-300 bg-white'
                    }`}
                    aria-hidden="true"
                  >
                    {e.id === activeExamId ? <span className="h-2.5 w-2.5 rounded-full bg-white" /> : null}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{e.name}</div>
                    <div className={`mt-0.5 text-xs tabular-nums ${e.id === activeExamId ? 'text-white/80' : 'text-slate-500'}`}>
                      시즌 종료일: {e.examDate ? e.examDate : '-'}
                    </div>
                  </div>
                </div>
              </button>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() =>
                    exportSeasonTasksToXlsx({
                      seasonId: e.id,
                      seasonName: e.name,
                      subjects,
                      tasks,
                    })
                  }
                >
                  내보내기
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setExamEditorMode('edit')
                    setExamEditorId(e.id)
                    setExamEditorOpen(true)
                  }}
                >
                  편집
                </Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <TimePickerModal
        open={timelinePickerOpen}
        title={timelinePickerField === 'start' ? '시작' : '종료'}
        initialHm={
          timelinePickerField === 'start'
            ? minutesToHm(defaultTimelineWindow.startMin)
            : minutesToHm(Math.max(defaultTimelineWindow.startMin + 10, defaultTimelineWindow.endMin))
        }
        stepMinutes={10}
        validate={(hm) => {
          const m = hmToMinutesLocal(hm)
          if (m === null) return '시간 형식이 올바르지 않아요.'
          const startMin = timelinePickerField === 'start' ? snap10(m) : defaultTimelineWindow.startMin
          const endMin = timelinePickerField === 'end' ? snap10(m) : defaultTimelineWindow.endMin
          if (timelinePickerField === 'start') {
            if (defaultTimelineWindow.endMin <= startMin) return '종료는 시작보다 뒤여야 해요.'
          } else {
            if (endMin <= defaultTimelineWindow.startMin) return '종료는 시작보다 뒤여야 해요.'
          }
          return null
        }}
        onApply={(hm) => {
          const m = hmToMinutesLocal(hm)
          if (m === null) return
          if (timelinePickerField === 'start') {
            const startMin = snap10(m)
            const endMin = Math.max(startMin + 10, defaultTimelineWindow.endMin)
            setDefaultTimelineWindow({ startMin, endMin })
          } else {
            const endMin = Math.max(defaultTimelineWindow.startMin + 10, snap10(m))
            setDefaultTimelineWindow({ startMin: defaultTimelineWindow.startMin, endMin })
          }
        }}
        onClose={() => setTimelinePickerOpen(false)}
      />

      {examEditorOpen ? (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/35 px-4"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setExamEditorOpen(false)
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl" onMouseDown={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div className="text-base font-semibold text-slate-900">{examEditorMode === 'add' ? '시즌 등록' : '시즌 편집'}</div>
              <button
                type="button"
                onClick={() => setExamEditorOpen(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100"
                aria-label="닫기"
              >
                <span aria-hidden="true" className="text-xl leading-none">
                  ×
                </span>
              </button>
            </div>

            <div className="mt-3 space-y-3">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">시즌 이름</div>
                <Input value={examEditorName} onChange={setExamEditorName} placeholder="예: 2026-1 중간고사" />
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-600">시즌 종료일</div>
                <input
                  type="date"
                  value={examEditorDate}
                  onChange={(ev) => setExamEditorDate(ev.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-slate-400"
                />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  if (examEditorMode === 'add') {
                    const id = addExam(examEditorName)
                    if (examEditorDate.trim()) updateExam(id, { examDate: examEditorDate.trim() || undefined })
                    setActiveExam(id)
                    setExamEditorOpen(false)
                    return
                  }
                  if (!examEditorId) return
                  updateExam(examEditorId, { name: examEditorName.trim() || '시즌', examDate: examEditorDate.trim() || undefined })
                  setExamEditorOpen(false)
                }}
              >
                완료
              </Button>
              <Button variant="secondary" onClick={() => setExamEditorOpen(false)}>
                취소
              </Button>
            </div>
            {examEditorMode === 'edit' && examEditorId ? (
              <div className="mt-3">
                <Button
                  variant="danger"
                  disabled={exams.length <= 1}
                  onClick={() => {
                    if (exams.length <= 1) return
                    const ok = window.confirm('이 시즌을 삭제할까요? 해당 시즌의 주제/일정도 함께 삭제됩니다.')
                    if (!ok) return
                    deleteExam(examEditorId)
                    setExamEditorOpen(false)
                  }}
                >
                  삭제
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}
