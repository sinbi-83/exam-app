'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  REPORT_SENT_VIA_LABELS,
  REPORT_STATUS_LABELS,
  isReportStatus,
  type ReportSentVia,
  type ReportStatus,
} from '@/lib/reportStatus'

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
  teacher: string | null
  vocab_analysis: string | null
  grammar_analysis: string | null
  reading_analysis: string | null
  // 확인·발송 상태 — report-status-level-test-review-migration.sql 실행 전에는 없음
  status?: ReportStatus
  sent_at?: string | null
  sent_via?: ReportSentVia | null
}

// 대시보드에서 ?view=draft|checked 로 넘어온다
type ReportView = 'all' | ReportStatus

const STATUS_BADGE: Record<ReportStatus, string> = {
  draft: 'border-amber-200 bg-amber-50 text-amber-700',
  checked: 'border-blue-200 bg-blue-50 text-blue-700',
  sent: 'border-gray-200 bg-gray-50 text-gray-500',
}

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [view, setView] = useState<ReportView>('all')
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    const v = new URLSearchParams(window.location.search).get('view')
    if (isReportStatus(v)) setView(v)
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

  function changeView(next: ReportView) {
    setView(next)
    const url = new URL(window.location.href)
    if (next === 'all') url.searchParams.delete('view')
    else url.searchParams.set('view', next)
    window.history.replaceState(null, '', url)
  }

  async function changeStatus(r: Report, status: ReportStatus, sentVia?: ReportSentVia) {
    setSavingId(r.id)
    const res = await fetch(`/api/reports?id=${r.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status, sent_via: sentVia ?? null }),
    })
    const json = await res.json()
    if (json.error) alert(json.error)
    else setReports((prev) => prev.map((x) => (x.id === r.id ? { ...x, ...json.data } : x)))
    setSavingId(null)
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
      teacher:      r.teacher ?? '',
      vocabAnalysis:   r.vocab_analysis ?? '',
      grammarAnalysis: r.grammar_analysis ?? '',
      readingAnalysis: r.reading_analysis ?? '',
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

  // 상태 칸이 아직 없으면(SQL 실행 전) 상태 버튼·필터를 숨긴다
  const hasStatus = reports.some((r) => isReportStatus(r.status))
  const shown = hasStatus && view !== 'all' ? reports.filter((r) => r.status === view) : reports
  const countOf = (v: ReportStatus) => reports.filter((r) => r.status === v).length

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

      {hasStatus && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {(['all', 'draft', 'checked', 'sent'] as ReportView[]).map((v) => (
            <button
              key={v}
              onClick={() => changeView(v)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                view === v ? 'border-blue-300 bg-blue-100 text-blue-700' : 'border-gray-200 text-gray-400 hover:border-gray-300'
              }`}
            >
              {v === 'all' ? `전체 ${reports.length}` : `${REPORT_STATUS_LABELS[v]} ${countOf(v)}`}
            </button>
          ))}
        </div>
      )}

      {reports.length > 0 && shown.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          &apos;{view !== 'all' && REPORT_STATUS_LABELS[view]}&apos; 보고서가 없습니다.
        </div>
      ) : reports.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 py-16 text-center text-sm text-gray-400">
          저장된 보고서가 없습니다.<br />
          보고서를 작성하고 미리보기를 누르면 자동 저장됩니다.
        </div>
      ) : (
        <div className="space-y-3">
          {shown.map((r) => {
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
                  {r.status && (
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                      <span className={`rounded-full border px-2 py-0.5 font-medium ${STATUS_BADGE[r.status]}`}>
                        {REPORT_STATUS_LABELS[r.status]}
                        {r.status === 'sent' && r.sent_via && ` · ${REPORT_SENT_VIA_LABELS[r.sent_via]}`}
                        {r.status === 'sent' && r.sent_at && ` · ${new Date(r.sent_at).toLocaleDateString('ko-KR')}`}
                      </span>
                      {r.status === 'draft' && (
                        <button
                          onClick={() => changeStatus(r, 'checked')}
                          disabled={savingId === r.id}
                          className="rounded border border-gray-300 px-2 py-0.5 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          확인 완료
                        </button>
                      )}
                      {r.status !== 'sent' && (
                        <select
                          value=""
                          disabled={savingId === r.id}
                          onChange={(e) => e.target.value && changeStatus(r, 'sent', e.target.value as ReportSentVia)}
                          className="rounded border border-gray-300 px-1.5 py-0.5 text-gray-600 disabled:opacity-50"
                        >
                          <option value="">보냄 표시…</option>
                          {(Object.keys(REPORT_SENT_VIA_LABELS) as ReportSentVia[]).map((v) => (
                            <option key={v} value={v}>{REPORT_SENT_VIA_LABELS[v]}</option>
                          ))}
                        </select>
                      )}
                      {r.status !== 'draft' && (
                        <button
                          onClick={() => changeStatus(r, r.status === 'sent' ? 'checked' : 'draft')}
                          disabled={savingId === r.id}
                          className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
                        >
                          되돌리기
                        </button>
                      )}
                    </div>
                  )}
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
