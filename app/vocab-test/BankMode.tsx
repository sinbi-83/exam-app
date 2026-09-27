'use client'

// 단어은행에서 자동 생성 → 미리보기(빼기/교체) → 시험 저장(exams + exam_questions) → 인쇄
// "이번 시험에서 빼기"는 이 시험 초안에서만 빠진다. 단어은행의 상태(반려 등)는 바꾸지 않는다 → 반려는 /vocabulary 에서.

import { useMemo, useState } from 'react'
import type { VocabularyEntryRecord } from '@/types/vocabulary'
import type { PassageVariantLevel } from '@/types/passageBank'
import { VARIANT_LABELS } from '@/types/passageBank'
import { findDifficultyBand, gradesWithBands, VOCABULARY_BANDS_NOTE, type VocabularyGrade } from '@/config/vocabularyLevels'
import {
  generateWordTest,
  pickReplacement,
  POS_LABELS_KO,
  toWordQuestionData,
  WORD_TEST_MODE_LABELS,
  type WordTestItem,
  type WordTestMode,
} from '@/lib/wordTest'

const LEVELS: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']

export default function BankMode() {
  const grades = gradesWithBands()
  const [grade, setGrade] = useState<VocabularyGrade>(grades[0] ?? '중1')
  const [level, setLevel] = useState<PassageVariantLevel>('school')
  const [count, setCount] = useState('20')
  const [mode, setMode] = useState<WordTestMode>('en_ko')
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [points, setPoints] = useState('5')

  const [entries, setEntries] = useState<VocabularyEntryRecord[] | null>(null)
  const [items, setItems] = useState<WordTestItem[]>([])
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [generated, setGenerated] = useState(false)
  const [notice, setNotice] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedExam, setSavedExam] = useState<{ id: string; title: string; date: string } | null>(null)

  // 현재 임시 기준표는 영→한/한→영 범위가 같다. 방향별로 달라지면 이 부분을 방향별 범위로 바꾼다.
  const band = findDifficultyBand(grade, level, 'en_ko')
  const defaultTitle = `${grade} ${VARIANT_LABELS[level]} 단어시험 (${WORD_TEST_MODE_LABELS[mode]})`

  async function loadEntries(): Promise<VocabularyEntryRecord[]> {
    if (entries) return entries
    const res = await fetch('/api/vocabulary?status=approved')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '단어은행을 불러오지 못했습니다.')
    setEntries(json.data ?? [])
    return json.data ?? []
  }

  async function generate() {
    setError('')
    setNotice('')
    setSavedExam(null)
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > 100) return setError('문제 수는 1~100 사이로 입력하세요.')
    if (!band) return setError(`${grade} ${VARIANT_LABELS[level]} 난이도 기준이 아직 없습니다.`)
    setBusy(true)
    try {
      // 새로 만들 때마다 최신 단어은행을 다시 읽는다
      setEntries(null)
      const res = await fetch('/api/vocabulary?status=approved')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '단어은행을 불러오지 못했습니다.')
      const list: VocabularyEntryRecord[] = json.data ?? []
      setEntries(list)
      const result = generateWordTest(list, band, mode, n)
      setItems(result.items)
      setExcluded(new Set())
      setGenerated(true)
      if (result.shortage) {
        setNotice(`조건에 맞는 단어가 ${result.items.length}개입니다. (요청 ${n}개 — 다른 레벨 단어로 채우지 않았습니다)`)
      }
      if (!title.trim()) setTitle(defaultTitle)
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  function removeItem(i: number) {
    const id = items[i].entry.id
    setExcluded((prev) => new Set(prev).add(id))
    setItems((prev) => prev.filter((_, idx) => idx !== i))
    setNotice('')
  }

  async function replaceItem(i: number) {
    if (!band) return
    const list = await loadEntries()
    const next = pickReplacement(list, band, items, i, excluded)
    if (!next) {
      setNotice(`${i + 1}번을 바꿀 수 있는 다른 단어가 없습니다.`)
      return
    }
    setExcluded((prev) => new Set(prev).add(items[i].entry.id))
    setItems((prev) => prev.map((it, idx) => (idx === i ? next : it)))
    setNotice('')
  }

  async function save() {
    setError('')
    const p = Number(points)
    if (!Number.isInteger(p) || p < 1 || p > 100) return setError('문항당 배점은 1~100 정수로 입력하세요.')
    if (items.length === 0) return setError('저장할 문항이 없습니다.')
    const finalTitle = title.trim() || defaultTitle
    setBusy(true)
    try {
      const res = await fetch('/api/vocabulary/word-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: finalTitle,
          exam_date: examDate || null,
          points_per_question: p,
          questions: items.map(toWordQuestionData),
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      setSavedExam({ id: json.data.exam_id, title: finalTitle, date: examDate })
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
    } finally {
      setBusy(false)
    }
  }

  const printUrl = useMemo(
    () =>
      savedExam
        ? `/exams/${savedExam.id}/print?exam_id=${savedExam.id}&title=${encodeURIComponent(savedExam.title)}&date=${encodeURIComponent(savedExam.date)}`
        : '',
    [savedExam],
  )

  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`

  return (
    <div className="grid gap-6 md:grid-cols-[320px_1fr]">
      {/* 조건 */}
      <div className="space-y-4">
        <p className="rounded bg-amber-50 px-3 py-2 text-xs text-amber-700">레벨 범위: {VOCABULARY_BANDS_NOTE}</p>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">학년</label>
          <select value={grade} onChange={(e) => setGrade(e.target.value as VocabularyGrade)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {grades.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">레벨</label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const b = findDifficultyBand(grade, l, 'en_ko')
              return (
                <button key={l} onClick={() => setLevel(l)} className={pill(level === l)}>
                  {VARIANT_LABELS[l]}{b ? <span className="ml-1 text-[10px] opacity-70">{b.min}~{b.max}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">문제 수</label>
          <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" className="w-24 rounded border border-gray-300 px-3 py-2 text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">방향</label>
          <div className="flex gap-2">
            {(['en_ko', 'ko_en', 'mixed'] as WordTestMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={pill(mode === m)}>{WORD_TEST_MODE_LABELS[m]}</button>
            ))}
          </div>
          {mode === 'mixed' && <p className="mt-1 text-xs text-gray-400">한→영 가능한 단어로 절반까지 한→영, 나머지는 영→한</p>}
        </div>
        <button
          onClick={generate}
          disabled={busy}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {generated ? '다시 생성' : '단어 자동 선택'}
        </button>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>

      {/* 미리보기 */}
      <div className="space-y-4">
        {!generated ? (
          <div className="flex h-48 items-center justify-center rounded-lg border border-dashed border-gray-200 text-sm text-gray-400">
            조건을 고르고 “단어 자동 선택”을 누르세요
          </div>
        ) : (
          <>
            {notice && <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700">{notice}</div>}
            <div>
              <p className="mb-2 text-sm font-medium text-gray-700">
                미리보기 ({items.length}문항) <span className="text-xs font-normal text-gray-400">— 아직 저장되지 않았습니다</span>
              </p>
              <p className="mb-2 text-xs text-gray-400">“빼기”는 이번 시험에서만 빠집니다. 단어은행에는 그대로 남습니다 (반려는 단어은행 화면에서).</p>
              {items.length === 0 ? (
                <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-500">문항이 없습니다.</div>
              ) : (
                <div className="overflow-x-auto rounded border border-gray-200 bg-white">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                        <th className="px-2 py-2 text-left">#</th>
                        <th className="px-2 py-2 text-left">방향</th>
                        <th className="px-2 py-2 text-left">문제</th>
                        <th className="px-2 py-2 text-left">정답</th>
                        <th className="px-2 py-2 text-right">난이도</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, i) => {
                        const q = toWordQuestionData(it)
                        return (
                          <tr key={it.entry.id} className="border-b border-gray-100 last:border-0">
                            <td className="px-2 py-1.5 text-gray-400">{i + 1}</td>
                            <td className="px-2 py-1.5 text-xs">
                              <span className={`rounded px-1.5 py-0.5 ${it.direction === 'en_ko' ? 'bg-blue-50 text-blue-700' : 'bg-purple-50 text-purple-700'}`}>
                                {WORD_TEST_MODE_LABELS[it.direction]}
                              </span>
                            </td>
                            <td className="px-2 py-1.5 text-gray-800">
                              {q.question}
                              {it.entry.pos && <span className="ml-1 text-xs text-gray-400">({POS_LABELS_KO[it.entry.pos]})</span>}
                            </td>
                            <td className="px-2 py-1.5 text-gray-600">
                              {q.answer}
                              {q.accepted_answers.length > 1 && (
                                <span className="ml-1 text-xs text-gray-400">/ {q.accepted_answers.slice(1).join(', ')}</span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right text-gray-500">{it.entry.base_difficulty}</td>
                            <td className="whitespace-nowrap px-2 py-1.5 text-right">
                              {!savedExam && <>
                              <button onClick={() => replaceItem(i)} className="mr-2 text-xs text-blue-600 hover:underline">교체</button>
                              <button onClick={() => removeItem(i)} className="text-xs text-gray-500 hover:text-red-500">빼기</button>
                              </>}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block sm:col-span-3">
                <span className="mb-1 block text-sm font-medium text-gray-700">시험 제목</span>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={defaultTitle} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">시험일 (선택)</span>
                <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-gray-700">문항당 배점</span>
                <input value={points} onChange={(e) => setPoints(e.target.value)} inputMode="numeric" className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
              </label>
              <div className="flex items-end text-sm text-gray-500">
                총 {items.length}문항 / {items.length * (Number(points) || 0)}점
              </div>
            </div>

            {savedExam ? (
              <div className="space-y-2 rounded border border-green-200 bg-green-50 p-4 text-sm text-green-700">
                <p>✅ 시험을 저장했습니다: {savedExam.title}</p>
                <div className="flex gap-2">
                  <a href={`/exams/${savedExam.id}`} className="rounded border border-green-600 px-3 py-1.5 text-green-700 hover:bg-green-100">저장된 시험 열기</a>
                  <a href={printUrl} target="_blank" rel="noopener noreferrer" className="rounded bg-green-600 px-3 py-1.5 text-white hover:bg-green-700">🖨️ 인쇄 화면</a>
                </div>
              </div>
            ) : (
              <button
                onClick={save}
                disabled={busy || items.length === 0}
                className="w-full rounded bg-green-600 py-2.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
              >
                시험 저장
              </button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
