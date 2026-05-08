import { useMemo, useState } from 'react'
import { Button, Card, CardHeader, Input } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'

function colorCandidates() {
  return ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#334155']
}

export function SubjectManagerView() {
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const addSubject = usePlannerStore((s) => s.addSubject)
  const updateSubject = usePlannerStore((s) => s.updateSubject)
  const deleteSubject = usePlannerStore((s) => s.deleteSubject)

  const [name, setName] = useState('')
  const [color, setColor] = useState(colorCandidates()[0]!)

  const taskCounts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) map.set(t.subjectId, (map.get(t.subjectId) ?? 0) + 1)
    return map
  }, [tasks])

  const scopedSubjects = useMemo(
    () => subjects.filter((s) => s.examId === activeExamId),
    [subjects, activeExamId],
  )

  return (
    <div className="flex flex-col gap-3">
      <MobileTopBar title="주제 관리" />
      <Card>
        <CardHeader title="주제" />
        <div className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_160px_100px]">
          <Input value={name} onChange={setName} placeholder="주제명 (예: 수학)" />
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              className="h-10 w-14 rounded-xl border border-slate-200 bg-white p-1"
            />
            <div className="flex gap-1">
              {colorCandidates().map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="h-6 w-6 rounded-lg border border-slate-200"
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
          <Button
            onClick={() => {
              addSubject({ name, color, examId: activeExamId })
              setName('')
            }}
          >
            추가
          </Button>
        </div>
      </Card>

      <Card>
        <CardHeader title="주제 목록" subtitle="현재 선택한 시즌의 주제만 표시됩니다." />
        <div className="divide-y divide-slate-100">
          {scopedSubjects.map((s) => (
            <div key={s.id} className="grid grid-cols-1 gap-2 px-4 py-3 md:grid-cols-[1fr_220px_110px]">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
                  <div className="truncate text-sm font-semibold text-slate-900">{s.name}</div>
                  <div className="text-xs text-slate-500">({taskCounts.get(s.id) ?? 0}개)</div>
                </div>
                <div className="mt-1 text-xs text-slate-500">ID: {s.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={s.color}
                  onChange={(e) => updateSubject(s.id, { color: e.target.value })}
                  className="h-10 w-14 rounded-xl border border-slate-200 bg-white p-1"
                />
                <Input value={s.name} onChange={(v) => updateSubject(s.id, { name: v })} />
              </div>
              <div className="flex items-center justify-end">
                <Button
                  variant="danger"
                  onClick={() => {
                    const taskCount = taskCounts.get(s.id) ?? 0
                    const ok = window.confirm(
                      taskCount > 0
                        ? `이 주제를 삭제할까요? 연결된 일정 ${taskCount}개도 함께 삭제됩니다.`
                        : '이 주제를 삭제할까요?',
                    )
                    if (!ok) return
                    deleteSubject(s.id)
                  }}
                >
                  삭제
                </Button>
              </div>
              {(taskCounts.get(s.id) ?? 0) > 0 ? (
                <div className="md:col-span-3 text-xs text-slate-500">삭제하면 연결된 일정도 함께 삭제됩니다.</div>
              ) : null}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}
