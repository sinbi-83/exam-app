'use client'

// 단어은행에서 자동 생성 → 미리보기(빼기/교체) → 시험 저장(exams + exam_questions) → 인쇄
// "이번 시험에서 빼기"는 이 시험 초안에서만 빠진다. 단어은행의 상태(반려 등)는 바꾸지 않는다 → 반려는 /vocabulary 에서.

import { useMemo, useReducer, useRef, useState } from 'react'
import type { VocabularyEntryRecord } from '@/types/vocabulary'
import type { PassageVariantLevel } from '@/types/passageBank'
import { VARIANT_LABELS } from '@/types/passageBank'
import { DRAFT_BAND_LABEL, findDifficultyBand, gradesWithBands, isDraftBandGrade, VOCABULARY_BANDS_NOTE, type VocabularyGrade } from '@/config/vocabularyLevels'
import {
  generateWordTest,
  pickReplacement,
  POS_LABELS_KO,
  toWordQuestionData,
  WORD_TEST_MODE_LABELS,
  type WordTestMode,
} from '@/lib/wordTest'
import { generalTestCandidates } from '@/lib/vocabularyCalibration'
import { draftIsCurrent, initialWordTestDraft, wordTestDraftReducer, type WordTestConditions } from '@/lib/wordTestDraft'

// 목록 API 는 출처 식별값도 함께 준다 (Calibration 전용 단어 제외용)
type BankEntry = VocabularyEntryRecord & { vocabulary_sources?: { source_ref: string }[] }

const LEVELS: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']
const COUNT_PRESETS = [20, 40, 60, 80]

