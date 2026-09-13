'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface Notification {
  id: string
  student_id: string | null
  title: string
  message: string
  notification_type: string
  created_at: string
  students?: { name: string; grade: string } | null
}

const TYPE_CONFIG = {
  general: { label: '일반', color: 'bg-gray-100 text-gray-600' },
  exam: { label: '시험안내', color: 'bg-blue-100 text-blue-700' },
  score: { label: '성적통보', color: 'bg-green-100 text-green-700' },
  payment: { label: '원비안내', color: 'bg-amber-100 text-amber-700' },
  absence: { label: '결석안내', color: 'bg-red-100 text-red-700' },
} as const

export default function NotificationsPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [sending, setSending] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [form, setForm] = useState({
    title: '',
    message: '',
    notification_type: 'general',
    student_ids: [] as string[],
  })

  useEffect(() => {
    fetch('/api/students').then((r) => r.json()).then((j) => setStudents(j.data ?? []))
    loadNotifications()
  }, [])

  async function loadNotifications() {
    const res = await fetch('/api/notifications')
    const json = await res.json()
    setNotifications(json.data ?? [])
    setLoading(false)
  }

  function toggleStudent(id: string) {
    setForm((f) => ({
      ...f,
      student_ids: f.student_ids.includes(id)
        ? f.student_ids.filter((s) => s !== id)
        : [...f.student_ids, id],
    }))
  }

  function toggleAll() {
    setForm((f) => ({
      ...f,
      student_ids: f.student_ids.length === students.length ? [] : students.map((s) => s.id),
    }))
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim() || !form.message.trim()) return
    setSending(true)
    const res = await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })
    const json = await res.json()
    if (!json.error) {
      await loadNotifications()
      setForm({ title: '', message: '', notification_type: 'general', student_ids: [] })
      setShowForm(false)
    }
    setSending(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('삭제하시겠습니까?')) return
    setDeleting(id)
    await fetch(`/api/notifications?id=${id}`, { method: 'DELETE' })
    setNotifications((prev) => prev.filter((n) => n.id !== id))
    setDeleting(null)
  }

  // 미리보기 메시지
  const preview = form.message
    .replace('{학생이름}', '[학생이름]')
    .replace('{점수}', '[점수]')
    .replace('{시험명}', '[시험명]')

  return (
    <div>
      <h1 className="mb-2 text-xl font-semibold text-gray-800">학부모 알림</h1>
      <p className="mb-6 text-sm text-gray-400">알림 내역을 관리하고 메모합니다. 실제 발송은 카카오/문자를 이용해주세요.</p>

      <div className="mb-4 flex items-center justify-between">
        <div className="flex gap-2 text-xs text-gray-400">
          <span>총 {notifications.length}건</span>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 알림 작성
        </button>
      </div>

      {/* 작성 폼 */}
      {showForm && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-blue-800">알림 작성</h2>
          <form onSubmit={handleSend} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs text-gray-600">제목 *</label>
                <input type="text" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                  placeholder="예) 6월 원비 안내" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-600">유형</label>
                <select value={form.notification_type} onChange={(e) => setForm((f) => ({ ...f, notification_type: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-600">내용 *</label>
              <p className="mb-1 text-xs text-gray-400">변수: {'{학생이름}'}, {'{점수}'}, {'{시험명}'}</p>
              <textarea
                value={form.message}
                onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))}
                rows={4}
                placeholder="안녕하세요. 보스턴S영어학원입니다.&#10;{학생이름} 학생의 6월 원비 납부 안내드립니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {preview !== form.message && (
              <div className="rounded bg-white border border-gray-200 p-3 text-sm text-gray-700">
                <p className="mb-1 text-xs text-gray-400">미리보기</p>
                <p className="whitespace-pre-wrap">{preview}</p>
              </div>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-xs text-gray-600">대상 학생</label>
                <button type="button" onClick={toggleAll} className="text-xs text-blue-600 hover:underline">
                  {form.student_ids.length === students.length ? '전체 해제' : '전체 선택'}
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {students.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleStudent(s.id)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                      form.student_ids.includes(s.id)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
                {students.length === 0 && <span className="text-xs text-gray-400">등록된 학생이 없습니다.</span>}
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button type="submit" disabled={sending} className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
                {sending ? '저장 중…' : '✓ 알림 기록 저장'}
              </button>
              <button type="button" onClick={() => setShowForm(false)} className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600">취소</button>
            </div>
          </form>
        </div>
      )}

      {/* 알림 목록 */}
      {loading ? (
        <div className="py-12 text-center text-sm text-gray-400">불러오는 중…</div>
      ) : notifications.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">알림 내역이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">알림 작성 버튼으로 기록을 남겨보세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((n) => {
            const tc = TYPE_CONFIG[n.notification_type as keyof typeof TYPE_CONFIG] ?? TYPE_CONFIG.general
            return (
              <div key={n.id} className="rounded-lg border border-gray-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`rounded px-2 py-0.5 text-xs font-medium ${tc.color}`}>{tc.label}</span>
                      <span className="text-sm font-medium text-gray-800">{n.title}</span>
                      {n.students && (
                        <span className="text-xs text-gray-400">→ {n.students.name}</span>
                      )}
                      {!n.student_id && (
                        <span className="text-xs text-gray-400">→ 전체</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-600 line-clamp-2">{n.message}</p>
                    <p className="mt-1 text-xs text-gray-400">{n.created_at.slice(0, 16).replace('T', ' ')}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(n.id)}
                    disabled={deleting === n.id}
                    className="shrink-0 text-xs text-gray-400 hover:text-red-500 disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
