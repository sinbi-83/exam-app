'use client'

import { useState } from 'react'

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

export default function AiPassagePage() {
  const [grade, setGrade] = useState(GRADE_OPTIONS[3])
  const [topic, setTopic] = useState('')
 const [passage, setPassage] = useState('')
  const [vocabQuestions, setVocabQuestions] = useState<any[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({})
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPassage('')
    setVocabQuestions([])
    setSelectedAnswers({})

    try {
      const res = await fetch('/api/generate-passage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ grade, topic }),
      })

      const data = await res.json()

      if (!res.ok) {
        alert(data.error || '오류가 발생했어요.')
        return
      }

      setPassage(data.passage)
      setVocabQuestions(data.vocabQuestions || [])
    } catch (err) {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }
function handleAnswerSelect(questionIndex: number, optionIndex: number) {
    setSelectedAnswers((prev) => ({ ...prev, [questionIndex]: optionIndex }))
  }
  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-gray-800 mb-6">
        AI 지문 + 문제자리 생성 (신규)
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
          {loading ? '생성 중...' : '지문 + 문제자리 생성'}
        </button>
      </form>
      {passage && (
        <div className="mt-6 whitespace-pre-wrap rounded border border-gray-300 bg-gray-50 p-4 text-sm">
          {passage}
        </div>
      )}

      {vocabQuestions.length > 0 && (
        <div className="mt-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">어휘 문제</h2>
          {vocabQuestions.map((q, qIndex) => {
            const selected = selectedAnswers[qIndex]
            return (
              <div key={qIndex} className="rounded border border-gray-300 p-4">
                <p className="mb-2 font-medium">
                  Q{qIndex + 1}. "{q.word}"와 의미가 가장 비슷한 것은? (문장 {q.sentenceNumber}번)
                </p>
                <div className="space-y-1">
                  {q.options.map((opt: string, optIndex: number) => {
                    const isSelected = selected === optIndex
                    const isCorrect = optIndex === q.answerIndex
                    let style = 'border-gray-300'
                    if (selected !== undefined) {
                      if (isCorrect) style = 'border-green-500 bg-green-50'
                      else if (isSelected) style = 'border-red-500 bg-red-50'
                    }
                    return (
                      <button
                        key={optIndex}
                        type="button"
                        onClick={() => handleAnswerSelect(qIndex, optIndex)}
                        className={`block w-full rounded border px-3 py-2 text-left text-sm ${style}`}
                      >
                        {['①', '②', '③', '④'][optIndex]} {opt}
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