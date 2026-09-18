'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface Homework {
  id: string
  student_id: string
  title: string
  due_date: string | null
  status: 'assigned' | 'done'
  note: string | null
  students?: { name: string; grade: string }
}

type FilterKey = 'all' | 'assigned' | 'done'

const FILTER_LABELS: Record<FilterKey, string> = {
  all: '전체',
  assigned: '배정중',
  done: '완료',
}

function isOverdue(h: Homework): boolean {
  if (h.status !== 'assigned' || !h.due_date) return false
  const today = new Date().toISOString().slice(0, 10)
  return h.due_date < today
}

export default function HomeworkPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [homework, setHomework] = useState<Homework[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterKey>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  // 배정 폼
  const [formStudentId, setFormStudentId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    loadStudents()
    loadHomework()
  }, [])

  async function loadStudents() {
    const res = await fetch('/api/students')
    const json = await res.json()
    setStudents(json.data ?? [])
  }

  async function loadHomework() {
    const res = await fetch('/api/homework')
    const json = await res.json()
    setHomework(json.data ?? [])
    setLoading(false)
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!formStudentId || !formTitle.trim()) {
      alert('학생과 숙제 내용을 입력해주세요.')
      return
    }
    setSubmitting(true)
    const res = await fetch('/api/homework', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student_id: formStudentId,
        title: formTitle.trim(),
        due_date: formDueDate || null,
      }),
    })
    const json = await res.json()
    if (!json.error && json.data) {
      setHomework((prev) => [json.data, ...prev])
      setFormTitle('')
      setFormDueDate('')
    } else {
      alert('숙제 배정에 실패했습니다: ' + (json.error ?? '다시 시도해주세요.'))
    }
    setSubmitting(false)
  }

  async function toggleStatus(hw: Homework) {
    const nextStatus = hw.status === 'assigned' ? 'done' : 'assigned'
    setSavingId(hw.id)
    const res = await fetch(`/api/homework/${hw.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    })
    const json = await res.json()
    if (!json.error) {
      setHomework((prev) => prev.map((h) => (h.id === hw.id ? { ...h, status: nextStatus } : h)))
    }
    setSavingId(null)
  }

  async function handleDelete(id: string) {
    if (!confirm('이 숙제를 삭제할까요?')) return
    const res = await fetch(`/api/homework/${id}`, { method: 'DELETE' })
    const json = await res.json()
    if (json.ok) {
      setHomework((prev) => prev.filter((h) => h.id !== id))
    }
  }

  const filtered = homework.filter((h) => filter === 'all' || h.status === filter)
  const assignedCount = homework.filter((h) => h.status === 'assigned').length
  const doneCount = homework.filter((h) => h.status === 'done').length

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>

  return (
    <div>
      <h1 className="mb-6 text-xl font-semibold text-gray-800">숙제관리</h1>

      {/* 숙제 배정 폼 */}
      <form onSubmit={handleAssign} className="mb-6 flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">학생</label>
          <select
            value={formStudentId}
            onChange={(e) => setFormStudentId(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">선택</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.name} {s.grade ? `(${s.grade})` : ''}</option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="mb-1 block text-xs font-medium text-gray-500">숙제 내용</label>
          <input
            type="text"
            value={formTitle}
            onChange={(e) => setFormTitle(e.target.value)}
            placeholder="예: 워크북 12~15p 풀기"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">마감일</label>
          <input
            type="date"
            value={formDueDate}
            onChange={(e) => setFormDueDate(e.target.value)}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? '배정 중…' : '+ 숙제 배정'}
        </button>
      </form>

      {/* 요약 + 필터 */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {(Object.keys(FILTER_LABELS) as FilterKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              filter === k
                ? 'border-blue-300 bg-blue-100 text-blue-700'
                : 'border-gray-200 text-gray-400 hover:border-gray-300'
            }`}
          >
            {FILTER_LABELS[k]} {k === 'all' ? homework.length : k === 'assigned' ? assignedCount : doneCount}
          </button>
        ))}
      </div>

      {students.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          등록된 학생이 없습니다. 학생관리에서 먼저 학생을 추가해주세요.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500">
          배정된 숙제가 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">학생</th>
                <th className="px-4 py-3">숙제 내용</th>
                <th className="px-4 py-3">마감일</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((h) => {
                const overdue = isOverdue(h)
                return (
                <tr key={h.id} className={`border-b border-gray-100 last:border-0 hover:bg-gray-50 ${overdue ? 'bg-red-50/40' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {h.students?.name ?? '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{h.title}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5">
                      <span className={`text-xs ${overdue ? 'font-medium text-red-600' : 'text-gray-400'}`}>
                        {h.due_date ?? '-'}
                      </span>
                      {overdue && (
                        <span className="rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-semibold text-white">
                          마감 지남
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toggleStatus(h)}
                      disabled={savingId === h.id}
                      className={`rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all disabled:opacity-50 ${
                        h.status === 'done'
                          ? 'border-green-300 bg-green-100 text-green-700'
                          : 'border-amber-300 bg-amber-100 text-amber-700'
                      }`}
                    >
                      {h.status === 'done' ? '완료' : '배정중'}
                    </button>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      삭제
                    </button>
                  </td>
                </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
