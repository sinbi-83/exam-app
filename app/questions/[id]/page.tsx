'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { PassageHighlightItem } from '@/types/aiPassage'

interface MultipleChoiceQuestion {
  targetText: string
  type: 'vocab' | 'grammar'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  choices: string[]
  correctIndex: number
  explanation: string
}

interface QuestionSetDetail {
  id: string
  grade: string
  topic: string
  passage: string
  translation: string
  items: PassageHighlightItem[]
  questions: MultipleChoiceQuestion[]
  created_at: string
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

const TYPE_LABEL: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
}

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: '초급',
  intermediate: '중급',
  advanced: '고급',
}

const TYPE_BG_CLASS: Record<string, string> = {
  vocab: 'bg-yellow-200',
  grammar: 'bg-blue-200',
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

  function handlePrintExam() {
    if (!data) return
    sessionStorage.setItem(
      'printData',
      JSON.stringify({ mode: 'exam', passage: data.passage, questions: data.questions })
    )
    window.open('/ai-passage/print', '_blank')
  }

  function handlePrintAnswer() {
    if (!data) return
    sessionStorage.setItem(
      'printData',
      JSON.stringify({ mode: 'answer', passage: data.passage, questions: data.questions })
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">{data.topic}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {data.grade} · {new Date(data.created_at).toLocaleDateString('ko-KR')}
      </p>

      <div className="mb-2 flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-yellow-200" /> 어휘
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-3 w-3 rounded bg-blue-200" /> 어법
        </span>
      </div>

      <div className="whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-6 text-sm leading-8">
        {segments.map((seg, idx) => {
          if (!seg.item) {
            return <span key={idx}>{seg.text}</span>
          }
          const bgClass = TYPE_BG_CLASS[seg.item.type] || 'bg-gray-200'
          return (
            <span key={idx} className="whitespace-nowrap">
              <span className={`${bgClass} rounded px-0.5`}>{seg.text}</span>
              <span className="ml-1 whitespace-nowrap rounded bg-gray-700 px-1 text-[10px] text-white">
                {TYPE_LABEL[seg.item.type]}·{DIFFICULTY_LABEL[seg.item.difficulty]}
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

      <div className="mb-8 flex gap-2">
        <button
          onClick={handlePrintExam}
          className="flex-1 rounded-md border border-gray-300 py-2 text-sm hover:bg-gray-50"
        >
          시험지 PDF 저장/출력
        </button>
        <button
          onClick={handlePrintAnswer}
          className="flex-1 rounded-md border border-gray-300 py-2 text-sm hover:bg-gray-50"
        >
          해설지 PDF 저장/출력
        </button>
      </div>

      <h2 className="mb-4 text-lg font-bold">정답 및 해설</h2>
      <div className="space-y-4">
        {data.questions.map((q, qIndex) => (
          <div key={qIndex} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="mb-2 font-medium">
              {qIndex + 1}. &quot;{q.targetText}&quot;의 의미로 가장 알맞은 것은?
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
              <p className="border-t border-gray-100 pt-2 text-sm text-gray-500">
                {q.explanation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}