'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Exam {
  id: string
  title: string
  exam_date: string | null
  total_questions: number | null
  max_score: number | null
  question_set_id: string | null
  created_at: string
}

export default function ExamsPage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [form, setForm] = useState({
    title: '',
    exam_date: '',
    total_questions: '',
    max_score: '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadExams()
  }, [])

  async function loadExams() {
    setLoading(true)
    try {
      const res = await fetch('/api/exams')
      const json = await res.json()
      if (json.error) setError(json.error)
      else setExams(json.data ?? [])
    } catch {
      setError('불러오지 못했습니다.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          exam_date: form.exam_date || null,
          total_questions: form.total_questions ? Number(form.total_questions) : null,
          max_score: form.max_score ? Number(form.max_score) : null,
        }),
      })
      const json = await res.json()
      if (json.error) {
        alert('저장 실패: ' + json.error)
      } else {
        setExams((prev) => [json.data, ...prev])
        setForm({ title: '', exam_date: '', total_questions: '', max_score: '' })
        setShowForm(false)
      }
    } catch {
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 시험을 삭제하시겠습니까?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/exams/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) alert('삭제 실패: ' + json.error)
      else setExams((prev) => prev.filter((e) => e.id !== id))
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(null)
    }
  }

  async function handleRename(id: string) {
    if (!editTitle.trim()) return
    try {
      const res = await fetch(`/api/exams/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editTitle }),
      })
      const json = await res.json()
      if (json.error) alert('수정 실패: ' + json.error)
      else {
        setExams((prev) => prev.map((e) => (e.id === id ? { ...e, title: editTitle } : e)))
        setEditing(null)
      }
    } catch {
      alert('수정 중 오류가 발생했습니다.')
    }
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">시험출제</h1>
        <button
          onClick={() => setShowForm(true)}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 새 시험 만들기
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {showForm && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-blue-800">새 시험 등록</h2>
          <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="mb-1 block text-xs text-gray-600">시험명 *</label>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="예) 2024년 1학기 중간고사"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">시험일</label>
              <input
                type="date"
                value={form.exam_date}
                onChange={(e) => setForm((f) => ({ ...f, exam_date: e.target.value }))}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">만점</label>
              <input
                type="number"
                value={form.max_score}
                onChange={(e) => setForm((f) => ({ ...f, max_score: e.target.value }))}
                placeholder="100"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="col-span-2 flex gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? '저장 중…' : '저장'}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-100"
              >
                취소
              </button>
            </div>
          </form>
        </div>
      )}

      {exams.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">등록된 시험이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">새 시험 만들기로 시험을 등록해보세요.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {exams.map((exam) => (
            <div key={exam.id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {editing === exam.id ? (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && handleRename(exam.id)}
                      />
                      <button onClick={() => handleRename(exam.id)} className="rounded bg-blue-600 px-3 py-1 text-xs text-white">저장</button>
                      <button onClick={() => setEditing(null)} className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600">취소</button>
                    </div>
                  ) : (
                    <h2 className="text-base font-semibold text-gray-800">{exam.title}</h2>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {exam.exam_date && <span>📅 {exam.exam_date}</span>}
                    {exam.total_questions && <span>📝 {exam.total_questions}문항</span>}
                    {exam.max_score && <span>🎯 만점 {exam.max_score}점</span>}
                    <span className="text-gray-400">등록: {exam.created_at.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="ml-4 flex gap-2">
                  <Link
                    href={`/exams/${exam.id}`}
                    className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700"
                  >
                    문항 구성 →
                  </Link>
                  <button
                    onClick={() => { setEditing(exam.id); setEditTitle(exam.title) }}
                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    수정
                  </button>
                  <button
                    onClick={() => handleDelete(exam.id)}
                    disabled={deleting === exam.id}
                    className="rounded border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    {deleting === exam.id ? '삭제 중…' : '삭제'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
