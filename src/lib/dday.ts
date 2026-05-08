import { differenceInCalendarDays, parseISO } from 'date-fns'
import { todayYmd } from './dates'

export function formatDday(dueDate?: string | null) {
  if (!dueDate) return ''
  const due = parseISO(dueDate)
  if (Number.isNaN(due.getTime())) return ''
  const diffDays = differenceInCalendarDays(due, parseISO(todayYmd()))
  if (diffDays === 0) return 'D-Day'
  if (diffDays > 0) return `D-${diffDays}`
  return `D+${Math.abs(diffDays)}`
}
