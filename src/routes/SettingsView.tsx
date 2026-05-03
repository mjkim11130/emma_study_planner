import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, Card, CardHeader, Input, Select } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'

export function SettingsView() {
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

  return (
    <div className="flex flex-col gap-3">
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
