import { addDays, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'

export function todayYmd() {
  return format(new Date(), 'yyyy-MM-dd')
}

export function ymdToDate(ymd: string) {
  return parseISO(ymd)
}

export function monthGridDays(yyyyMm: string) {
  const base = parseISO(`${yyyyMm}-01`)
  const start = startOfWeek(startOfMonth(base), { weekStartsOn: 0 })
  const days: string[] = []
  for (let i = 0; i < 42; i += 1) {
    const d = addDays(start, i)
    days.push(format(d, 'yyyy-MM-dd'))
  }
  const currentMonth = format(base, 'yyyy-MM')
  return { days, currentMonth }
}
