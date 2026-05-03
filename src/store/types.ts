export type Exam = {
  id: string
  name: string // e.g. "2026-1 중간고사"
  status: 'active' | 'archived'
  examDate?: string // YYYY-MM-DD
  createdAt: string
}

export type Subject = {
  id: string
  examId: string
  name: string
  color: string
  createdAt: string
}

export type StudyTaskStatus = 'pending' | 'completed'

export type StudyTask = {
  id: string
  examId: string
  subjectId: string
  title: string
  date: string // YYYY-MM-DD (미배치 가능: "")
  dueDate?: string // YYYY-MM-DD (선택: D-day 마감일)
  plannedMinutes: number
  startTime?: string // HH:mm
  endTime?: string // HH:mm
  actualMinutes?: number
  status: StudyTaskStatus
  memo?: string
  createdAt: string
  updatedAt: string
}
