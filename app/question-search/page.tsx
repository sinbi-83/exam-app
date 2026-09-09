'use client'

import { useState } from 'react'
import { getTypeHighlightClass } from '@/lib/tagDisplay'

const GRADE_OPTIONS = [
  '전체',
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

const DIFFICULTY_OPTIONS: { value: number; label: string }[] = [
  { value: 2, label: '초급' },
  { value: 3, label: '중급' },
  { value: 4, label: '고급' },
]

const CATEGORY_OPTIONS: { value: string; label: string }[] = [
  { value: 'vocab', label: '어휘' },
  { value: 'grammar', label: '어법' },
  { value: 'summary', label: '지문요약' },
  { value: 'reading', label: '독해' },
  { value: 'essay', label: '서술형' },
]

interface QuestionRow {
  id: string
  question_set_id: string
  question_type: string
  question_text: string
  choices: string[] | null
  correct_answer: string | null
  explanation: string | null
  grade: string
  topic: string
  difficulty: number | null
  created_at: string
}

interface PassageGroup {
  key: string
  items: QuestionRow[]
}

const CHOICE_MARK = ['①', '②', '③', '④', '⑤']

function getDifficultyLabel(value: number | null): string {
  if (value === 2) return '초급'
  if (value === 3) return '중급'
  if (value === 4) return '고급'
  return '-'
}

function getDifficultyBadgeClass(value: number | null): string {
  if (value === 2) return 'bg-green-100 text-green-700'
  if (value === 3) return 'bg-yellow-100 text-yellow-700'
  if (value === 4) return 'bg-red-100 text-red-700'
  return 'bg-gray-100 text-gray-500'
}

function getCategoryLabel(type: string): string {
  if (type === 'vocab') return '어휘'
  if (type === 'grammar') return '어법'
  if (type === 'summary') return '지문요약'
  if (type.startsWith('reading_')) return `독해·${type.replace('reading_', '')}`
  if (type.startsWith('essay_')) return `서술형·${type.replace('essay_', '')}`
  return type
}

function getCategoryBadgeClass(type: string): string {
  if (type === 'vocab') return 'bg-yellow-100 text-yellow-800'
  if (type === 'grammar') return 'bg-blue-100 text-blue-800'
  if (type === 'summary') return 'bg-pink-100 text-pink-800'
  if (type.startsWith('reading_')) return 'bg-emerald-100 text-emerald-800'
  if (type.startsWith('essay_')) return 'bg-teal-100 text-teal-800'
  return 'bg-gray-100 text-gray-600'
}

function matchesCategory(type: string, selected: Set<string>): boolean {
  if (type === 'vocab' && selected.has('vocab')) return true
  if (type === 'grammar' && selected.has('grammar')) return true
  if (type === 'summary' && selected.has('summary')) return true
  if (type.startsWith('reading_') && selected.has('reading')) return true
  if (type.startsWith('essay_') && selected.has('essay')) return true
  return false
}

// 검색 결과를 "같은 지문에서 나온 문항끼리" 묶어주는 함수
function groupByPassage(rows: QuestionRow[]): PassageGroup[] {
  const order: string[] = []
  const map: Record<string, QuestionRow[]> = {}
  for (const q of rows) {
    const key = q.question_set_id || 'unknown'
    if (!map[key]) {
      map[key] = []
      order.push(key)
    }
    map[key].push(q)
  }
  return order.map((key) => ({ key, items: map[key] }))
}

// question_text 안의 "따옴표로 감싼 부분"을 추출
function extractQuoted(text: string): string | null {
  const match = text.match(/"([^"]+)"/)
  return match ? match[1] : null
}

