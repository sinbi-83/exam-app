'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PassageHighlightItem, EssayQuestion, PassageSentence } from '@/types/aiPassage'
import { SummaryMultipleChoiceQuestion } from '@/lib/buildMultipleChoice'
import {
  getTypeLabel,
  getDifficultyLabel,
  getTypeHighlightClass,
  getTypeBadgeClass,
  getDifficultyBadgeClass,
  flattenDetailTags,
  DetailTagsLike,
} from '@/lib/tagDisplay'

interface MultipleChoiceQuestion {
  targetText: string
  type: string
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  choices: string[]
  correctIndex: number
  explanation: string
  targetSentence?: string
  sentenceNumber?: number
  detailTags?: DetailTagsLike
}

interface QuestionSetDetail {
  id: string
  grade: string
  topic: string
  passage: string
  translation: string
  items: PassageHighlightItem[]
  questions: MultipleChoiceQuestion[]
  sentences?: PassageSentence[]
  essay_questions?: EssayQuestion[]
  summary_questions?: SummaryMultipleChoiceQuestion[]
  created_at: string
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

function buildQuestionPrompt(q: MultipleChoiceQuestion): string {
  if (q.type === 'grammar') {
    return `밑줄 친 "${q.targetText}"의 쓰임이 어법상 가장 적절한 것은?`
  }
  return `"${q.targetText}"의 의미로 가장 알맞은 것은?`
}

function buildHighlightSegments(passage: string, items: PassageHighlightItem[]) {
  type Match = { start: number; end: number; item: PassageHighlightItem }
  const matches: Match[] = []

  for (const item of items) {
    if (!item.targetText) continue
    const idx = passage.indexOf(item.targetText)
    if (idx === -1) continue
    matches.push({ start: idx, end: idx + item.targetText.length, item })
  }

  matches.sort((a, b) => a.start - b.start)

  const cleaned: Match[] = []
  let lastEnd = 0
  for (const m of matches) {
    if (m.start >= lastEnd) {
      cleaned.push(m)
      lastEnd = m.end
    }
  }

  const segments: { text: string; item?: PassageHighlightItem }[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) {
      segments.push({ text: passage.slice(cursor, m.start) })
    }
    segments.push({ text: passage.slice(m.start, m.end), item: m.item })
    cursor = m.end
  }
  if (cursor < passage.length) {
    segments.push({ text: passage.slice(cursor) })
  }

  return segments
}

