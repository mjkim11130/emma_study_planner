import { useEffect, useMemo, useState } from 'react'
import { usePlannerStore } from '../store/usePlannerStore'
import type { Subject } from '../store/types'
import { TaskDialogShell } from './TaskDialogShell'

function colorCandidates() {
  return ['#2563eb', '#16a34a', '#f97316', '#dc2626', '#7c3aed', '#0891b2', '#334155', '#0ea5e9', '#22c55e', '#f59e0b']
}

function normalizeHex(color: string) {
  const raw = color.trim()
  const hex = raw.startsWith('#') ? raw.slice(1) : raw
  if (/^[0-9a-fA-F]{3}$/.test(hex)) return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
  if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
  return raw.toLowerCase()
}

function pickDefaultColor(subjects: Subject[]) {
  const used = new Set(subjects.filter((s) => !s.archived).map((s) => normalizeHex(s.color)))
  const pool = colorCandidates().filter((c) => !used.has(normalizeHex(c)))
  const pickFrom = pool.length ? pool : colorCandidates()
  const idx = Math.floor(Math.random() * pickFrom.length)
  return pickFrom[idx] ?? '#2563eb'
}

function pickNextTopicName(subjects: Subject[]) {
  const names = subjects.map((s) => (s.name ?? '').trim())
  let max = 0
  for (const n of names) {
    const m = /^주제\s*(\d+)$/.exec(n)
    if (!m) continue
    const v = Number(m[1])
    if (Number.isFinite(v) && v > max) max = v
  }
  return `주제 ${max + 1}`
}

export function SubjectDialog({
  open,
  mode,
  subjectId,
  onClose,
  onAfterAdd,
}: {
  open: boolean
  mode: 'edit' | 'add'
  subjectId?: string | null
  onClose: () => void
  onAfterAdd?: (subjectId: string) => void
}) {
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const subjects = usePlannerStore((s) => s.subjects)
  const addSubject = usePlannerStore((s) => s.addSubject)
  const updateSubject = usePlannerStore((s) => s.updateSubject)
  const deleteSubject = usePlannerStore((s) => s.deleteSubject)

  const subject: Subject | null = useMemo(() => {
    if (mode !== 'edit' || !subjectId) return null
    return subjects.find((s) => s.id === subjectId) ?? null
  }, [mode, subjectId, subjects])

  const [name, setName] = useState('')
  const [nameSample, setNameSample] = useState('주제 추가')
  const [color, setColor] = useState('#2563eb')
  const [archived, setArchived] = useState(false)
  const [isRest, setIsRest] = useState(false)

  useEffect(() => {
    if (!open) return
    if (mode === 'edit' && subject) {
      setName(subject.name)
      setColor(subject.color)
      setArchived(Boolean(subject.archived))
      setIsRest(Boolean(subject.isRest))
      setNameSample(subject.name?.trim() || '주제 추가')
      return
    }
    setName('')
    setColor(pickDefaultColor(subjects.filter((s) => s.examId === activeExamId)))
    setArchived(false)
    setIsRest(false)
    setNameSample('주제 추가')
  }, [open, mode, subject])

  if (!open) return null

  return (
    <TaskDialogShell open onClose={onClose} titleRow={null}>
      <div className="px-5 py-5 md:px-6">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="relative h-10 w-10 shrink-0">
              <button
                type="button"
                className="h-10 w-10 rounded-xl border border-slate-200 bg-white"
                style={{ background: color }}
                aria-label="색상 선택"
              />
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="색상 선택"
              />
            </div>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={nameSample || '주제 추가'}
              className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-base font-semibold text-slate-900 outline-none placeholder:font-semibold placeholder:text-slate-400 focus:border-slate-400"
            />
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="닫기"
          >
            <span aria-hidden="true" className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        <div className="mt-4 flex flex-col items-end gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input type="checkbox" checked={isRest} onChange={(e) => setIsRest(e.target.checked)} />
            통계에 포함하지 않기
          </label>
          {mode === 'edit' ? (
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
              <input type="checkbox" checked={archived} onChange={(e) => setArchived(e.target.checked)} />
              보관처리
            </label>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 border-t border-slate-100 bg-white/95 px-5 py-4 backdrop-blur md:px-6">
        {mode === 'edit' ? (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                if (!subject) return
                const scoped = subjects.filter((s) => s.examId === activeExamId)
                const nextName = name.trim() || pickNextTopicName(scoped)
                updateSubject(subject.id, { name: nextName, color, archived, isRest })
                onClose()
              }}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-black/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-black/70 disabled:bg-black/30"
            >
              완료
            </button>
            <button
              type="button"
              onClick={() => {
                if (!subject) return
                deleteSubject(subject.id)
                onClose()
              }}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-rose-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-rose-500"
            >
              삭제
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                const before = subjects.map((s) => s.id)
                const scoped = subjects.filter((s) => s.examId === activeExamId)
                const nextName = name.trim() || pickNextTopicName(scoped)
                addSubject({ name: nextName, color, examId: activeExamId })
                const after = usePlannerStore.getState().subjects.map((s) => s.id)
                const created = after.find((id) => !before.includes(id))
                if (created) onAfterAdd?.(created)
                onClose()
              }}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-black/80 px-3 py-2 text-sm font-medium text-white transition hover:bg-black/70 disabled:bg-black/30"
            >
              등록
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-slate-100 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-200"
            >
              등록 취소
            </button>
          </div>
        )}
      </div>
    </TaskDialogShell>
  )
}
