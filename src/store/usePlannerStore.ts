import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomId } from '../lib/ids'
import { hmToMinutes } from '../lib/time'
import type { Exam, StudyTask, Subject } from './types'

type PlannerState = {
  exams: Exam[]
  activeExamId: string
  setActiveExam: (examId: string) => void
  resetAll: () => void
  addExam: (name: string) => string
  setExamStatus: (examId: string, status: Exam['status']) => void
  updateExam: (id: string, patch: Partial<Pick<Exam, 'name' | 'examDate'>>) => void
  deleteExam: (examId: string) => void

  subjects: Subject[]
  tasks: StudyTask[]
  addSubject: (input: { name: string; color: string; examId?: string }) => void
  updateSubject: (id: string, patch: Partial<Pick<Subject, 'name' | 'color' | 'examId'>>) => void
  deleteSubject: (id: string) => void
  addTask: (input: {
    subjectId: string
    title: string
    date?: string
    dueDate?: string
    plannedSeconds: number
    examId?: string
  }) => string
  updateTask: (id: string, patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => void
  deleteTask: (id: string) => void
}

function computeActualSeconds(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return undefined
  const s = hmToMinutes(startTime)
  const e = hmToMinutes(endTime)
  if (s === null || e === null) return undefined
  const diff = e - s
  if (diff < 0) return undefined
  return diff * 60
}

function isInvalidTimeRange(startTime?: string, endTime?: string) {
  if (!startTime || !endTime) return false
  const s = hmToMinutes(startTime)
  const e = hmToMinutes(endTime)
  if (s === null || e === null) return false
  return e < s
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
      resetAll: () => set(seed()),
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
      deleteExam: (examId) =>
        set((state) => {
          const nextExams = state.exams.filter((e) => e.id !== examId)
          const nextSubjects = state.subjects.filter((s) => s.examId !== examId)
          const nextSubjectIds = new Set(nextSubjects.map((s) => s.id))
          const nextTasks = state.tasks.filter((t) => t.examId !== examId && nextSubjectIds.has(t.subjectId))

          let nextActiveExamId = state.activeExamId
          if (state.activeExamId === examId) {
            nextActiveExamId = nextExams.find((e) => e.status === 'active')?.id ?? nextExams[0]?.id ?? ''
          }
          return { exams: nextExams, subjects: nextSubjects, tasks: nextTasks, activeExamId: nextActiveExamId }
        }),
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
      addTask: ({ subjectId, title, date, dueDate, plannedSeconds, examId }) => {
        const id = randomId('task')
        const createdAt = nowIso()
        const resolvedExamId = examId ?? get().activeExamId
        const task: StudyTask = {
          id,
          examId: resolvedExamId,
          subjectId,
          title: title.trim() || '새 일정',
          date: date ?? '',
          dueDate: typeof dueDate === 'string' && dueDate ? dueDate : undefined,
          plannedSeconds: Math.max(0, Math.floor(plannedSeconds)),
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
            const invalidActualRange = isInvalidTimeRange(next.actualStartTime, next.actualEndTime)
            const actualSeconds = invalidActualRange
              ? undefined
              : patch.actualSeconds !== undefined
                ? patch.actualSeconds
                : computeActualSeconds(next.actualStartTime, next.actualEndTime)
            const status =
              invalidActualRange
                ? 'pending'
                : next.actualStartTime && next.actualEndTime
                  ? 'completed'
                  : actualSeconds !== undefined
                    ? 'completed'
                    : (next.status ?? 'pending')
            return { ...next, actualSeconds, status }
          }),
        })),
      deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
    }),
    {
      name: 'emma-study-planner:v1',
      version: 6,
      migrate: (persisted: any, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') return seed()
        if (fromVersion >= 6) return persisted

        if (fromVersion === 5) {
          // v5 -> v6: planned/actual 시간을 초 단위로 전환
          const tasks = Array.isArray(persisted.tasks)
            ? persisted.tasks.map((t: any) => {
                const plannedSecondsRaw =
                  typeof t.plannedSeconds === 'number'
                    ? t.plannedSeconds
                    : typeof t.plannedMinutes === 'number'
                      ? t.plannedMinutes * 60
                      : 0
                const actualSecondsRaw =
                  typeof t.actualSeconds === 'number'
                    ? t.actualSeconds
                    : typeof t.actualMinutes === 'number'
                      ? t.actualMinutes * 60
                      : undefined
                const next = {
                  ...t,
                  plannedSeconds: Math.max(0, Math.floor(plannedSecondsRaw)),
                  actualSeconds: actualSecondsRaw !== undefined ? Math.max(0, Math.floor(actualSecondsRaw)) : undefined,
                }
                delete (next as any).plannedMinutes
                delete (next as any).actualMinutes
                return next
              })
            : []
          return { ...persisted, tasks }
        }

        if (fromVersion === 4) {
          // v4 -> v5: 목표/기록 시간 필드 분리
          const tasks = Array.isArray(persisted.tasks)
            ? persisted.tasks.map((t: any) => ({
                ...t,
                plannedStartTime: typeof t.plannedStartTime === 'string' ? t.plannedStartTime : undefined,
                actualStartTime: typeof t.actualStartTime === 'string' ? t.actualStartTime : typeof t.startTime === 'string' ? t.startTime : undefined,
                actualEndTime: typeof t.actualEndTime === 'string' ? t.actualEndTime : typeof t.endTime === 'string' ? t.endTime : undefined,
              }))
            : []
          return { ...persisted, tasks }
        }

        if (fromVersion === 3) {
          // v3 -> v4: task dueDate(선택 마감일) 추가
          const tasks = Array.isArray(persisted.tasks)
            ? persisted.tasks.map((t: any) => ({
                ...t,
                dueDate: typeof t.dueDate === 'string' ? t.dueDate : undefined,
              }))
            : []
          return { ...persisted, tasks }
        }

        if (fromVersion === 2) {
          // v2 -> v3: examDate 추가
          const exams = Array.isArray(persisted.exams)
            ? persisted.exams.map((e: any) => ({
                ...e,
                examDate: typeof e.examDate === 'string' ? e.examDate : undefined,
              }))
            : seed().exams
          return { ...persisted, exams }
        }

        // v1(학기+시험) -> v2(시험만)
        const exams: Exam[] = Array.isArray(persisted.exams)
          ? persisted.exams.map((e: any) => ({
              id: String(e.id),
              name: String(e.name ?? '시험'),
              status: (e.status === 'archived' ? 'archived' : 'active') as Exam['status'],
              examDate: typeof e.examDate === 'string' ? e.examDate : undefined,
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
              dueDate: typeof t.dueDate === 'string' ? t.dueDate : undefined,
              plannedSeconds:
                typeof t.plannedSeconds === 'number'
                  ? t.plannedSeconds
                  : typeof t.plannedMinutes === 'number'
                    ? t.plannedMinutes * 60
                    : Number(t.plannedMinutes ?? 0) * 60,
              plannedStartTime: typeof t.plannedStartTime === 'string' ? t.plannedStartTime : undefined,
              actualStartTime: typeof t.actualStartTime === 'string' ? t.actualStartTime : typeof t.startTime === 'string' ? t.startTime : undefined,
              actualEndTime: typeof t.actualEndTime === 'string' ? t.actualEndTime : typeof t.endTime === 'string' ? t.endTime : undefined,
              actualSeconds:
                typeof t.actualSeconds === 'number'
                  ? t.actualSeconds
                  : typeof t.actualMinutes === 'number'
                    ? t.actualMinutes * 60
                    : undefined,
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
