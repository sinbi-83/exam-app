'use client'

// 시험 관리 > 시험지 보관함: 저장된 문제 시험과 단어 시험을 한곳에서 본다 (예전 /exams 목록).
// 새 시험 만들기는 시험 출제(/create) 로 옮겼다. 이름 수정·삭제는 예전과 같다.

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

interface Exam {
  id: string
  title: string
  exam_date: string | null
  total_questions: number | null
  max_score: number | null
  question_set_id: string | null
  exam_type: 'problem' | 'word' | null
  created_at: string
}

type TypeFilter = 'all' | 'problem' | 'word'
const TYPE_LABELS: Record<'problem' | 'word', string> = { problem: '문제 시험', word: '단어 시험' }

export default function TestsArchivePage() {
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all')
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadExams()
  }, [])

  async function loadExams() {
    setLoading(true)
    try {
      const res = await fetch('/api/exams', { cache: 'no-store' })
      const json = await res.json()
      if (json.error) setError(json.error)
      else setExams(json.data ?? [])
    } catch {
      setError('불러오지 못했습니다.')
    } finally {
      setLoading(false)
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

  // 검색어로 먼저 거른 목록. 탭 옆 개수와 보이는 목록이 모두 이것에서 나온다
  // (예전에는 개수만 검색어와 상관없이 전체를 세어, 검색하면 개수와 목록이 달랐다 — 2026-09-29)
  const searched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return exams.filter((e) => !q || e.title.toLowerCase().includes(q))
  }, [exams, search])

  const counts = useMemo(
    () => ({
      all: searched.length,
      problem: searched.filter((e) => e.exam_type === 'problem').length,
      word: searched.filter((e) => e.exam_type === 'word').length,
    }),
    [searched],
  )

  const shown = useMemo(
    () => searched.filter((e) => typeFilter === 'all' || e.exam_type === typeFilter),
    [searched, typeFilter],
  )

  const printUrl = (e: Exam) =>
    `/tests/${e.id}/print?exam_id=${e.id}&title=${encodeURIComponent(e.title)}&date=${encodeURIComponent(e.exam_date ?? '')}`

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">시험지 보관함</h1>
          <p className="mt-0.5 text-xs text-gray-500">저장된 문제 시험과 단어 시험을 한곳에서 봅니다.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/create/problem" className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700">+ 문제 시험 출제</Link>
          <Link href="/create/word" className="rounded border border-blue-600 px-3 py-2 text-sm font-medium text-blue-600 hover:bg-blue-50">+ 단어 시험 출제</Link>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(['all', 'problem', 'word'] as TypeFilter[]).map((t) => (
          <button key={t} onClick={() => setTypeFilter(t)} className={pill(typeFilter === t)}>
            {t === 'all' ? '전체' : TYPE_LABELS[t]} {counts[t]}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="시험 이름 검색"
          className="ml-auto w-48 rounded border border-gray-300 px-3 py-1.5 text-sm"
        />
      </div>

      {error && (
        <div className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {shown.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">{exams.length === 0 ? '저장된 시험이 없습니다.' : '조건에 맞는 시험이 없습니다.'}</p>
          <p className="mt-1 text-sm text-gray-400">시험 출제에서 문제 시험이나 단어 시험을 만들어 보세요.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {shown.map((exam) => (
            <div key={exam.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
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
                    <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-gray-800">
                      {exam.exam_type && (
                        <span className={`rounded px-1.5 py-0.5 text-xs font-normal ${exam.exam_type === 'word' ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'}`}>
                          {TYPE_LABELS[exam.exam_type]}
                        </span>
                      )}
                      {exam.title}
                    </h2>
                  )}
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                    {exam.exam_date && <span>📅 {exam.exam_date}</span>}
                    {exam.total_questions && <span>📝 {exam.total_questions}문항</span>}
                    {exam.max_score && <span>🎯 만점 {exam.max_score}점</span>}
                    <span className="text-gray-400">등록: {exam.created_at.slice(0, 10)}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Link href={`/tests/${exam.id}`} className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700">
                    열기 →
                  </Link>
                  <a href={printUrl(exam)} target="_blank" rel="noopener noreferrer" className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100">
                    🖨️ 인쇄
                  </a>
                  <button
                    onClick={() => { setEditing(exam.id); setEditTitle(exam.title) }}
                    className="rounded border border-gray-300 px-3 py-1 text-xs text-gray-600 hover:bg-gray-100"
                  >
                    이름 수정
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