export default function BankMode() {
  const grades = gradesWithBands()
  // 학년·레벨·방향 + 미리보기 문항은 한 덩어리(초안)로 관리한다 → 조건이 바뀌면 미리보기가 반드시 비워진다 (lib/wordTestDraft.ts)
  const [draft, dispatch] = useReducer(
    wordTestDraftReducer,
    // 처음 고른 학년은 승인된 범위표 학년 중 첫째 (초안 학년이 늘어도 기본값은 그대로)
    { grade: grades.find((g) => !isDraftBandGrade(g)) ?? grades[0] ?? '중1', level: 'school', mode: 'en_ko' },
    initialWordTestDraft,
  )
  const grade = draft.conditions.grade as VocabularyGrade
  const level = draft.conditions.level as PassageVariantLevel
  const mode = draft.conditions.mode
  const items = draft.items
  const generated = draft.generatedFor !== null
  const [count, setCount] = useState('40')
  // 직접 입력한 제목만 보관한다. 비어 있으면 "만들 때의 조건"으로 기본 제목을 쓴다 (예전엔 첫 생성 제목이 고정됐음)
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [points, setPoints] = useState('5')

  const [entries, setEntries] = useState<VocabularyEntryRecord[] | null>(null)
  const [notice, setNotice] = useState<string>('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedExam, setSavedExam] = useState<{ id: string; title: string; date: string } | null>(null)
  // 가장 최근 초안 번호 (비동기 결과가 늦게 와도 최신 번호와 비교해 버린다)
  const seqRef = useRef(draft.seq)
  seqRef.current = draft.seq

  // 지금 기준표(초안)는 영→한/한→영 범위가 같다. 방향별로 달라지면 이 부분을 방향별 범위로 바꾼다.
  const band = findDifficultyBand(grade, level, 'en_ko')
  const titleFor = (c: WordTestConditions) =>
    `${c.grade} ${VARIANT_LABELS[c.level as PassageVariantLevel]} 단어시험 (${WORD_TEST_MODE_LABELS[c.mode]})`
  const defaultTitle = titleFor(draft.generatedFor ?? draft.conditions)

  function changeConditions(patch: Partial<WordTestConditions>) {
    dispatch({ type: 'setConditions', patch })
    // 이전 기준의 결과·안내·저장 표시를 모두 지운다
    setNotice('')
    setError('')
    setSavedExam(null)
  }

  async function fetchCandidates(): Promise<VocabularyEntryRecord[]> {
    const res = await fetch('/api/vocabulary?status=approved', { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '단어은행을 불러오지 못했습니다.')
    // Calibration anchor 전용 단어(난이도 자 검수용)는 일반 단어시험 후보에서 뺀다
    return generalTestCandidates<BankEntry>(json.data ?? [])
  }

  async function loadEntries(): Promise<VocabularyEntryRecord[]> {
    if (entries) return entries
    const list = await fetchCandidates()
    setEntries(list)
    return list
  }

  async function generate() {
    setError('')
    setNotice('')
    setSavedExam(null)
    const n = Number(count)
    if (!Number.isInteger(n) || n < 1 || n > 100) return setError('문제 수는 1~100 사이로 입력하세요.')
    if (!band) return setError(`${grade} ${VARIANT_LABELS[level]} 난이도 기준이 아직 없습니다.`)
    // 누른 순간의 조건과 범위를 고정해서 쓴다
    const conditions = draft.conditions
    const bandAtClick = band
    const seq = draft.seq + 1
    dispatch({ type: 'generateStart' })
    seqRef.current = seq
    setBusy(true)
    try {
      // 새로 만들 때마다 최신 단어은행을 다시 읽는다
      const list = await fetchCandidates()
      setEntries(list)
      if (seqRef.current !== seq) return // 기다리는 동안 조건이 바뀌었다 → 옛 결과는 버린다
      const result = generateWordTest(list, bandAtClick, conditions.mode, n)
      dispatch({ type: 'generateDone', seq, conditions, items: result.items })
      if (result.shortage) {
        setNotice(`조건에 맞는 단어가 ${result.items.length}개입니다. (요청 ${n}개 — 다른 레벨 단어로 채우지 않았습니다)`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '생성 실패')
    } finally {
      setBusy(false)
    }
  }

  function removeItem(i: number) {
    dispatch({ type: 'remove', index: i })
    setNotice('')
  }

  async function replaceItem(i: number) {
    if (!band || !draftIsCurrent(draft)) return
    const list = await loadEntries()
    const next = pickReplacement(list, band, items, i, new Set(draft.excluded))
    if (!next) {
      setNotice(`${i + 1}번을 바꿀 수 있는 다른 단어가 없습니다.`)
      return
    }
    dispatch({ type: 'replace', index: i, item: next })
    setNotice('')
  }

  async function save() {
    setError('')
    const p = Number(points)
    if (!Number.isInteger(p) || p < 1 || p > 100) return setError('문항당 배점은 1~100 정수로 입력하세요.')
    if (!draftIsCurrent(draft)) return setError('조건이 바뀌었습니다. “단어 자동 선택”을 다시 눌러 주세요.')
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
        ? `/tests/${savedExam.id}/print?exam_id=${savedExam.id}&title=${encodeURIComponent(savedExam.title)}&date=${encodeURIComponent(savedExam.date)}`
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
          <select value={grade} onChange={(e) => changeConditions({ grade: e.target.value })} className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
            {grades.map((g) => <option key={g} value={g}>{g}{isDraftBandGrade(g) ? ' (승인 전 초안)' : ''}</option>)}
          </select>
          {isDraftBandGrade(grade) && (
            <p className="undecided-glow mt-1 inline-block rounded px-1.5 py-0.5 text-xs text-amber-700">{grade} 레벨 범위는 {DRAFT_BAND_LABEL}입니다.</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">레벨</label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => {
              const b = findDifficultyBand(grade, l, 'en_ko')
              return (
                <button key={l} onClick={() => changeConditions({ level: l })} className={pill(level === l)}>
                  {VARIANT_LABELS[l]}{b ? <span className="ml-1 text-[10px] opacity-70">{b.min}~{b.max}</span> : null}
                </button>
              )
            })}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">문제 수</label>
          <div className="flex flex-wrap items-center gap-2">
            <input value={count} onChange={(e) => setCount(e.target.value)} inputMode="numeric" className="w-20 rounded border border-gray-300 px-3 py-2 text-sm" />
            {COUNT_PRESETS.map((c) => (
              <button key={c} onClick={() => setCount(String(c))} className={pill(count === String(c))}>{c}</button>
            ))}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-700">방향</label>
          <div className="flex gap-2">
            {(['en_ko', 'ko_en', 'mixed'] as WordTestMode[]).map((m) => (
              <button key={m} onClick={() => changeConditions({ mode: m })} className={pill(mode === m)}>{WORD_TEST_MODE_LABELS[m]}</button>
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
                미리보기 ({items.length}문항)
                {draft.generatedFor && (
                  <span className="ml-1 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-normal text-blue-700">
                    {draft.generatedFor.grade} {VARIANT_LABELS[draft.generatedFor.level as PassageVariantLevel]} · {WORD_TEST_MODE_LABELS[draft.generatedFor.mode]} 기준
                    {band ? ` (난이도 ${band.min}~${band.max})` : ''}
                  </span>
                )}{' '}
                <span className="text-xs font-normal text-gray-400">— 아직 저장되지 않았습니다</span>
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
                  <a href={`/tests/${savedExam.id}`} className="rounded border border-green-600 px-3 py-1.5 text-green-700 hover:bg-green-100">저장된 시험 열기</a>
                  <a href={printUrl} target="_blank" rel="noopener noreferrer" className="rounded bg-green-600 px-3 py-1.5 text-white hover:bg-green-700">🖨️ 시험지 인쇄</a>
                  <a href={`${printUrl}&sheet=study`} target="_blank" rel="noopener noreferrer" className="rounded bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700">📘 학습지 인쇄</a>
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