// 지문 안에서 어휘/어법 문제가 가리키는 부분을 찾아 하이라이트 세그먼트로 나누는 함수
function buildPassageSegments(passage: string, items: QuestionRow[]) {
  type Match = { start: number; end: number; type: string }
  const matches: Match[] = []

  for (const item of items) {
    if (item.question_type !== 'vocab' && item.question_type !== 'grammar') continue
    const target = extractQuoted(item.question_text)
    if (!target) continue
    const idx = passage.indexOf(target)
    if (idx === -1) continue
    matches.push({ start: idx, end: idx + target.length, type: item.question_type })
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

  const segments: { text: string; type?: string }[] = []
  let cursor = 0
  for (const m of cleaned) {
    if (m.start > cursor) segments.push({ text: passage.slice(cursor, m.start) })
    segments.push({ text: passage.slice(m.start, m.end), type: m.type })
    cursor = m.end
  }
  if (cursor < passage.length) segments.push({ text: passage.slice(cursor) })

  return segments
}

export default function QuestionSearchPage() {
  const [grade, setGrade] = useState('전체')
  const [selectedDifficulties, setSelectedDifficulties] = useState<Set<number>>(
    new Set([2, 3, 4])
  )
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(['vocab', 'grammar', 'summary', 'reading', 'essay'])
  )
  const [results, setResults] = useState<QuestionRow[]>([])
  const [passages, setPassages] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  function toggleDifficulty(value: number) {
    setSelectedDifficulties((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  function toggleCategory(value: string) {
    setSelectedCategories((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }

  async function handleSearch() {
    setLoading(true)
    setSearched(true)
    try {
      const params = new URLSearchParams()
      if (grade !== '전체') params.set('grade', grade)
      if (selectedDifficulties.size > 0 && selectedDifficulties.size < 3) {
        params.set('difficulties', Array.from(selectedDifficulties).join(','))
      }

      const res = await fetch(`/api/questions/search?${params.toString()}`)
      const data = await res.json()

      if (!res.ok) {
        alert(data.error || '검색에 실패했습니다.')
        setResults([])
        setPassages({})
        return
      }

      const filtered = (data.data || []).filter((q: QuestionRow) =>
        matchesCategory(q.question_type, selectedCategories)
      )
      setResults(filtered)
      setPassages(data.passages || {})
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setLoading(false)
    }
  }

  // 인쇄 데이터를 만들어서 새 탭으로 여는 함수
  function handlePrint(mode: 'exam' | 'answer') {
    const printGroups = groups.map((group) => ({
      passage: passages[group.key] || '',
      items: group.items.map((q, idx) => ({
        number: idx + 1,
        question_type: q.question_type,
        question_text: q.question_text,
        choices: q.choices,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
      })),
    }))
    sessionStorage.setItem('searchPrintData', JSON.stringify({ mode, groups: printGroups }))
    window.open('/question-search/print', '_blank')
  }

  const groups = groupByPassage(results)

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">문항 검색</h1>
      <p className="mb-6 text-sm text-gray-400">
        지금까지 만든 모든 지문의 문항을 유형·난이도·학년으로 검색해요.
      </p>

      <div className="mb-6 space-y-4 rounded-lg border border-gray-200 bg-white p-5">
        <div>
          <label className="mb-1 block text-sm text-gray-600">학년</label>
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </div>

        <div>
          <p className="mb-1 text-sm text-gray-600">난이도</p>
          <div className="flex gap-4">
            {DIFFICULTY_OPTIONS.map((d) => (
              <label key={d.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedDifficulties.has(d.value)}
                  onChange={() => toggleDifficulty(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1 text-sm text-gray-600">유형</p>
          <div className="flex flex-wrap gap-4">
            {CATEGORY_OPTIONS.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedCategories.has(c.value)}
                  onChange={() => toggleCategory(c.value)}
                />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={handleSearch}
          disabled={loading}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? '검색 중...' : '검색하기'}
        </button>
      </div>

      {searched && !loading && results.length > 0 && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-gray-500">검색 결과 {results.length}개</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handlePrint('exam')}
              className="rounded-md bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              🖨 시험지 인쇄
            </button>
            <button
              type="button"
              onClick={() => handlePrint('answer')}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
            >
              정답지 인쇄
            </button>
          </div>
        </div>
      )}

      {searched && !loading && results.length === 0 && (
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          조건에 맞는 문항이 없습니다.
        </p>
      )}

      <div className="space-y-8">
        {groups.map((group) => {
          const passageText = passages[group.key]
          const segments = passageText ? buildPassageSegments(passageText, group.items) : []

          return (
            <div key={group.key}>
              {passageText && (
                <div className="mb-3">
                  <p className="mb-1 text-xs font-medium text-gray-400">
                    📄 아래 문항들의 원본 지문 (밑줄 표시는 어휘·어법 문제가 가리키는 부분이에요)
                  </p>
                  <div className="whitespace-pre-wrap rounded-lg border border-gray-300 bg-gray-50 p-4 text-sm leading-7 text-gray-700">
                    {segments.map((seg, idx) =>
                      seg.type ? (
                        <span
                          key={idx}
                          className={`${getTypeHighlightClass(seg.type)} rounded px-0.5`}
                        >
                          {seg.text}
                        </span>
                      ) : (
                        <span key={idx}>{seg.text}</span>
                      )
                    )}
                  </div>
                  
                    <a
                    href={`/questions/${group.key}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-1 inline-block text-[11px] text-blue-500 hover:underline"
                  >
                    이 지문 상세페이지 열기 (하이라이트·정답 포함) →
                  </a>
                </div>
              )}

              <div className="space-y-3">
                {group.items.map((q, qIndex) => (
                  <div key={q.id} className="rounded-lg border border-gray-200 bg-white p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-1.5">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getCategoryBadgeClass(
                          q.question_type
                        )}`}
                      >
                        {getCategoryLabel(q.question_type)}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${getDifficultyBadgeClass(
                          q.difficulty
                        )}`}
                      >
                        {getDifficultyLabel(q.difficulty)}
                      </span>
                      <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                        {q.grade}
                      </span>
                      {q.topic && (
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
                          {q.topic}
                        </span>
                      )}
                    </div>

                    <p className="mb-2 text-sm font-medium text-gray-800">
                      {qIndex + 1}. {q.question_text}
                    </p>

                    {q.choices && q.choices.length > 0 ? (
                      <div className="space-y-1 pl-2">
                        {q.choices.map((choice, idx) => (
                          <p
                            key={idx}
                            className={
                              choice === q.correct_answer
                                ? 'text-sm font-medium text-green-700'
                                : 'text-sm text-gray-700'
                            }
                          >
                            {CHOICE_MARK[idx]} {choice}
                            {choice === q.correct_answer ? ' (정답)' : ''}
                          </p>
                        ))}
                      </div>
                    ) : (
                      q.correct_answer && (
                        <p className="text-sm">
                          <span className="font-medium text-gray-700">모범답안: </span>
                          <span className="text-green-700">{q.correct_answer}</span>
                        </p>
                      )
                    )}

                    {q.explanation && (
                      <p className="mt-2 border-t border-gray-100 pt-2 text-sm text-gray-500">
                        {q.explanation}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}