'use client'

import { useEffect, useState } from 'react'

interface ScheduleEvent {
  id: string
  title: string
  event_date: string
  start_time: string | null
  end_time: string | null
  event_type: string
  note: string | null
}

const TYPE_CONFIG = {
  class: { label: '수업', color: 'bg-blue-100 text-blue-700 border-blue-200' },
  exam: { label: '시험', color: 'bg-red-100 text-red-700 border-red-200' },
  holiday: { label: '휴일', color: 'bg-gray-100 text-gray-600 border-gray-200' },
  other: { label: '기타', color: 'bg-purple-100 text-purple-700 border-purple-200' },
} as const

type EventType = keyof typeof TYPE_CONFIG

function getMonthStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default function SchedulePage() {
  const now = new Date()
  const [month, setMonth] = useState(getMonthStr(now))
  const [events, setEvents] = useState<ScheduleEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    title: '',
    event_date: new Date().toISOString().slice(0, 10),
    start_time: '',
    end_time: '',
    event_type: 'class',
    note: '',
  })

  useEffect(() => { loadEvents() }, [month])

  async function loadEvents() {
    setLoading(true)
    const res = await fetch(`/api/schedule?month=${month}`)
    const json = await res.json()
    setEvents(json.data ?? [])
    setLoading(false)
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.event_date) return
    setSaving(true)
    const res = await fetch('/api/schedule', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!json.error) {
      setEvents((prev) => [...prev, json.data].sort((a, b) => a.event_date.localeCompare(b.event_date)))
      setForm({ title: '', event_date: new Date().toISOString().slice(0, 10), start_time: '', end_time: '', event_type: 'class', note: '' })
      setShowForm(false)
      window.dispatchEvent(new Event('schedule-updated'))
    }
    setSaving(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await fetch(`/api/schedule?id=${id}`, { method: 'DELETE' })
    setEvents((prev) => prev.filter((e) => e.id !== id))
    setDeleting(null)
    window.dispatchEvent(new Event('schedule-updated'))
  }

  function changeMonth(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(getMonthStr(d))
  }

  // 날짜별 그룹화
  const grouped: Record<string, ScheduleEvent[]> = {}
  events.forEach((e) => {
    if (!grouped[e.event_date]) grouped[e.event_date] = []
    grouped[e.event_date].push(e)
  })

  const [year, mon] = month.split('-')

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">수업 일정</h1>

      {/* 월 네비게이션 */}
      <div className="mb-6 flex items-center gap-4">
        <button onClick={() => changeMonth(-1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">‹</button>
        <span className="text-base font-semibold text-gray-700">{year}년 {mon}월</span>
        <button onClick={() => changeMonth(1)} className="rounded border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50">›</button>
        <div className="flex-1" />
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 일정 추가
        </button>
      </div>

      {/* 추가 폼 */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-blue-800">새 일정</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-600">제목 *</label>
              <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="예) 중1 수업" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">날짜 *</label>
              <input type="date" value={form.event_date} onChange={(e) => setForm((f) => ({ ...f, event_date: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">종류</label>
              <select value={form.event_type} onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">시작 시간</label>
              <input type="time" value={form.start_time} onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">종료 시간</label>
              <input type="time" value={form.end_time} onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-600">메모</label>
              <input type="text" value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
                placeholder="예) 교재 p.30~40" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="col-span-2 flex gap-2">
              <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {saving ? '저장 중…' : '저장'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600">취소</button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : Object.keys(grouped).length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">이번 달 일정이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">일정 추가 버튼으로 수업/시험 일정을 등록하세요.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(grouped).map(([date, evs]) => {
            const d = new Date(date + 'T00:00:00')
            const weekday = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()]
            const isSun = d.getDay() === 0
            const isSat = d.getDay() === 6
            return (
              <div key={date} className="flex gap-4">
                <div className={`w-16 shrink-0 text-center pt-1 ${isSun ? 'text-red-500' : isSat ? 'text-blue-500' : 'text-gray-600'}`}>
                  <div className="text-lg font-bold">{d.getDate()}</div>
                  <div className="text-xs">{weekday}요일</div>
                </div>
                <div className="flex-1 space-y-2">
                  {evs.map((ev) => {
                    const tc = TYPE_CONFIG[ev.event_type as EventType] ?? TYPE_CONFIG.other
                    return (
                      <div key={ev.id} className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3">
                        <span className={`shrink-0 rounded border px-2 py-0.5 text-xs ${tc.color}`}>{tc.label}</span>
                        <div className="flex-1">
                          <span className="text-sm font-medium text-gray-800">{ev.title}</span>
                          {(ev.start_time || ev.end_time) && (
                            <span className="ml-2 text-xs text-gray-400">
                              {ev.start_time}{ev.end_time ? ` ~ ${ev.end_time}` : ''}
                            </span>
                          )}
                          {ev.note && <span className="ml-2 text-xs text-gray-400">({ev.note})</span>}
                        </div>
                        <button
                          onClick={() => handleDelete(ev.id)}
                          disabled={deleting === ev.id}
                          className="text-xs text-gray-400 hover:text-red-500"
                        >
                          삭제
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
