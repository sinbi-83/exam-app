'use client'

import { useEffect, useState } from 'react'

interface Exam {
  id: string
  title: string
  exam_date: string | null
  total_questions: number | null
  max_score: number | null
}

interface ExamResult {
  id: string
  student_id: string
  exam_title: string
  score: number
  max_score: number
  exam_date: string
  exam_id: string | null
  students: { name: string } | null
}

interface ExamWithStats extends Exam {
  results: ExamResult[]
  average: number | null
  highest: ExamResult | null
  lowest: ExamResult | null
}

export default function AnalyticsPage() {
  const [examsWithStats, setExamsWithStats] = useState<ExamWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function fetchData() {
      try {
        const [examsRes, resultsRes] = await Promise.all([
          fetch('/api/exams'),
          fetch('/api/exam-results'),
        ])
        const examsData = await examsRes.json()
        const resultsData = await resultsRes.json()

        if (!examsRes.ok) {
          setError(examsData.error || '시험 목록을 불러오지 못했습니다.')
          return
        }
        if (!resultsRes.ok) {
          setError(resultsData.error || '성적 목록을 불러오지 못했습니다.')
          return
        }

        const exams: Exam[] = examsData.data || []
        const results: ExamResult[] = resultsData.data || []

        // 시험 카드마다, 그 시험(exam_id)에 연결된 점수만 모아서 통계 계산
        const combined: ExamWithStats[] = exams.map((exam) => {
          const linkedResults = results.filter((r) => r.exam_id === exam.id)

          let average: number | null = null
          let highest: ExamResult | null = null
          let lowest: ExamResult | null = null

          if (linkedResults.length > 0) {
            const percentages = linkedResults.map((r) => (r.score / r.max_score) * 100)
            average = percentages.reduce((sum, p) => sum + p, 0) / percentages.length

            highest = linkedResults.reduce((best, r) =>
              r.score / r.max_score > best.score / best.max_score ? r : best
            )
            lowest = linkedResults.reduce((worst, r) =>
              r.score / r.max_score < worst.score / worst.max_score ? r : worst
            )
          }

          return { ...exam, results: linkedResults, average, highest, lowest }
        })

        // 응시 기록이 있는 시험을 먼저, 그 안에서는 최신순으로 정렬
        combined.sort((a, b) => {
          if (a.results.length === 0 && b.results.length > 0) return 1
          if (a.results.length > 0 && b.results.length === 0) return -1
          const dateA = a.exam_date ? new Date(a.exam_date).getTime() : 0
          const dateB = b.exam_date ? new Date(b.exam_date).getTime() : 0
          return dateB - dateA
        })

        setExamsWithStats(combined)
      } catch {
        setError('서버와 통신 중 문제가 발생했어요.')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [])

  if (loading) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  if (error) {
    return <p className="p-8 text-sm text-red-500">{error}</p>
  }

  if (examsWithStats.length === 0) {
    return (
      <div className="mx-auto max-w-2xl rounded-lg border border-gray-200 bg-white p-8 text-center">
        <p className="text-lg font-medium text-gray-700">성적분석</p>
        <p className="mt-2 text-sm text-gray-400">
          아직 만들어진 시험 카드가 없습니다. 채점관리에서 시험 카드를 먼저 만들어보세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">성적분석</h1>

      <div className="space-y-4">
        {examsWithStats.map((exam) => (
          <div key={exam.id} className="rounded-lg border border-gray-200 bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="font-medium text-gray-800">{exam.title}</p>
                <p className="text-xs text-gray-400">
                  {exam.exam_date || '날짜 없음'} · 만점 {exam.max_score ?? '?'}점
                </p>
              </div>
              <span className="rounded bg-gray-100 px-2 py-1 text-xs text-gray-500">
                응시 {exam.results.length}명
              </span>
            </div>

            {exam.results.length === 0 ? (
              <p className="text-sm text-gray-400">아직 이 시험에 연결된 성적이 없습니다.</p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-3 gap-2 rounded bg-gray-50 p-3 text-center">
                  <div>
                    <p className="text-xs text-gray-400">평균</p>
                    <p className="text-lg font-semibold text-gray-800">
                      {exam.average?.toFixed(1)}점
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">최고점</p>
                    <p className="text-lg font-semibold text-green-600">
                      {exam.highest?.students?.name} ({exam.highest?.score}점)
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">최저점</p>
                    <p className="text-lg font-semibold text-orange-500">
                      {exam.lowest?.students?.name} ({exam.lowest?.score}점)
                    </p>
                  </div>
                </div>

                <div className="space-y-1">
                  {[...exam.results]
                    .sort((a, b) => b.score / b.max_score - a.score / a.max_score)
                    .map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center justify-between rounded border border-gray-100 px-3 py-1.5 text-sm"
                      >
                        <span className="text-gray-700">{r.students?.name || '알 수 없음'}</span>
                        <span className="text-gray-500">
                          {r.score}/{r.max_score}점
                        </span>
                      </div>
                    ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}