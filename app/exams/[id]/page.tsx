'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'

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

  const addedIds = new Set(examQuestions.map((q) => q.question_data.id))

  async function addQuestion(q: BankQuestion) {
    setAdding(q.id)
    const res = await fetch('/api/exam-questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exam_id: examId,
        question_data: { ...q, passage: q.question_set_id ? passages[q.question_set_id] : undefined },
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
          question_data: { ...q, passage: q.question_set_id ? passages[q.question_set_id] : undefined },
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
    const url = `/exams/${examId}/print?title=${encodeURIComponent(exam?.title ?? '')}&date=${encodeURIComponent(exam?.exam_date ?? '')}&data=${encodeURIComponent(JSON.stringify(examQuestions))}`
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
          {showBank ? '✕ 문제은행 닫기' : '+ 문제은행에서 추가'}
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
                  <p className="text-sm text-gray-800 line-clamp-2">{eq.question_data.question}</p>
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

      {/* 문제은행 패널 */}
      {showBank && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">

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
        </div>
      )}
    </div>
  )
}
