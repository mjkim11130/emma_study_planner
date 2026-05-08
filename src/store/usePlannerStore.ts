import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { randomId } from '../lib/ids'
import { addSecondsToHm, durationSecondsFromHmRange } from '../lib/time'
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
  lastUsedSubjectIdByExam: Record<string, string>
  subjectOrderByExam: Record<string, string[]>
  addSubject: (input: { name: string; color: string; examId?: string }) => void
  updateSubject: (id: string, patch: Partial<Pick<Subject, 'name' | 'color' | 'examId' | 'archived' | 'isRest'>>) => void
  deleteSubject: (id: string) => void
  setSubjectOrder: (examId: string, subjectIds: string[]) => void
  addTask: (input: {
    subjectId: string
    title: string
    date?: string
    dueDate?: string
    plannedStartTime?: string
    plannedSeconds: number
    actualStartTime?: string
    actualEndTime?: string
    actualSeconds?: number
    recordCompleteOnly?: boolean
    examId?: string
  }) => string
  updateTask: (id: string, patch: Partial<Omit<StudyTask, 'id' | 'createdAt'>>) => void
  deleteTask: (id: string) => void
}

function computeActualSeconds(startTime?: string, endTime?: string) {
  return durationSecondsFromHmRange(startTime, endTime, { allowNextDay: true })
}

function isInvalidTimeRange(startTime?: string, endTime?: string) {
  return startTime !== undefined && endTime !== undefined && computeActualSeconds(startTime, endTime) === undefined
}

function computeActualTimesFromPlanned(input: { plannedStartTime?: string; plannedSeconds?: number }) {
  const plannedStartTime = input.plannedStartTime
  const plannedSeconds = typeof input.plannedSeconds === 'number' ? input.plannedSeconds : 0
  if (!plannedStartTime || !Number.isFinite(plannedSeconds) || plannedSeconds <= 0) return null
  const endHm = addSecondsToHm(plannedStartTime, plannedSeconds)
  if (!endHm) return null
  return { actualStartTime: plannedStartTime, actualEndTime: endHm }
}

function nowIso() {
  return new Date().toISOString()
}

function nextSeasonName(existingNames: string[], base = '새 시즌') {
  const norm = (s: string) => (s ?? '').trim()
  const used = new Set(existingNames.map(norm).filter(Boolean))
  if (!used.has(base)) return base
  let max = 1
  for (const n of used) {
    const m = new RegExp(`^${base.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\$&')}\\s*(\\d+)$`).exec(n)
    if (!m) continue
    const v = Number(m[1])
    if (Number.isFinite(v)) max = Math.max(max, v)
  }
  return `${base} ${max + 1}`
}

function defaultSubjectsForExam(examId: string, createdAt: string): Subject[] {
  return [
    { id: randomId('sub'), examId, name: '중요', color: '#fecaca', archived: false, createdAt },
    { id: randomId('sub'), examId, name: '일반', color: '#e5e7eb', archived: false, createdAt },
  ]
}

