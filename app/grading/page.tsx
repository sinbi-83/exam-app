'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface ExamResult {
  id: string
  student_id: string
  exam_title: string
  score: number
  max_score: number
  exam_date: string
  students: { name: string } | null
}

export default function GradingPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [results, setResults] = useState<ExamResult[]>([])
  const [loading, setLoading] = useState(true)

  const [studentId, setStudentId] = useState('')
  const [examTitle, setExamTitle] = useState('')
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  async function fetchAll() {
    setLoading(true)
    try {
      const [studentsRes, resultsRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/exam-results'),
      ])
      const studentsData = await studentsRes.json()
      const resultsData = await resultsRes.json()

      if (studentsRes.ok) {
        setStudents(studentsData.data || [])
        if (studentsData.data?.length > 0 && !studentId) {
          setStudentId(studentsData.data[0].id)
        }
      }
      if (resultsRes.ok) {
        setResults(resultsData.data || [])
      }
    } catch {
      // 조용히 실패
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!studentId || !examTitle.trim() || score === '') {
      alert('학생, 시험명, 점수는 필수입니다.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/exam-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          exam_title: examTitle,
          score: Number(score),
          max_score: Number(maxScore),
          exam_date: examDate,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert(result.error || '등록에 실패했습니다.')
        return
      }
      setExamTitle('')
      setScore('')
      fetchAll()
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 성적 기록을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/exam-results/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchAll()
      }
    } catch {
      alert('삭제 중 문제가 발생했어요.')
    }
  }

  if (students.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">채점관리</h1>
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          먼저 &apos;학생관리&apos;에서 학생을 등록해주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">채점관리</h1>

      <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">학생</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.grade})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">시험명</label>
          <input
            type="text"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="예: 8월 모의고사"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>

        <div className="flex gap-3">
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">점수</label>
            <input
              type="number"
              value={score}
              onChange={(e) => setScore(e.target.value)}
              placeholder="80"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">만점</label>
            <input
              type="number"
              value={maxScore}
              onChange={(e) => setMaxScore(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-600 mb-1">시험 날짜</label>
            <input
              type="date"
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '등록 중...' : '성적 등록'}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-semibold text-gray-800">최근 등록 내역</h2>
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          등록된 성적이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {r.students?.name || '알 수 없음'} · {r.exam_title}
                </p>
                <p className="text-xs text-gray-500">
                  {r.score}/{r.max_score}점 · {r.exam_date}
                </p>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}