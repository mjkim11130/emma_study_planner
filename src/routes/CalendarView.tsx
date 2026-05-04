import { addDays, addMonths, differenceInCalendarDays, format, parseISO, startOfWeek } from 'date-fns'
import { useEffect, useMemo, useRef, useState, type WheelEvent as ReactWheelEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { todayYmd } from '../lib/dates'
import { formatRoundedDurationKoFromSeconds, formatRoundedDurationShortFromSeconds } from '../lib/time'
import { Button, Card } from '../components/ui'
import { usePlannerStore } from '../store/usePlannerStore'
import { MobileTopBar } from '../components/MobileTopBar'

export function CalendarView() {
  const navigate = useNavigate()
  const activeExamId = usePlannerStore((s) => s.activeExamId)
  const activeExam = usePlannerStore(useMemo(() => (s) => s.exams.find((e) => e.id === activeExamId), [activeExamId]))
  const subjects = usePlannerStore((s) => s.subjects)
  const tasks = usePlannerStore((s) => s.tasks)
  const addTask = usePlannerStore((s) => s.addTask)
  const updateTask = usePlannerStore((s) => s.updateTask)
  const today = useMemo(() => parseISO(todayYmd()), [])
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const weekSectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const weekdayHeaderRef = useRef<HTMLDivElement | null>(null)
  const [startOpen, setStartOpen] = useState(true)
  const [startPopupEverOpened, setStartPopupEverOpened] = useState(false)
  const [startDock, setStartDock] = useState<{ v: 'top' | 'bottom'; h: 'right' }>({ v: 'bottom', h: 'right' })
  const [topDockY, setTopDockY] = useState<number>(() => 64)
  const isAdjustingMonthsRef = useRef(false)
  const scrollSnapTimerRef = useRef<number | null>(null)
  const scrollAnimRef = useRef<number | null>(null)
  const dragRef = useRef<{
    isDragging: boolean
    startX: number
    startY: number
    dx: number
    dy: number
    didDrag: boolean
    lastDragAt: number
  }>({ isDragging: false, startX: 0, startY: 0, dx: 0, dy: 0, didDrag: false, lastDragAt: 0 })

  const normalizeHex = (color: string) => {
    const raw = color.trim()
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    if (/^[0-9a-fA-F]{3}$/.test(hex)) {
      return `#${hex[0]}${hex[0]}${hex[1]}${hex[1]}${hex[2]}${hex[2]}`.toLowerCase()
    }
    if (/^[0-9a-fA-F]{6}$/.test(hex)) return `#${hex}`.toLowerCase()
    return null
  }

  const pickReadableTextColor = (bgColor: string) => {
    const hex = normalizeHex(bgColor)
    if (!hex) return '#0f172a' // slate-900 fallback
    const r = parseInt(hex.slice(1, 3), 16) / 255
    const g = parseInt(hex.slice(3, 5), 16) / 255
    const b = parseInt(hex.slice(5, 7), 16) / 255
    const srgb = (v: number) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4))
    const L = 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b)
    return L > 0.5 ? '#0f172a' : '#ffffff'
  }

  const formatDday = (dueDate?: string) => {
    if (!dueDate) return null
    const end = parseISO(dueDate)
    const diffDays = differenceInCalendarDays(end, today) // due - today
    if (diffDays === 0) return 'D-Day'
    return diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
  }

  const measureUnits = (text: string) => {
    let units = 0
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0
      const isWide =
        (code >= 0x1100 && code <= 0x115f) || // Hangul Jamo
        (code >= 0x2e80 && code <= 0xa4cf) || // CJK + Hangul compat
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul syllables
        (code >= 0xf900 && code <= 0xfaff) // CJK compat ideographs
      units += isWide ? 2 : 1
    }
    return units
  }

  const truncateToUnits = (text: string, maxUnits: number) => {
    if (maxUnits <= 0) return ''
    let units = 0
    let out = ''
    for (const ch of text) {
      const code = ch.codePointAt(0) ?? 0
      const isWide =
        (code >= 0x1100 && code <= 0x115f) ||
        (code >= 0x2e80 && code <= 0xa4cf) ||
        (code >= 0xac00 && code <= 0xd7a3) ||
        (code >= 0xf900 && code <= 0xfaff)
      const u = isWide ? 2 : 1
      if (units + u > maxUnits) break
      units += u
      out += ch
    }
    return out
  }

  const [displayMonth, setDisplayMonth] = useState(() => format(new Date(), 'yyyy-MM'))
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)
  const [weeks, setWeeks] = useState<string[]>(() => {
    const base = parseISO(`${displayMonth}-01`)
    const firstWeek = startOfWeek(base, { weekStartsOn: 0 })
    const list: string[] = []
    for (let i = -2; i <= 14; i += 1) {
      list.push(format(addDays(firstWeek, i * 7), 'yyyy-MM-dd'))
    }
    return list
  })

  const examCountdown = useMemo(() => {
    if (!activeExam?.examDate) return null
    const today = parseISO(todayYmd())
    const examDate = parseISO(activeExam.examDate)
    const diffDays = differenceInCalendarDays(examDate, today) // exam - today
    const dday = diffDays === 0 ? 'D-Day' : diffDays > 0 ? `D-${diffDays}` : `D+${Math.abs(diffDays)}`
    const weeksLeft = diffDays > 0 ? Math.ceil(diffDays / 7) : 0
    return { dday, weeksLeft, examDate: activeExam.examDate }
  }, [activeExam])

  const scopedTasks = useMemo(() => tasks.filter((t) => t.examId === activeExamId && t.date), [tasks, activeExamId])
  const unassignedBySubject = useMemo(() => {
    const items = tasks.filter((t) => t.examId === activeExamId && !t.date && t.status !== 'completed').slice()
    const bySubject = new Map<string, typeof items>()
    for (const t of items) {
      const list = bySubject.get(t.subjectId) ?? []
      list.push(t)
      bySubject.set(t.subjectId, list)
    }
    const groups = Array.from(bySubject.entries()).map(([subjectId, list]) => {
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt)) // 최신 등록순(앞으로)
      return { subjectId, list, newest: list[0]?.createdAt ?? '' }
    })
    groups.sort((a, b) => b.newest.localeCompare(a.newest)) // 과목 그룹도 최신 등록순
    return groups
  }, [tasks, activeExamId])

  const unassignedPending = useMemo(() => unassignedBySubject.flatMap((g) => g.list), [unassignedBySubject])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, typeof tasks>()
    for (const t of scopedTasks) {
      const list = map.get(t.date) ?? []
      list.push(t)
      map.set(t.date, list)
    }
    return map
  }, [scopedTasks])

  // 일정 추가는 캘린더에서 하지 않고, 대시보드/과목 디테일에서 생성 후 날짜 배치하도록 유도

  const examMetaLabel = useMemo(() => {
    if (!activeExam) return null
    const name = activeExam.name?.trim()
    const pieces: string[] = []
    if (name) pieces.push(name)
    if (examCountdown?.examDate) pieces.push(`시험일 ${examCountdown.examDate}`)
    if (examCountdown?.dday) pieces.push(examCountdown.dday)
    return pieces.length ? pieces.join(' · ') : null
  }, [activeExam, examCountdown])

  const animateScrollTop = (el: HTMLElement, to: number, durationMs = 260) => {
    if (scrollAnimRef.current) window.cancelAnimationFrame(scrollAnimRef.current)
    const from = el.scrollTop
    const delta = to - from
    if (Math.abs(delta) < 1) return
    const start = performance.now()
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs)
      el.scrollTop = from + delta * easeOutCubic(t)
      if (t < 1) scrollAnimRef.current = window.requestAnimationFrame(tick)
    }
    scrollAnimRef.current = window.requestAnimationFrame(tick)
  }

  const scrollToWeek = (weekStartYmd: string) => {
    const root = scrollRef.current
    const el = weekSectionRefs.current[weekStartYmd]
    if (!root || !el) return
    const headerH = weekdayHeaderRef.current?.offsetHeight ?? 32
    // Align week start just below the sticky weekday header (robust to nested offsetParents).
    const rootRect = root.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const top = root.scrollTop + (elRect.top - rootRect.top) - headerH
    animateScrollTop(root, top, 280)
  }

  const nearestMonthStartWeek = (monthYmd: string) => {
    const monthStart = parseISO(monthYmd)
    return format(startOfWeek(monthStart, { weekStartsOn: 0 }), 'yyyy-MM-dd')
  }

  const ensureWeekInWindow = (weekStartYmd: string) => {
    if (weeks.includes(weekStartYmd)) return
    const target = parseISO(weekStartYmd)
    const list: string[] = []
    for (let i = -2; i <= 14; i += 1) {
      list.push(format(addDays(target, i * 7), 'yyyy-MM-dd'))
    }
    setWeeks(list)
  }

  useEffect(() => {
    // initial position
    const base = parseISO(`${displayMonth}-01`)
    const firstWeek = format(startOfWeek(base, { weekStartsOn: 0 }), 'yyyy-MM-dd')
    scrollToWeek(firstWeek)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (startOpen) setStartPopupEverOpened(true)
  }, [startOpen])

  const recomputeTopDockY = () => {
    const header = weekdayHeaderRef.current
    if (!header) return
    const rect = header.getBoundingClientRect()
    // Dock just below weekday header.
    setTopDockY(Math.round(rect.bottom) + 6)
  }

  useEffect(() => {
    recomputeTopDockY()
    const root = scrollRef.current
    root?.addEventListener('scroll', recomputeTopDockY, { passive: true })
    window.addEventListener('resize', recomputeTopDockY)
    return () => {
      root?.removeEventListener('scroll', recomputeTopDockY)
      window.removeEventListener('resize', recomputeTopDockY)
    }
  }, [])

  useEffect(() => {
    if (startDock.v === 'top') recomputeTopDockY()
  }, [startDock.v])

  const onStartDockPointerDown = (e: React.PointerEvent, allowOnInteractive: boolean) => {
    // only for mobile floating widget; ignore right click etc.
    if (e.pointerType === 'mouse' && e.button !== 0) return
    const target = e.target as HTMLElement | null
    if (!allowOnInteractive && target?.closest('button, a')) return
    dragRef.current.isDragging = true
    dragRef.current.startX = e.clientX
    dragRef.current.startY = e.clientY
    dragRef.current.dx = 0
    dragRef.current.dy = 0
    dragRef.current.didDrag = false
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  }

  const onStartDockPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return
    dragRef.current.dx = e.clientX - dragRef.current.startX
    dragRef.current.dy = e.clientY - dragRef.current.startY
    if (!dragRef.current.didDrag && Math.hypot(dragRef.current.dx, dragRef.current.dy) > 6) dragRef.current.didDrag = true
    const root = (e.currentTarget as HTMLElement).closest('[data-start-dock-root]') as HTMLElement | null
    if (root) root.style.transform = `translate3d(${dragRef.current.dx}px, ${dragRef.current.dy}px, 0)`
  }

  const onStartDockPointerUp = (e: React.PointerEvent) => {
    if (!dragRef.current.isDragging) return
    dragRef.current.isDragging = false
    if (dragRef.current.didDrag) dragRef.current.lastDragAt = Date.now()
    const root = (e.currentTarget as HTMLElement).closest('[data-start-dock-root]') as HTMLElement | null
    if (root) root.style.transform = ''
    const vh = window.innerHeight || 1
    const v: 'top' | 'bottom' = e.clientY < vh / 2 ? 'top' : 'bottom'
    setStartDock({ v, h: 'right' })
    try {
      ;(e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const shouldIgnoreClickAfterDrag = () => Date.now() - (dragRef.current.lastDragAt || 0) < 350

  const startDockOrigin = startDock.v === 'top' ? 'origin-top-right' : 'origin-bottom-right'

  const onStartPendingWheel = (e: ReactWheelEvent<HTMLDivElement>) => {
    // Let native scrolling happen (so wheel inertia/trackpad feels right),
    // but never allow the background month calendar to capture the wheel.
    e.stopPropagation()

    // Optional: shift+wheel scrolls horizontally.
    if (e.shiftKey && e.deltaX === 0) {
      e.preventDefault()
      e.currentTarget.scrollLeft += e.deltaY
    }
  }


  useEffect(() => {
    const root = scrollRef.current
    if (!root) return

    let raf = 0
    const onScroll = () => {
      cancelAnimationFrame(raf)
      raf = window.requestAnimationFrame(() => {
        if (isAdjustingMonthsRef.current) return

        // Expand week window when reaching edges (keeps scroll feeling continuous).
        const nearTop = root.scrollTop < 160
        const nearBottom = root.scrollHeight - (root.scrollTop + root.clientHeight) < 160
        if (nearTop && weeks.length) {
          const first = weeks[0]
          const prev = format(addDays(parseISO(first), -7), 'yyyy-MM-dd')
          if (!weeks.includes(prev)) {
            isAdjustingMonthsRef.current = true
            const prevScrollHeight = root.scrollHeight
            setWeeks((cur) => [prev, ...cur])
            requestAnimationFrame(() => {
              // preserve visual position after prepend
              const delta = root.scrollHeight - prevScrollHeight
              root.scrollTop += delta
              isAdjustingMonthsRef.current = false
            })
            return
          }
        }
        if (nearBottom && weeks.length) {
          const last = weeks[weeks.length - 1]
          const next = format(addDays(parseISO(last), 7), 'yyyy-MM-dd')
          if (!weeks.includes(next)) {
            setWeeks((cur) => [...cur, next])
            return
          }
        }

        const rootRect = root.getBoundingClientRect()
        const headerH = weekdayHeaderRef.current?.getBoundingClientRect().height ?? 0
        const visibleTop = rootRect.top + headerH
        const visibleBottom = rootRect.bottom
        const visibleHeight = Math.max(1, visibleBottom - visibleTop)

        // Determine the month occupying >= 50% of the visible calendar area.
        const monthToVisiblePx = new Map<string, number>()
        const weekRects = weeks
          .map((w) => {
            const el = weekSectionRefs.current[w]
            if (!el) return null
            const rect = el.getBoundingClientRect()
            const overlap = Math.max(0, Math.min(rect.bottom, visibleBottom) - Math.max(rect.top, visibleTop))
            const mid = addDays(parseISO(w), 3)
            const m = format(mid, 'yyyy-MM')
            monthToVisiblePx.set(m, (monthToVisiblePx.get(m) ?? 0) + overlap)
            return { w, rect, overlap, month: m }
          })
          .filter(Boolean) as Array<{ w: string; rect: DOMRect; overlap: number; month: string }>
        if (!weekRects.length) return

        let bestMonth = displayMonth
        let bestPx = 0
        for (const [m, px] of monthToVisiblePx.entries()) {
          if (px > bestPx) {
            bestPx = px
            bestMonth = m
          }
        }
        if (bestPx / visibleHeight >= 0.5 && bestMonth !== displayMonth) setDisplayMonth(bestMonth)

        // Soft snap to month boundary when scroll settles and we're near a boundary.
        if (scrollSnapTimerRef.current) window.clearTimeout(scrollSnapTimerRef.current)
        scrollSnapTimerRef.current = window.setTimeout(() => {
          const current = bestMonth
          const monthStartWeek = nearestMonthStartWeek(`${current}-01`)
          const el = weekSectionRefs.current[monthStartWeek]
          if (!el) return
          const rect = el.getBoundingClientRect()
          const distance = rect.top - visibleTop
          if (Math.abs(distance) < 160) scrollToWeek(monthStartWeek)
        }, 160)
      })
    }

    root.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      cancelAnimationFrame(raf)
      if (scrollSnapTimerRef.current) window.clearTimeout(scrollSnapTimerRef.current)
      if (scrollAnimRef.current) window.cancelAnimationFrame(scrollAnimRef.current)
      root.removeEventListener('scroll', onScroll)
    }
  }, [weeks, displayMonth])

  const prevMonthLabel = useMemo(() => {
    const d = addMonths(parseISO(`${displayMonth}-01`), -1)
    return `${Number(format(d, 'M'))}월`
  }, [displayMonth])

  const nextMonthLabel = useMemo(() => {
    const d = addMonths(parseISO(`${displayMonth}-01`), 1)
    return `${Number(format(d, 'M'))}월`
  }, [displayMonth])

  return (
    <div className="flex h-[calc(100dvh-72px-env(safe-area-inset-bottom))] flex-col overflow-hidden">
      <MobileTopBar
        title=""
        left={
          <Button
            variant="secondary"
            onClick={() => {
              const prevMonth = format(addMonths(parseISO(`${displayMonth}-01`), -1), 'yyyy-MM')
              const weekStart = nearestMonthStartWeek(`${prevMonth}-01`)
              ensureWeekInWindow(weekStart)
              requestAnimationFrame(() => scrollToWeek(weekStart))
            }}
          >
            {prevMonthLabel}
          </Button>
        }
        center={
          <div className="flex flex-col items-center justify-center gap-0.5">
            <div className="flex items-center justify-center gap-2">
              <div className="text-sm font-semibold text-slate-900">{displayMonth}</div>
              <Button
                variant="secondary"
                onClick={() => {
                  const now = format(new Date(), 'yyyy-MM')
                  setDisplayMonth(now)
                  const base = startOfWeek(parseISO(`${now}-01`), { weekStartsOn: 0 })
                  const list: string[] = []
                  for (let i = -2; i <= 14; i += 1) list.push(format(addDays(base, i * 7), 'yyyy-MM-dd'))
                  setWeeks(list)
                  requestAnimationFrame(() => scrollToWeek(format(base, 'yyyy-MM-dd')))
                }}
              >
                오늘
              </Button>
            </div>
            {examMetaLabel ? <div className="text-[11px] text-slate-600">{examMetaLabel}</div> : null}
          </div>
        }
        right={
          <Button
            variant="secondary"
            onClick={() => {
              const nextMonth = format(addMonths(parseISO(`${displayMonth}-01`), 1), 'yyyy-MM')
              const weekStart = nearestMonthStartWeek(`${nextMonth}-01`)
              ensureWeekInWindow(weekStart)
              requestAnimationFrame(() => scrollToWeek(weekStart))
            }}
          >
            {nextMonthLabel}
          </Button>
        }
      />

      <div className="hidden md:block mt-3">
        <Card>
          <div className="hidden items-center justify-between gap-2 px-4 py-3 md:flex">
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    const prevMonth = format(addMonths(parseISO(`${displayMonth}-01`), -1), 'yyyy-MM')
                    const weekStart = nearestMonthStartWeek(`${prevMonth}-01`)
                    ensureWeekInWindow(weekStart)
                    requestAnimationFrame(() => scrollToWeek(weekStart))
                  }}
                >
                  이전
                </Button>
                <div className="text-sm font-semibold text-slate-900">{displayMonth}</div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const nextMonth = format(addMonths(parseISO(`${displayMonth}-01`), 1), 'yyyy-MM')
                    const weekStart = nearestMonthStartWeek(`${nextMonth}-01`)
                    ensureWeekInWindow(weekStart)
                    requestAnimationFrame(() => scrollToWeek(weekStart))
                  }}
                >
                  다음
                </Button>
              </div>
              {examMetaLabel ? <div className="text-[11px] text-slate-600">{examMetaLabel}</div> : null}
            </div>
            <Button
              variant="secondary"
              onClick={() => {
                const now = format(new Date(), 'yyyy-MM')
                setDisplayMonth(now)
                const base = startOfWeek(parseISO(`${now}-01`), { weekStartsOn: 0 })
                const list: string[] = []
                for (let i = -2; i <= 14; i += 1) list.push(format(addDays(base, i * 7), 'yyyy-MM-dd'))
                setWeeks(list)
                requestAnimationFrame(() => scrollToWeek(format(base, 'yyyy-MM-dd')))
              }}
            >
              오늘
            </Button>
          </div>
        </Card>
      </div>

	      <div
	        ref={scrollRef}
	        className="mt-2 flex-1 overflow-y-auto scroll-smooth md:mt-3"
	        style={{ scrollSnapType: 'y proximity' }}
	      >
	        {/* Sticky weekday header */}
	        <div
	          ref={weekdayHeaderRef}
	          className="sticky top-0 z-20 grid grid-cols-7 border-b border-slate-100 bg-slate-50 text-xs font-medium text-slate-600"
	        >
	          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
	            <div key={d} className="px-1 py-2 md:px-2">
	              {d}
	            </div>
	          ))}
	        </div>

        {weeks.map((weekStart) => {
          const weekStartDate = parseISO(weekStart)
          const days = Array.from({ length: 7 }, (_, i) => format(addDays(weekStartDate, i), 'yyyy-MM-dd'))
          return (
            <div
              key={weekStart}
              ref={(el) => {
                weekSectionRefs.current[weekStart] = el
              }}
              className="grid grid-cols-7 scroll-mt-10"
            >
              {days.map((ymd) => {
                    const dayMonth = ymd.slice(0, 7)
                    const isCurrentMonth = dayMonth === displayMonth
                    const isToday = ymd === todayYmd()
                    const cellTasks = (tasksByDate.get(ymd) ?? [])
                      .slice()
                      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
                    const visible = cellTasks.slice(0, 4)
                    const more = cellTasks.length - visible.length

                    return (
                      <div
                        key={ymd}
                        role="button"
                        tabIndex={0}
                        onClick={() => navigate(`/day/${ymd}`)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') navigate(`/day/${ymd}`)
                        }}
                        onDragOver={(e) => {
                          e.preventDefault()
                          setDragOverDate(ymd)
                        }}
                        onDragLeave={() => {
                          setDragOverDate((cur) => (cur === ymd ? null : cur))
                        }}
                        onDrop={(e) => {
                          e.preventDefault()
                          const taskId = e.dataTransfer.getData('text/emma-task-id')
                          if (taskId) updateTask(taskId, { date: ymd })
                          setDragOverDate(null)
                        }}
                        className={`h-[132px] cursor-pointer overflow-visible border-b border-r border-slate-100 p-1.5 md:h-[148px] md:p-2 ${
                          isCurrentMonth ? 'bg-white' : 'bg-slate-50'
                        } ${isToday ? 'relative z-10 outline outline-2 outline-slate-300 outline-offset-[-2px]' : ''} ${
                          dragOverDate === ymd ? 'outline outline-2 outline-slate-400' : ''
                        }`}
                        aria-label={`${ymd} 일간 기록 보기`}
                      >
                        <div className="flex w-full items-center justify-between gap-1">
                          <div className={`text-xs font-semibold ${isCurrentMonth ? 'text-slate-900' : 'text-slate-400'}`}>
                            {Number(ymd.slice(8, 10))}
                          </div>
                        </div>

                        <div className="-mx-1.5 mt-1 flex flex-col overflow-x-visible overflow-y-hidden max-h-[96px] divide-y divide-slate-200 md:-mx-2 md:max-h-[112px]">
                          {visible.map((t) => {
                            const sub = subjects.find((s) => s.id === t.subjectId)
                            const dday = formatDday(t.dueDate)
                            const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
                            const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                            const timeLabelKo = formatRoundedDurationKoFromSeconds(secondsToShow)
                            const timeLabelShort = formatRoundedDurationShortFromSeconds(secondsToShow)
                            const bg = sub?.color ?? '#94a3b8'
                            const textColor = pickReadableTextColor(bg)
                            const mobileMetaText = dday ? dday : timeLabelShort
                            const desktopMetaText = `${timeLabelKo}${dday ? ` ${dday}` : ''}`
                            const mobileMaxUnits = 14
                            const desktopMaxUnits = 22
                            const titleMaxUnitsMobile = mobileMaxUnits - measureUnits(mobileMetaText) - 1
                            const titleMaxUnitsDesktop = desktopMaxUnits - measureUnits(desktopMetaText) - 1
                            const titleMobile = truncateToUnits(t.title, titleMaxUnitsMobile)
                            const titleDesktop = truncateToUnits(t.title, titleMaxUnitsDesktop)
                            return (
                              <Link
                                key={t.id}
                                to={`/task/${t.id}`}
                                onClick={(e) => e.stopPropagation()}
                                draggable
                                onDragStart={(e) => {
                                  e.dataTransfer.setData('text/emma-task-id', t.id)
                                  e.dataTransfer.effectAllowed = 'move'
                                }}
                                onDragEnd={() => setDragOverDate(null)}
                                className="box-border block w-full rounded-[3px] py-1 pl-1.5 pr-0 text-left text-[10px] leading-none hover:brightness-95 active:cursor-grabbing md:pl-2"
                                style={{
                                  background: bg,
                                  color: textColor,
                                }}
                              >
                                <div className="flex items-center justify-between gap-1">
                                  <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                    <span className="md:hidden">{titleMobile}</span>
                                    <span className="hidden md:inline">{titleDesktop}</span>
                                  </span>
                                  <span className="shrink-0 tabular-nums text-[9px] leading-none tracking-tighter">
                                    {!dday ? (
                                      <span
                                        className={`bg-white/60 px-1 py-[1px] text-slate-700 md:hidden ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                      >
                                        {timeLabelShort}
                                      </span>
                                    ) : null}
                                    <span
                                      className={`hidden bg-white/60 px-1 py-[1px] text-slate-700 md:inline ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                    >
                                      {timeLabelKo}
                                    </span>
                                    {dday ? (
                                      <span className="ml-1 bg-white/60 px-1 py-[1px] font-semibold text-indigo-700">
                                        {dday}
                                      </span>
                                    ) : null}
                                  </span>
                                </div>
                              </Link>
                            )
                          })}
                          {more > 0 ? <div className="text-[11px] text-slate-400">+{more}</div> : null}
                        </div>
                      </div>
                    )
                  })}
            </div>
          )
	        })}
	      </div>

	      {/* Always-on floating "Start 예정" popup above bottom bar (mobile). */}
		      <div
		        data-start-dock-root
		        className={`fixed z-40 md:hidden ${startDockOrigin} will-change-[width,height,border-radius]`}
	        style={{
	          right: '0.375rem',
	          bottom: startDock.v === 'bottom' ? 'calc(var(--bottom-nav-h, 0px) + env(safe-area-inset-bottom) + 10px)' : undefined,
	          top: startDock.v === 'top' ? `${topDockY}px` : undefined,
	          width: startOpen ? 'calc(100vw - 0.75rem)' : '64px',
	          height: startOpen ? '173px' : '64px',
	          borderRadius: startOpen ? 24 : 9999,
	          transition: startOpen
	            ? // Open: radius snaps first (already reduced), then only size expands.
	              'top 160ms ease-in-out, bottom 160ms ease-in-out, border-radius 0ms linear, width 360ms cubic-bezier(0.16, 1, 0.3, 1), height 360ms cubic-bezier(0.16, 1, 0.3, 1)'
	            : // Close: keep the nice morphing radius animation.
	              'top 160ms ease-in-out, bottom 160ms ease-in-out, border-radius 260ms cubic-bezier(0.16, 1, 0.3, 1), width 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms, height 360ms cubic-bezier(0.16, 1, 0.3, 1) 30ms',
	        }}
	      >
	        <div
	          className="relative h-full w-full overflow-hidden border border-white/8 shadow-xl ring-1 ring-black/5 backdrop-blur-sm backdrop-saturate-105"
	          style={{
	            borderRadius: 'inherit',
	            backgroundColor: startOpen ? 'rgba(255,255,255,0.06)' : 'rgba(255,255,255,0.92)',
	          }}
	        >
	          <button
	            type="button"
            onClick={() => {
              if (shouldIgnoreClickAfterDrag()) return
              setStartOpen(true)
            }}
	            className={`absolute inset-0 flex items-center justify-center transition-[opacity,transform] duration-110 ease-out ${
	              startOpen ? 'pointer-events-none scale-[0.92] opacity-0' : 'pointer-events-auto scale-100 opacity-100'
	            }`}
            onPointerDown={(e) => onStartDockPointerDown(e, true)}
            onPointerMove={onStartDockPointerMove}
            onPointerUp={onStartDockPointerUp}
            onPointerCancel={onStartDockPointerUp}
            style={{ touchAction: 'none' }}
	            aria-label="시작 예정 열기"
	          >
	            <span className="text-3xl font-semibold text-slate-700">+</span>
	          </button>

          {startPopupEverOpened ? (
            <div
	              className={`flex h-full flex-col transition-[opacity,transform] duration-110 ease-out ${
	                startOpen ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-1 opacity-0'
	              }`}
            >
              <div
                className="flex w-full items-center justify-between gap-2 px-3 py-2"
                onPointerDown={(e) => onStartDockPointerDown(e, false)}
                onPointerMove={onStartDockPointerMove}
                onPointerUp={onStartDockPointerUp}
                onPointerCancel={onStartDockPointerUp}
                style={{ touchAction: 'none' }}
              >
                <div className="flex items-center gap-2">
                  <div className="text-sm font-semibold text-slate-900">시작 예정</div>
                  {unassignedPending.length ? (
                    <div className="rounded-full bg-white/7 px-2 py-0.5 text-[11px] font-semibold text-slate-800 tabular-nums backdrop-blur">
                      {unassignedPending.length}
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => {
                      const subjectId = subjects.find((s) => s.examId === activeExamId)?.id ?? subjects[0]?.id
                      if (!subjectId) {
                        navigate('/subjects')
                        return
                      }
                      const id = addTask({ subjectId, title: '공부', plannedSeconds: 60 * 60, examId: activeExamId })
                      navigate(`/task/${id}`)
                    }}
                  >
                    + 일정 추가
                  </Button>
                  <Button variant="secondary" onClick={() => setStartOpen(false)}>
                    닫기
                  </Button>
                </div>
              </div>

              <div
                className="h-[132px] border-t border-white/8 px-3 py-2"
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragOverDate('__unassigned__')
                }}
                onDragLeave={() => {
                  setDragOverDate((cur) => (cur === '__unassigned__' ? null : cur))
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const taskId = e.dataTransfer.getData('text/emma-task-id')
                  if (taskId) updateTask(taskId, { date: '' })
                  setDragOverDate(null)
                }}
              >
                <div className={`${dragOverDate === '__unassigned__' ? 'outline outline-2 outline-slate-400' : ''}`}>
	                  <div
	                    className="h-full overflow-x-auto overflow-y-auto overscroll-contain pb-1"
	                    onWheel={onStartPendingWheel}
	                    onWheelCapture={(e) => e.stopPropagation()}
	                  >
	                    <div className="flex gap-2">
	                      {unassignedBySubject.map((g) => {
	                        const subject = subjects.find((s) => s.id === g.subjectId)
	                        const columns = []
	                        for (let i = 0; i < g.list.length; i += 4) columns.push(g.list.slice(i, i + 4))
	                        return (
	                          <div key={g.subjectId} className="flex h-full shrink-0 flex-col">
	                            <div className="mb-1 w-[calc((100vw-0.75rem)/7)] overflow-hidden whitespace-nowrap text-[11px] font-semibold text-slate-800">
	                              {subject?.name ?? '과목'}
	                            </div>
	                            <div className="flex gap-2">
	                              {columns.map((col, colIdx) => (
	                                <div key={colIdx} className="w-[calc((100vw-0.75rem)/7)] shrink-0">
	                                  <div className="flex flex-col gap-1 pb-1">
	                                    {col.map((t) => {
	                                const sub = subjects.find((s) => s.id === t.subjectId)
	                                const dday = formatDday(t.dueDate)
	                                const hasActual = typeof t.actualSeconds === 'number' && Number.isFinite(t.actualSeconds)
	                                const secondsToShow = hasActual ? (t.actualSeconds as number) : t.plannedSeconds
                                const timeLabelKo = formatRoundedDurationKoFromSeconds(secondsToShow)
                                const timeLabelShort = formatRoundedDurationShortFromSeconds(secondsToShow)
                                const bg = sub?.color ?? '#94a3b8'
                                const textColor = pickReadableTextColor(bg)
                                const mobileMetaText = dday ? dday : timeLabelShort
                                const desktopMetaText = `${timeLabelKo}${dday ? ` ${dday}` : ''}`
                                const mobileMaxUnits = 14
                                const desktopMaxUnits = 22
	                                const titleMaxUnitsMobile = mobileMaxUnits - measureUnits(mobileMetaText) - 1
	                                const titleMaxUnitsDesktop = desktopMaxUnits - measureUnits(desktopMetaText) - 1
	                                const titleMobile = truncateToUnits(t.title, titleMaxUnitsMobile)
	                                const titleDesktop = truncateToUnits(t.title, titleMaxUnitsDesktop)
	                                return (
	                                  <Link
                                    key={t.id}
                                    to={`/task/${t.id}`}
                                    draggable
                                    onDragStart={(e) => {
                                      e.dataTransfer.setData('text/emma-task-id', t.id)
                                      e.dataTransfer.effectAllowed = 'move'
                                    }}
                                    onDragEnd={() => setDragOverDate(null)}
                                    className="box-border block w-full overflow-hidden rounded-[3px] py-1 pl-1.5 pr-0 text-left text-[10px] leading-none hover:brightness-95 active:cursor-grabbing"
                                    style={{ background: bg, color: textColor }}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <span className="min-w-0 overflow-hidden whitespace-nowrap">
                                        <span className="md:hidden">{titleMobile}</span>
                                        <span className="hidden md:inline">{titleDesktop}</span>
                                      </span>
                                      <span className="shrink-0 tabular-nums text-[9px] leading-none tracking-tighter">
                                        {!dday ? (
                                          <span
                                            className={`bg-white/60 px-1 py-[1px] text-slate-700 md:hidden ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                          >
                                            {timeLabelShort}
                                          </span>
                                        ) : null}
                                        <span
                                          className={`hidden bg-white/60 px-1 py-[1px] text-slate-700 md:inline ${hasActual ? 'font-semibold text-slate-900' : ''}`}
                                        >
                                          {timeLabelKo}
                                        </span>
                                        {dday ? (
                                          <span className="ml-1 bg-white/60 px-1 py-[1px] font-semibold text-indigo-700">{dday}</span>
                                        ) : null}
                                      </span>
                                    </div>
	                                  </Link>
	                                )
	                                    })}
	                                  </div>
	                                </div>
	                              ))}
	                            </div>
	                          </div>
	                        )
	                      })}
                    </div>
                  </div>
                </div>
              </div>
	            </div>
	          ) : null}
	        </div>

	        {!startOpen && unassignedPending.length ? (
	          <span className="pointer-events-none absolute -right-2 -top-2 rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-semibold text-white tabular-nums">
	            {unassignedPending.length}
	          </span>
	        ) : null}
	      </div>
	    </div>
	  );
}
