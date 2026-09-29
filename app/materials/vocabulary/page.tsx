'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { VocabularyEntryRecord, VocabularyRejectReason, VocabularySourceRecord } from '@/types/vocabulary'
import {
  BULK_SKIP_REASON_LABELS,
  type BulkSkipReason,
  undecidedCount,
  VOCABULARY_APPROVAL_ORIGIN_LABELS,
  VOCABULARY_REJECT_REASON_LABELS,
  VOCABULARY_SELECTABLE_REJECT_REASONS,
  VOCABULARY_VIEW_STATE_HINTS,
  VOCABULARY_VIEW_STATE_LABELS,
  VOCABULARY_VIEW_STATES,
  vocabularyViewState,
  type VocabularyViewState,
} from '@/lib/vocabulary'
import { exclusionConfirmText } from '@/lib/vocabularyExclusion'
import { CopyrightBelow, CopyrightInline } from '@/app/components/CopyrightNotice'
import {
  anchorLabels,
  GRADE_RANGE_POSITION_LABELS,
  gradeDifficultyRange,
  gradeRangePosition,
  VOCABULARY_BANDS_NOTE,
  VOCABULARY_GRADES,
  type VocabularyGrade,
} from '@/config/vocabularyLevels'
import { generateWordTest, POS_LABELS_KO, toWordQuestionData } from '@/lib/wordTest'
import {
  CALIBRATION_ZONE_LABELS,
  CALIBRATION_ZONE_RANGES,
  calibrationZone,
  DIFFICULTY_NUDGE_STEP,
  countableSources,
  isCalibrationReviewed,
  isReviewNoteRef,
  nextUnreviewedId,
  nudgeDifficulty,
  OWNER_APPROVAL_REF_PREFIX,
  REVIEW_DONE_REF_PREFIX,
  REVIEW_REASON_LABELS,
  REVIEW_STATE_LABELS,
  reviewState,
  SOURCE_REF_LABELS,
  type CalibrationZone,
  type ReviewReason,
} from '@/lib/vocabularyCalibration'
import {
  countByGradePosition,
  GRADE_RANGE_POSITIONS,
  gradeFilterAfterGradeChange,
  vocabularyFilterKey,
  vocabularyFilterSummary,
  type GradeRangeFilter,
} from '@/lib/vocabularyListFilter'

type StatusFilter = VocabularyViewState | 'all'
type ReviewFilter = 'all' | 'unreviewed' | 'reviewed'
type ZoneFilter = CalibrationZone | 'all' | 'custom'

type SourceRef = Pick<VocabularySourceRecord, 'source_type' | 'source_ref' | 'created_by'>
type Entry = VocabularyEntryRecord & { vocabulary_sources?: SourceRef[] }

const STATUS_BADGE: Record<VocabularyViewState, string> = {
  pending: 'bg-amber-100 text-amber-700',
  deferred: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  archived: 'bg-gray-200 text-gray-600',
}

// 검수용 시험 최대 문항 수
const CHECK_TEST_MAX = 20

// 숫자 난이도 → "중1~2·중3 수준" (절대 난이도 자의 기준점 초안, 겹치면 모두)
function levelText(difficulty: number | null): string {
  if (difficulty === null) return '난이도 없음'
  const labels = anchorLabels(difficulty)
  return labels.length ? `${labels.join('·')} 수준` : '기준점 밖'
}

// 목록/상세에 보여줄 출처 이름 (검수 메모 행은 제외)
function sourceLabel(e: Entry): string {
  const refs = countableSources(e.vocabulary_sources)
  if (refs.length === 0) return '-'
  return refs.map((s) => SOURCE_REF_LABELS[s.source_ref] ?? `${s.source_type}: ${s.source_ref}`).join(', ')
}

function parseDifficulty(text: string): number | null {
  if (text.trim() === '') return null
  const n = Number(text)
  return Number.isInteger(n) ? n : NaN
}