export default function QuestionSetDetailPage() {
  const params = useParams()
  const id = params.id as string

  const [data, setData] = useState<QuestionSetDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showTranslation, setShowTranslation] = useState(false)

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/question-sets/${id}`)
        const result = await res.json()
        if (!res.ok) {
          setError(result.error || '불러오지 못했습니다.')
          return
        }
        setData(result.data)
      } catch {
        setError('서버와 통신 중 문제가 발생했어요.')
      } finally {
        setLoading(false)
      }
    }
    fetchDetail()
  }, [id])

  // 객관식 시험지 인쇄 (지문요약 문제도 같이 포함되도록 수정)
  function handlePrintExam() {
    if (!data) return
    sessionStorage.setItem(
      'printData',
      JSON.stringify({
        mode: 'exam',
        grade: data.grade,
        passage: data.passage,
        questions: data.questions,
        summaryQuestions: data.summary_questions || [],
      })
    )
    window.open('/ai-passage/print', '_blank')
  }

  // 정답지 인쇄 (지문요약 + 서술형 정답도 같이 포함되도록 수정)
  function handlePrintAnswer() {
    if (!data) return
    sessionStorage.setItem(
      'printData',
      JSON.stringify({
        mode: 'answer',
        grade: data.grade,
        passage: data.passage,
        questions: data.questions,
        summaryQuestions: data.summary_questions || [],
        essayQuestions: data.essay_questions || [],
      })
    )
    window.open('/ai-passage/print', '_blank')
  }

  // 서술형 시험지 인쇄 (신규)
  function handlePrintEssay() {
    if (!data) return
    sessionStorage.setItem(
      'printData',
      JSON.stringify({
        mode: 'essay',
        grade: data.grade,
        passage: data.passage,
        questions: data.questions,
        essayQuestions: data.essay_questions || [],
      })
    )
    window.open('/ai-passage/print', '_blank')
  }

  if (loading) {
    return <p className="p-8 text-sm text-gray-500">불러오는 중...</p>
  }

  if (error || !data) {
    return <p className="p-8 text-sm text-red-500">{error || '문제를 찾을 수 없습니다.'}</p>
  }

  const segments = buildHighlightSegments(data.passage, data.items)
  const summaryQuestions = data.summary_questions || []
  const essayQuestions = data.essay_questions || []
  const mcqCount = data.questions.length

  return (
    <div className="mx-auto max-w-[820px]">
      <div className="mb-1 flex items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-800">{data.topic}</h1>
        <span className="rounded bg-gray-100 px-2 py-0.5 text-xs text-gray-500">{data.grade}</span>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        {new Date(data.created_at).toLocaleDateString('ko-KR')}
      </p>

      <div className="mb-2 flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-yellow-200" /> 어휘
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-blue-200" /> 어법
        </span>
      </div>

      <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-6 text-[15px] leading-9">
        {segments.map((seg, idx) => {
          if (!seg.item) {
            return <span key={idx}>{seg.text}</span>
          }
          const bgClass = getTypeHighlightClass(seg.item.type)
          return (
            <span key={idx} className="whitespace-nowrap">
              <span className={`${bgClass} rounded px-0.5`}>{seg.text}</span>
              <span className="ml-1 whitespace-nowrap rounded bg-gray-700 px-1 text-[10px] text-white">
                {getTypeLabel(seg.item.type)}·{getDifficultyLabel(seg.item.difficulty)}
              </span>
            </span>
          )
        })}
      </div>

      <button
        onClick={() => setShowTranslation((v) => !v)}
        className="my-4 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
      >
        {showTranslation ? '한글 해석 숨기기' : '한글 해석 보기'}
      </button>

      {showTranslation && (
        <div className="mb-6 rounded-lg bg-gray-50 p-4 text-sm leading-7 text-gray-700">
          {data.translation}
        </div>
      )}

      <div className="mb-8 flex flex-wrap gap-2">
        <button
          onClick={handlePrintExam}
          className="flex-1 rounded-md border border-gray-300 py-2 text-sm hover:bg-gray-50"
        >
          시험지 PDF 저장/출력
        </button>
        {essayQuestions.length > 0 && (
          <button
            onClick={handlePrintEssay}
            className="flex-1 rounded-md border border-teal-300 py-2 text-sm text-teal-700 hover:bg-teal-50"
          >
            서술형 시험지 PDF 저장/출력
          </button>
        )}
        <button
          onClick={handlePrintAnswer}
          className="flex-1 rounded-md border border-gray-300 py-2 text-sm hover:bg-gray-50"
        >
          해설지 PDF 저장/출력
        </button>
      </div>

      <h2 className="mb-4 text-lg font-bold">정답 및 해설</h2>
      <div className="space-y-4">
        {data.questions.map((q, qIndex) => {
          const detailTagList = flattenDetailTags(q.detailTags)
          return (
            <div key={qIndex} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="mb-2 flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getTypeBadgeClass(q.type)}`}>
                  {getTypeLabel(q.type)}
                </span>
                <span
                  className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(q.difficulty)}`}
                >
                  {getDifficultyLabel(q.difficulty)}
                </span>
                {detailTagList.map((tag, i) => (
                  <span key={i} className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                    {tag}
                  </span>
                ))}
              </div>
              <p className="mb-2 font-medium">
                {qIndex + 1}. {buildQuestionPrompt(q)}
              </p>
              <div className="mb-2 space-y-1 pl-2">
                {q.choices.map((choice, choiceIndex) => (
                  <p
                    key={choiceIndex}
                    className={
                      choiceIndex === q.correctIndex
                        ? 'text-sm font-medium text-green-700'
                        : 'text-sm text-gray-700'
                    }
                  >
                    {CHOICE_MARK[choiceIndex]} {choice}
                    {choiceIndex === q.correctIndex ? ' (정답)' : ''}
                  </p>
                ))}
              </div>
              {q.explanation && (
                <p className="border-t border-gray-100 pt-2 text-sm text-gray-500">{q.explanation}</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 지문요약 문제 정답 (신규) */}
      {summaryQuestions.length > 0 && (
        <>
          <h2 className="mb-4 mt-8 text-lg font-bold">지문요약 문제 정답</h2>
          <div className="space-y-4">
            {summaryQuestions.map((sq, index) => {
              const number = mcqCount + index + 1
              return (
                <div key={index} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-medium text-pink-800">
                      지문요약
                    </span>
                    <span
                      className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(sq.difficulty)}`}
                    >
                      {getDifficultyLabel(sq.difficulty)}
                    </span>
                  </div>
                  <p className="mb-2 font-medium">
                    {number}. {sq.summaryText}
                  </p>
                  <div className="mb-2 space-y-1 pl-2">
                    {sq.choices.map((choice, choiceIndex) => (
                      <p
                        key={choiceIndex}
                        className={
                          choiceIndex === sq.correctIndex
                            ? 'text-sm font-medium text-green-700'
                            : 'text-sm text-gray-700'
                        }
                      >
                        {CHOICE_MARK[choiceIndex]} {choice}
                        {choiceIndex === sq.correctIndex ? ' (정답)' : ''}
                      </p>
                    ))}
                  </div>
                  {sq.explanation && (
                    <p className="border-t border-gray-100 pt-2 text-sm text-gray-500">{sq.explanation}</p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* 서술형 문제 정답 및 채점기준 (신규) */}
      {essayQuestions.length > 0 && (
        <>
          <h2 className="mb-4 mt-8 text-lg font-bold">서술형 문제 정답 및 채점기준</h2>
          <div className="space-y-4">
            {essayQuestions.map((eq, index) => {
              const number = mcqCount + summaryQuestions.length + index + 1
              return (
                <div key={eq.id} className="rounded-lg border border-gray-200 bg-white p-4">
                  <div className="mb-2 flex flex-wrap items-center gap-1.5">
                    <span className="rounded bg-teal-100 px-1.5 py-0.5 text-[11px] font-medium text-teal-800">
                      서술형 · {eq.type}
                    </span>
                    <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[11px] font-medium text-indigo-700">
                      {getDifficultyLabel(eq.level)}
                    </span>
                  </div>

                  {eq.type === '배열영작' && eq.wordBank && eq.wordBank.length > 0 && (
                    <div className="mb-3 flex flex-wrap gap-1.5">
                      {eq.wordBank.map((word, wIdx) => (
                        <span
                          key={wIdx}
                          className="rounded border border-gray-300 bg-gray-50 px-2 py-1 text-xs text-gray-700"
                        >
                          {word}
                        </span>
                      ))}
                    </div>
                  )}

                  <p className="mb-2 font-medium">
                    {number}. {eq.prompt}
                  </p>

                  {eq.conditions && (
                    <div className="mb-2 rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500">
                      조건: {eq.conditions}
                    </div>
                  )}

                  <p className="text-sm">
                    <span className="font-medium text-gray-700">모범답안: </span>
                    <span className="text-green-700">{eq.modelAnswer}</span>
                  </p>

                  {eq.rubric && eq.rubric.length > 0 && (
                    <div className="mt-2">
                      <span className="text-sm font-medium text-gray-700">채점 기준:</span>
                      <ul className="mt-1 list-disc pl-5 text-sm text-gray-600">
                        {eq.rubric.map((r, rIdx) => (
                          <li key={rIdx}>
                            {r.criteria} ({r.points}점)
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {eq.partialCreditNotes && (
                    <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-500">
                      <span className="font-medium text-gray-700">부분점수: </span>
                      {eq.partialCreditNotes}
                    </p>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}