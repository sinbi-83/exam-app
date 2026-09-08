'use client'

import { useState } from 'react'
import {
  buildMultipleChoiceQuestions,
  buildSummaryQuestions,
  buildReadingQuestions,
  buildReadingQuestionPrompt,
  MultipleChoiceQuestion,
  SummaryMultipleChoiceQuestion,
  ReadingMultipleChoiceQuestion,
} from '@/lib/buildMultipleChoice'
import { PassageHighlightItem, EssayQuestion, PassageSentence, SummaryQuestion, ReadingQuestion } from '@/types/aiPassage'
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

// 서술형 문제의 근거 문장 id들을 실제 문장 텍스트로 바꿔주는 함수 (현재 미사용, 추후 재사용 대비 보존)
function findSentenceTexts(sentences: PassageSentence[], ids: string[]): string {
  return ids
    .map((id) => sentences.find((s) => s.id === id)?.text)
    .filter((t): t is string => Boolean(t))
    .join(' ')
}

export default function AiPassagePage() {
  const [grade, setGrade] = useState(GRADE_OPTIONS[3])
  const [topic, setTopic] = useState('')
  const [passage, setPassage] = useState('')
  const [translation, setTranslation] = useState('')
  const [items, setItems] = useState<PassageHighlightItem[]>([])
  const [sentences, setSentences] = useState<PassageSentence[]>([])
  const [essayQuestions, setEssayQuestions] = useState<EssayQuestion[]>([])
  const [summaryQuestions, setSummaryQuestions] = useState<SummaryQuestion[]>([])
  const [readingQuestions, setReadingQuestions] = useState<ReadingQuestion[]>([])
  const [loading, setLoading] = useState(false)

  const [questions, setQuestions] = useState<MultipleChoiceQuestion[]>([])
  const [builtSummaryQuestions, setBuiltSummaryQuestions] = useState<SummaryMultipleChoiceQuestion[]>([])
  const [builtReadingQuestions, setBuiltReadingQuestions] = useState<ReadingMultipleChoiceQuestion[]>([])
  const [selectedAnswers, setSelectedAnswers] = useState<{ [key: number]: number }>({})
  const [selectedSummaryAnswers, setSelectedSummaryAnswers] = useState<{ [key: number]: number }>({})
  const [selectedReadingAnswers, setSelectedReadingAnswers] = useState<{ [key: number]: number }>({})
  const [showTranslation, setShowTranslation] = useState(false)
  const [saving, setSaving] = useState(false)
  const [openAnswerIds, setOpenAnswerIds] = useState<{ [key: string]: boolean }>({})

  // 난이도 필터: 체크된 난이도만 문제로 뽑힘, 기본은 3개 다 체크
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<string>>(
    new Set(['beginner', 'intermediate', 'advanced'])
  )

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setPassage('')
    setTranslation('')
    setItems([])
    setSentences([])
    setEssayQuestions([])
    setSummaryQuestions([])
    setReadingQuestions([])
    setQuestions([])
    setBuiltSummaryQuestions([])
    setBuiltReadingQuestions([])
    setSelectedAnswers({})
    setSelectedSummaryAnswers({})
    setSelectedReadingAnswers({})
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
      setSentences(data.data.sentences || [])
      setEssayQuestions(data.data.essayQuestions || [])
      setSummaryQuestions(data.data.summaryQuestions || [])
      setReadingQuestions(data.data.readingQuestions || [])
    } catch (err) {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  async function handleBuildQuestions() {
    // 체크된 난이도만 남기고 걸러내기
    const filteredItems = items.filter((item) => selectedDifficulties.has(item.difficulty))
    const filteredSummaryQuestions = summaryQuestions.filter((sq) =>
      selectedDifficulties.has(sq.difficulty)
    )
    const filteredReadingQuestions = readingQuestions.filter((rq) =>
      selectedDifficulties.has(rq.difficulty)
    )

    const built = buildMultipleChoiceQuestions(filteredItems)
    setQuestions(built)
    setSelectedAnswers({})

    const builtSummary = buildSummaryQuestions(filteredSummaryQuestions)
    setBuiltSummaryQuestions(builtSummary)
    setSelectedSummaryAnswers({})

    const builtReading = buildReadingQuestions(filteredReadingQuestions)
    setBuiltReadingQuestions(builtReading)
    setSelectedReadingAnswers({})

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
          items: filteredItems,
          questions: built,
          sentences,
          essayQuestions,
          summaryQuestions: builtSummary,
          readingQuestions: builtReading,
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

  function handleSummarySelect(questionIndex: number, choiceIndex: number) {
    setSelectedSummaryAnswers((prev) => ({ ...prev, [questionIndex]: choiceIndex }))
  }

  function handleReadingSelect(questionIndex: number, choiceIndex: number) {
    setSelectedReadingAnswers((prev) => ({ ...prev, [questionIndex]: choiceIndex }))
  }

  function toggleAnswerVisible(id: string) {
    setOpenAnswerIds((prev) => ({ ...prev, [id]: !prev[id] }))
  }

  // 난이도 체크박스 토글 함수
  function toggleDifficulty(level: string) {
    setSelectedDifficulties((prev) => {
      const next = new Set(prev)
      if (next.has(level)) {
        next.delete(level)
      } else {
        next.add(level)
      }
      return next
    })
  }

  // 학생용 시험지(객관식) / 서술형 시험지 / 교사용 정답지를 새 탭으로 여는 함수
  function handlePrint(mode: 'exam' | 'answer' | 'essay') {
    const printData = {
      mode,
      grade,
      passage,
      questions,
      summaryQuestions: builtSummaryQuestions,
      readingQuestions: builtReadingQuestions,
      essayQuestions,
      sentences,
    }
    sessionStorage.setItem('printData', JSON.stringify(printData))
    window.open('/ai-passage/print', '_blank')
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

          {/* 난이도 필터 체크박스 */}
          <div className="flex items-center gap-4 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-sm">
            <span className="text-gray-500">난이도 필터:</span>
            {(['beginner', 'intermediate', 'advanced'] as const).map((level) => (
              <label key={level} className="flex cursor-pointer items-center gap-1.5">
                <input
                  type="checkbox"
                  checked={selectedDifficulties.has(level)}
                  onChange={() => toggleDifficulty(level)}
                />
                <span>{getDifficultyLabel(level)}</span>
              </label>
            ))}
          </div>

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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-800">
              생성된 문제 ({questions.length}개)
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePrint('exam')}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
              >
                객관식 시험지 보기
              </button>
              <button
                type="button"
                onClick={() => handlePrint('answer')}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                정답지 보기 (교사용)
              </button>
            </div>
          </div>
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

      {builtSummaryQuestions.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            지문요약 문제 ({builtSummaryQuestions.length}개)
          </h2>
          <p className="text-xs text-gray-400">
            * 지문 전체를 읽고 빈칸에 알맞은 표현을 고르는 객관식 문제예요.
          </p>
          {builtSummaryQuestions.map((sq, sIndex) => {
            const selected = selectedSummaryAnswers[sIndex]
            return (
              <div key={sIndex} className="rounded border border-gray-300 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-pink-100 px-1.5 py-0.5 text-[11px] font-medium text-pink-800">
                    지문요약
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(sq.difficulty)}`}>
                    {getDifficultyLabel(sq.difficulty)}
                  </span>
                </div>
                <p className="mb-2 font-medium">
                  S{sIndex + 1}. {sq.summaryText}
                </p>
                <div className="space-y-1">
                  {sq.choices.map((choice, choiceIndex) => {
                    const isSelected = selected === choiceIndex
                    const isCorrect = choiceIndex === sq.correctIndex
                    let style = 'border-gray-300'
                    if (selected !== undefined) {
                      if (isCorrect) style = 'border-green-500 bg-green-50'
                      else if (isSelected) style = 'border-red-500 bg-red-50'
                    }
                    return (
                      <button
                        key={choiceIndex}
                        type="button"
                        onClick={() => handleSummarySelect(sIndex, choiceIndex)}
                        className={`block w-full rounded border px-3 py-2 text-left text-sm ${style}`}
                      >
                        {CHOICE_MARK[choiceIndex]} {choice}
                      </button>
                    )
                  })}
                </div>
                {selected !== undefined && sq.explanation && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-500">
                    {sq.explanation}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {builtReadingQuestions.length > 0 && (
        <div className="mt-8 space-y-4">
          <h2 className="text-lg font-semibold text-gray-800">
            독해 문제 ({builtReadingQuestions.length}개)
          </h2>
          <p className="text-xs text-gray-400">
            * 지문 전체를 읽고 푸는 주제·제목·분위기·요지·내용일치 문제예요.
          </p>
          {builtReadingQuestions.map((rq, rIndex) => {
            const selected = selectedReadingAnswers[rIndex]
            return (
              <div key={rIndex} className="rounded border border-gray-300 p-4">
                <div className="mb-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-800">
                    독해 · {rq.type}
                  </span>
                  <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(rq.difficulty)}`}>
                    {getDifficultyLabel(rq.difficulty)}
                  </span>
                </div>
                <p className="mb-2 font-medium">
                  R{rIndex + 1}. {buildReadingQuestionPrompt(rq.type)}
                </p>
                <div className="space-y-1">
                  {rq.choices.map((choice, choiceIndex) => {
                    const isSelected = selected === choiceIndex
                    const isCorrect = choiceIndex === rq.correctIndex
                    let style = 'border-gray-300'
                    if (selected !== undefined) {
                      if (isCorrect) style = 'border-green-500 bg-green-50'
                      else if (isSelected) style = 'border-red-500 bg-red-50'
                    }
                    return (
                      <button
                        key={choiceIndex}
                        type="button"
                        onClick={() => handleReadingSelect(rIndex, choiceIndex)}
                        className={`block w-full rounded border px-3 py-2 text-left text-sm ${style}`}
                      >
                        {CHOICE_MARK[choiceIndex]} {choice}
                      </button>
                    )
                  })}
                </div>
                {selected !== undefined && rq.explanation && (
                  <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-500">
                    {rq.explanation}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}

      {essayQuestions.length > 0 && (
        <div className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-gray-800">
              서술형 문제 미리보기 ({essayQuestions.length}개)
            </h2>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => handlePrint('essay')}
                className="rounded-md bg-teal-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-teal-700"
              >
                서술형 시험지 보기
              </button>
              <button
                type="button"
                onClick={() => handlePrint('answer')}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
              >
                정답지 보기 (교사용)
              </button>
            </div>
          </div>
          <p className="text-xs text-gray-400">
            * 서술형 시험지는 지문 없이 문제만 독립적으로 인쇄돼요. (답 유출 방지)
          </p>
          {essayQuestions.map((eq, index) => {
            const isAnswerOpen = !!openAnswerIds[eq.id]
            return (
              <div key={eq.id} className="rounded border border-gray-300 p-4">
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
                  E{index + 1}. {eq.prompt}
                </p>

                {eq.conditions && (
                  <div className="mb-2 rounded border border-dashed border-gray-300 p-2 text-xs text-gray-500">
                    조건: {eq.conditions}
                  </div>
                )}

                <div className="mt-2 space-y-1">
                  {Array.from({ length: eq.answerLines || 1 }).map((_, lineIdx) => (
                    <div key={lineIdx} className="h-6 border-b border-gray-300" />
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => toggleAnswerVisible(eq.id)}
                  className="mt-3 rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                >
                  {isAnswerOpen ? '모범답안/채점기준 숨기기' : '모범답안/채점기준 보기 (교사용)'}
                </button>

                {isAnswerOpen && (
                  <div className="mt-3 space-y-2 rounded bg-gray-50 p-3 text-sm">
                    <p>
                      <span className="font-medium text-gray-700">모범답안: </span>
                      <span className="text-gray-600">{eq.modelAnswer}</span>
                    </p>
                    {eq.rubric && eq.rubric.length > 0 && (
                      <div>
                        <span className="font-medium text-gray-700">채점 기준:</span>
                        <ul className="mt-1 list-disc pl-5 text-gray-600">
                          {eq.rubric.map((r, rIdx) => (
                            <li key={rIdx}>
                              {r.criteria} ({r.points}점)
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {eq.partialCreditNotes && (
                      <p className="text-gray-500">
                        <span className="font-medium text-gray-700">부분점수: </span>
                        {eq.partialCreditNotes}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}