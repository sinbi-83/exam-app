'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface ScheduleEvent {
  id: string
  title: string
  event_date: string
  start_time: string | null
  event_type: string
}

const TYPE_LABEL: Record<string, string> = {
  class: '수업',
  exam: '시험',
  holiday: '휴일',
  other: '기타',
}

const POLL_MS = 5 * 60 * 1000

export default function ScheduleAlertBell() {
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [today, setToday] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  async function loadUpcoming() {
    try {
      const res = await fetch('/api/schedule/upcoming?days=2')
      if (!res.ok) return
      const json = await res.json()
      setEvents(json.data ?? [])
      setToday(json.today ?? null)
    } catch {
      // 네트워크 오류 시 조용히 무시
    }
  }

  useEffect(() => {
    loadUpcoming()
    const interval = setInterval(loadUpcoming, POLL_MS)
    const onUpdate = () => loadUpcoming()
    window.addEventListener('schedule-updated', onUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('schedule-updated', onUpdate)
    }
  }, [])

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    if (open) document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [open])

  const todayCount = events.filter((e) => e.event_date === today).length

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-sm hover:bg-gray-100"
        aria-label="일정 알림"
      >
        🔔
        {todayCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {todayCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 shadow-lg">
          <p className="mb-2 text-xs font-semibold text-gray-500">다가오는 일정</p>
          {events.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">예정된 일정이 없습니다.</p>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto">
              {events.map((ev) => (
                <div key={ev.id} className="rounded-md px-2 py-1.5 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-blue-600">
                      {ev.event_date === today ? '오늘' : '내일'}
                    </span>
                    {ev.start_time && <span className="text-[11px] text-gray-400">{ev.start_time}</span>}
                    <span className="text-[11px] text-gray-400">{TYPE_LABEL[ev.event_type] ?? '기타'}</span>
                  </div>
                  <p className="text-sm text-gray-800">{ev.title}</p>
                </div>
              ))}
            </div>
          )}
          <Link
            href="/schedule"
            onClick={() => setOpen(false)}
            className="mt-2 block rounded-md py-1.5 text-center text-xs font-medium text-blue-600 hover:bg-blue-50"
          >
            전체 일정 보기
          </Link>
        </div>
      )}
    </div>
  )
}
