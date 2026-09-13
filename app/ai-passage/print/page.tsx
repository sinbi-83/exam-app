'use client'

import { useEffect, useState } from 'react'
import html2canvas from 'html2canvas'
import jsPDF from 'jspdf'
import { EssayQuestion, PassageSentence } from '@/types/aiPassage'

interface MultipleChoiceQuestion {
  targetText: string
  type: 'vocab' | 'grammar'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  choices: string[]
  correctIndex: number
  explanation: string
}

interface SummaryMultipleChoiceQuestion {
  summaryText: string
  choices: string[]
  correctIndex: number
  explanation: string
  difficulty: string
}

interface ReadingMultipleChoiceQuestion {
  type: string
  choices: string[]
  correctIndex: number
  explanation: string
  difficulty: string
}

interface PrintData {
  mode: 'exam' | 'answer' | 'essay'
  grade?: string
  passage: string
  questions: MultipleChoiceQuestion[]
  summaryQuestions?: SummaryMultipleChoiceQuestion[]
  readingQuestions?: ReadingMultipleChoiceQuestion[]
  essayQuestions?: EssayQuestion[]
  sentences?: PassageSentence[]
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

function buildQuestionPrompt(q: MultipleChoiceQuestion, displayNumber: number): string {
  if (q.type === 'grammar') {
    return `빈칸 (${displayNumber})에 들어갈 말로 가장 적절한 것은?`
  }
  return `"${q.targetText}"(${displayNumber})의 의미로 가장 알맞은 것은?`
}

// 단어 중간이 아니라 독립된 단어/구절로 등장하는 위치를 정확히 찾는 함수
// (예: "her"를 찾을 때 "There" 안의 "her"에 잘못 매칭되는 것을 방지)
function findWordBoundaryIndex(passage: string, target: string): number {
  if (!target) return -1
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    const match = passage.match(new RegExp(`\\b${escaped}\\b`))
    if (match && typeof match.index === 'number') return match.index
  } catch {
    // 정규식 생성에 실패하면 기존 방식으로 대체
  }
  return passage.indexOf(target)
}

// 문제들을 "지문에 실제로 등장하는 순서"로 정렬하고, 그 순서대로 번호(1~N)를 매기는 함수
// 시험지와 정답지가 항상 같은 번호를 쓰도록 여기서 한 번만 순서를 정한다
function buildExamOrder(passage: string, questions: MultipleChoiceQuestion[]) {
  const items = questions.map((q, qIndex) => {
    const idx = q.targetText ? findWordBoundaryIndex(passage, q.targetText) : -1
    return { q, qIndex, start: idx === -1 ? Number.MAX_SAFE_INTEGER : idx }
  })
  items.sort((a, b) => a.start - b.start)
  return items.map((item, i) => ({ ...item, displayNumber: i + 1 }))
}

// 독해 문제 유형별 질문 문구 (코드가 고정으로 담당, lib/buildMultipleChoice.ts와 동일 로직)
function buildReadingQuestionPrompt(type: string): string {
  switch (type) {
    case '주제':
      return '이 글의 주제로 가장 알맞은 것은?'
    case '제목':
      return '이 글의 제목으로 가장 알맞은 것은?'
    case '분위기':
      return '이 글의 어조(분위기)로 가장 알맞은 것은?'
    case '요지':
      return '이 글의 요지로 가장 알맞은 것은?'
    case '내용일치':
      return '이 글의 내용과 일치하지 않는 것은?'
    default:
      return '다음 중 가장 알맞은 것은?'
  }
}

// 어법 문제는 빈칸으로, 어휘 문제는 밑줄+번호로 지문에 표시하는 함수
function buildExamPassageSegments(
  passage: string,
  orderedItems: { q: MultipleChoiceQuestion; displayNumber: number; start: number }[]
) {
  type Match = { start: number; end: number; qNumber: number; kind: 'grammar' | 'vocab'; text: string }
  const matches: Match[] = []

  orderedItems.forEach(({ q, displayNumber, start }) => {
    if (!q.targetText || start === Number.MAX_SAFE_INTEGER) return
    matches.push({
      start,
      end: start + q.targetText.length,
      qNumber: displayNumber,
      kind: q.type === 'grammar' ? 'grammar' : 'vocab',
      text: q.targetText,
    })
  })

  matches.sort((a, b) => a.start - b.start)

  const cleaned: Match[] = []
  let lastEnd = 0
  for (const m of matches) {
    if (m.start >= lastEnd) {
      cleaned.push(m)
      lastEnd = m.end
    }
  }

  const segments: { text: string; blankNumber?: number; underlineNumber?: number }[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) {
      segments.push({ text: passage.slice(cursor, m.start) })
    }
    if (m.kind === 'grammar') {
      segments.push({ text: '', blankNumber: m.qNumber })
    } else {
      segments.push({ text: m.text, underlineNumber: m.qNumber })
    }
    cursor = m.end
  }
  if (cursor < passage.length) {
    segments.push({ text: passage.slice(cursor) })
  }

  return segments
}

