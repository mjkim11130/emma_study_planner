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
  plannedStartTime?: string // HH:mm (목표 시작시간)
  plannedSeconds: number // 목표 소요시간(초)

  actualStartTime?: string // HH:mm (기록 시작시간)
  actualEndTime?: string // HH:mm (기록 종료시간)
  actualSeconds?: number // 실제 소요시간(초)
  status: StudyTaskStatus
  memo?: string
  createdAt: string
  updatedAt: string
}