export default function VocabularyPage() {
  const [entries, setEntries] = useState<Entry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')
  const [review, setReview] = useState<ReviewFilter>('all')
  const [zone, setZone] = useState<ZoneFilter>('all')
  const [grade, setGrade] = useState<VocabularyGrade>('중1')
  const [gradeFilter, setGradeFilter] = useState<GradeRangeFilter>('all')
  const [customMin, setCustomMin] = useState('')
  const [customMax, setCustomMax] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // 일괄 사용하기: '확인 필요'(나중에 결정 포함) 단어만 고를 수 있다
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [bulkSaving, setBulkSaving] = useState(false)
  const [bulkMessage, setBulkMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [reviewMode, setReviewMode] = useState(false)

  // 상세 편집값
  const [meaning, setMeaning] = useState('')
  const [accepted, setAccepted] = useState('')
  const [difficulty, setDifficulty] = useState('')
  const [koEn, setKoEn] = useState(false)
  const [rejectReason, setRejectReason] = useState<VocabularyRejectReason | ''>('')
  const [rejectNote, setRejectNote] = useState('')
  const [reviewReason, setReviewReason] = useState<ReviewReason | ''>('')
  const [reviewMemo, setReviewMemo] = useState('')
  const [notes, setNotes] = useState<VocabularySourceRecord[]>([])
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  // 검수용 시험 (하한 / 상한 기준 체감 확인용)
  const [checkTest, setCheckTest] = useState<{ id: string; title: string; count: number } | null>(null)
  const [checkTestError, setCheckTestError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setLoadError('')
    try {
      const res = await fetch('/api/vocabulary')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '불러오기 실패')
      setEntries(json.data ?? [])
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : '불러오기 실패')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const range = useMemo((): { min: number; max: number } | null => {
    if (zone === 'all') return null
    if (zone === 'custom') {
      const min = Number(customMin) || 1
      const max = Number(customMax) || 100
      return { min: Math.max(1, Math.min(min, max)), max: Math.min(100, Math.max(min, max)) }
    }
    return CALIBRATION_ZONE_RANGES[zone]
  }, [zone, customMin, customMax])

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { all: entries.length, pending: 0, deferred: 0, approved: 0, rejected: 0, archived: 0 }
    for (const e of entries) c[vocabularyViewState(e)]++
    return c
  }, [entries])
  const undecided = useMemo(() => undecidedCount(entries), [entries])

  // 학년 범위 (C-2): 고른 학년의 기준표 구간. 기준표가 없으면 null → "기준 미설정"
  const gradeRange = useMemo(() => gradeDifficultyRange(grade), [grade])
  const matchesGrade = useCallback(
    (e: Entry) => gradeFilter === 'all' || (gradeRange !== null && gradeRangePosition(e.base_difficulty, gradeRange) === gradeFilter),
    [gradeFilter, gradeRange],
  )

  // 진행상황: 전체 / 구간별 교사 검수 완료 수
  const progress = useMemo(() => {
    const zones: Record<CalibrationZone, { done: number; total: number }> = {
      floor: { done: 0, total: 0 }, middle: { done: 0, total: 0 }, ceiling: { done: 0, total: 0 },
    }
    let done = 0
    for (const e of entries) {
      const doneReview = isCalibrationReviewed(e)
      if (doneReview) done++
      const z = calibrationZone(e.base_difficulty)
      if (!z) continue
      zones[z].total++
      if (doneReview) zones[z].done++
    }
    return { done, total: entries.length, zones }
  }, [entries])

  // 상태 탭 + 검색어 기준 목록 (학년 범위 아래/안/위 개수는 이것으로 센다)
  const statusSearchMatched = useMemo(() => {
    const q = search.trim().toLowerCase()
    return entries.filter((e) =>
      (status === 'all' || vocabularyViewState(e) === status) &&
      (!q || e.expression.toLowerCase().includes(q) || e.meaning_ko.includes(q) || e.accepted_meanings.some((m) => m.includes(q))),
    )
  }, [entries, status, search])
  const gradePositionCounts = useMemo(
    () => countByGradePosition(statusSearchMatched, (e) => (gradeRange ? gradeRangePosition(e.base_difficulty, gradeRange) : null)),
    [statusSearchMatched, gradeRange],
  )

  const filtered = useMemo(() => {
    const list = statusSearchMatched.filter((e) =>
      matchesGrade(e) &&
      (review === 'all' || (review === 'reviewed') === isCalibrationReviewed(e)) &&
      (!range || (e.base_difficulty !== null && e.base_difficulty >= range.min && e.base_difficulty <= range.max)),
    )
    // 난이도 필터를 쓰면 난이도 순으로 (양 끝 비교가 쉽게)
    return range ? [...list].sort((a, b) => (a.base_difficulty ?? 0) - (b.base_difficulty ?? 0)) : list
  }, [statusSearchMatched, matchesGrade, review, range])

  // 필터를 하나라도 바꾸면 체크해 둔 단어를 비운다 (안 보이는 단어가 선택된 채 일괄 사용되지 않게)
  const filterKey = vocabularyFilterKey({ grade, status, gradeFilter, review, zone, customMin, customMax, search })
  useEffect(() => { setChecked(new Set()) }, [filterKey])

  const filterSummary = vocabularyFilterSummary({
    grade,
    hasGradeRange: gradeRange !== null,
    gradeRangeLabel: gradeFilter === 'all' ? null : GRADE_RANGE_POSITION_LABELS[gradeFilter],
    statusLabel: status === 'all' ? null : VOCABULARY_VIEW_STATE_LABELS[status],
    reviewLabel: review === 'all' ? null : review === 'reviewed' ? '교사 검수 완료' : '교사 미확인',
    zoneLabel: range ? `${range.min}~${range.max}` : null,
    search,
    count: filtered.length,
  })

  const selected = entries.find((e) => e.id === selectedId) ?? null
  // 지금 보이는 목록 중 '확인 필요'(나중에 결정 포함) — 일괄 사용하기 대상
  const selectablePending = useMemo(() => filtered.filter((e) => e.status === 'pending'), [filtered])
  const checkedPendingCount = useMemo(() => selectablePending.filter((e) => checked.has(e.id)).length, [selectablePending, checked])

  // 선택이 바뀌면 편집칸을 그 항목 값으로 채우고, 검수 메모를 불러온다
  useEffect(() => {
    if (!selected) return
    setMeaning(selected.meaning_ko)
    setAccepted(selected.accepted_meanings.join(', '))
    setDifficulty(selected.base_difficulty === null ? '' : String(selected.base_difficulty))
    setKoEn(selected.ko_en_allowed)
    setRejectReason('')
    setRejectNote('')
    setReviewReason('')
    setReviewMemo('')
    setNotes([])
    const id = selected.id
    fetch(`/api/vocabulary/${id}`)
      .then((r) => r.json())
      .then((json) => {
        const srcs: VocabularySourceRecord[] = json.data?.vocabulary_sources ?? []
        setNotes(srcs.filter((s) => isReviewNoteRef(s.source_ref)).sort((a, b) => b.created_at.localeCompare(a.created_at)))
      })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  // 검수 모드를 켜면: 교사 미확인만 + 첫 항목 선택
  function startReviewMode() {
    setReviewMode(true)
    setReview('unreviewed')
    const first = entries.find((e) =>
      !isCalibrationReviewed(e) &&
      (status === 'all' || vocabularyViewState(e) === status) &&
      matchesGrade(e) &&
      (!range || (e.base_difficulty !== null && e.base_difficulty >= range.min && e.base_difficulty <= range.max)),
    )
    setSelectedId(first?.id ?? null)
  }

  async function patch(body: Record<string, unknown>, doneText: string, goNext = false) {
    if (!selected) return
    const currentId = selected.id
    // "다음"은 저장 전 목록 기준으로 정한다 (미확인 필터에서는 저장 후 현재 항목이 목록에서 빠지므로)
    const nextId = goNext ? nextUnreviewedId(filtered, currentId) : null
    setSaving(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/vocabulary/${currentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      // 목록 응답의 출처 정보는 유지하고 어휘 값만 바꾼다
      // 검수 완료/메모 기록이 생겼으면 목록의 출처 정보에도 붙인다 (새로고침 없이 집계·필터 반영)
      setEntries((prev) =>
        prev.map((e) =>
          e.id === currentId
            ? { ...e, ...json.data, vocabulary_sources: json.record ? [...(e.vocabulary_sources ?? []), json.record] : e.vocabulary_sources }
            : e,
        ),
      )
      const text = json.warning ? `${doneText} (${json.warning})` : doneText
      if (goNext) {
        if (nextId) {
          setSelectedId(nextId)
          setMessage({ ok: true, text: `${selected.expression}: ${text} → 다음 단어` })
        } else {
          setMessage({ ok: true, text: `${selected.expression}: ${text} — 이 목록의 미검수 단어를 모두 마쳤습니다.` })
          if (review === 'unreviewed') setSelectedId(null)
        }
      } else {
        setMessage({ ok: true, text })
      }
    } catch (e) {
      setMessage({ ok: false, text: e instanceof Error ? e.message : '저장 실패' })
    } finally {
      setSaving(false)
    }
  }

  function editedFields(): Record<string, unknown> | string {
    if (!selected) return {}
    const out: Record<string, unknown> = {}
    const m = meaning.trim()
    if (!m) return '대표 뜻을 입력하세요.'
    if (m !== selected.meaning_ko) out.meaning_ko = m
    const acc = accepted.split(',').map((s) => s.trim()).filter(Boolean)
    if (acc.join('\u0000') !== selected.accepted_meanings.join('\u0000')) out.accepted_meanings = acc
    const d = parseDifficulty(difficulty)
    if (d !== null && !(Number.isInteger(d) && d >= 1 && d <= 100)) return '난이도는 1~100 정수로 입력하세요.'
    if (d !== selected.base_difficulty) out.base_difficulty = d
    if (koEn !== selected.ko_en_allowed) out.ko_en_allowed = koEn
    return out
  }

  function reviewNoteFields() {
    return { review_reason: reviewReason || null, review_note: reviewMemo.trim() || null }
  }

  function saveEdits() {
    const f = editedFields()
    if (typeof f === 'string') return setMessage({ ok: false, text: f })
    if (Object.keys(f).length === 0) return setMessage({ ok: false, text: '바뀐 내용이 없습니다.' })
    patch({ ...f, ...reviewNoteFields() }, '저장했습니다.')
  }

  // 검수 완료: 편집한 값 + 검수 기록을 한 번에 저장하고 다음 미검수 단어로
  function completeReview() {
    const f = editedFields()
    if (typeof f === 'string') return setMessage({ ok: false, text: f })
    patch({ ...f, ...reviewNoteFields(), review: true }, '검수 완료', true)
  }

  // 현재 기준 맞음: 값은 그대로 두고 검수만 기록 → 다음
  function confirmAsIs() {
    patch({ review: true, ...reviewNoteFields() }, '현재 기준 맞음 (값 변경 없음)', true)
  }

  function nudge(delta: number) {
    const d = parseDifficulty(difficulty)
    const base = d === null || Number.isNaN(d) ? selected?.base_difficulty ?? 50 : d
    setDifficulty(String(nudgeDifficulty(base, delta)))
  }

  // 상태 버튼은 편집 중인 값도 함께 저장한다
  function runAction(action: string, doneText: string, extra: Record<string, unknown> = {}) {
    const f = editedFields()
    if (typeof f === 'string') return setMessage({ ok: false, text: f })
    patch({ ...f, ...extra, action }, doneText)
  }

  // 여러 개를 한 번에 '사용하기' — 개수를 한 번 더 확인받는다. 승인 경로는 '일괄 승인'(batch)
  async function bulkApprove() {
    // 화면에 보이는 개수와 같게: 지금 목록의 확인 필요 중 선택한 것만
    const ids = selectablePending.filter((e) => checked.has(e.id)).map((e) => e.id)
    if (ids.length === 0) return
    if (!window.confirm(`선택한 ${ids.length}개를 '사용 중'으로 바꿉니다.\n바로 단어시험에 나올 수 있게 됩니다. (승인 경로: 일괄 승인)\n\n진행할까요?`)) return
    setBulkSaving(true)
    setBulkMessage(null)
    try {
      const res = await fetch('/api/vocabulary/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', ids }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '일괄 사용하기 실패')
      const updated = new Map<string, VocabularyEntryRecord>((json.data.entries ?? []).map((u: VocabularyEntryRecord) => [u.id, u]))
      // 목록의 출처 정보는 유지하고 어휘 값만 바꾼다
      setEntries((prev) => prev.map((e) => (updated.has(e.id) ? { ...e, ...updated.get(e.id)!, vocabulary_sources: e.vocabulary_sources } : e)))
      setChecked(new Set())
      const skipped: { reason: BulkSkipReason }[] = json.data.skipped ?? []
      const skipText = skipped.length
        ? ` · 건너뜀 ${skipped.length}개 (${[...new Set(skipped.map((x) => BULK_SKIP_REASON_LABELS[x.reason]))].join(', ')})`
        : ''
      setBulkMessage({ ok: true, text: `${json.data.approved}개를 사용 중으로 바꿨습니다${skipText}.` })
    } catch (e) {
      setBulkMessage({ ok: false, text: e instanceof Error ? e.message : '일괄 사용하기 실패' })
    } finally {
      setBulkSaving(false)
    }
  }

  // 영구 제외: 사유 필수 + DB 조회로 만든 경고를 보여주고 한 번 더 확인받는다
  async function excludePermanently() {
    if (!selected) return
    if (!rejectReason) return setMessage({ ok: false, text: '영구 제외 사유를 선택하세요.' })
    setSaving(true)
    let warnings: string[] = []
    try {
      const res = await fetch(`/api/vocabulary/${selected.id}/exclusion-check`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '확인 정보를 불러오지 못했습니다.')
      warnings = json.data.warnings ?? []
    } catch (e) {
      setSaving(false)
      return setMessage({ ok: false, text: e instanceof Error ? e.message : '확인 정보를 불러오지 못했습니다.' })
    }
    setSaving(false)
    if (!window.confirm(exclusionConfirmText(selected.expression, VOCABULARY_REJECT_REASON_LABELS[rejectReason], warnings))) return
    runAction('reject', '영구 제외했습니다.', { reject_reason: rejectReason, reject_note: rejectNote })
  }

  // 영구 제외 → 다시 검토하기: 경고 확인 후 '확인 필요'로
  function reopenRejected() {
    if (!selected) return
    const ok = window.confirm(
      `'${selected.expression}'을(를) 다시 '확인 필요'로 돌립니다.
` +
      "영구 제외 사유는 지워집니다. 시험에 다시 쓰려면 확인 후 '사용하기'를 눌러야 합니다.",
    )
    if (ok) runAction('reopen', "'확인 필요'로 되돌렸습니다.")
  }

  // 검수용 시험: 지금 난이도 필터 범위의 승인 단어로 영→한 최대 20문항 (고3 등 학년 기준을 새로 만들지 않는다)
  async function createCheckTest() {
    if (!range) return
    setCheckTest(null)
    setCheckTestError('')
    const pool = entries.filter((e) => e.status === 'approved' && e.deleted_at === null)
    const result = generateWordTest(pool, range, 'en_ko', CHECK_TEST_MAX)
    if (result.items.length === 0) return setCheckTestError('이 범위에 승인된 단어가 없습니다.')
    const title = `[검수용] 난이도 ${range.min}~${range.max} 단어시험`
    try {
      const res = await fetch('/api/vocabulary/word-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, exam_date: null, points_per_question: 5, questions: result.items.map(toWordQuestionData) }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? '저장 실패')
      setCheckTest({ id: json.data.exam_id, title, count: result.items.length })
    } catch (e) {
      setCheckTestError(e instanceof Error ? e.message : '저장 실패')
    }
  }

  const draftDifficulty = parseDifficulty(difficulty)
  const difficultyChanged = selected !== null && draftDifficulty !== selected.base_difficulty
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-sm ${active ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-600 hover:bg-gray-50'}`

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-800">단어은행</h1>
            {/* 결정 안 된 단어 = 확인 필요 + 나중에 결정 */}
            <span
              title="확인 필요 + 나중에 결정"
              className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${undecided > 0 ? 'undecided-glow bg-yellow-300 text-yellow-900' : 'bg-gray-100 text-gray-500'}`}
            >
              결정 안 된 단어 {undecided}개
            </span>
          </div>
          <p className="mt-1 text-xs text-gray-500">
            수준 표시는 1~100 절대 난이도 기준점(초안), 학년 범위는 {VOCABULARY_BANDS_NOTE} 기준입니다.
          </p>
        </div>
        <div className="flex gap-2">
          {reviewMode ? (
            <button onClick={() => setReviewMode(false)} className="rounded border border-gray-400 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
              검수 모드 끄기
            </button>
          ) : (
            <button onClick={startReviewMode} className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
              🎯 검수 모드
            </button>
          )}
          <a href="/create/word" className="rounded border border-blue-600 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50">
            단어시험 만들기 →
          </a>
        </div>
      </div>

      {/* 진행상황 (작게) */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded bg-gray-50 px-3 py-2 text-xs text-gray-600">
        <span>
          교사 검수 완료 <b className="text-gray-900">{progress.done}</b> / {progress.total} · 미검수 {progress.total - progress.done}
        </span>
        {(['floor', 'middle', 'ceiling'] as CalibrationZone[]).map((z) => (
          <span key={z}>
            {CALIBRATION_ZONE_LABELS[z]}: {progress.zones[z].done}/{progress.zones[z].total}
          </span>
        ))}
      </div>

      {reviewMode && (
        <div className="mb-3 rounded border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs leading-relaxed text-indigo-800">
          <b>검수 모드</b> — 판단 후 “검수 완료”를 누르면 저장하고 다음 미검수 단어로 넘어갑니다. 생각해 볼 것:
          지금 난이도가 맞는가 · 학생에게 언제부터 요구할까 · 이 뜻에서도 같은 난이도인가 · 영→한/한→영 차이가 큰가 ·
          시험 가치가 있는가 · 고3 상위 학생이 알아야 하는가 · 보스턴S 교육 범위 밖인가.
          난이도 숫자는 Claude 임시값이며 정답이 아닙니다.
        </div>
      )}

      {/* 필터 */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {(['all', ...VOCABULARY_VIEW_STATES] as StatusFilter[]).map((s) => (
          <button key={s} onClick={() => setStatus(s)} className={pill(status === s)}>
            {s === 'all' ? '전체' : VOCABULARY_VIEW_STATE_LABELS[s]} {counts[s]}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="영어 표현 또는 뜻 검색"
          className="ml-auto w-full rounded border border-gray-300 px-3 py-1.5 text-sm sm:w-64"
        />
      </div>
      {status !== 'all' && <p className="mb-2 text-xs text-gray-500">{VOCABULARY_VIEW_STATE_HINTS[status]}</p>}

      {/* 학년 범위 (C-2): 고른 학년 기준으로 그때그때 계산한다 */}
      <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-gray-500">학년</span>
        <select
          value={grade}
          onChange={(e) => {
            // 학년을 바꾸면 '학년 범위 안'으로 바꿔 목록이 바로 그 학년 단어로 바뀌게 한다
            const g = e.target.value as VocabularyGrade
            setGrade(g)
            setGradeFilter(gradeFilterAfterGradeChange(gradeDifficultyRange(g) !== null))
          }}
          className="rounded border border-gray-300 px-2 py-1 text-sm"
        >
          {VOCABULARY_GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        {gradeRange ? (
          <>
            <button onClick={() => setGradeFilter('all')} className={pill(gradeFilter === 'all')}>전체</button>
            {GRADE_RANGE_POSITIONS.map((p) => (
              <button key={p} onClick={() => setGradeFilter(p)} className={pill(gradeFilter === p)}>
                {GRADE_RANGE_POSITION_LABELS[p]} {gradePositionCounts[p]}
              </button>
            ))}
            <span className="text-xs text-gray-400">({grade} 난이도 {gradeRange.min}~{gradeRange.max})</span>
          </>
        ) : (
          <span className="text-xs text-amber-700">기준 미설정 — {grade} 학년 범위가 아직 없습니다.</span>
        )}
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-xs text-gray-500">검수</span>
        {([['all', '전체'], ['unreviewed', '교사 미확인'], ['reviewed', '교사 검수 완료']] as [ReviewFilter, string][]).map(([v, l]) => (
          <button key={v} onClick={() => setReview(v)} className={pill(review === v)}>{l}</button>
        ))}
        <span className="ml-2 text-xs text-gray-500">난이도 구간(검수용)</span>
        {(['all', 'floor', 'middle', 'ceiling'] as ZoneFilter[]).map((z) => (
          <button key={z} onClick={() => { setZone(z); setCheckTest(null); setCheckTestError('') }} className={pill(zone === z)}>
            {z === 'all' ? '전체' : CALIBRATION_ZONE_LABELS[z as CalibrationZone]}
          </button>
        ))}
        <button onClick={() => { setZone('custom'); setCheckTest(null); setCheckTestError('') }} className={pill(zone === 'custom')}>직접</button>
        {zone === 'custom' && (
          <span className="flex items-center gap-1">
            <input value={customMin} onChange={(e) => setCustomMin(e.target.value)} placeholder="1" inputMode="numeric" className="w-14 rounded border border-gray-300 px-2 py-1" />
            ~
            <input value={customMax} onChange={(e) => setCustomMax(e.target.value)} placeholder="100" inputMode="numeric" className="w-14 rounded border border-gray-300 px-2 py-1" />
          </span>
        )}
        <CopyrightInline target="vocabulary" />
      </div>

      {/* 검수용 시험: 난이도 필터를 골랐을 때만 */}
      {range && (
        <div className="mb-3 flex flex-wrap items-center gap-2 rounded border border-dashed border-gray-300 px-3 py-2 text-xs text-gray-600">
          <span>
            난이도 {range.min}~{range.max} 승인 단어로 <b>검수용 시험</b>(영→한, 최대 {CHECK_TEST_MAX}문항)을 만들어 실제 시험지로 체감해 볼 수 있습니다.
          </span>
          <button onClick={createCheckTest} className="rounded border border-indigo-500 px-2 py-1 text-indigo-700 hover:bg-indigo-50">
            검수용 시험 만들기
          </button>
          {checkTest && (
            <span className="flex items-center gap-2 text-green-700">
              ✅ {checkTest.title} ({checkTest.count}문항) 저장
              <a
                href={`/tests/${checkTest.id}/print?exam_id=${checkTest.id}&title=${encodeURIComponent(checkTest.title)}&date=`}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                인쇄 화면
              </a>
              <a href={`/tests/${checkTest.id}`} className="underline">시험 열기</a>
            </span>
          )}
          {checkTestError && <span className="text-red-600">{checkTestError}</span>}
        </div>
      )}

      {loadError && <div className="mb-3 rounded border border-red-200 bg-red-50 p-3 text-sm text-red-600">{loadError}</div>}

      {/* 일괄 사용하기: 지금 보이는 목록에 '확인 필요' 단어가 있을 때만 */}
      {selectablePending.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm">
          <span className="text-green-800">
            확인 필요 단어 <b>{checkedPendingCount}</b>개 선택됨 (이 목록의 확인 필요 {selectablePending.length}개 중)
          </span>
          <button
            onClick={bulkApprove}
            disabled={bulkSaving || checkedPendingCount === 0}
            className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
          >
            선택한 {checkedPendingCount}개 사용하기
          </button>
          {checkedPendingCount > 0 && (
            <button onClick={() => setChecked(new Set())} className="text-xs text-gray-500 underline">선택 해제</button>
          )}
          {bulkMessage && <span className={`text-xs ${bulkMessage.ok ? 'text-green-700' : 'text-red-600'}`}>{bulkMessage.text}</span>}
        </div>
      )}
      {selectablePending.length === 0 && bulkMessage && (
        <p className={`mb-2 text-xs ${bulkMessage.ok ? 'text-green-700' : 'text-red-600'}`}>{bulkMessage.text}</p>
      )}

      {/* 무엇으로 걸러진 목록인지 한 줄 요약 */}
      {!loading && <p className="mb-1 text-xs font-medium text-gray-600">{filterSummary}</p>}

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* 목록 */}
        <div className="overflow-x-auto rounded border border-gray-200 bg-white">
          {loading ? (
            <p className="p-6 text-center text-sm text-gray-400">불러오는 중…</p>
          ) : filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">해당하는 어휘가 없습니다.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
                  <th className="w-8 px-2 py-2 text-center">
                    {selectablePending.length > 0 && (
                      <input
                        type="checkbox"
                        title="이 목록의 확인 필요 단어 모두 선택"
                        checked={checkedPendingCount === selectablePending.length}
                        onChange={(ev) => setChecked(ev.target.checked ? new Set(selectablePending.map((e) => e.id)) : new Set())}
                      />
                    )}
                  </th>
                  <th className="px-3 py-2 text-left">표현</th>
                  <th className="px-3 py-2 text-left">품사</th>
                  <th className="px-3 py-2 text-left">대표 뜻</th>
                  <th className="px-3 py-2 text-right">난이도</th>
                  <th className="px-3 py-2 text-left">레벨</th>
                  <th className="px-3 py-2 text-center">한→영</th>
                  <th className="px-3 py-2 text-left">상태</th>
                  <th className="px-3 py-2 text-center">검수</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelectedId(e.id)}
                    className={`cursor-pointer border-b border-gray-100 last:border-0 hover:bg-blue-50 ${e.id === selectedId ? 'bg-blue-50' : ''}`}
                  >
                    <td className="px-2 py-1.5 text-center" onClick={(ev) => ev.stopPropagation()}>
                      {e.status === 'pending' && (
                        <input
                          type="checkbox"
                          checked={checked.has(e.id)}
                          onChange={(ev) =>
                            setChecked((prev) => {
                              const next = new Set(prev)
                              if (ev.target.checked) next.add(e.id)
                              else next.delete(e.id)
                              return next
                            })
                          }
                        />
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-medium text-gray-800">
                      {e.expression}
                      {e.sense_note && <span className="ml-1 text-[10px] text-gray-400">*</span>}
                    </td>
                    <td className="px-3 py-1.5 text-gray-500">{e.pos ? POS_LABELS_KO[e.pos] : '-'}</td>
                    <td className="px-3 py-1.5 text-gray-700">{e.meaning_ko}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700">{e.base_difficulty ?? '-'}</td>
                    <td className="px-3 py-1.5 text-xs text-gray-500">{levelText(e.base_difficulty)}</td>
                    <td className="px-3 py-1.5 text-center">{e.ko_en_allowed ? '○' : '–'}</td>
                    <td className="px-3 py-1.5">
                      <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[vocabularyViewState(e)]}`}>{VOCABULARY_VIEW_STATE_LABELS[vocabularyViewState(e)]}</span>
                    </td>
                    <td className="px-3 py-1.5 text-center text-xs">
                      {reviewState(e) === 'reviewed' ? (
                        <span className="text-green-600">✔</span>
                      ) : reviewState(e) === 'edited' ? (
                        <span className="text-amber-600" title={REVIEW_STATE_LABELS.edited}>수정</span>
                      ) : (
                        <span className="text-gray-400">미확인</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 상세 / 검수 */}
        <div className="h-fit rounded border border-gray-200 bg-white p-4 lg:sticky lg:top-4">
          {!selected ? (
            <p className="py-10 text-center text-sm text-gray-400">
              {message?.ok ? message.text : '목록에서 어휘를 선택하세요.'}
            </p>
          ) : (
            <div className="space-y-3 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-semibold text-gray-900">{selected.expression}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_BADGE[vocabularyViewState(selected)]}`}>{VOCABULARY_VIEW_STATE_LABELS[vocabularyViewState(selected)]}</span>
                  <span
                    className={`rounded px-1.5 py-0.5 text-xs ${
                      reviewState(selected) === 'reviewed' ? 'bg-green-50 text-green-700'
                        : reviewState(selected) === 'edited' ? 'bg-amber-50 text-amber-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {REVIEW_STATE_LABELS[reviewState(selected)]}
                  </span>
                </div>
                <p className="text-xs text-gray-500">
                  {selected.pos ?? '품사 없음'} · {selected.entry_type}
                </p>
                {selected.sense_note && <p className="text-xs text-gray-600">의미 구분: {selected.sense_note}</p>}
                <p className="text-xs text-gray-400">출처: {sourceLabel(selected)}</p>
                {selected.approval_origin && (
                  <p className="text-xs text-gray-400">승인 경로: {VOCABULARY_APPROVAL_ORIGIN_LABELS[selected.approval_origin]}</p>
                )}
                {selected.status === 'rejected' && selected.reject_reason && (
                  <p className="text-xs text-red-500">
                    영구 제외 사유: {VOCABULARY_REJECT_REASON_LABELS[selected.reject_reason]}
                    {selected.reject_note ? ` (${selected.reject_note})` : ''}
                  </p>
                )}
              </div>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">대표 뜻 (시험 기본 정답)</span>
                <input value={meaning} onChange={(e) => setMeaning(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-600">추가로 인정할 뜻 (쉼표로 구분)</span>
                <input value={accepted} onChange={(e) => setAccepted(e.target.value)} className="w-full rounded border border-gray-300 px-2 py-1.5" />
              </label>

              <div>
                <span className="mb-1 block text-xs font-medium text-gray-600">난이도 (1~100)</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button onClick={() => nudge(-DIFFICULTY_NUDGE_STEP)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                    조금 쉽게 −{DIFFICULTY_NUDGE_STEP}
                  </button>
                  <input
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    inputMode="numeric"
                    className="w-16 rounded border border-gray-300 px-2 py-1 text-center"
                  />
                  <button onClick={() => nudge(DIFFICULTY_NUDGE_STEP)} className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-50">
                    조금 어렵게 +{DIFFICULTY_NUDGE_STEP}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {difficultyChanged ? (
                    <>
                      <b className="text-orange-600">
                        {selected.base_difficulty ?? '없음'} → {Number.isNaN(draftDifficulty) ? '?' : draftDifficulty ?? '없음'}
                      </b>{' '}
                      (저장 전) · {levelText(draftDifficulty === null || Number.isNaN(draftDifficulty) ? null : draftDifficulty)}
                    </>
                  ) : (
                    levelText(selected.base_difficulty)
                  )}
                </p>
              </div>

              <label className="flex items-center gap-2">
                <input type="checkbox" checked={koEn} onChange={(e) => setKoEn(e.target.checked)} />
                <span className="text-sm text-gray-700">한→영 출제 가능</span>
                <span className="text-xs text-gray-400">(정답 영어가 하나로 정해질 때만)</span>
              </label>

              <div className="grid grid-cols-[1fr_1.4fr] gap-2">
                <select
                  value={reviewReason}
                  onChange={(e) => setReviewReason(e.target.value as ReviewReason | '')}
                  className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                >
                  <option value="">판단 이유 (선택)</option>
                  {Object.entries(REVIEW_REASON_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <input
                  value={reviewMemo}
                  onChange={(e) => setReviewMemo(e.target.value)}
                  placeholder="짧은 메모 (선택)"
                  className="rounded border border-gray-300 px-2 py-1.5 text-xs"
                />
              </div>

              {/* 검수 버튼 */}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={confirmAsIs}
                  disabled={saving}
                  className="rounded border border-green-600 py-2 text-sm text-green-700 hover:bg-green-50 disabled:opacity-40"
                  title="값은 그대로 두고 검수만 완료 → 다음 단어"
                >
                  현재 기준 맞음
                </button>
                <button
                  onClick={completeReview}
                  disabled={saving}
                  className="rounded bg-indigo-600 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-40"
                  title="수정한 값 저장 + 검수 완료 → 다음 단어"
                >
                  검수 완료 → 다음
                </button>
              </div>
              <button
                onClick={saveEdits}
                disabled={saving}
                className="w-full rounded border border-blue-600 py-1.5 text-sm text-blue-600 hover:bg-blue-50 disabled:opacity-40"
              >
                수정만 저장 (이 단어에 머무르기)
              </button>

              {message && <p className={`text-sm ${message.ok ? 'text-green-600' : 'text-red-600'}`}>{message.text}</p>}

              <div className="space-y-2 border-t border-gray-100 pt-3">
                {/* 상태 버튼 (설계도 C-1) */}
                {vocabularyViewState(selected) === 'pending' && (
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => runAction('approve', '사용 중으로 바꿨습니다. 이제 시험에 나옵니다.')}
                      disabled={saving}
                      className="rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                    >
                      사용하기
                    </button>
                    <button
                      onClick={() => runAction('defer', '나중에 결정으로 미뤘습니다.')}
                      disabled={saving}
                      className="rounded border border-orange-400 py-2 text-sm text-orange-700 hover:bg-orange-50 disabled:opacity-40"
                    >
                      나중에 결정
                    </button>
                  </div>
                )}
                {vocabularyViewState(selected) === 'deferred' && (
                  <button
                    onClick={() => runAction('approve', '사용 중으로 바꿨습니다. 이제 시험에 나옵니다.')}
                    disabled={saving}
                    className="w-full rounded bg-green-600 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                  >
                    사용하기
                  </button>
                )}
                {selected.status === 'approved' && (
                  <button
                    onClick={() => runAction('archive', '사용 중단했습니다. 시험에 더 이상 나오지 않습니다.')}
                    disabled={saving}
                    className="w-full rounded border border-gray-400 py-1.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-40"
                  >
                    사용 중단
                  </button>
                )}
                {selected.status === 'archived' && (
                  <button
                    onClick={() => runAction('restore', '다시 사용 중으로 바꿨습니다.')}
                    disabled={saving}
                    className="w-full rounded border border-green-600 py-1.5 text-sm text-green-700 hover:bg-green-50 disabled:opacity-40"
                  >
                    다시 사용하기
                  </button>
                )}
                {/* 영구 제외: 확인 필요 / 나중에 결정 / 사용 중단에서만. 사유 필수 + 경고 확인 */}
                {(selected.status === 'pending' || selected.status === 'archived') && (
                  <div className="space-y-2 rounded border border-red-100 bg-red-50/40 p-2">
                    <div className="flex gap-2">
                      <select
                        value={rejectReason}
                        onChange={(e) => setRejectReason(e.target.value as VocabularyRejectReason | '')}
                        className="flex-1 rounded border border-gray-300 px-2 py-1.5 text-sm"
                      >
                        <option value="">영구 제외 사유 선택 (필수)</option>
                        {VOCABULARY_SELECTABLE_REJECT_REASONS.map((k) => (
                          <option key={k} value={k}>{VOCABULARY_REJECT_REASON_LABELS[k]}</option>
                        ))}
                      </select>
                      <button
                        onClick={excludePermanently}
                        disabled={saving}
                        className="rounded border border-red-500 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-40"
                      >
                        영구 제외
                      </button>
                    </div>
                    <input
                      value={rejectNote}
                      onChange={(e) => setRejectNote(e.target.value)}
                      placeholder="메모 (선택)"
                      className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                    />
                  </div>
                )}
                {selected.status === 'rejected' && (
                  <button
                    onClick={reopenRejected}
                    disabled={saving}
                    className="w-full rounded border border-amber-500 py-1.5 text-sm text-amber-700 hover:bg-amber-50 disabled:opacity-40"
                  >
                    다시 검토하기 (확인 필요로)
                  </button>
                )}
              </div>

              {notes.length > 0 && (
                <div className="border-t border-gray-100 pt-2 text-xs text-gray-500">
                  <p className="mb-1 font-medium">검수 기록 (✔ 검수 완료 · ★ 소유자 승인 · ✎ 수정 메모)</p>
                  {notes.map((n) => (
                    <p key={n.id}>
                      {n.source_ref.startsWith(REVIEW_DONE_REF_PREFIX) ? '✔ ' : n.source_ref.startsWith(OWNER_APPROVAL_REF_PREFIX) ? '★ ' : '✎ '}
                      {n.created_at.slice(0, 10)} · {n.rationale}
                      {n.suggested_difficulty !== null ? ` (당시 난이도 ${n.suggested_difficulty})` : ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      <CopyrightBelow target="vocabulary" />
    </div>
  )
}
