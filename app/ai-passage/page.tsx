'use client'

import { useState } from 'react'
import {
  buildMultipleChoiceQuestions,
  MultipleChoiceQuestion,
} from '@/lib/buildMultipleChoice'
import { PassageHighlightItem } from '@/types/aiPassage'
import {
  getTypeLabel,
  getDifficultyLabel,
  getTypeHighlightClass,
  getTypeBadgeClass,
  getDifficultyBadgeClass,
  flattenDetailTags,
} from '@/lib/tagDisplay'

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

export default function AiPassagePage() {
  const [grade, setGrade] = useState(GRADE_OPTIONS[3])
  const [topic, setTopic] = useState('')
  const [passage, setPassage] = useState('')
  const [translation, setTranslation] = useState('')
  const [items, setItems] = useState<PassageHighlightItem[]>([])
  const [loading, setLoading] = useState(false)

  const [questions, setQuestions] = useState<MultipleChoiceQuestion[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({})
  const [showTranslation, setShowTranslation] = useState(false)
  const [saving, setSaving] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPassage('')
    setTranslation('')
    setItems([])
    setQuestions([])
    setSelectedAnswers({})
    setShowTranslation(false)

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
      setTranslation(data.data.translation || '')
      setItems(data.data.items || [])
    } catch (err) {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBuildQuestions() {
    const built = buildMultipleChoiceQuestions(items)
    setQuestions(built)
    setSelectedAnswers({})

    setSaving(true)
    try {
      await fetch('/api/save-question-set', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade,
          topic,
          passage,
          translation,
          items,
          questions: built,
        }),
      })
    } catch (err) {
      console.error('문제은행 저장 실패:', err)
    } finally {
      setSaving(false)
    }
  }

  function handleAnswerSelect(questionIndex: number, choiceIndex: number) {
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: choiceIndex }))
  }

  const segments = passage ? buildHighlightSegments(passage, items) : []

  return (
    <div className="mx-auto max-w-[820px]">
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
            placeholder="예: 우정, 환경, 여행지"
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

          <div className="whitespace-pre-wrap rounded border border-gray-300 bg-gray-50 p-4 text-[15px] leading-9">
            {segments.map((seg, idx) => {
              if (!seg.item) {
                return <span key={idx}>{seg.text}</span>
              }
              const bgClass = getTypeHighlightClass(seg.item.type)
              return (
                <span key={idx} className="whitespace-nowrap">
                  <span className={`${bgClass} rounded px-0.5`}>{seg.text}</span>
                  <span className="ml-1 whitespace-nowrap rounded bg-gray-700 px-1 py-0.5 text-[10px] font-normal text-white">
                    {getTypeLabel(seg.item.type)}·{getDifficultyLabel(seg.item.difficulty)}
                  </span>
                </span>
              )
            })}
          </div>

          {translation && (
            <div>
              <button
                type="button"
                onClick={() => setShowTranslation((v) => !v)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              >
                {showTranslation ? '한글 해석 숨기기' : '한글 해석 보기'}
              </button>
              {showTranslation && (
                <div className="mt-3 rounded-lg bg-gray-50 p-4 text-sm leading-7 text-gray-700">
                  {translation}
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={handleBuildQuestions}
            disabled={saving}
            className="w-full rounded bg-green-600 py-2 text-white disabled:opacity-50"
          >
            {saving ? '저장 중...' : '문제 만들기'}
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
            const detailTagList = flattenDetailTags(q.detailTags)
            return (
              <div key={qIndex} className="rounded border border-gray-300 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getTypeBadgeClass(q.type)}`}>
                    {getTypeLabel(q.type)}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(q.difficulty)}`}>
                    {getDifficultyLabel(q.difficulty)}
                  </span>
                  {detailTagList.map((tag, tagIndex) => (
                    <span
                      key={tagIndex}
                      className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
                <p className="mb-2 font-medium">
                  Q{qIndex + 1}. {buildQuestionPrompt(q)}
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
                {selected !== undefined && q.explanation && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-500">
                    {q.explanation}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}