// 이미지 파일을 미리 불러와서 <img> 엘리먼트로 반환하는 함수 (워터마크를 PDF에 그릴 때 사용)
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export default function PrintPage() {
  const [data, setData] = useState<PrintData | null>(null)
  const [isDownloading, setIsDownloading] = useState(false)

  useEffect(() => {
    const raw = sessionStorage.getItem('printData')
    if (raw) {
      setData(JSON.parse(raw))
    }
  }, [])

  useEffect(() => {
    if (data) {
      const timer = setTimeout(() => {
        window.print()
      }, 300)
      return () => clearTimeout(timer)
    }
  }, [data])

  // 화면을 이미지로 캡처해서 PDF 파일로 바로 저장하는 함수
  // 제목/지문/문제 하나하나(.break-inside-avoid)를 각각 따로 캡처한 뒤,
  // 페이지 단위 Canvas를 만들어 워터마크(globalAlpha=0.1)와 내용을 합성해서 PDF에 넣는다.
  // Canvas globalAlpha 방식은 jsPDF GState보다 훨씬 안정적으로 동작한다.
  async function handleDownloadPdf() {
    const container = document.querySelector('.print-area') as HTMLElement | null
    if (!container) return

    const blockEls = Array.from(container.querySelectorAll('.break-inside-avoid')) as HTMLElement[]
    if (blockEls.length === 0) return

    setIsDownloading(true)
    try {
      // 1. 각 블록을 캡처
      const blockCanvases: HTMLCanvasElement[] = []
      for (const el of blockEls) {
        const originalPaddingTop = el.style.paddingTop
        const originalPaddingBottom = el.style.paddingBottom
        el.style.paddingTop = `${(parseFloat(originalPaddingTop) || 0) + 4}px`
        el.style.paddingBottom = `${(parseFloat(originalPaddingBottom) || 0) + 4}px`

        const canvas = await html2canvas(el, {
          scale: 2,
          useCORS: true,
          backgroundColor: '#ffffff',
          ignoreElements: (node) => node.getAttribute('data-pdf-ignore') === 'true',
        })

        el.style.paddingTop = originalPaddingTop
        el.style.paddingBottom = originalPaddingBottom
        blockCanvases.push(canvas)
      }

      // 2. PDF 기본 설정
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidthMm = pdf.internal.pageSize.getWidth()   // 210
      const pageHeightMm = pdf.internal.pageSize.getHeight() // 297
      const marginMm = 12
      const usableWidthMm = pageWidthMm - marginMm * 2
      const bottomLimitMm = pageHeightMm - marginMm

      // 3. 블록 배치 계산 (mm 기준)
      const placements: { pageIndex: number; x: number; y: number; w: number; h: number }[] = []
      let cursorMm = marginMm
      let pageIndex = 0
      blockCanvases.forEach((canvas, idx) => {
        const imgHeightMm = (canvas.height * usableWidthMm) / canvas.width
        if (idx > 0 && cursorMm + imgHeightMm > bottomLimitMm) {
          pageIndex += 1
          cursorMm = marginMm
        }
        placements.push({ pageIndex, x: marginMm, y: cursorMm, w: usableWidthMm, h: imgHeightMm })
        cursorMm += imgHeightMm + 4
      })

      const totalPages = pageIndex + 1
      for (let i = 1; i < totalPages; i++) pdf.addPage()

      // 4. mm → px 변환 비율: 블록 캔버스 너비를 기준으로 계산
      //    (html2canvas scale=2로 캡처했으므로 캔버스 px ÷ usableWidthMm = px/mm)
      const mmToPx = blockCanvases[0].width / usableWidthMm
      const pageWidthPx = Math.round(pageWidthMm * mmToPx)
      const pageHeightPx = Math.round(pageHeightMm * mmToPx)

      // 5. 워터마크 이미지 로드 (실패해도 내용은 그대로 저장)
      let watermarkImg: HTMLImageElement | null = null
      try {
        watermarkImg = await loadImage('/boston-logo-watermark.png')
      } catch (err) {
        console.error('워터마크 로고를 불러오지 못했습니다:', err)
      }

      // 6. 페이지별로 Canvas에 워터마크 + 내용을 합성해서 PDF에 삽입
      for (let p = 0; p < totalPages; p++) {
        const pageCanvas = document.createElement('canvas')
        pageCanvas.width = pageWidthPx
        pageCanvas.height = pageHeightPx
        const ctx = pageCanvas.getContext('2d')!

        // 흰 배경
        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, pageWidthPx, pageHeightPx)

        // 워터마크: Canvas globalAlpha로 투명도를 주면 모든 브라우저에서 안정적으로 동작
        if (watermarkImg) {
          const wmWidthMm = 70
          const wmHeightMm = (watermarkImg.height / watermarkImg.width) * wmWidthMm
          const wxPx = (pageWidthMm - wmWidthMm) / 2 * mmToPx
          const wyPx = (pageHeightMm - wmHeightMm) / 2 * mmToPx
          const wwPx = wmWidthMm * mmToPx
          const whPx = wmHeightMm * mmToPx
          ctx.globalAlpha = 0.1
          ctx.drawImage(watermarkImg, wxPx, wyPx, wwPx, whPx)
          ctx.globalAlpha = 1.0
        }

        // 이 페이지에 속한 블록 이미지들을 그 위에 겹쳐 그린다
        placements.forEach(({ pageIndex: pIdx, x, y }, idx) => {
          if (pIdx !== p) return
          const bc = blockCanvases[idx]
          ctx.drawImage(bc, x * mmToPx, y * mmToPx, bc.width, bc.height)
        })

        // 완성된 페이지 Canvas를 PDF 페이지로 추가
        pdf.setPage(p + 1)
        pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageWidthMm, pageHeightMm)
      }

      const modeLabel =
        data?.mode === 'answer' ? '정답지' : data?.mode === 'essay' ? '서술형시험지' : '시험지'
      pdf.save(`${data?.grade || ''}${modeLabel}.pdf`)
    } finally {
      setIsDownloading(false)
    }
  }

  if (!data) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  const examOrder = buildExamOrder(data.passage, data.questions)
  const examSegments = data.mode === 'exam' ? buildExamPassageSegments(data.passage, examOrder) : []

  const essayQuestions = data.essayQuestions || []
  const summaryQuestions = data.summaryQuestions || []
  const readingQuestions = data.readingQuestions || []
  const mcqCount = data.questions.length
  const gradePrefix = data.grade ? `${data.grade} ` : ''

  return (
    <div className="relative mx-auto max-w-2xl p-8 print-area">
      {/* 배경 워터마크 로고: 아주 연하게, 화면과 인쇄물 모두에 표시됨 (PDF 다운로드에서는 제외) */}
      <img
        src="/boston-logo-watermark.png"
        alt=""
        aria-hidden="true"
        data-pdf-ignore="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-0 w-[380px] -translate-x-1/2 -translate-y-1/2 opacity-[0.10] print:opacity-[0.10]"
      />

      {/* 실제 시험지 내용: 워터마크보다 위에 쌓이도록 z-10 */}
      <div className="relative z-10">
        <div className="mb-4 flex justify-end gap-2 print:hidden" data-pdf-ignore="true">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            🖨 인쇄하기
          </button>
          <button
            onClick={handleDownloadPdf}
            disabled={isDownloading}
            className="rounded-md bg-gray-700 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {isDownloading ? '만드는 중...' : '⬇ PDF 다운로드'}
          </button>
        </div>

        {data.mode === 'exam' && (
          <>
            <h1 className="mb-4 text-lg font-bold break-inside-avoid">{gradePrefix}영어 시험문제</h1>
            <p className="mb-6 whitespace-pre-wrap text-sm leading-8 break-inside-avoid">
              {examSegments.map((seg, idx) =>
                seg.blankNumber ? (
                  <span
                    key={idx}
                    className="mx-1 inline-block min-w-[70px] border-b border-black px-2 text-center font-medium"
                  >
                    ({seg.blankNumber})
                  </span>
                ) : seg.underlineNumber ? (
                  <span key={idx}>
                    <span className="underline">{seg.text}</span>
                    <span className="font-medium">({seg.underlineNumber})</span>
                  </span>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
            </p>
            <div className="space-y-6">
              {examOrder.map(({ q, displayNumber }) => (
                <div key={displayNumber} className="break-inside-avoid">
                  <p className="mb-2 font-medium">
                    {displayNumber}. {buildQuestionPrompt(q, displayNumber)}
                  </p>
                  <div className="space-y-1 pl-2">
                    {q.choices.map((choice, choiceIndex) => (
                      <p key={choiceIndex} className="text-sm">
                        {CHOICE_MARK[choiceIndex]} {choice}
                      </p>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {summaryQuestions.length > 0 && (
              <div className="mt-6 space-y-6">
                {summaryQuestions.map((sq, index) => {
                  const number = mcqCount + index + 1
                  return (
                    <div key={index} className="break-inside-avoid">
                      <p className="mb-2 font-medium">
                        {number}. {sq.summaryText}
                      </p>
                      <div className="space-y-1 pl-2">
                        {sq.choices.map((choice, choiceIndex) => (
                          <p key={choiceIndex} className="text-sm">
                            {CHOICE_MARK[choiceIndex]} {choice}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {readingQuestions.length > 0 && (
              <div className="mt-6 space-y-6">
                {readingQuestions.map((rq, index) => {
                  const number = mcqCount + summaryQuestions.length + index + 1
                  return (
                    <div key={index} className="break-inside-avoid">
                      <p className="mb-2 font-medium">
                        {number}. {buildReadingQuestionPrompt(rq.type)}
                      </p>
                      <div className="space-y-1 pl-2">
                        {rq.choices.map((choice, choiceIndex) => (
                          <p key={choiceIndex} className="text-sm">
                            {CHOICE_MARK[choiceIndex]} {choice}
                          </p>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {data.mode === 'essay' && (
          <>
            <h1 className="mb-4 text-lg font-bold break-inside-avoid">{gradePrefix}영어 서술형 시험문제</h1>
            <div className="space-y-6">
              {essayQuestions.map((eq, index) => {
                return (
                  <div key={eq.id} className="break-inside-avoid">
                    {eq.type === '배열영작' && eq.wordBank && eq.wordBank.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {eq.wordBank.map((word, wIdx) => (
                          <span key={wIdx} className="rounded border border-gray-400 px-2 py-0.5 text-xs">
                            {word}
                          </span>
                        ))}
                      </div>
                    )}
                    <p className="mb-2 font-medium">
                      {index + 1}. {eq.prompt}
                    </p>
                    {eq.conditions && (
                      <p className="mb-2 rounded border border-dashed border-gray-400 p-2 text-xs text-gray-600">
                        조건: {eq.conditions}
                      </p>
                    )}
                    <div className="space-y-2 pl-1">
                      {Array.from({ length: eq.answerLines || 1 }).map((_, lineIdx) => (
                        <div key={lineIdx} className="h-6 border-b border-black" />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}

        {data.mode === 'answer' && (
          <>
            <h1 className="mb-4 text-lg font-bold break-inside-avoid">{gradePrefix}정답 및 해설</h1>
            <div className="space-y-4">
              {examOrder.map(({ q, displayNumber }) => (
                <div key={displayNumber} className="break-inside-avoid">
                  <p className="text-sm font-medium">
                    {displayNumber}. "{q.targetText}" — 정답: {CHOICE_MARK[q.correctIndex]} {q.choices[q.correctIndex]}
                  </p>
                  {q.explanation && (
                    <p className="mt-1 text-sm text-gray-600">{q.explanation}</p>
                  )}
                </div>
              ))}
            </div>

            {summaryQuestions.length > 0 && (
              <div className="mt-6 space-y-2 border-t border-gray-300 pt-4">
                <h2 className="text-base font-bold">지문요약 문제 정답</h2>
                {summaryQuestions.map((sq, index) => {
                  const number = mcqCount + index + 1
                  return (
                    <div key={index} className="break-inside-avoid">
                      <p className="text-sm font-medium">
                        {number}. 정답: {CHOICE_MARK[sq.correctIndex]} {sq.choices[sq.correctIndex]}
                      </p>
                      {sq.explanation && (
                        <p className="mt-1 text-sm text-gray-600">{sq.explanation}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {readingQuestions.length > 0 && (
              <div className="mt-6 space-y-2 border-t border-gray-300 pt-4">
                <h2 className="text-base font-bold">독해 문제 정답</h2>
                {readingQuestions.map((rq, index) => {
                  const number = mcqCount + summaryQuestions.length + index + 1
                  return (
                    <div key={index} className="break-inside-avoid">
                      <p className="text-sm font-medium">
                        {number}. [{rq.type}] 정답: {CHOICE_MARK[rq.correctIndex]} {rq.choices[rq.correctIndex]}
                      </p>
                      {rq.explanation && (
                        <p className="mt-1 text-sm text-gray-600">{rq.explanation}</p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {essayQuestions.length > 0 && (
              <div className="mt-6 space-y-4 border-t border-gray-300 pt-4">
                <h2 className="text-base font-bold">서술형 정답 및 채점기준</h2>
                {essayQuestions.map((eq, index) => {
                  const number = mcqCount + summaryQuestions.length + readingQuestions.length + index + 1
                  return (
                    <div key={eq.id} className="break-inside-avoid">
                      <p className="text-sm font-medium">
                        {number}. [{eq.type}] 모범답안: {eq.modelAnswer}
                      </p>
                      {eq.rubric && eq.rubric.length > 0 && (
                        <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
                          {eq.rubric.map((r, rIdx) => (
                            <li key={rIdx}>
                              {r.criteria} ({r.points}점)
                            </li>
                          ))}
                        </ul>
                      )}
                      {eq.partialCreditNotes && (
                        <p className="mt-1 text-sm text-gray-500">
                          부분점수: {eq.partialCreditNotes}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}