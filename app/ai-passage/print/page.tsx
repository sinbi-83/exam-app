'use client'

import { useEffect, useState } from 'react'
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

function buildQuestionPrompt(q: MultipleChoiceQuestion, qIndex: number): string {
  if (q.type === 'grammar') {
    return `빈칸 (${qIndex + 1})에 들어갈 말로 가장 적절한 것은?`
  }
  return `"${q.targetText}"의 의미로 가장 알맞은 것은?`
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

// 어법 문제에 해당하는 부분만 지문에서 빈칸으로 가리는 함수
function buildExamPassageSegments(passage: string, questions: MultipleChoiceQuestion[]) {
  type Match = { start: number; end: number; qNumber: number }
  const matches: Match[] = []

  questions.forEach((q, qIndex) => {
    if (q.type !== 'grammar' || !q.targetText) return
    const idx = passage.indexOf(q.targetText)
    if (idx === -1) return
    matches.push({ start: idx, end: idx + q.targetText.length, qNumber: qIndex + 1 })
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

  const segments: { text: string; blankNumber?: number }[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) {
      segments.push({ text: passage.slice(cursor, m.start) })
    }
    segments.push({ text: '', blankNumber: m.qNumber })
    cursor = m.end
  }
  if (cursor < passage.length) {
    segments.push({ text: passage.slice(cursor) })
  }

  return segments
}

export default function PrintPage() {
  const [data, setData] = useState<PrintData | null>(null)

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

  if (!data) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  const examSegments =
    data.mode === 'exam' ? buildExamPassageSegments(data.passage, data.questions) : []

  const essayQuestions = data.essayQuestions || []
  const summaryQuestions = data.summaryQuestions || []
  const readingQuestions = data.readingQuestions || []
  const mcqCount = data.questions.length
  const gradePrefix = data.grade ? `${data.grade} ` : ''

  return (
    <div className="relative mx-auto max-w-2xl p-8 print-area">
      {/* 배경 워터마크 로고: 아주 연하게, 화면과 인쇄물 모두에 표시됨 */}
      <img
        src="/boston-logo-watermark.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none fixed left-1/2 top-1/2 z-0 w-[380px] -translate-x-1/2 -translate-y-1/2 opacity-[0.10] print:opacity-[0.10]"
      />

      {/* 실제 시험지 내용: 워터마크보다 위에 쌓이도록 z-10 */}
      <div className="relative z-10">
        <div className="mb-4 flex justify-end print:hidden">
          <button
            onClick={() => window.print()}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            🖨 인쇄하기
          </button>
        </div>

        {data.mode === 'exam' && (
          <>
            <h1 className="mb-4 text-lg font-bold">{gradePrefix}영어 시험문제</h1>
            <p className="mb-6 whitespace-pre-wrap text-sm leading-8 break-inside-avoid">
              {examSegments.map((seg, idx) =>
                seg.blankNumber ? (
                  <span
                    key={idx}
                    className="mx-1 inline-block min-w-[70px] border-b border-black px-2 text-center font-medium"
                  >
                    ({seg.blankNumber})
                  </span>
                ) : (
                  <span key={idx}>{seg.text}</span>
                )
              )}
            </p>
            <div className="space-y-6">
              {data.questions.map((q, qIndex) => (
                <div key={qIndex} className="break-inside-avoid">
                  <p className="mb-2 font-medium">
                    {qIndex + 1}. {buildQuestionPrompt(q, qIndex)}
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
            <h1 className="mb-4 text-lg font-bold">{gradePrefix}영어 서술형 시험문제</h1>
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
            <h1 className="mb-4 text-lg font-bold">{gradePrefix}정답 및 해설</h1>
            <div className="space-y-4">
              {data.questions.map((q, qIndex) => (
                <div key={qIndex} className="break-inside-avoid">
                  <p className="text-sm font-medium">
                    {qIndex + 1}. "{q.targetText}" — 정답: {CHOICE_MARK[q.correctIndex]} {q.choices[q.correctIndex]}
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