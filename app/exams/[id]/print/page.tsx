'use client'

import { useSearchParams } from 'next/navigation'
import { Suspense, useEffect, useState } from 'react'

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
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  }).from(el).save()
}

interface QuestionData {
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  passage?: string
}

interface ExamQuestion {
  id: string
  question_data: QuestionData
  sort_order: number
  points: number
}

const TYPE_LABELS: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  essay: '서술형',
  summary: '지문요약',
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

// "따옴표로 감싼 부분" 추출 (targetText)
function extractQuoted(text: string): string | null {
  const match = text.match(/"([^"]+)"/)
  return match ? match[1] : null
}

// 지문에서 밑줄 쳐야 할 단어들을 찾아 세그먼트로 분리
function buildPassageSegments(passage: string, questions: ExamQuestion[]) {
  type Seg = { text: string; underline?: boolean }

  const matchRanges: { start: number; end: number }[] = []
  for (const eq of questions) {
    const q = eq.question_data
    if (q.type !== 'vocab' && q.type !== 'grammar') continue
    const target = extractQuoted(q.question)
    if (!target) continue
    const idx = passage.indexOf(target)
    if (idx === -1) continue
    matchRanges.push({ start: idx, end: idx + target.length })
  }

  // 겹치지 않도록 정렬 및 중복 제거
  matchRanges.sort((a, b) => a.start - b.start)
  const cleaned: { start: number; end: number }[] = []
  let lastEnd = 0
  for (const m of matchRanges) {
    if (m.start >= lastEnd) { cleaned.push(m); lastEnd = m.end }
  }

  const segs: Seg[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) segs.push({ text: passage.slice(cursor, m.start) })
    segs.push({ text: passage.slice(m.start, m.end), underline: true })
    cursor = m.end
  }
  if (cursor < passage.length) segs.push({ text: passage.slice(cursor) })
  return segs
}

// 문제 텍스트에서 "quoted" 부분을 밑줄로 렌더링
function renderQuestionText(text: string) {
  const parts = text.split(/("(?:[^"]+)")/)
  return parts.map((part, i) => {
    if (part.startsWith('"') && part.endsWith('"') && part.length > 2) {
      return (
        <span key={i} style={{ textDecoration: 'underline', textUnderlineOffset: '2px', fontStyle: 'italic' }}>
          {part.slice(1, -1)}
        </span>
      )
    }
    return <span key={i}>{part}</span>
  })
}

// 빈칸(_____)을 실제 빈칸 선으로 렌더링
function renderWithBlanks(text: string) {
  const parts = text.split(/(_{3,})/)
  return parts.map((part, i) => {
    if (/^_{3,}$/.test(part)) {
      return (
        <span
          key={i}
          style={{ display: 'inline-block', minWidth: '60px', borderBottom: '1.5px solid #333', margin: '0 2px', verticalAlign: 'bottom' }}
        />
      )
    }
    return <span key={i}>{part}</span>
  })
}

