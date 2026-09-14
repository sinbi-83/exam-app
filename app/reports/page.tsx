'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Report {
  id: string
  student_name: string
  student_grade: string | null
  exam_title: string | null
  exam_date: string | null
  score: number
  max_score: number
  strengths: string | null
  comment: string | null
  next_steps: string | null
  type_scores: Record<string, number>
  created_at: string
  // for reprint
  student_id: string | null
  exam_id: string | null
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/reports')
      .then((r) => r.json())
      .then((json) => setReports(json.data ?? []))
      .finally(() => setLoading(false))
  }, [])

  async function handleDelete(id: string) {
    if (!confirm('이 보고서를 삭제하시겠습니까?')) return
    setDeleting(id)
    await fetch(`/api/reports?id=${id}`, { method: 'DELETE' })
    setReports((prev) => prev.filter((r) => r.id !== id))
    setDeleting(null)
  }

  function openPrint(r: Report) {
    const params = new URLSearchParams({
      studentName:  r.student_name,
      studentGrade: r.student_grade ?? '',
      examTitle:    r.exam_title ?? '(시험명 미지정)',
      examDate:     r.exam_date ?? '',
      score:        String(r.score),
      maxScore:     String(r.max_score),
      comment:      r.comment ?? '',
      nextSteps:    r.next_steps ?? '',
      strengths:    r.strengths ?? '',
      typeScores:   JSON.stringify(r.type_scores ?? {}),
    })
    window.open(`/report/print?${params.toString()}`, '_blank')
  }

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>
  }

  const pctColor = (pct: number) =>
    pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'

  const grade = (pct: number) =>
    pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D'

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl font-semibold text-gray-800">저장된 보고서</h1>
        <Link
          href="/report"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + 새 보고서 작성
        </Link>
      </div>

      {reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          저장된 보고서가 없습니다.<br />
          보고서를 작성하고 미리보기를 누르면 자동 저장됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          {reports.map((r) => {
            const pct = r.max_score > 0 ? Math.round((r.score / r.max_score) * 100) : 0
            return (
              <div
                key={r.id}
                className="flex items-center gap-4 rounded-lg border border-gray-200 bg-white px-5 py-4"
              >
                {/* 성적 뱃지 */}
                <div className="flex w-14 flex-col items-center">
                  <span className={`text-2xl font-black ${pctColor(pct)}`}>{grade(pct)}</span>
                  <span className="text-xs text-gray-400">{pct}%</span>
                </div>

                {/* 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-gray-800">{r.student_name}</span>
                    {r.student_grade && (
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">{r.student_grade}</span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-sm text-gray-500">
                    {r.exam_title ?? '(시험명 미지정)'}
                    {r.exam_date && <span className="ml-2 text-gray-400">{r.exam_date}</span>}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {r.score}/{r.max_score}점 &nbsp;·&nbsp;
                    저장일: {new Date(r.created_at).toLocaleDateString('ko-KR')}
                  </p>
                </div>

                {/* 버튼 */}
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => openPrint(r)}
                    className="rounded border border-blue-300 px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50"
                  >
                    🖨️ 보기/인쇄
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={deleting === r.id}
                    className="rounded border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-50 disabled:opacity-50"
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
