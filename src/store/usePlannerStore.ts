import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomId } from '../lib/ids'
import { hmToMinutes } from '../lib/time'
import type { Exam, StudyTask, Subject } from './types'

type PlannerState = {
  exams: Exam[]
  activeExamId: string
  setActiveExam: (examId: string) => void
  addExam: (name: string) => string
  setExamStatus: (examId: string, status: Exam['status']) => void
  updateExam: (id: string, patch: Partial<Pick<Exam, 'name'>>) => void

  subjects: Subject[]
  tasks: StudyTask[]
  addSubject: (input: { name: string; color: string; examId?: string }) => void
  updateSubject: (id: string, patch: Partial<Pick<Subject, 'name' | 'color' | 'examId'>>) => void
  deleteSubject: (id: string) => void
  addTask: (input: { subjectId: string; title: string; date?: string; plannedMinutes: number; examId?: string }) => string
  updateTask: (id: string, patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => void
  deleteTask: (id: string) => void
}

function computeActualMinutes(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return undefined
  const s = hmToMinutes(startTime)
  const e = hmToMinutes(endTime)
  if (s === null || e === null) return undefined
  const diff = e - s
  if (diff < 0) return undefined
  return diff
}

function nowIso() {
  return new Date().toISOString()
}

const seed = () => {
  const createdAt = nowIso()
  const exam1Id = 'exam_1'
  const exams: Exam[] = [{ id: exam1Id, name: '기본 시험', status: 'active', createdAt }]
  const subjects: Subject[] = [
    { id: 'sub_math', examId: exam1Id, name: '수학', color: '#2563eb', createdAt },
    { id: 'sub_eng', examId: exam1Id, name: '영어', color: '#16a34a', createdAt },
    { id: 'sub_kor', examId: exam1Id, name: '국어', color: '#f97316', createdAt },
  ]
  return {
    exams,
    activeExamId: exam1Id,
    subjects,
    tasks: [] as StudyTask[],
  }
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set, get) => ({
      ...seed(),
      setActiveExam: (examId) => set({ activeExamId: examId }),
      addExam: (name) => {
        const id = randomId('exam')
        const createdAt = nowIso()
        set((state) => ({
          exams: [...state.exams, { id, name: name.trim() || '새 시험', status: 'active', createdAt }],
        }))
        return id
      },
      setExamStatus: (examId, status) =>
        set((state) => {
          const updated = state.exams.map((e) => (e.id === examId ? { ...e, status } : e))
          let nextActiveExamId = state.activeExamId
          if (status === 'archived' && state.activeExamId === examId) {
            nextActiveExamId = updated.find((e) => e.status === 'active')?.id ?? ''
          }
          return { exams: updated, activeExamId: nextActiveExamId }
        }),
      updateExam: (id, patch) =>
        set((state) => ({
          exams: state.exams.map((e) => (e.id === id ? { ...e, ...patch } : e)),
        })),
      addSubject: ({ name, color }) =>
        set((state) => ({
          subjects: [
            ...state.subjects,
            {
              id: randomId('sub'),
              examId: state.activeExamId,
              name: name.trim() || '새 과목',
              color,
              createdAt: nowIso(),
            },
          ],
        })),
      updateSubject: (id, patch) =>
        set((state) => ({
          subjects: state.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      deleteSubject: (id) =>
        set((state) => ({
          subjects: state.subjects.filter((s) => s.id !== id),
          tasks: state.tasks.filter((t) => t.subjectId !== id),
        })),
      addTask: ({ subjectId, title, date, plannedMinutes, examId }) => {
        const id = randomId('task')
        const createdAt = nowIso()
        const resolvedExamId = examId ?? get().activeExamId
        const task: StudyTask = {
          id,
          examId: resolvedExamId,
          subjectId,
          title: title.trim() || '새 일정',
          date: date ?? '',
          plannedMinutes: Math.max(0, Math.floor(plannedMinutes)),
          status: 'pending',
          createdAt,
          updatedAt: createdAt,
        }
        set((state) => ({ tasks: [...state.tasks, task] }))
        return id
      },
      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((t) => {
            if (t.id !== id) return t
            const next = { ...t, ...patch, updatedAt: nowIso() }
            const actualMinutes =
              patch.actualMinutes !== undefined ? patch.actualMinutes : computeActualMinutes(next.startTime, next.endTime)
            const status =
              next.startTime && next.endTime ? 'completed' : actualMinutes !== undefined ? 'completed' : (next.status ?? 'pending')
            return { ...next, actualMinutes, status }
          }),
        })),
      deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
    }),
    {
      name: 'emma-study-planner:v1',
      version: 2,
      migrate: (persisted: any, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') return seed()
        if (fromVersion >= 2) return persisted

        // v1(학기+시험) -> v2(시험만)
        const exams: Exam[] = Array.isArray(persisted.exams)
          ? persisted.exams.map((e: any) => ({
              id: String(e.id),
              name: String(e.name ?? '시험'),
              status: (e.status === 'archived' ? 'archived' : 'active') as Exam['status'],
              createdAt: String(e.createdAt ?? new Date().toISOString()),
            }))
          : seed().exams

        const activeExamId: string =
          typeof persisted.activeExamId === 'string'
            ? persisted.activeExamId
            : exams.find((e) => e.status === 'active')?.id ?? exams[0]?.id ?? ''

        const subjects: Subject[] = Array.isArray(persisted.subjects)
          ? persisted.subjects.map((s: any) => ({
              id: String(s.id),
              examId: typeof s.examId === 'string' ? s.examId : activeExamId,
              name: String(s.name ?? '과목'),
              color: String(s.color ?? '#334155'),
              createdAt: String(s.createdAt ?? new Date().toISOString()),
            }))
          : seed().subjects

        const tasks: StudyTask[] = Array.isArray(persisted.tasks)
          ? persisted.tasks.map((t: any) => ({
              id: String(t.id),
              examId: typeof t.examId === 'string' ? t.examId : activeExamId,
              subjectId: String(t.subjectId),
              title: String(t.title ?? '일정'),
              date: typeof t.date === 'string' ? t.date : '',
              plannedMinutes: Number(t.plannedMinutes ?? 0),
              startTime: typeof t.startTime === 'string' ? t.startTime : undefined,
              endTime: typeof t.endTime === 'string' ? t.endTime : undefined,
              actualMinutes: typeof t.actualMinutes === 'number' ? t.actualMinutes : undefined,
              status: t.status === 'completed' ? 'completed' : 'pending',
              memo: typeof t.memo === 'string' ? t.memo : undefined,
              createdAt: String(t.createdAt ?? new Date().toISOString()),
              updatedAt: String(t.updatedAt ?? t.createdAt ?? new Date().toISOString()),
            }))
          : []

        return { exams, activeExamId, subjects, tasks }
      },
    },
  ),
)
