'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

async function downloadPdf(filename: string) {
  const html2pdf = (await import('html2pdf.js')).default
  const el = document.querySelector('.print-area')
  if (!el) return
  html2pdf().set({
    margin: 0,
    filename: `${filename}.pdf`,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
  }).from(el).save()
}

function RadarBar({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100)
  const color =
    pct >= 80 ? 'bg-green-400' : pct >= 60 ? 'bg-blue-400' : pct >= 40 ? 'bg-amber-400' : 'bg-red-400'
  return (
    <div className="mb-2">
      <div className="mb-0.5 flex justify-between text-[11px]">
        <span className="text-gray-600">{label}</span>
        <span className="font-medium text-gray-700">{value}점</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function ReportContent() {
  const params = useSearchParams()

  const studentName = params.get('studentName') ?? ''
  const studentGrade = params.get('studentGrade') ?? ''
  const examTitle = params.get('examTitle') ?? ''
  const examDate = params.get('examDate') ?? ''
  const score = Number(params.get('score') ?? 0)
  const maxScore = Number(params.get('maxScore') ?? 100)
  const comment = params.get('comment') ?? ''
  const nextSteps = params.get('nextSteps') ?? ''
  const strengths = params.get('strengths') ?? ''
  const typeScoresRaw = params.get('typeScores') ?? '{}'
  const typeScores: Record<string, number> = (() => {
    try {
      const raw = JSON.parse(typeScoresRaw)
      return Object.fromEntries(
        Object.entries(raw)
          .filter(([, v]) => v !== '' && !isNaN(Number(v)))
          .map(([k, v]) => [k, Number(v)])
      )
    } catch {
      return {}
    }
  })()

  const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0
  const grade =
    pct >= 90 ? 'A+' : pct >= 80 ? 'A' : pct >= 70 ? 'B+' : pct >= 60 ? 'B' : pct >= 50 ? 'C' : 'D'
  const gradeColor =
    pct >= 80 ? 'text-green-600' : pct >= 60 ? 'text-blue-600' : pct >= 40 ? 'text-amber-600' : 'text-red-500'

  const today = new Date().toLocaleDateString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700&display=swap');
        * { font-family: 'Noto Sans KR', sans-serif; box-sizing: border-box; }
        @page { size: A4; margin: 0; }
        @media print {
          body { margin: 0; }
          .no-print { display: none !important; }
          .page { box-shadow: none !important; }
        }
      `}</style>

      {/* Print button */}
      <div className="no-print mb-4 flex justify-center pt-6">
        <button
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(studentName || '학생보고서')}
          className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          📄 PDF 저장
        </button>
      </div>

      {/* A4 Page */}
      <div
        className="print-area page mx-auto bg-white shadow-lg"
        style={{
          width: '210mm',
          minHeight: '297mm',
          padding: '14mm 16mm 12mm',
        }}
      >
        {/* Header */}
        <div
          style={{ background: 'linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%)' }}
          className="mb-5 rounded-xl px-6 py-4 text-white"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium opacity-80">보스턴S영어학원</p>
              <p className="mt-0.5 text-lg font-bold">학생 성취도 보고서</p>
            </div>
            <div className="text-right text-xs opacity-70">
              <p>발행일: {today}</p>
              {examDate && <p>시험일: {examDate}</p>}
            </div>
          </div>
        </div>

        {/* Student info + Score */}
        <div className="mb-5 grid grid-cols-3 gap-4">
          <div className="col-span-2 rounded-lg border border-gray-200 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">학생 정보</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span className="text-xs text-gray-400">이름</span>
                <p className="font-semibold text-gray-800">{studentName || '-'}</p>
              </div>
              <div>
                <span className="text-xs text-gray-400">학년</span>
                <p className="font-semibold text-gray-800">{studentGrade || '-'}</p>
              </div>
              <div className="col-span-2">
                <span className="text-xs text-gray-400">시험명</span>
                <p className="font-semibold text-gray-800">{examTitle || '-'}</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 p-4 text-center">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-400">최종 점수</p>
            <p className="text-3xl font-bold text-gray-800">
              {score}
              <span className="text-base font-normal text-gray-400">/{maxScore}</span>
            </p>
            <p className={`mt-1 text-2xl font-black ${gradeColor}`}>{grade}</p>
            <p className="mt-0.5 text-xs text-gray-400">{pct}%</p>
          </div>
        </div>

        {/* Area scores bar chart */}
        {Object.keys(typeScores).length > 0 && (
          <div className="mb-5 rounded-lg border border-gray-200 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">영역별 성취도</p>
            {Object.entries(typeScores).map(([type, val]) => (
              <RadarBar key={type} label={type} value={val} max={maxScore > 0 ? maxScore : 100} />
            ))}
          </div>
        )}

        {/* Comments */}
        <div className="mb-4 grid grid-cols-2 gap-4">
          {strengths && (
            <div className="rounded-lg border border-green-100 bg-green-50 p-4">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-green-700">
                <span>✅</span> 잘한 점 / 강점
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{strengths}</p>
            </div>
          )}
          {comment && (
            <div className="rounded-lg border border-amber-100 bg-amber-50 p-4">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-amber-700">
                <span>📌</span> 보완이 필요한 부분
              </p>
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{comment}</p>
            </div>
          )}
        </div>

        {nextSteps && (
          <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 p-4">
            <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-blue-700">
              <span>📚</span> 다음 학습 계획 / 권고사항
            </p>
            <p className="whitespace-pre-wrap text-xs leading-relaxed text-gray-700">{nextSteps}</p>
          </div>
        )}

        {/* Footer */}
        <div className="mt-auto border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between text-[10px] text-gray-400">
            <span>보스턴S영어학원 | 담당 교사: 서향미 선생님</span>
            <span>이 보고서는 AI 시험문제 출제 시스템으로 생성되었습니다.</span>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-8">
            <div className="text-center text-xs text-gray-500">
              <div className="mb-1">담당교사 확인</div>
              <div className="border-b border-gray-300 pb-4" />
            </div>
            <div className="text-center text-xs text-gray-500">
              <div className="mb-1">학부모 확인</div>
              <div className="border-b border-gray-300 pb-4" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

export default function ReportPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <ReportContent />
    </Suspense>
  )
}
