'use client'

// 시험 출제 > 혼합 시험 (7단계): 지문 1개 + 유형(객관식/주관식/문법)·레벨별 문항 + 단어 문항 → 시험지 한 장.
// 설계: docs/design-plan.md '7단계 혼합 출제'. 저장은 기존 exams + exam_questions (POST /api/exams/mixed).
// - 다른 지문에서 채우지 않는다. 단어는 '사용 중' 단어만 (저장 API 가 DB 로 한 번 더 확인).
// - 조건을 바꾸면 미리보기를 비우고, 늦게 도착한 결과는 버린다 (lib/mixedTestDraft.ts, wordTestDraft 와 같은 방식).

import { useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import type { VocabularyEntryRecord } from '@/types/vocabulary'
import { VARIANT_LABELS, type PassageVariantLevel } from '@/types/passageBank'
import {
  DRAFT_BAND_LABEL,
  findDifficultyBand,
  gradesWithBands,
  isDraftBandGrade,
  type VocabularyGrade,
} from '@/config/vocabularyLevels'
import {
  gradeSortKey,
  PASSAGE_KIND_LABELS,
  UNIFIED_DIFFICULTY_LABELS,
  type UnifiedDifficulty,
  type UnifiedPassageRow,
} from '@/lib/passageUnified'
import {
  availability,
  expectedShortages,
  MIXED_CATEGORIES,
  MIXED_CATEGORY_LABELS,
  allocatePoints,
  MIXED_TOTAL_POINTS,
  pickPassageReplacement,
  pointsSummary,
  resolvePassageSource,
  selectPassageItems,
  type CategoryCounts,
  type MixedCandidate,
  type MixedCategory,
} from '@/lib/mixedTest'
import {
  initialMixedDraft,
  mixedDraftIsCurrent,
  mixedDraftReducer,
  mixedItemKey,
  type MixedConditions,
  type MixedDraftAction,
  type MixedDraftItem,
} from '@/lib/mixedTestDraft'
import { generateWordTest, pickReplacement, toWordQuestionData, WORD_TEST_MODE_LABELS, type WordTestItem } from '@/lib/wordTest'
import { generalTestCandidates } from '@/lib/vocabularyCalibration'

type BankEntry = VocabularyEntryRecord & { vocabulary_sources?: { source_ref: string }[] }
const LEVELS: PassageVariantLevel[] = ['school', 'academy', 'advanced', 'prestudy']
const DIFFS: UnifiedDifficulty[] = [1, 2, 3, 4]

export default function MixedTestPage() {
  const router = useRouter()
  const wordGrades = gradesWithBands()

  // ── 지문 목록 (통합 목록, 보관 제외) ──
  const [rows, setRows] = useState<UnifiedPassageRow[]>([])
  const [rowsLoading, setRowsLoading] = useState(true)
  const [rowsError, setRowsError] = useState('')
  const [kindFilter, setKindFilter] = useState<'all' | 'ai' | 'external'>('all')
  const [gradeFilter, setGradeFilter] = useState('all')

  useEffect(() => {
    fetch('/api/passages-unified', { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => (json.error ? setRowsError(json.error) : setRows((json.data ?? []).filter((r: UnifiedPassageRow) => !r.archived))))
      .catch(() => setRowsError('지문 목록을 불러오지 못했습니다.'))
      .finally(() => setRowsLoading(false))
  }, [])

  // ── 조건 + 미리보기 초안 ──
  const [draft, dispatch] = useReducer(
    mixedDraftReducer,
    {
      passageKey: null,
      level: 2,
      counts: { mc: 10, subjective: 3, grammar: 2 },
      word: { count: 10, grade: wordGrades.find((g) => !isDraftBandGrade(g)) ?? wordGrades[0] ?? '중1', level: 'academy', direction: 'en_ko' },
    } as MixedConditions,
    initialMixedDraft,
  )
  const c = draft.conditions
  const row = rows.find((r) => `${r.kind}:${r.id}` === c.passageKey) ?? null
  const source = row ? resolvePassageSource(row, c.level) : null
  const sourceKey = source ? `${source.kind}:${source.id}` : null

  // ── 고른 지문의 문항 후보 (지문·레벨이 바뀌면 다시 읽고, 늦게 온 응답은 버린다) ──
  const [cands, setCands] = useState<{ key: string; list: MixedCandidate[]; excludedLeak: number } | null>(null)
  const [candsError, setCandsError] = useState('')
  const candSeq = useRef(0)
  useEffect(() => {
    const seq = ++candSeq.current
    setCands(null)
    setCandsError('')
    if (!source || !sourceKey) return
    fetch(`/api/mixed-test/candidates?kind=${source.kind}&id=${source.id}`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((json) => {
        if (seq !== candSeq.current) return
        if (json.error) setCandsError(json.error)
        else setCands({ key: sourceKey, list: json.data ?? [], excludedLeak: json.excluded_leak ?? 0 })
      })
      .catch(() => seq === candSeq.current && setCandsError('문항을 불러오지 못했습니다.'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey])
  const candList = cands && cands.key === sourceKey ? cands.list : null
  const avail = candList ? availability(candList, c.level) : null
  const preShort = candList ? expectedShortages(candList, c.counts) : []

  // ── 단어 ──
  const [entries, setEntries] = useState<BankEntry[] | null>(null)
  const wordBand = findDifficultyBand(c.word.grade as VocabularyGrade, c.word.level as PassageVariantLevel, c.word.direction)
  async function fetchWords(): Promise<BankEntry[]> {
    // '사용 중' 단어만. Calibration 전용 단어는 뺀다 (단어시험과 같게)
    const res = await fetch('/api/vocabulary?status=approved', { cache: 'no-store' })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error ?? '단어은행을 불러오지 못했습니다.')
    return generalTestCandidates<BankEntry>(json.data ?? []).filter((e) => e.status === 'approved' && e.deleted_at === null)
  }

  // ── 뽑기 ──
  const seqRef = useRef(0)
  const [busy, setBusy] = useState(false)
  const [notices, setNotices] = useState<string[]>([])
  const [error, setError] = useState('')
  const [title, setTitle] = useState('')
  const [examDate, setExamDate] = useState('')
  const [points, setPoints] = useState('5')
  const [pointMode, setPointMode] = useState<'hundred' | 'fixed'>('hundred') // 기본: 100점으로 맞추기
  const [saving, setSaving] = useState(false)

  function change(patch: Extract<MixedDraftAction, { type: 'setConditions' }>['patch']) {
    dispatch({ type: 'setConditions', patch })
    setNotices([])
    setError('')
  }

  const passageTotal = MIXED_CATEGORIES.reduce((n, k) => n + c.counts[k], 0)

  async function generate() {
    setError('')
    setNotices([])
    if (!row) return setError('지문을 먼저 고르세요.')
    if (passageTotal === 0 && c.word.count === 0) return setError('문항 수를 1개 이상 정하세요.')
    if (passageTotal > 0 && !candList) return setError('지문 문항을 불러오는 중입니다. 잠시 뒤 다시 누르세요.')
    if (c.word.count > 0 && !wordBand) return setError(`${c.word.grade} ${VARIANT_LABELS[c.word.level as PassageVariantLevel]} 단어 범위가 아직 없습니다.`)
    // 누른 순간의 조건·후보·범위를 고정해서 쓴다
    const conditions = c
    const listAtClick = candList ?? []
    const bandAtClick = wordBand
    const seq = draft.seq + 1
    dispatch({ type: 'generateStart' })
    seqRef.current = seq
    setBusy(true)
    try {
      const passagePick = selectPassageItems(listAtClick, conditions.counts, conditions.level)
      let wordItems: WordTestItem[] = []
      let wordShort = false
      if (conditions.word.count > 0 && bandAtClick) {
        const list = await fetchWords()
        setEntries(list)
        if (seqRef.current !== seq) return // 기다리는 동안 조건이 바뀌었다 → 옛 결과는 버린다
        const r = generateWordTest(list, bandAtClick, conditions.word.direction, conditions.word.count)
        wordItems = r.items
        wordShort = r.shortage
      }
      if (seqRef.current !== seq) return
      const items: MixedDraftItem[] = [
        ...passagePick.items.map((candidate) => ({ source: 'passage' as const, candidate })),
        ...wordItems.map((item) => ({ source: 'word' as const, item })),
      ]
      dispatch({ type: 'generateDone', seq, conditions, items })
      const msgs: string[] = []
      for (const s of passagePick.shortages) {
        msgs.push(`${MIXED_CATEGORY_LABELS[s.category]}: 이 지문에 ${s.picked}개뿐이라 ${s.picked}개만 넣었습니다 (요청 ${s.requested}개, 다른 지문에서 채우지 않음).`)
      }
      if (passagePick.offLevel > 0) {
        msgs.push(`고른 레벨(${UNIFIED_DIFFICULTY_LABELS[conditions.level]}) 문항이 모자라 같은 지문의 다른 레벨 문항 ${passagePick.offLevel}개를 넣었습니다 (미리보기에 레벨 표시).`)
      }
      if (wordShort) {
        msgs.push(`단어: 조건에 맞는 '사용 중' 단어가 ${wordItems.length}개라 ${wordItems.length}개만 넣었습니다 (요청 ${conditions.word.count}개, 확인 필요 단어는 넣지 않음).`)
      }
      setNotices(msgs)
      if (!title) setTitle(`${row.title} 혼합 시험`)
    } catch (e) {
      if (seqRef.current === seq) setError(e instanceof Error ? e.message : '뽑기 실패')
    } finally {
      if (seqRef.current === seq) setBusy(false)
    }
  }

  function replace(index: number) {
    const it = draft.items[index]
    if (!it || !draft.generatedFor) return
    const excluded = new Set(draft.excluded)
    if (it.source === 'passage') {
      if (!candList) return
      const current = draft.items.flatMap((x) => (x.source === 'passage' ? [x.candidate] : []))
      const next = pickPassageReplacement(candList, current, it.candidate, draft.generatedFor.level, excluded)
      if (!next) return setNotices([`${MIXED_CATEGORY_LABELS[it.candidate.category]}: 이 지문에 바꿀 문항이 더 없습니다.`])
      dispatch({ type: 'replace', index, item: { source: 'passage', candidate: next } })
    } else {
      const w = draft.generatedFor.word
      const band = findDifficultyBand(w.grade as VocabularyGrade, w.level as PassageVariantLevel, w.direction)
      if (!entries || !band) return
      const wordItems = draft.items.flatMap((x) => (x.source === 'word' ? [x.item] : []))
      const wi = wordItems.findIndex((x) => x.entry.id === it.item.entry.id)
      const excludedIds = new Set([...excluded].filter((k) => k.startsWith('word:')).map((k) => k.slice(5)))
      const next = pickReplacement(entries, band, wordItems, wi, excludedIds)
      if (!next) return setNotices(['단어: 같은 조건의 다른 \'사용 중\' 단어가 더 없습니다.'])
      dispatch({ type: 'replace', index, item: { source: 'word', item: next } })
    }
  }

  async function save() {
    if (!mixedDraftIsCurrent(draft)) return setError('조건이 바뀌었습니다. 다시 뽑아 주세요.')
    // 배점: 기본은 100점으로 맞추기 (앞쪽 문항부터 1점씩 더 줌), 또는 문항당 같은 배점
    let pointList: number[]
    if (pointMode === 'hundred') {
      const auto = allocatePoints(draft.items.length)
      if (!auto) return setError(`문항이 ${MIXED_TOTAL_POINTS}개보다 많아 100점으로 맞출 수 없습니다. '문항당 같은 배점'을 고르세요.`)
      pointList = auto
    } else {
      const p = Number(points)
      if (!Number.isInteger(p) || p < 1 || p > 100) return setError('문항당 배점은 1~100 정수로 입력하세요.')
      pointList = draft.items.map(() => p)
    }
    const t = title.trim() || `${row?.title ?? ''} 혼합 시험`
    setSaving(true)
    setError('')
    try {
      const questions = draft.items.map((it) => (it.source === 'passage' ? it.candidate.question_data : toWordQuestionData(it.item)))
      const res = await fetch('/api/exams/mixed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: t, exam_date: examDate || null, points: pointList, questions }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      const id = json.data.exam_id
      // 인쇄 화면은 학생용(정답 없음)이 기본. 교사용·답안지만은 인쇄 화면에서 고른다
      router.push(`/tests/${id}/print?exam_id=${id}&title=${encodeURIComponent(t)}&date=${encodeURIComponent(examDate)}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패')
      setSaving(false)
    }
  }

  // ── 화면 ──
  const gradeOptions = useMemo(
    () => [...new Set(rows.map((r) => r.grade).filter((g): g is string => !!g))].sort((a, b) => gradeSortKey(a) - gradeSortKey(b)),
    [rows],
  )
  const shownRows = rows.filter((r) => (kindFilter === 'all' || r.kind === kindFilter) && (gradeFilter === 'all' || r.grade === gradeFilter))
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`
  const current = mixedDraftIsCurrent(draft)

  return (
    <div className="mx-auto max-w-5xl">
      <h1 className="mb-1 text-xl font-semibold text-gray-800">혼합 시험 출제</h1>
      <p className="mb-5 text-sm text-gray-500">
        지문 1개의 문항(객관식·주관식·문법)과 단어은행 단어를 한 장의 시험지로 만듭니다. 만든 시험은{' '}
        <Link href="/tests" className="text-blue-600 hover:underline">시험지 보관함</Link>에 모입니다.
      </p>

      {/* 1. 지문 고르기 */}
      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">1. 지문 고르기</h2>
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {(['all', 'ai', 'external'] as const).map((k) => (
            <button key={k} onClick={() => setKindFilter(k)} className={pill(kindFilter === k)}>
              {k === 'all' ? '전체' : PASSAGE_KIND_LABELS[k]}
            </button>
          ))}
          <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)} className="rounded border border-gray-300 px-2 py-1 text-sm">
            <option value="all">학년 전체</option>
            {gradeOptions.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        {rowsError && <p className="text-sm text-red-600">{rowsError}</p>}
        <div className="max-h-64 overflow-y-auto rounded border border-gray-100">
          {rowsLoading ? (
            <p className="p-4 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : shownRows.length === 0 ? (
            <p className="p-4 text-center text-sm text-gray-400">지문이 없습니다.</p>
          ) : (
            shownRows.map((r) => {
              const key = `${r.kind}:${r.id}`
              return (
                <label key={key} className={`flex cursor-pointer items-center gap-2 border-b border-gray-100 px-3 py-2 text-sm last:border-0 hover:bg-blue-50 ${c.passageKey === key ? 'bg-blue-50' : ''}`}>
                  <input type="radio" name="passage" checked={c.passageKey === key} onChange={() => change({ passageKey: key })} />
                  <span className={`rounded px-1.5 py-0.5 text-[11px] ${r.kind === 'ai' ? 'bg-purple-100 text-purple-700' : 'bg-teal-100 text-teal-700'}`}>{PASSAGE_KIND_LABELS[r.kind]}</span>
                  <span className="w-10 text-xs text-gray-500">{r.grade ?? r.gradeRaw ?? '-'}</span>
                  <span className="flex-1 text-gray-800">{r.title}</span>
                  <span className="text-xs text-gray-400">
                    {r.isGroup ? r.levels.map((l) => l.label).join('·') : r.difficulty ? UNIFIED_DIFFICULTY_LABELS[r.difficulty] : '난이도 미정'} · {r.questionCount}문항
                  </span>
                </label>
              )
            })
          )}
        </div>
      </section>

      {/* 2. 지문 문항 */}
      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">2. 지문 문항 (레벨 · 유형별 개수)</h2>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs text-gray-500">레벨</span>
          {DIFFS.map((d) => (
            <button key={d} onClick={() => change({ level: d })} className={pill(c.level === d)}>{UNIFIED_DIFFICULTY_LABELS[d]}</button>
          ))}
          <span className="text-xs text-gray-400">이 레벨 문항을 먼저, 모자라면 같은 지문의 가까운 레벨 문항</span>
        </div>
        {source?.levelLabel && <p className="mb-2 text-xs text-teal-700">4단계 세트: {source.levelLabel} 지문의 문항을 씁니다.</p>}
        <div className="flex flex-wrap gap-4">
          {MIXED_CATEGORIES.map((k: MixedCategory) => (
            <label key={k} className="text-sm text-gray-700">
              {MIXED_CATEGORY_LABELS[k]}{' '}
              <input
                type="number"
                min={0}
                max={50}
                value={c.counts[k]}
                onChange={(e) => change({ counts: { [k]: Math.max(0, Math.min(50, Number(e.target.value) || 0)) } as Partial<CategoryCounts> })}
                className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
              />
              개
              {avail && (
                <span className="ml-1 text-xs text-gray-400">
                  (이 지문 {avail.total[k]}개 · 이 레벨 {avail.atLevel[k]}개)
                </span>
              )}
            </label>
          ))}
        </div>
        {candsError && <p className="mt-2 text-sm text-red-600">{candsError}</p>}
        {cands && cands.key === sourceKey && cands.excludedLeak > 0 && (
          <p className="mt-2 text-xs text-red-700">
            정답이 문제에 드러나는 어법 문항 {cands.excludedLeak}개는 후보에서 뺐습니다 (정답 노출 의심).
          </p>
        )}
        {row && !candList && !candsError && <p className="mt-2 text-xs text-gray-400">문항 불러오는 중…</p>}
        {preShort.length > 0 && (
          <p className="mt-2 rounded bg-amber-50 px-3 py-2 text-xs text-amber-800">
            부족: {preShort.map((s) => `${MIXED_CATEGORY_LABELS[s.category]} ${s.requested}개 요청 → 이 지문에 ${s.picked}개`).join(' · ')} (있는 만큼만 넣고, 다른 지문에서 채우지 않습니다)
          </p>
        )}
      </section>

      {/* 3. 단어 문항 */}
      <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-2 text-sm font-semibold text-gray-800">3. 단어 문항 (단어은행 &lsquo;사용 중&rsquo; 단어만)</h2>
        <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
          <label>
            개수{' '}
            <input
              type="number"
              min={0}
              max={100}
              value={c.word.count}
              onChange={(e) => change({ word: { count: Math.max(0, Math.min(100, Number(e.target.value) || 0)) } })}
              className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
            />
          </label>
          <select value={c.word.grade} onChange={(e) => change({ word: { grade: e.target.value } })} className="rounded border border-gray-300 px-2 py-1 text-sm">
            {wordGrades.map((g) => <option key={g} value={g}>{g}{isDraftBandGrade(g) ? ' (승인 전 초안)' : ''}</option>)}
          </select>
          <select value={c.word.level} onChange={(e) => change({ word: { level: e.target.value } })} className="rounded border border-gray-300 px-2 py-1 text-sm">
            {LEVELS.map((l) => <option key={l} value={l}>{VARIANT_LABELS[l]}</option>)}
          </select>
          {(['en_ko', 'ko_en'] as const).map((d) => (
            <button key={d} onClick={() => change({ word: { direction: d } })} className={pill(c.word.direction === d)}>{WORD_TEST_MODE_LABELS[d]}</button>
          ))}
          {wordBand && <span className="text-xs text-gray-400">난이도 {wordBand.min}~{wordBand.max}</span>}
        </div>
        {isDraftBandGrade(c.word.grade as VocabularyGrade) && (
          <p className="undecided-glow mt-2 inline-block rounded px-1.5 py-0.5 text-xs text-amber-700">{c.word.grade} 레벨 범위는 {DRAFT_BAND_LABEL}입니다.</p>
        )}
      </section>

      <div className="mb-5 flex items-center gap-3">
        <button onClick={generate} disabled={busy || !row} className="rounded bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
          {draft.generatedFor ? '다시 뽑기' : '문항 뽑기'}
        </button>
        {busy && <span className="text-xs text-gray-400">뽑는 중…</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
      {notices.length > 0 && (
        <ul className="mb-4 space-y-1 rounded bg-amber-50 px-4 py-2 text-xs text-amber-800">
          {notices.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
      )}

      {/* 4. 미리보기 */}
      {draft.generatedFor && (
        <section className="mb-5 rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">4. 미리보기 ({draft.items.length}문항)</h2>
          <ol className="divide-y divide-gray-100">
            {draft.items.map((it, i) => (
              <li key={mixedItemKey(it)} className="flex items-start gap-2 py-1.5 text-sm">
                <span className="w-6 text-right text-gray-400">{i + 1}.</span>
                {it.source === 'passage' ? (
                  <>
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">{MIXED_CATEGORY_LABELS[it.candidate.category]}</span>
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
                      {it.candidate.difficulty ? UNIFIED_DIFFICULTY_LABELS[it.candidate.difficulty] : '레벨 미정'}
                    </span>
                    <span className="flex-1 text-gray-800 line-clamp-2">{it.candidate.preview}</span>
                  </>
                ) : (
                  <>
                    <span className="rounded bg-purple-50 px-1.5 py-0.5 text-[11px] text-purple-700">단어 {WORD_TEST_MODE_LABELS[it.item.direction]}</span>
                    <span className="flex-1 text-gray-800">
                      {it.item.direction === 'en_ko' ? it.item.entry.expression : it.item.entry.meaning_ko}
                      <span className="ml-1 text-gray-400">→ {it.item.direction === 'en_ko' ? it.item.entry.meaning_ko : it.item.entry.expression}</span>
                    </span>
                  </>
                )}
                <button onClick={() => replace(i)} className="text-xs text-blue-600 hover:underline">교체</button>
                <button onClick={() => dispatch({ type: 'remove', index: i })} className="text-xs text-red-500 hover:underline">삭제</button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* 5. 저장 */}
      {draft.generatedFor && (
        <section className="mb-10 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-gray-800">5. 저장 후 인쇄</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-gray-600 sm:col-span-3">
              시험 제목
              <input value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <label className="text-xs text-gray-600">
              시험일
              <input type="date" value={examDate} onChange={(e) => setExamDate(e.target.value)} className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </label>
            <div className="text-xs text-gray-600 sm:col-span-2">
              배점
              <div className="mt-1 space-y-1">
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="pointMode" checked={pointMode === 'hundred'} onChange={() => setPointMode('hundred')} />
                  100점으로 맞추기 (기본)
                  <span className="text-gray-500">
                    {allocatePoints(draft.items.length)
                      ? `— ${pointsSummary(allocatePoints(draft.items.length)!)} (앞쪽 문항부터 1점씩 더)`
                      : `— 문항이 ${MIXED_TOTAL_POINTS}개보다 많아 쓸 수 없음`}
                  </span>
                </label>
                <label className="flex items-center gap-1.5">
                  <input type="radio" name="pointMode" checked={pointMode === 'fixed'} onChange={() => setPointMode('fixed')} />
                  문항당 같은 배점
                  <input
                    value={points}
                    onChange={(e) => setPoints(e.target.value)}
                    onFocus={() => setPointMode('fixed')}
                    inputMode="numeric"
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-sm"
                  />
                  점
                </label>
                <p className="text-gray-400">저장한 뒤 시험 화면에서 문항별 배점을 따로 고칠 수 있습니다.</p>
              </div>
            </div>
          </div>
          <button onClick={save} disabled={saving || !current} className="mt-3 rounded bg-green-600 px-5 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40">
            {saving ? '저장 중…' : `시험 저장 (${draft.items.length}문항) → 인쇄 화면`}
          </button>
          <p className="mt-1 text-xs text-gray-500">인쇄 화면은 학생용(정답 없음)으로 열립니다. 교사용·답안지만은 인쇄 화면에서 고르세요.</p>
        </section>
      )}
    </div>
  )
}
