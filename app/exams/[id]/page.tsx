'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  PassageEssay,
  PassageQuestion,
  PassageRecord,
  PassageSummary,
  PassageVariantLevel,
  VARIANT_LABELS,
} from '@/types/passageBank'
import {
  buildExternalExamQuestionData,
  ExamSourceKind,
  externalAddedKeys,
  isExternalItemAdded,
} from '@/lib/externalPassageExam'
import { bankAddedIds, buildBankExamQuestionData } from '@/lib/questionBankExam'
import { buildPickerRows, isPassageComplete, pickerLevelOptions, VARIANT_ORDER } from '@/lib/externalPassagePicker'
import { schoolStageBadgeClass } from '@/lib/gradeLevel'

interface Exam {
  id: string
  title: string
  exam_date: string | null
  total_questions: number | null
  max_score: number | null
  created_at: string
}

interface ExamQuestion {
  id: string
  exam_id: string
  question_data: QuestionData
  sort_order: number
  points: number
}

interface QuestionData {
  id?: string
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  grade?: string
  difficulty?: number
  passage?: string
  // 외부지문저장소 'order' 유형 전용: 배열할 문장들
  items?: string[]
  // 외부지문저장소 'match' 유형 전용: 좌우 짝짓기
  matchWords?: string[]
  matchMeanings?: string[]
  // 출처(provenance) — 추적·중복 추가 방지용 (DB 컬럼 추가 없이 이 JSON 안에서 처리). lib/externalPassageExam.ts 참고
  source?: 'external_passage' | 'question_bank'
  source_passage_id?: string
  source_kind?: ExamSourceKind
  source_question_id?: string
  source_question_set_id?: string | null
  source_index?: number
  // 단어은행 단어시험 문항 (type 'word', lib/wordTest.ts)
  direction?: 'en_ko' | 'ko_en'
}

interface BankQuestion {
  id: string
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  grade?: string
  topic?: string
  difficulty?: number
  question_set_id?: string
}

const TYPE_LABELS: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  essay: '서술형',
  summary: '지문요약',
  mc: '객관식',
  blank: '빈칸',
  tf: '참/거짓',
  order: '순서배열',
  match: '짝짓기',
  word: '단어',
}

// order/match 는 "q" 필드가 없으므로, 체크리스트에 보여줄 짧은 미리보기 문구를 따로 만든다.
function questionPreviewText(q: PassageQuestion): string {
  if (q.type === 'order') return `문장 배열: ${q.items[0]?.slice(0, 40) ?? ''}…`
  if (q.type === 'match') return `짝짓기: ${q.pairs.map((p) => p.word).join(', ')}`
  return q.q
}

