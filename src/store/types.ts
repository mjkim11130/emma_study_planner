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
  archived?: boolean
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
  plannedStartTime?: string // HH:mm (계획 시작시간)
  plannedSeconds: number // 계획 소요시간(초)

  actualStartTime?: string // HH:mm (완료 시작시간)
  actualEndTime?: string // HH:mm (완료 종료시간)
  actualSeconds?: number // 실제 소요시간(초)
  recordCompleteOnly?: boolean // 시간 없이 '완료 처리'만 한 완료(시간 입력 잠금)
  status: StudyTaskStatus
  memo?: string
  createdAt: string
  updatedAt: string
}
