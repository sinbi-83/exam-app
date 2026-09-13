'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface QuestionSet {
  id: string
  grade: string
  topic: string
  created_at: string
  questions: unknown[] | null
  essay_questions: unknown[] | null
  summary_questions: unknown[] | null
  reading_questions: unknown[] | null
}

function countAll(set: QuestionSet): number {
  return (
    (set.questions?.length ?? 0) +
    (set.essay_questions?.length ?? 0) +
    (set.summary_questions?.length ?? 0) +
    (set.reading_questions?.length ?? 0)
  )
}

export default function PassagesPage() {
  const [sets, setSets] = useState<QuestionSet[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/question-sets')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) {
          setError(json.error)
        } else {
          setSets(json.data ?? [])
        }
      })
      .catch(() => setError('데이터를 불러오지 못했습니다.'))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('이 지문 세트를 삭제하시겠습니까?')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/question-sets/${id}`, { method: 'DELETE' })
      const json = await res.json()
      if (json.error) {
        alert('삭제 실패: ' + json.error)
      } else {
        setSets((prev) => prev.filter((s) => s.id !== id))
      }
    } catch {
      alert('삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        불러오는 중…
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-600">
        {error}
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">지문관리</h1>
        <Link
          href="/ai-passage"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 새 지문 생성
        </Link>
      </div>

      {sets.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500">아직 생성된 지문이 없습니다.</p>
          <p className="mt-1 text-sm text-gray-400">
            AI 지문 생성에서 새 지문을 만들어보세요.
          </p>
          <Link
            href="/ai-passage"
            className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            AI 지문 생성 바로가기
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                <th className="px-4 py-3">학년</th>
                <th className="px-4 py-3">주제</th>
                <th className="px-4 py-3 text-center">문항 수</th>
                <th className="px-4 py-3">생성일</th>
                <th className="px-4 py-3 text-center">관리</th>
              </tr>
            </thead>
            <tbody>
              {sets.map((set) => (
                <tr
                  key={set.id}
                  className="border-b border-gray-100 last:border-0 hover:bg-gray-50"
                >
                  <td className="px-4 py-3 text-gray-600">{set.grade || '-'}</td>
                  <td className="px-4 py-3 font-medium text-gray-800">
                    {set.topic || '(제목 없음)'}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">
                    {countAll(set)}문항
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {set.created_at.slice(0, 10)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <Link
                        href={`/questions/${set.id}`}
                        className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                      >
                        문항 보기
                      </Link>
                      <button
                        onClick={() => handleDelete(set.id)}
                        disabled={deleting === set.id}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                      >
                        {deleting === set.id ? '삭제 중…' : '삭제'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