function PrintContent() {
  const params = useSearchParams()
  const examId = params.get('exam_id') ?? ''
  const title = params.get('title') ?? '시험지'
  const date = params.get('date') ?? ''

  const [questions, setQuestions] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!examId) { setLoading(false); return }
    fetch(`/api/exam-questions?exam_id=${examId}`)
      .then((r) => r.json())
      .then((json) => { if (json.data) setQuestions(json.data) })
      .finally(() => setLoading(false))
  }, [examId])

  const totalPoints = questions.reduce((s, q) => s + q.points, 0)
  const today = new Date().toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })

  // 지문별로 그룹화
  const passageGroups: { passage: string | null; questions: ExamQuestion[] }[] = []
  questions.forEach((eq) => {
    const passage = eq.question_data.passage ?? null
    const last = passageGroups[passageGroups.length - 1]
    if (last && last.passage === passage) {
      last.questions.push(eq)
    } else {
      passageGroups.push({ passage, questions: [eq] })
    }
  })

  if (loading) {
    return <div className="py-20 text-center text-sm text-gray-400">문제 불러오는 중…</div>
  }

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
          .question-block { break-inside: avoid; page-break-inside: avoid; }
        }
      `}</style>

      <div className="no-print mb-4 flex justify-center gap-3 pt-6">
        <button
          onClick={() => window.print()}
          className="rounded bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          🖨️ 인쇄
        </button>
        <button
          onClick={() => downloadPdf(title)}
          className="rounded bg-red-600 px-6 py-2 text-sm font-medium text-white hover:bg-red-700"
        >
          📄 PDF 저장
        </button>
      </div>

      <div
        className="print-area page mx-auto bg-white shadow-lg"
        style={{ width: '210mm', minHeight: '297mm', padding: '14mm 16mm 12mm' }}
      >
        {/* 헤더 */}
        <div className="mb-6 border-b-2 border-gray-800 pb-3">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-gray-500">보스턴S영어학원</p>
              <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
            </div>
            <div className="text-right text-xs text-gray-500">
              <p>출제일: {today}</p>
              {date && <p>시험일: {date}</p>}
            </div>
          </div>

          {/* 학생 정보 칸 */}
          <div className="mt-3 grid grid-cols-3 gap-4 text-sm">
            <div className="border-b border-gray-400 pb-1">
              <span className="text-xs text-gray-400 mr-2">이름:</span>
            </div>
            <div className="border-b border-gray-400 pb-1">
              <span className="text-xs text-gray-400 mr-2">학년/반:</span>
            </div>
            <div className="text-right text-xs text-gray-500">
              총 {questions.length}문항 / {totalPoints}점 만점
            </div>
          </div>
        </div>

        {/* 문항 */}
        <div className="space-y-5">
          {(() => {
            let qNum = 0
            return passageGroups.map((group, gi) => (
              <div key={gi}>
                {/* 지문: 밑줄 칠 단어 하이라이트 */}
                {group.passage && (
                  <div
                    className="mb-3 rounded border border-gray-200 bg-gray-50 p-3 question-block"
                    style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}
                  >
                    <p className="mb-1 text-xs font-semibold text-gray-500">【지문】</p>
                    <p className="text-xs leading-relaxed text-gray-700 whitespace-pre-wrap">
                      {buildPassageSegments(group.passage, group.questions).map((seg, si) =>
                        seg.underline ? (
                          <span
                            key={si}
                            style={{ textDecoration: 'underline', textDecorationThickness: '1.5px', textUnderlineOffset: '2px' }}
                          >
                            {seg.text}
                          </span>
                        ) : (
                          <span key={si}>{seg.text}</span>
                        )
                      )}
                    </p>
                  </div>
                )}

                {/* 문항들 */}
                {group.questions.map((eq) => {
                  qNum++
                  const num = qNum
                  const q = eq.question_data
                  const isMultiple = Array.isArray(q.options) && q.options.length > 0
                  const isEssay = q.type === 'essay'
                  const isSummary = q.type === 'summary'
                  const isShortAnswer = !isMultiple && !isEssay && !isSummary

                  return (
                    <div
                      key={eq.id}
                      className="pb-3 question-block"
                      style={{ breakInside: 'avoid', pageBreakInside: 'avoid', display: 'block' }}
                    >
                      <div className="mb-1 flex items-start gap-2">
                        <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-800 text-[10px] font-bold text-white">
                          {num}
                        </span>
                        <div className="flex-1">
                          <div className="mb-0.5 flex items-center gap-2">
                            <span className="text-[10px] text-gray-400">
                              [{TYPE_LABELS[q.type] ?? q.type}] {eq.points}점
                            </span>
                          </div>
                          {/* 지문요약 빈칸 문제 */}
                          {isSummary ? (
                            <p className="text-sm leading-relaxed text-gray-900">
                              {renderWithBlanks(q.question)}
                            </p>
                          ) : (
                            <p className="text-sm leading-relaxed text-gray-900">
                              {renderQuestionText(q.question)}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* 객관식 보기 */}
                      {isMultiple && (
                        <div className="ml-7 mt-2 space-y-0.5">
                          {q.options!.map((opt, i) => (
                            <div key={i} className="text-sm text-gray-700">
                              {CHOICE_MARK[i] ?? `(${i + 1})`} {opt}
                            </div>
                          ))}
                        </div>
                      )}

                      {isEssay && (
                        <div className="ml-7 mt-2 h-16 rounded border border-gray-300" />
                      )}

                      {isShortAnswer && (
                        <div className="ml-7 mt-1">
                          <div className="inline-block min-w-32 border-b border-gray-400 pb-1" />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))
          })()}
        </div>

        {/* 정답란 */}
        <div className="mt-8 border-t border-dashed border-gray-300 pt-4">
          <p className="mb-2 text-xs font-semibold text-gray-400">— 정답 (선생님용 / 출력 후 제거) —</p>
          <div className="grid grid-cols-5 gap-2">
            {questions.map((eq, idx) => (
              <div key={eq.id} className="text-xs text-gray-600">
                <span className="font-medium">{idx + 1}.</span>{' '}
                {eq.question_data.answer ?? '-'}
              </div>
            ))}
          </div>
        </div>

        {/* 하단 */}
        <div className="mt-6 border-t border-gray-200 pt-3 text-[10px] text-gray-400 text-center">
          보스턴S영어학원 | 담당교사: 서향미 선생님
        </div>
      </div>
    </>
  )
}

export default function ExamPrintPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-sm text-gray-400">로딩 중…</div>}>
      <PrintContent />
    </Suspense>
  )
}
