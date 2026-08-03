'use client'

import { useState } from 'react'
import {
  buildMultipleChoiceQuestions,
  MultipleChoiceQuestion,
} from '@/lib/buildMultipleChoice'

const GRADE_OPTIONS = [
  '초등학교 4학년',
  '초등학교 5학년',
  '초등학교 6학년',
  '중학교 1학년',
  '중학교 2학년',
  '중학교 3학년',
  '고등학교 1학년',
  '고등학교 2학년',
  '고등학교 3학년',
]

interface PassageHighlightItem {
  targetText: string
  type: 'vocab' | 'grammar'
  difficulty: 'beginner' | 'intermediate' | 'advanced'
  answer: string
  wrongAnswers: string[]
}

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

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

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

export default function AiPassagePage() {
  const [grade, setGrade] = useState(GRADE_OPTIONS[3])
  const [topic, setTopic] = useState('')
  const [passage, setPassage] = useState('')
  const [items, setItems] = useState<PassageHighlightItem[]>([])
  const [loading, setLoading] = useState(false)

  const [questions, setQuestions] = useState<MultipleChoiceQuestion[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({})

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPassage('')
    setItems([])
    setQuestions([])
    setSelectedAnswers({})

    try {
      const res = await fetch('/api/generate-ai-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gradeLevel: grade, topicKeyword: topic }),
      })

      const data = await res.json()

      if (!data.ok) {
        alert(data.message || '오류가 발생했어요.')
        return
      }

      setPassage(data.data.passage)
      setItems(data.data.items || [])
    } catch (err) {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  function handleBuildQuestions() {
    const built = buildMultipleChoiceQuestions(items)
    setQuestions(built)
    setSelectedAnswers({})
  }

  function handleAnswerSelect(questionIndex: number, choiceIndex: number) {
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: choiceIndex }))
  }

  const segments = passage ? buildHighlightSegments(passage, items) : []

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 mb-6">
        AI 지문 생성 (신규)
      </h1>

      <form onSubmit={handleSubmit} className="rounded-lg border border-gray-200 bg-white p-6 space-y-5">
        <div>
          <label className="block text-sm text-gray-600 mb-1">학년</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">주제 키워드</label>
          <input
            type="text"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="예: 우정, 환경, 인공지능"
            className="w-full rounded border border-gray-300 px-3 py-2"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded bg-blue-600 py-2 text-white disabled:opacity-50"
        >
          {loading ? '생성 중...' : '지문 생성'}
        </button>
      </form>

      {passage && (
        <div className="mt-6 space-y-4">
          <div className="mb-2 flex gap-4 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-yellow-200" /> 어휘
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-3 w-3 rounded bg-blue-200" /> 어법
            </span>
          </div>

          <div className="whitespace-pre-wrap rounded border border-gray-300 bg-gray-50 p-4 text-sm leading-8">
            {segments.map((seg, idx) => {
              if (!seg.item) {
                return <span key={idx}>{seg.text}</span>
              }
              const bgClass = TYPE_BG_CLASS[seg.item.type] || 'bg-gray-200'
              return (
                <span key={idx} className="whitespace-nowrap">
                  <span className={`${bgClass} rounded px-0.5`}>{seg.text}</span>
                  <span className="ml-1 whitespace-nowrap rounded bg-gray-700 px-1 py-0.5 text-[10px] font-normal text-white">
                    {TYPE_LABEL[seg.item.type]}·{DIFFICULTY_LABEL[seg.item.difficulty]}
                  </span>
                </span>
              )
            })}
          </div>

          <button
            type="button"
            onClick={handleBuildQuestions}
            className="w-full rounded bg-green-600 py-2 text-white"
          >
            문제 만들기
          </button>
        </div>
      )}

      {questions.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            생성된 문제 ({questions.length}개)
          </h2>
          {questions.map((q, qIndex) => {
            const selected = selectedAnswers[qIndex]
            return (
              <div key={qIndex} className="rounded border border-gray-300 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                  <span className="rounded bg-gray-100 px-2 py-0.5">
                    {TYPE_LABEL[q.type]} · {DIFFICULTY_LABEL[q.difficulty]}
                  </span>
                </div>
                <p className="mb-2 font-medium">
                  Q{qIndex + 1}. "{q.targetText}"의 의미로 가장 알맞은 것은?
                </p>
                <div className="space-y-1">
                  {q.choices.map((choice, choiceIndex) => {
                    const isSelected = selected === choiceIndex
                    const isCorrect = choiceIndex === q.correctIndex
                    let style = 'border-gray-300'
                    if (selected !== undefined) {
                      if (isCorrect) style = 'border-green-500 bg-green-50'
                      else if (isSelected) style = 'border-red-500 bg-red-50'
                    }
                    return (
                      <button
                        key={choiceIndex}
                        type="button"
                        onClick={() => handleAnswerSelect(qIndex, choiceIndex)}
                        className={`block w-full rounded border px-3 py-2 text-left text-sm ${style}`}
                      >
                        {CHOICE_MARK[choiceIndex]} {choice}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}