const seed = () => {
  const createdAt = nowIso()
  const exam1Id = 'exam_1'
  const exams: Exam[] = [{ id: exam1Id, name: '새 시즌', status: 'active', createdAt }]
  const subjects: Subject[] = defaultSubjectsForExam(exam1Id, createdAt)
  return {
    exams,
    activeExamId: exam1Id,
    subjects,
    tasks: [] as StudyTask[],
    lastUsedSubjectIdByExam: {} as Record<string, string>,
    subjectOrderByExam: { [exam1Id]: subjects.map((s) => s.id) } as Record<string, string[]>,
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
        set((state) => {
          const nextName = name.trim() || nextSeasonName(state.exams.map((e) => e.name), '새 시즌')
          const defaults = defaultSubjectsForExam(id, createdAt)
          const nextSubjects = [...state.subjects, ...defaults]
          return {
            exams: [...state.exams, { id, name: nextName, status: 'active', createdAt }],
            subjects: nextSubjects,
            subjectOrderByExam: { ...state.subjectOrderByExam, [id]: defaults.map((s) => s.id) },
          }
        })
        return id
      },
      setExamStatus: (examId, status) =>
        set((state) => {
          if (status === 'archived') {
            const activeExamCount = state.exams.filter((e) => e.status === 'active').length
            const target = state.exams.find((e) => e.id === examId)
            if (target?.status === 'active' && activeExamCount <= 1) return state
          }
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
          if (nextExams.length === 0) return state
          const nextSubjects = state.subjects.filter((s) => s.examId !== examId)
          const nextSubjectIds = new Set(nextSubjects.map((s) => s.id))
          const nextTasks = state.tasks.filter((t) => t.examId !== examId && nextSubjectIds.has(t.subjectId))
          const restOrder = { ...state.subjectOrderByExam }
          delete restOrder[examId]

          let nextActiveExamId = state.activeExamId
          if (state.activeExamId === examId) {
            nextActiveExamId = nextExams.find((e) => e.status === 'active')?.id ?? nextExams[0]?.id ?? ''
          }
          return { exams: nextExams, subjects: nextSubjects, tasks: nextTasks, activeExamId: nextActiveExamId, subjectOrderByExam: restOrder }
        }),
      addSubject: ({ name, color, examId }) =>
        set((state) => {
          const resolvedExamId = examId ?? state.activeExamId
          const id = randomId('sub')
          const createdAt = nowIso()
          return {
            subjects: [
              ...state.subjects,
              {
                id,
                examId: resolvedExamId,
                name: name.trim() || '새 과목',
                color,
                archived: false,
                createdAt,
              },
            ],
            subjectOrderByExam: {
              ...state.subjectOrderByExam,
              [resolvedExamId]: [...(state.subjectOrderByExam[resolvedExamId] ?? []), id],
            },
          }
        }),
      updateSubject: (id, patch) =>
        set((state) => ({
          subjects: state.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),
      deleteSubject: (id) =>
        set((state) => ({
          subjects: state.subjects.filter((s) => s.id !== id),
          tasks: state.tasks.filter((t) => t.subjectId !== id),
          subjectOrderByExam: Object.fromEntries(
            Object.entries(state.subjectOrderByExam).map(([examId, order]) => [examId, (order ?? []).filter((x) => x !== id)]),
          ),
        })),
      setSubjectOrder: (examId, subjectIds) =>
        set((state) => {
          const scopedIds = new Set(state.subjects.filter((s) => s.examId === examId).map((s) => s.id))
          const dedup: string[] = []
          const seen = new Set<string>()
          for (const id of subjectIds) {
            if (!scopedIds.has(id)) continue
            if (seen.has(id)) continue
            seen.add(id)
            dedup.push(id)
          }
          for (const id of scopedIds) if (!seen.has(id)) dedup.push(id)
          return { subjectOrderByExam: { ...state.subjectOrderByExam, [examId]: dedup } }
        }),
      addTask: ({
        subjectId,
        title,
        date,
        dueDate,
        plannedStartTime,
        plannedSeconds,
        actualStartTime,
        actualEndTime,
        actualSeconds,
        recordCompleteOnly,
        examId,
      }) => {
        const id = randomId('task')
        const createdAt = nowIso()
        const resolvedExamId = examId ?? get().activeExamId
        const invalidActualRange = isInvalidTimeRange(actualStartTime, actualEndTime)
        const resolvedRecordCompleteOnly = Boolean(recordCompleteOnly)
        const plannedSecondsSafe = Math.max(0, Math.floor(plannedSeconds))
        const resolvedPlannedStartTime = typeof plannedStartTime === 'string' && plannedStartTime ? plannedStartTime : undefined
        const impliedActualTimes = resolvedRecordCompleteOnly
          ? computeActualTimesFromPlanned({ plannedStartTime: resolvedPlannedStartTime, plannedSeconds: plannedSecondsSafe })
          : null
        const resolvedActualSeconds = invalidActualRange
          ? undefined
          : typeof actualSeconds === 'number'
            ? Math.max(0, Math.floor(actualSeconds))
            : computeActualSeconds(impliedActualTimes?.actualStartTime ?? actualStartTime, impliedActualTimes?.actualEndTime ?? actualEndTime)
        const resolvedStatus = resolvedRecordCompleteOnly
          ? 'completed'
          : invalidActualRange
          ? 'pending'
          : actualStartTime && actualEndTime
            ? 'completed'
            : resolvedActualSeconds !== undefined
              ? 'completed'
              : 'pending'
        const task: StudyTask = {
          id,
          examId: resolvedExamId,
          subjectId,
          title: title.trim(),
          date: date ?? '',
          dueDate: typeof dueDate === 'string' && dueDate ? dueDate : undefined,
          plannedStartTime: resolvedPlannedStartTime,
          plannedSeconds: plannedSecondsSafe,
          actualStartTime: typeof (impliedActualTimes?.actualStartTime ?? actualStartTime) === 'string' && (impliedActualTimes?.actualStartTime ?? actualStartTime)
            ? (impliedActualTimes?.actualStartTime ?? actualStartTime)
            : undefined,
          actualEndTime: typeof (impliedActualTimes?.actualEndTime ?? actualEndTime) === 'string' && (impliedActualTimes?.actualEndTime ?? actualEndTime)
            ? (impliedActualTimes?.actualEndTime ?? actualEndTime)
            : undefined,
          actualSeconds: resolvedRecordCompleteOnly ? undefined : resolvedActualSeconds,
          recordCompleteOnly: resolvedRecordCompleteOnly,
          status: resolvedStatus,
          createdAt,
          updatedAt: createdAt,
        }
        set((state) => ({
          tasks: [...state.tasks, task],
          lastUsedSubjectIdByExam: { ...state.lastUsedSubjectIdByExam, [resolvedExamId]: subjectId },
        }))
        return id
      },
      updateTask: (id, patch) =>
        set((state) => {
          const current = state.tasks.find((t) => t.id === id)
          if (!current) return state
          const nextExamId = patch.examId ?? current.examId
          const nextSubjectId = patch.subjectId ?? current.subjectId
          return {
            lastUsedSubjectIdByExam: { ...state.lastUsedSubjectIdByExam, [nextExamId]: nextSubjectId },
            tasks: state.tasks.map((t) => {
              if (t.id !== id) return t
              const baseNext = { ...t, ...patch, updatedAt: nowIso() }
              const recordCompleteOnly = Boolean(baseNext.recordCompleteOnly)
              const impliedActualTimes = recordCompleteOnly
                ? computeActualTimesFromPlanned({ plannedStartTime: baseNext.plannedStartTime, plannedSeconds: baseNext.plannedSeconds })
                : null
              const next = impliedActualTimes
                ? {
                    ...baseNext,
                    actualStartTime: impliedActualTimes.actualStartTime,
                    actualEndTime: impliedActualTimes.actualEndTime,
                    actualSeconds: undefined,
                  }
                : baseNext
              const invalidActualRange = isInvalidTimeRange(next.actualStartTime, next.actualEndTime)
              const actualSeconds = recordCompleteOnly
                ? undefined
                : invalidActualRange
                  ? undefined
                  : patch.actualSeconds !== undefined
                    ? patch.actualSeconds
                    : computeActualSeconds(next.actualStartTime, next.actualEndTime)
              const status =
                recordCompleteOnly
                  ? 'completed'
                  : invalidActualRange
                  ? 'pending'
                  : next.actualStartTime && next.actualEndTime
                    ? 'completed'
                    : actualSeconds !== undefined
                      ? 'completed'
                      : (next.status ?? 'pending')
              return { ...next, actualSeconds, status }
            }),
          }
        }),
      deleteTask: (id) => set((state) => ({ tasks: state.tasks.filter((t) => t.id !== id) })),
    }),
    {
      name: 'emma-study-planner:v1',
      version: 9,
      migrate: (persisted: any, fromVersion) => {
        if (!persisted || typeof persisted !== 'object') return seed()
        if (fromVersion >= 9) return persisted

        if (fromVersion === 8) {
          const base = persisted as any
          const exams = Array.isArray(base.exams) ? base.exams : seed().exams
          const subjects = Array.isArray(base.subjects) ? base.subjects : seed().subjects
          const order: Record<string, string[]> = {}
          for (const e of exams) {
            const examId = String((e as any).id ?? '')
            if (!examId) continue
            order[examId] = subjects.filter((s: any) => String(s.examId ?? '') === examId).map((s: any) => String(s.id))
          }
          return { ...base, subjectOrderByExam: order }
        }

        if (fromVersion === 7) {
          const tasks = Array.isArray(persisted.tasks)
            ? persisted.tasks.map((t: any) => ({ ...t, recordCompleteOnly: Boolean(t.recordCompleteOnly) }))
            : []
          return { ...persisted, tasks }
        }

        if (fromVersion === 6) {
          return { ...persisted, lastUsedSubjectIdByExam: {} }
        }

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
          // v4 -> v5: 계획/완료 시간 필드 분리
          const tasks = Array.isArray(persisted.tasks)
            ? persisted.tasks.map((t: any) => ({
                ...t,
                plannedStartTime: typeof t.plannedStartTime === 'string' ? t.plannedStartTime : undefined,
                actualStartTime: typeof t.actualStartTime === 'string' ? t.actualStartTime : typeof t.startTime === 'string' ? t.startTime : undefined,
                actualEndTime: typeof t.actualEndTime === 'string' ? t.actualEndTime : typeof t.endTime === 'string' ? t.endTime : undefined,
                recordCompleteOnly: Boolean((t as any).recordCompleteOnly),
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
              recordCompleteOnly: Boolean((t as any).recordCompleteOnly),
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

        const subjectOrderByExam: Record<string, string[]> = {}
        for (const e of exams) {
          subjectOrderByExam[e.id] = subjects.filter((s) => s.examId === e.id).map((s) => s.id)
        }
        return { exams, activeExamId, subjects, tasks, subjectOrderByExam }
      },
    },
  ),
)