export default function ExamDetailPage() {
  const params = useParams()
  const router = useRouter()
  const examId = params.id as string

  const [exam, setExam] = useState<Exam | null>(null)
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [loading, setLoading] = useState(true)
  const [showBank, setShowBank] = useState(false)
  // 세트 목록
  const [questionSets, setQuestionSets] = useState<{id:string; grade:string; topic:string; created_at:string}[]>([])
  const [setsLoading, setSetsLoading] = useState(false)
  const [setSearch, setSetSearch] = useState('')
  // 개별 문항 (세트 선택 후)
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [bankLoading, setBankLoading] = useState(false)
  const [bankGrade, setBankGrade] = useState('all')
  const [bankType, setBankType] = useState('all')
  const [bankSearch, setBankSearch] = useState('')
  const [selectedSetId, setSelectedSetId] = useState<string | null>(null)
  const [selectedSetTopic, setSelectedSetTopic] = useState('')
  const [adding, setAdding] = useState<string | null>(null)
  const [addingAll, setAddingAll] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const [passages, setPassages] = useState<Record<string, string>>({})

  // 외부지문저장소에서 문제 담기 (STEP 7)
  const [bankSource, setBankSource] = useState<'ai' | 'external'>('ai')
  const [extItems, setExtItems] = useState<PassageSummary[]>([])
  const [extLoading, setExtLoading] = useState(false)
  const [extSearch, setExtSearch] = useState('')
  const [extLevel, setExtLevel] = useState('all')
  // 펼쳐둔 지문 그룹 (문제 화면에서 목록으로 돌아와도 유지)
  const [extExpanded, setExtExpanded] = useState<Set<string>>(new Set())
  const [extSelectedId, setExtSelectedId] = useState<string | null>(null)
  const [extRecord, setExtRecord] = useState<PassageRecord | null>(null)
  const [extRecordLoading, setExtRecordLoading] = useState(false)
  const [extQChecked, setExtQChecked] = useState<boolean[]>([])
  const [extEChecked, setExtEChecked] = useState<boolean[]>([])
  const [extAdding, setExtAdding] = useState(false)
  // 지문을 빠르게 바꿔 누를 때, 늦게 도착한 이전 지문 응답이 현재 화면(선택상태)을 덮어쓰지 않게 하는 번호표
  const extRequestSeq = useRef(0)

  useEffect(() => {
    loadExam()
    loadExamQuestions()
  }, [examId])

  async function loadExam() {
    const res = await fetch(`/api/exams/${examId}`)
    const json = await res.json()
    if (!json.error) setExam(json.data)
    setLoading(false)
  }

  async function loadExamQuestions() {
    const res = await fetch(`/api/exam-questions?exam_id=${examId}`)
    const json = await res.json()
    if (!json.error) setExamQuestions(json.data ?? [])
  }

  // 세트 목록 로드
  async function loadSets() {
    setSetsLoading(true)
    const res = await fetch('/api/question-sets')
    const json = await res.json()
    if (!json.error) setQuestionSets(json.data ?? [])
    setSetsLoading(false)
  }

  // 특정 세트의 문항 로드
  async function loadSetQuestions(setId: string, topic: string) {
    setSelectedSetId(setId)
    setSelectedSetTopic(topic)
    setBankLoading(true)
    const res = await fetch(`/api/questions/search?question_set_id=${setId}`)
    const json = await res.json()
    if (!json.error) {
      setBankQuestions(json.data ?? [])
      setPassages(json.passages ?? {})
    }
    setBankLoading(false)
  }

  async function loadBank() {
    setBankLoading(true)
    const qs = new URLSearchParams()
    if (bankGrade !== 'all') qs.set('grade', bankGrade)
    const res = await fetch(`/api/questions/search?${qs}`)
    const json = await res.json()
    if (!json.error) {
      setBankQuestions(json.data ?? [])
      setPassages(json.passages ?? {})
    }
    setBankLoading(false)
  }

  useEffect(() => {
    if (showBank) loadSets()
  }, [showBank])

  const addedIds = bankAddedIds(examQuestions)

  // ── 외부지문저장소에서 문제 담기 (STEP 7) ──

  useEffect(() => {
    if (showBank && bankSource === 'external' && extItems.length === 0) loadExtItems()
  }, [showBank, bankSource])

  async function loadExtItems() {
    setExtLoading(true)
    try {
      const res = await fetch('/api/passages')
      const json = await res.json()
      if (!json.error) {
        // 보관함으로 옮겨둔 자료는 지금 쓰는 자료가 아니므로 목록에서 뺀다.
        const list = (json.data ?? []) as (PassageSummary & { group_archived?: boolean | null })[]
        setExtItems(list.filter((p) => !(p.group_id ? p.group_archived : p.archived)))
      }
    } catch {
      // 조용히 실패 — 목록이 비어있으면 화면에서 "저장된 외부지문이 없습니다"로 보인다.
    } finally {
      setExtLoading(false)
    }
  }

  // 지문(난이도)을 바꾸면 체크 상태는 항상 새로 시작한다 — 이전 지문의 체크가 다른 지문에 옮겨붙지 않는다.
  async function selectExtPassage(id: string) {
    const seq = ++extRequestSeq.current
    setExtSelectedId(id)
    setExtRecord(null)
    setExtQChecked([])
    setExtEChecked([])
    setExtRecordLoading(true)
    try {
      const res = await fetch(`/api/passages/${id}`)
      const json = await res.json()
      if (seq !== extRequestSeq.current) return
      if (!json.error) {
        setExtRecord(json.data)
        setExtQChecked(new Array(json.data.questions.length).fill(true))
        setExtEChecked(new Array(json.data.essays.length).fill(true))
      }
    } finally {
      if (seq === extRequestSeq.current) setExtRecordLoading(false)
    }
  }

  function backToExtList() {
    extRequestSeq.current++
    setExtRecordLoading(false)
    setExtSelectedId(null)
    setExtRecord(null)
    setExtQChecked([])
    setExtEChecked([])
  }

  // 이 지문의 문제 중 이미 이번 시험에 담겨 있는 것 (question_data 안의 source_* 값으로 판단, DB 컬럼 추가 없음)
  // qid 가 있으면 qid 로, qid 없는 legacy 시험문항만 index 로 비교한다 (lib/externalPassageExam.ts)
  const extAddedKeySet = useMemo(
    () => (extRecord ? externalAddedKeys(examQuestions, extRecord.id) : new Set<string>()),
    [examQuestions, extRecord],
  )
  function isExtAdded(kind: ExamSourceKind, index: number, item: PassageQuestion | PassageEssay): boolean {
    return !!extRecord && isExternalItemAdded(extAddedKeySet, extRecord.id, kind, index, item.qid)
  }

  const extRows = useMemo(
    () => buildPickerRows(extItems, { search: extSearch, level: extLevel }),
    [extItems, extSearch, extLevel],
  )
  const extLevelOptions = useMemo(() => pickerLevelOptions(extItems), [extItems])
  // 문제 화면 상단에서 같은 그룹의 다른 난이도로 바로 이동하기 위한 목록
  const extSiblings = useMemo(() => {
    const current = extItems.find((p) => p.id === extSelectedId)
    if (!current?.group_id) return []
    return extItems
      .filter((p) => p.group_id === current.group_id)
      .sort(
        (a, b) =>
          VARIANT_ORDER.indexOf(a.variant_level as PassageVariantLevel) -
          VARIANT_ORDER.indexOf(b.variant_level as PassageVariantLevel),
      )
  }, [extItems, extSelectedId])

  function toggleExtGroup(groupId: string) {
    setExtExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const extTotalCount = extRecord ? extRecord.questions.length + extRecord.essays.length : 0
  const extSelectedCount = extQChecked.filter(Boolean).length + extEChecked.filter(Boolean).length

  function toggleAllExt(value: boolean) {
    if (!extRecord) return
    setExtQChecked(
      extRecord.questions.map((q, i) => (isExtAdded('question', i, q) ? true : value)),
    )
    setExtEChecked(
      extRecord.essays.map((e, i) => (isExtAdded('essay', i, e) ? true : value)),
    )
  }

  async function addSelectedExternal() {
    if (!extRecord || extRecord.id !== extSelectedId) return
    const toAdd: { kind: ExamSourceKind; index: number; item: PassageQuestion | PassageEssay }[] = []
    extRecord.questions.forEach((q, i) => {
      if (extQChecked[i] && !isExtAdded('question', i, q)) {
        toAdd.push({ kind: 'question', index: i, item: q })
      }
    })
    extRecord.essays.forEach((e, i) => {
      if (extEChecked[i] && !isExtAdded('essay', i, e)) {
        toAdd.push({ kind: 'essay', index: i, item: e })
      }
    })
    if (toAdd.length === 0) {
      alert('추가할 문제를 선택해주세요.')
      return
    }
    setExtAdding(true)
    try {
      const results: ExamQuestion[] = []
      for (const { kind, index, item } of toAdd) {
        const question_data = buildExternalExamQuestionData({ id: extRecord.id, body: extRecord.body }, kind, index, item)
        const res = await fetch('/api/exam-questions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exam_id: examId,
            question_data,
            sort_order: examQuestions.length + results.length,
            points: 5,
          }),
        })
        const json = await res.json()
        if (!json.error) results.push(json.data)
      }
      setExamQuestions((prev) => [...prev, ...results])
      if (results.length > 0) alert(`${results.length}개 문제를 시험에 추가했습니다.`)
    } catch {
      alert('추가 중 오류가 발생했습니다.')
    } finally {
      setExtAdding(false)
    }
  }

  async function addQuestion(q: BankQuestion) {
    setAdding(q.id)
    const res = await fetch('/api/exam-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_id: examId,
        question_data: buildBankExamQuestionData(q, q.question_set_id ? passages[q.question_set_id] : undefined),
        sort_order: examQuestions.length,
        points: 5,
      }),
    })
    const json = await res.json()
    if (!json.error) setExamQuestions((prev) => [...prev, json.data])
    setAdding(null)
  }

  // 전체 추가 (미추가 문항만)
  async function addAllQuestions() {
    const toAdd = filteredBank.filter((q) => !addedIds.has(q.id))
    if (toAdd.length === 0) return
    setAddingAll(true)
    const results: ExamQuestion[] = []
    for (let i = 0; i < toAdd.length; i++) {
      const q = toAdd[i]
      const res = await fetch('/api/exam-questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exam_id: examId,
          question_data: buildBankExamQuestionData(q, q.question_set_id ? passages[q.question_set_id] : undefined),
          sort_order: examQuestions.length + i,
          points: 5,
        }),
      })
      const json = await res.json()
      if (!json.error) results.push(json.data)
    }
    setExamQuestions((prev) => [...prev, ...results])
    setAddingAll(false)
  }

  async function removeQuestion(eqId: string) {
    setRemoving(eqId)
    await fetch(`/api/exam-questions?id=${eqId}`, { method: 'DELETE' })
    setExamQuestions((prev) => prev.filter((q) => q.id !== eqId))
    setRemoving(null)
  }

  async function updatePoints(eqId: string, points: number) {
    await fetch('/api/exam-questions', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: eqId, points }),
    })
    setExamQuestions((prev) => prev.map((q) => q.id === eqId ? { ...q, points } : q))
  }

  function openPrint() {
    const url = `/exams/${examId}/print?exam_id=${examId}&title=${encodeURIComponent(exam?.title ?? '')}&date=${encodeURIComponent(exam?.exam_date ?? '')}`
    const a = document.createElement('a')
    a.href = url
    a.target = '_blank'
    a.rel = 'noopener noreferrer'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }

  const filteredBank = bankQuestions.filter((q) => {
    if (bankType !== 'all' && q.type !== bankType) return false
    if (bankSearch.trim()) {
      const kw = bankSearch.trim().toLowerCase()
      return (
        (q.topic ?? '').toLowerCase().includes(kw) ||
        (q.question ?? '').toLowerCase().includes(kw) ||
        (q.grade ?? '').toLowerCase().includes(kw)
      )
    }
    return true
  })

  const totalPoints = examQuestions.reduce((s, q) => s + q.points, 0)

  if (loading) return <div className="py-20 text-center text-sm text-gray-400">불러오는 중…</div>
  if (!exam) return <div className="py-20 text-center text-sm text-red-400">시험을 찾을 수 없습니다.</div>

  return (
    <div>
      {/* 헤더 */}
      <div className="mb-6 flex items-center gap-3">
        <button onClick={() => router.back()} className="text-gray-400 hover:text-gray-600">← 목록</button>
        <h1 className="text-xl font-semibold text-gray-800">{exam.title}</h1>
        <div className="flex-1" />
        <button
          onClick={openPrint}
          disabled={examQuestions.length === 0}
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          🖨️ 시험지 출력
        </button>
      </div>

      {/* 시험 정보 */}
      <div className="mb-6 flex flex-wrap gap-4 rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-600">
        {exam.exam_date && <span>📅 시험일: <strong>{exam.exam_date}</strong></span>}
        {exam.max_score && <span>🎯 만점: <strong>{exam.max_score}점</strong></span>}
        <span>📝 선택된 문항: <strong className="text-blue-600">{examQuestions.length}문항</strong></span>
        <span>합계 배점: <strong className="text-green-600">{totalPoints}점</strong></span>
      </div>

      {/* 선택된 문항 목록 */}
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-700">시험 문항 ({examQuestions.length})</h2>
        <button
          onClick={() => setShowBank(!showBank)}
          className="rounded border border-blue-300 bg-blue-50 px-3 py-1.5 text-sm text-blue-700 hover:bg-blue-100"
        >
          {showBank ? '✕ 문제 추가 닫기' : '+ 문제 추가'}
        </button>
      </div>

      {examQuestions.length === 0 ? (
        <div className="mb-6 rounded-lg border border-dashed border-gray-300 bg-gray-50 py-12 text-center text-sm text-gray-400">
          아직 문항이 없습니다. 문제은행에서 추가해보세요.
        </div>
      ) : (
        <div className="mb-6 space-y-3">
          {examQuestions.map((eq, idx) => (
            <div key={eq.id} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="mb-1 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                      {TYPE_LABELS[eq.question_data.type] ?? eq.question_data.type}
                    </span>
                    {eq.question_data.grade && (
                      <span className="text-xs text-gray-400">{eq.question_data.grade}</span>
                    )}
                  </div>
                  {eq.question_data.type === 'word' ? (
                    // 단어은행 단어시험 문항: 방향 · 제시어 → 정답
                    <p className="text-sm text-gray-800">
                      <span className="mr-1 text-xs text-gray-400">
                        {eq.question_data.direction === 'ko_en' ? '한→영' : '영→한'}
                      </span>
                      {eq.question_data.question} <span className="text-gray-400">→ {eq.question_data.answer}</span>
                    </p>
                  ) : (
                    <p className="text-sm text-gray-800 line-clamp-2">{eq.question_data.question}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <input
                    type="number"
                    value={eq.points}
                    onChange={(e) => updatePoints(eq.id, Number(e.target.value))}
                    className="w-14 rounded border border-gray-300 px-2 py-1 text-center text-sm"
                    min={1}
                  />
                  <span className="text-xs text-gray-400">점</span>
                  <button
                    onClick={() => removeQuestion(eq.id)}
                    disabled={removing === eq.id}
                    className="ml-1 rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-40"
                  >
                    삭제
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 문제 추가 패널: AI 문제은행 / 외부지문저장소 */}
      {showBank && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <div className="mb-4 flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setBankSource('ai')}
              className={`px-3 py-2 text-sm font-medium ${
                bankSource === 'ai' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              🧠 AI 문제은행
            </button>
            <button
              onClick={() => setBankSource('external')}
              className={`px-3 py-2 text-sm font-medium ${
                bankSource === 'external' ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              📁 외부지문저장소
            </button>
          </div>

          {bankSource === 'ai' && (
            <>
          {/* ── STEP 1: 세트 선택 ── */}
          {!selectedSetId && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">📚 문제 세트 선택</h3>
                <span className="text-xs text-gray-400">세트를 선택하면 해당 문항이 나옵니다</span>
              </div>
              <input
                type="text"
                value={setSearch}
                onChange={(e) => setSetSearch(e.target.value)}
                placeholder="🔍 세트 검색 (예: 가족, 학교...)"
                className="mb-3 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
              />
              {setsLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {questionSets
                    .filter(s => !setSearch || (s.topic ?? '').includes(setSearch) || (s.grade ?? '').includes(setSearch))
                    .map((s) => (
                      <div key={s.id}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-blue-300 hover:bg-blue-50"
                        onClick={() => loadSetQuestions(s.id, s.topic)}
                      >
                        <div>
                          <p className="text-sm font-medium text-gray-800">{s.topic || '(제목없음)'}</p>
                          <p className="text-xs text-gray-400">{s.grade} · {new Date(s.created_at).toLocaleDateString('ko-KR')}</p>
                        </div>
                        <span className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">선택 →</span>
                      </div>
                    ))
                  }
                  {questionSets.length === 0 && (
                    <div className="py-8 text-center text-sm text-gray-400">저장된 문제 세트가 없습니다.</div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── STEP 2: 선택한 세트의 문항 목록 ── */}
          {selectedSetId && (
            <>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => { setSelectedSetId(null); setSelectedSetTopic(''); setBankQuestions([]) }}
                    className="text-xs text-blue-600 hover:underline"
                  >← 세트 목록</button>
                  <h3 className="text-sm font-semibold text-gray-700">📖 {selectedSetTopic}</h3>
                  <span className="text-xs text-gray-400">({filteredBank.length}문항)</span>
                </div>
                <button
                  onClick={addAllQuestions}
                  disabled={addingAll || filteredBank.filter(q => !addedIds.has(q.id)).length === 0}
                  className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-40"
                >
                  {addingAll ? '추가 중…' : `✚ 전체 추가 (${filteredBank.filter(q => !addedIds.has(q.id)).length}문항)`}
                </button>
              </div>

              {bankLoading ? (
                <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
              ) : filteredBank.length === 0 ? (
                <div className="py-8 text-center text-sm text-gray-400">문항이 없습니다.</div>
              ) : (
                <div className="max-h-96 overflow-y-auto space-y-2">
                  {filteredBank.map((q) => {
                    const isAdded = addedIds.has(q.id)
                    return (
                      <div
                        key={q.id}
                        className={`flex items-start gap-3 rounded-lg border p-3 ${
                          isAdded ? 'border-green-200 bg-green-50' : 'border-gray-100 hover:border-blue-200'
                        }`}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="mb-1 flex items-center gap-2">
                            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">
                              {TYPE_LABELS[q.type] ?? q.type}
                            </span>
                            {q.grade && <span className="text-xs text-gray-400">{q.grade}</span>}
                          </div>
                          <p className="text-xs text-gray-700 line-clamp-2">{q.question}</p>
                        </div>
                        <button
                          onClick={() => !isAdded && addQuestion(q)}
                          disabled={isAdded || adding === q.id}
                          className={`shrink-0 rounded px-3 py-1 text-xs font-medium ${
                            isAdded
                              ? 'bg-green-100 text-green-600 cursor-default'
                              : 'bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50'
                          }`}
                        >
                          {isAdded ? '✓ 추가됨' : adding === q.id ? '...' : '+ 추가'}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
            </>
          )}

          {bankSource === 'external' && (
            <>
              {/* ── STEP 1: 지문 그룹 선택 → 난이도 선택 ── */}
              {!extSelectedId ? (
                <>
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">📁 외부지문 선택</h3>
                    <span className="text-xs text-gray-400">지문을 펼쳐 난이도를 고르면 문제가 나옵니다</span>
                  </div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    <select
                      value={extLevel}
                      onChange={(e) => setExtLevel(e.target.value)}
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    >
                      <option value="all">전체 학년</option>
                      {extLevelOptions.map((lv) => (
                        <option key={lv} value={lv}>{lv}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={extSearch}
                      onChange={(e) => setExtSearch(e.target.value)}
                      placeholder="🔍 제목·주제 검색"
                      className="min-w-[200px] flex-1 rounded border border-gray-300 px-3 py-2 text-sm focus:border-blue-400 focus:outline-none"
                    />
                  </div>
                  {extLoading ? (
                    <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto space-y-2">
                      {extRows.map((row) => {
                        if (row.kind === 'single') {
                          const p = row.item
                          return (
                            <div
                              key={row.key}
                              className="flex cursor-pointer items-center justify-between rounded-lg border border-gray-100 p-3 hover:border-blue-300 hover:bg-blue-50"
                              onClick={() => selectExtPassage(p.id)}
                            >
                              <div>
                                <p className="text-sm font-medium text-gray-800">{p.title || '(제목없음)'}</p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                                  <span className={`rounded border px-1.5 py-0.5 text-[11px] ${schoolStageBadgeClass(p.level)}`}>
                                    {p.level || '학년 미정'}
                                  </span>
                                  {p.topic} · 단일 지문 · {p.question_count + p.essay_count}문제
                                  {!isPassageComplete(p) && <span className="text-amber-600">· 문제 부족</span>}
                                </p>
                              </div>
                              <span className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">선택 →</span>
                            </div>
                          )
                        }
                        const first = row.items[0]
                        const isOpen = extExpanded.has(row.groupId)
                        const complete = row.items.every(isPassageComplete)
                        const partialMatch = row.matchedIds.length < row.items.length
                        return (
                          <div key={row.key} className="overflow-hidden rounded-lg border border-gray-100">
                            <button
                              type="button"
                              onClick={() => toggleExtGroup(row.groupId)}
                              aria-expanded={isOpen}
                              className="flex w-full items-center gap-3 p-3 text-left hover:bg-gray-50"
                            >
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-gray-200 text-[10px] text-gray-500">
                                {isOpen ? '▼' : '▶'}
                              </span>
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-gray-800">{first.title || '(제목없음)'}</p>
                                <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-gray-400">
                                  <span className={`rounded border px-1.5 py-0.5 text-[11px] ${schoolStageBadgeClass(first.level)}`}>
                                    {first.level || '학년 미정'}
                                  </span>
                                  {first.topic} · {row.items.length}개 유형 ·
                                  <span className={complete ? 'text-green-600' : 'text-amber-600'}>
                                    {complete ? '완성' : '문제 부족'}
                                  </span>
                                  {partialMatch && (
                                    <span className="text-blue-500">
                                      · 검색 일치:{' '}
                                      {row.items
                                        .filter((i) => row.matchedIds.includes(i.id))
                                        .map((i) => (i.variant_level ? VARIANT_LABELS[i.variant_level] : '난이도 없음'))
                                        .join(', ')}
                                    </span>
                                  )}
                                </p>
                              </div>
                            </button>
                            {isOpen && (
                              <div className="divide-y divide-gray-100 border-t border-gray-100 bg-gray-50/60">
                                {row.items.map((child) => (
                                  <div
                                    key={child.id}
                                    className="flex cursor-pointer items-center justify-between py-2 pl-11 pr-3 hover:bg-blue-50"
                                    onClick={() => selectExtPassage(child.id)}
                                  >
                                    <p className="text-sm text-gray-700">
                                      {child.variant_level ? VARIANT_LABELS[child.variant_level] : '(난이도 없음)'}
                                      <span className="ml-2 text-xs text-gray-400">
                                        {child.question_count + child.essay_count}문제 ·{' '}
                                        <span className={isPassageComplete(child) ? 'text-green-600' : 'text-amber-600'}>
                                          {isPassageComplete(child) ? '완성' : '문제 부족'}
                                        </span>
                                      </span>
                                    </p>
                                    <span className="rounded bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">선택 →</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        )
                      })}
                      {extItems.length === 0 ? (
                        <div className="py-8 text-center text-sm text-gray-400">저장된 외부지문이 없습니다.</div>
                      ) : (
                        extRows.length === 0 && (
                          <div className="py-8 text-center text-sm text-gray-400">검색 결과가 없습니다.</div>
                        )
                      )}
                    </div>
                  )}
                </>
              ) : (
                <>
                  {/* ── STEP 2: 선택한 지문(난이도)의 문제 25개 체크리스트 ── */}
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        onClick={backToExtList}
                        disabled={extAdding}
                        className="text-xs text-blue-600 hover:underline disabled:opacity-40"
                      >
                        ← 지문 목록
                      </button>
                      <h3 className="text-sm font-semibold text-gray-700">📖 {extRecord?.title}</h3>
                      {extSiblings.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {extSiblings.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => s.id !== extSelectedId && selectExtPassage(s.id)}
                              disabled={extAdding}
                              className={`rounded border px-2 py-0.5 text-xs disabled:opacity-40 ${
                                s.id === extSelectedId
                                  ? 'border-blue-600 bg-blue-600 text-white'
                                  : 'border-gray-300 text-gray-600 hover:bg-gray-100'
                              }`}
                            >
                              {s.variant_level ? VARIANT_LABELS[s.variant_level] : '(난이도 없음)'}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {extRecord && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-blue-600">
                          선택 {extSelectedCount} / {extTotalCount}
                        </span>
                        <button
                          onClick={() => toggleAllExt(true)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          전체 선택
                        </button>
                        <button
                          onClick={() => toggleAllExt(false)}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-100"
                        >
                          전체 해제
                        </button>
                      </div>
                    )}
                  </div>

                  {extRecordLoading || !extRecord ? (
                    <div className="py-8 text-center text-sm text-gray-400">불러오는 중…</div>
                  ) : (
                    <>
                      <div className="max-h-96 overflow-y-auto space-y-1.5">
                        <p className="mb-1 text-xs font-semibold text-gray-500">일반문제 ({extRecord.questions.length})</p>
                        {extRecord.questions.map((q, i) => {
                          const key = q.qid ?? `question:${i}`
                          const already = isExtAdded('question', i, q)
                          return (
                            <label
                              key={key}
                              className={`flex items-start gap-2 rounded border p-2 text-xs ${
                                already ? 'border-green-200 bg-green-50' : 'border-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={extQChecked[i] ?? true}
                                disabled={already}
                                onChange={() =>
                                  setExtQChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                                }
                              />
                              <span className="flex-1">
                                <span className="mr-1 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
                                  {TYPE_LABELS[q.type] ?? q.type}
                                </span>
                                {questionPreviewText(q)}
                                {already && <span className="ml-1 text-green-600">✓ 추가됨</span>}
                              </span>
                            </label>
                          )
                        })}
                        <p className="mb-1 mt-3 text-xs font-semibold text-gray-500">서술형 ({extRecord.essays.length})</p>
                        {extRecord.essays.map((e, i) => {
                          const key = e.qid ?? `essay:${i}`
                          const already = isExtAdded('essay', i, e)
                          return (
                            <label
                              key={key}
                              className={`flex items-start gap-2 rounded border p-2 text-xs ${
                                already ? 'border-green-200 bg-green-50' : 'border-gray-100'
                              }`}
                            >
                              <input
                                type="checkbox"
                                className="mt-0.5"
                                checked={extEChecked[i] ?? true}
                                disabled={already}
                                onChange={() =>
                                  setExtEChecked((prev) => prev.map((v, idx) => (idx === i ? !v : v)))
                                }
                              />
                              <span className="flex-1">
                                <span className="mr-1 rounded bg-purple-100 px-1 text-[10px] text-purple-600">서술형</span>
                                {e.q}
                                {already && <span className="ml-1 text-green-600">✓ 추가됨</span>}
                              </span>
                            </label>
                          )
                        })}
                      </div>
                      <div className="mt-4 flex justify-end">
                        <button
                          onClick={addSelectedExternal}
                          disabled={extAdding || extSelectedCount === 0}
                          className="rounded bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-40"
                        >
                          {extAdding ? '추가 중…' : `선택한 문제 시험에 추가 (${extSelectedCount}개)`}
                        </button>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
