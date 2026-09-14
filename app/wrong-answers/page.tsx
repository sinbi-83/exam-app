'use client'

import { useEffect, useState, useMemo } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface Exam {
  id: string
  title: string
  exam_date: string | null
  max_score: number | null
}

interface ExamQuestion {
  id: string
  sort_order: number
  points: number
  question_data: {
    type: string
    question: string
    options?: string[]
    answer?: string
    explanation?: string
    passage?: string
  }
}

// 문제은행 문항 (직접 선택 모드)
interface BankQuestion {
  id: string
  type: string
  question: string
  options?: string[]
  answer?: string
  explanation?: string
  grade?: string
  difficulty?: number
  question_set_id?: string
}

// 직접 선택 모드에서 사용할 내부 문항 형식
interface PickedQuestion {
  id: string
  sort_order: number
  points: number
  question_data: {
    type: string
    question: string
    options?: string[]
    answer?: string
    explanation?: string
  }
}

const TYPE_LABELS: Record<string, string> = {
  vocab: '어휘',
  grammar: '어법',
  reading: '독해',
  essay: '서술형',
  summary: '지문요약',
}

function getTypeColor(pct: number) {
  if (pct >= 80) return { bg: 'bg-green-100', text: 'text-green-700', bar: 'bg-green-400', badge: '✅ 우수' }
  if (pct >= 60) return { bg: 'bg-blue-100', text: 'text-blue-700', bar: 'bg-blue-400', badge: '🔵 보통' }
  if (pct >= 40) return { bg: 'bg-amber-100', text: 'text-amber-700', bar: 'bg-amber-400', badge: '⚠️ 주의' }
  return { bg: 'bg-red-100', text: 'text-red-700', bar: 'bg-red-400', badge: '❌ 취약' }
}

type Mode = 'exam' | 'bank'

export default function WrongAnswersPage() {
  const [mode, setMode] = useState<Mode>('exam')

  // 공통
  const [students, setStudents] = useState<Student[]>([])
  const [selectedStudent, setSelectedStudent] = useState('')
  const [scoredAt, setScoredAt] = useState('')
  const [notes, setNotes] = useState('')
  const [wrongIds, setWrongIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showAnalysis, setShowAnalysis] = useState(false)
  const [existingRecordId, setExistingRecordId] = useState<string | null>(null)

  // 시험 모드
  const [exams, setExams] = useState<Exam[]>([])
  const [selectedExam, setSelectedExam] = useState('')
  const [examQuestions, setExamQuestions] = useState<ExamQuestion[]>([])
  const [questionsLoading, setQuestionsLoading] = useState(false)

  // 문제은행 직접 선택 모드
  const [bankQuestions, setBankQuestions] = useState<BankQuestion[]>([])
  const [bankLoading, setBankLoading] = useState(false)
  const [bankGrade, setBankGrade] = useState('all')
  const [bankType, setBankType] = useState('all')
  const [pickedQuestions, setPickedQuestions] = useState<PickedQuestion[]>([])  // 선택한 문항들
  const [showBankPanel, setShowBankPanel] = useState(false)

  // 유형 필터 (분석에서 제외할 유형)
  const [excludedTypes, setExcludedTypes] = useState<Set<string>>(new Set())

  function toggleExcludeType(type: string) {
    setExcludedTypes(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }

  // 현재 사용할 문항 목록 (모드 + 유형 필터 적용)
  const activeQuestions: PickedQuestion[] = (mode === 'exam'
    ? examQuestions.map(q => ({ ...q }))
    : pickedQuestions
  ).filter(q => !excludedTypes.has(q.question_data.type))

  useEffect(() => {
    fetch('/api/students').then(r => r.json()).then(j => setStudents(j.data ?? []))
    fetch('/api/exams').then(r => r.json()).then(j => setExams(j.data ?? []))
  }, [])

  // 시험 선택 시 문항 로드
  useEffect(() => {
    if (mode !== 'exam' || !selectedExam) { setExamQuestions([]); return }
    setQuestionsLoading(true)
    fetch(`/api/exam-questions?exam_id=${selectedExam}`)
      .then(r => r.json())
      .then(j => { setExamQuestions(j.data ?? []); setQuestionsLoading(false) })
  }, [selectedExam, mode])

  // 문제은행 로드
  useEffect(() => {
    if (!showBankPanel) return
    setBankLoading(true)
    const qs = new URLSearchParams()
    if (bankGrade !== 'all') qs.set('grade', bankGrade)
    fetch(`/api/questions/search?${qs}`)
      .then(r => r.json())
      .then(j => { setBankQuestions(j.data ?? []); setBankLoading(false) })
  }, [showBankPanel, bankGrade])

  // 학생+시험 둘 다 선택되면 기존 기록 불러오기
  useEffect(() => {
    if (!selectedStudent || (mode === 'exam' && !selectedExam)) {
      setWrongIds(new Set()); setNotes(''); setScoredAt('')
      setExistingRecordId(null); setSaved(false); setShowAnalysis(false)
      return
    }
    if (mode !== 'exam') return
    fetch(`/api/wrong-answers?student_id=${selectedStudent}&exam_id=${selectedExam}`)
      .then(r => r.json())
      .then(j => {
        const record = j.data?.[0]
        if (record) {
          setWrongIds(new Set(record.wrong_question_ids ?? []))
          setNotes(record.notes ?? '')
          setScoredAt(record.scored_at ?? '')
          setExistingRecordId(record.id)
          setSaved(true)
          setShowAnalysis(true)
        } else {
          setWrongIds(new Set()); setNotes(''); setScoredAt('')
          setExistingRecordId(null); setSaved(false); setShowAnalysis(false)
        }
      })
  }, [selectedStudent, selectedExam, mode])

  function toggleWrong(id: string) {
    setWrongIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setSaved(false)
    setShowAnalysis(false)
  }

  // 문제은행에서 문항 추가
  function pickBankQuestion(q: BankQuestion) {
    if (pickedQuestions.find(p => p.id === q.id)) return
    setPickedQuestions(prev => [...prev, {
      id: q.id,
      sort_order: prev.length,
      points: 5,
      question_data: {
        type: q.type,
        question: q.question,
        options: q.options,
        answer: q.answer,
        explanation: q.explanation,
      }
    }])
    setSaved(false)
    setShowAnalysis(false)
  }

  function removePicked(id: string) {
    setPickedQuestions(prev => prev.filter(q => q.id !== id))
    setWrongIds(prev => { const n = new Set(prev); n.delete(id); return n })
    setSaved(false); setShowAnalysis(false)
  }

  function updatePickedPoints(id: string, points: number) {
    setPickedQuestions(prev => prev.map(q => q.id === id ? { ...q, points } : q))
  }

  // 모드 전환 시 초기화
  function switchMode(m: Mode) {
    setMode(m)
    setWrongIds(new Set())
    setSaved(false)
    setShowAnalysis(false)
    setExistingRecordId(null)
    if (m === 'bank') { setSelectedExam(''); setExamQuestions([]) }
    if (m === 'exam') { setPickedQuestions([]); setShowBankPanel(false) }
  }

  async function handleSave() {
    if (!selectedStudent) return
    if (mode === 'exam' && !selectedExam) return
    if (mode === 'bank' && pickedQuestions.length === 0) return

    setLoading(true)

    // 문제은행 모드는 exam_id 없이 저장 (null)
    const body: Record<string, unknown> = {
      exam_id: mode === 'exam' ? selectedExam : null,
      student_id: selectedStudent,
      wrong_question_ids: Array.from(wrongIds),
      scored_at: scoredAt || null,
      notes: notes || null,
    }

    // 문제은행 모드: 선택한 문항 정보도 같이 저장 (notes에 포함)
    if (mode === 'bank') {
      const questionSummary = pickedQuestions.map((q, i) =>
        `${i + 1}. [${TYPE_LABELS[q.question_data.type] ?? q.question_data.type}] ${q.question_data.question.substring(0, 30)}...`
      ).join('\n')
      body.notes = (notes ? notes + '\n\n' : '') + '[문제은행 직접 채점]\n' + questionSummary
    }

    const res = await fetch('/api/wrong-answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json()
    if (!json.error) {
      setSaved(true)
      setShowAnalysis(true)
      if (json.data?.id) setExistingRecordId(json.data.id)
    }
    setLoading(false)
  }

  async function handleDelete() {
    if (!existingRecordId) return
    if (!confirm('이 오답 기록을 삭제하시겠습니까?')) return
    await fetch(`/api/wrong-answers?id=${existingRecordId}`, { method: 'DELETE' })
    setWrongIds(new Set()); setNotes(''); setScoredAt('')
    setExistingRecordId(null); setSaved(false); setShowAnalysis(false)
  }

  // 분석 데이터 계산
  const analysis = useMemo(() => {
    if (activeQuestions.length === 0) return null
    const totalQuestions = activeQuestions.length
    const wrongCount = wrongIds.size
    const totalPoints = activeQuestions.reduce((s, q) => s + q.points, 0)
    const wrongPoints = activeQuestions.filter(q => wrongIds.has(q.id)).reduce((s, q) => s + q.points, 0)
    const score = totalPoints - wrongPoints
    const scorePct = totalPoints > 0 ? Math.round((score / totalPoints) * 100) : 0
    const grade = scorePct >= 90 ? 'A+' : scorePct >= 80 ? 'A' : scorePct >= 70 ? 'B+' :
      scorePct >= 60 ? 'B' : scorePct >= 50 ? 'C' : 'D'

    const typeMap: Record<string, { total: number; wrong: number; points: number; wrongPoints: number }> = {}
    for (const q of activeQuestions) {
      const t = q.question_data.type
      if (!typeMap[t]) typeMap[t] = { total: 0, wrong: 0, points: 0, wrongPoints: 0 }
      typeMap[t].total++
      typeMap[t].points += q.points
      if (wrongIds.has(q.id)) { typeMap[t].wrong++; typeMap[t].wrongPoints += q.points }
    }

    const typeStats = Object.entries(typeMap).map(([type, stat]) => ({
      type, ...stat,
      correctPct: stat.total > 0 ? Math.round(((stat.total - stat.wrong) / stat.total) * 100) : 100,
    })).sort((a, b) => a.correctPct - b.correctPct)

    const weakTypes = typeStats.filter(t => t.correctPct < 60)
    const wrongQuestions = activeQuestions.filter(q => wrongIds.has(q.id))
    return { totalQuestions, wrongCount, totalPoints, score, scorePct, grade, typeStats, weakTypes, wrongQuestions }
  }, [activeQuestions, wrongIds])

  const currentExam = exams.find(e => e.id === selectedExam)
  const currentStudent = students.find(s => s.id === selectedStudent)

  function openReport() {
    if (!analysis || !currentStudent) return
    const typeScores: Record<string, number> = {}
    analysis.typeStats.forEach(t => {
      typeScores[TYPE_LABELS[t.type] ?? t.type] = t.points - t.wrongPoints
    })
    const weakComment = analysis.weakTypes.length > 0
      ? analysis.weakTypes.map(t => `${TYPE_LABELS[t.type] ?? t.type} (정답률 ${t.correctPct}%)`).join(', ') + ' 영역 집중 보완 필요'
      : '전반적으로 양호한 성취도를 보이고 있습니다.'
    const goodTypes = analysis.typeStats.filter(t => t.correctPct >= 80)
    const strengths = goodTypes.length > 0
      ? goodTypes.map(t => `${TYPE_LABELS[t.type] ?? t.type} 우수 (정답률 ${t.correctPct}%)`).join(', ')
      : ''
    const nextSteps = analysis.weakTypes.length > 0
      ? analysis.weakTypes.map(t => `${TYPE_LABELS[t.type] ?? t.type} 영역 추가 학습 권장`).join(' / ')
      : '현재 수준 유지 및 심화 문제 도전 권장'

    const params = new URLSearchParams({
      student_id: selectedStudent,
      exam_id: selectedExam || '',
      examTitle: currentExam?.title ?? '문제은행 채점',
      examDate: currentExam?.exam_date ?? scoredAt ?? '',
      score: String(analysis.score),
      maxScore: String(analysis.totalPoints),
      comment: weakComment,
      strengths,
      nextSteps,
      typeScores: JSON.stringify(typeScores),
    })
    window.location.href = `/report?${params.toString()}`
  }

  const filteredBank = bankType === 'all' ? bankQuestions : bankQuestions.filter(q => q.type === bankType)
  const pickedIds = new Set(pickedQuestions.map(q => q.id))

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-gray-800">오답 분석</h1>
        <p className="mt-1 text-sm text-gray-500">틀린 문항을 체크하면 영역별 취약점을 자동 분석합니다.</p>
      </div>

      {/* 모드 선택 탭 */}
      <div className="mb-5 flex rounded-lg border border-gray-200 bg-white p-1">
        <button
          onClick={() => switchMode('exam')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'exam' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📋 시험으로 채점
        </button>
        <button
          onClick={() => switchMode('bank')}
          className={`flex-1 rounded-md py-2 text-sm font-medium transition-colors ${
            mode === 'bank' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          📚 문제은행에서 직접 선택
        </button>
      </div>

      {/* 선택 패널 */}
      <div className="mb-6 rounded-lg border border-gray-200 bg-white p-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">학생 선택</label>
            <select value={selectedStudent} onChange={e => setSelectedStudent(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
              <option value="">-- 학생 선택 --</option>
              {students.map(s => <option key={s.id} value={s.id}>{s.name} {s.grade && `(${s.grade})`}</option>)}
            </select>
          </div>

          {mode === 'exam' ? (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">시험 선택</label>
              <select value={selectedExam} onChange={e => setSelectedExam(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm">
                <option value="">-- 시험 선택 --</option>
                {exams.map(e => <option key={e.id} value={e.id}>{e.title}{e.exam_date ? ` (${e.exam_date})` : ''}</option>)}
              </select>
            </div>
          ) : (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-500">문항 수</label>
              <div className="flex items-center h-10 rounded border border-gray-200 bg-gray-50 px-3 text-sm text-gray-600">
                {pickedQuestions.length > 0 ? `${pickedQuestions.length}문항 선택됨` : '아래에서 문항을 추가하세요'}
              </div>
            </div>
          )}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">시험일</label>
            <input type="date" value={scoredAt} onChange={e => setScoredAt(e.target.value)}
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-500">메모 (선택)</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="예: 수업 태도 좋음, 집중력 부족 등"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
          </div>
        </div>
      </div>

      {/* 유형 필터 — 시험 문항이 로드된 후에만 표시 */}
      {(examQuestions.length > 0 || pickedQuestions.length > 0) && (() => {
        const allTypes = Array.from(new Set(
          (mode === 'exam' ? examQuestions : pickedQuestions).map(q => q.question_data.type)
        ))
        if (allTypes.length === 0) return null
        return (
          <div className="mb-4 rounded-lg border border-gray-200 bg-white px-5 py-3">
            <p className="mb-2 text-xs font-semibold text-gray-500">📌 분석에 포함할 유형 선택</p>
            <div className="flex flex-wrap gap-2">
              {allTypes.map(type => {
                const excluded = excludedTypes.has(type)
                return (
                  <button
                    key={type}
                    onClick={() => toggleExcludeType(type)}
                    className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                      excluded
                        ? 'border-gray-300 bg-gray-100 text-gray-400 line-through'
                        : 'border-blue-300 bg-blue-50 text-blue-700'
                    }`}
                  >
                    {TYPE_LABELS[type] ?? type}
                  </button>
                )
              })}
            </div>
            {excludedTypes.size > 0 && (
              <p className="mt-2 text-[11px] text-gray-400">
                취소선 유형은 채점 목록 및 분석에서 제외됩니다.
              </p>
            )}
          </div>
        )
      })()}

      {/* ── 문제은행 직접 선택 모드 ── */}
      {mode === 'bank' && (
        <div className="mb-6">
          {/* 문항 추가 패널 */}
          <div className="mb-4 rounded-lg border border-gray-200 bg-white">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-semibold text-gray-700">📚 문제은행에서 문항 추가</h2>
              <button onClick={() => setShowBankPanel(!showBankPanel)}
                className="rounded border border-blue-200 bg-blue-50 px-3 py-1 text-xs text-blue-700 hover:bg-blue-100">
                {showBankPanel ? '▲ 닫기' : '▼ 문항 선택하기'}
              </button>
            </div>

            {showBankPanel && (
              <div className="p-4">
                <div className="mb-3 flex gap-2">
                  <select value={bankGrade} onChange={e => setBankGrade(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="all">전체 학년</option>
                    {['중1','중2','중3','고1','고2','고3','초5','초6'].map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <select value={bankType} onChange={e => setBankType(e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-sm">
                    <option value="all">전체 유형</option>
                    {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>

                {bankLoading ? (
                  <div className="py-6 text-center text-sm text-gray-400">불러오는 중…</div>
                ) : filteredBank.length === 0 ? (
                  <div className="py-6 text-center text-sm text-gray-400">문항이 없습니다.</div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2">
                    {filteredBank.map(q => {
                      const isPicked = pickedIds.has(q.id)
                      return (
                        <div key={q.id}
                          className={`flex items-start gap-3 rounded-lg border p-3 ${
                            isPicked ? 'border-green-200 bg-green-50' : 'border-gray-100 hover:border-blue-200'
                          }`}>
                          <div className="flex-1 min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                                {TYPE_LABELS[q.type] ?? q.type}
                              </span>
                              {q.grade && <span className="text-[10px] text-gray-400">{q.grade}</span>}
                            </div>
                            <p className="text-xs text-gray-700 line-clamp-2">{q.question}</p>
                          </div>
                          <button onClick={() => !isPicked && pickBankQuestion(q)}
                            disabled={isPicked}
                            className={`shrink-0 rounded px-3 py-1 text-xs font-medium ${
                              isPicked ? 'bg-green-100 text-green-600 cursor-default' : 'bg-blue-600 text-white hover:bg-blue-700'
                            }`}>
                            {isPicked ? '✓ 추가됨' : '+ 추가'}
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 선택된 문항 목록 + 배점 설정 */}
          {pickedQuestions.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-gray-700">선택된 문항 ({pickedQuestions.length}개) — 배점 수정 가능</h2>
              </div>
              <div className="divide-y divide-gray-50 p-2">
                {pickedQuestions.map((q, idx) => {
                  const isWrong = wrongIds.has(q.id)
                  return (
                    <div key={q.id} className={`flex items-start gap-3 rounded-lg p-3 ${isWrong ? 'bg-red-50' : ''}`}>
                      <div onClick={() => toggleWrong(q.id)} className="flex shrink-0 cursor-pointer flex-col items-center gap-1">
                        <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                          isWrong ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
                        }`}>{idx + 1}</span>
                        <span className={`text-[10px] font-medium ${isWrong ? 'text-red-500' : 'text-gray-300'}`}>
                          {isWrong ? '✗ 틀림' : '○ 맞음'}
                        </span>
                      </div>
                      <div onClick={() => toggleWrong(q.id)} className="flex-1 min-w-0 cursor-pointer">
                        <div className="mb-0.5 flex items-center gap-2">
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                            {TYPE_LABELS[q.question_data.type] ?? q.question_data.type}
                          </span>
                        </div>
                        <p className="text-sm text-gray-800 line-clamp-2">{q.question_data.question}</p>
                        {q.question_data.answer && (
                          <p className="mt-0.5 text-xs text-blue-600">정답: {q.question_data.answer}</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <input type="number" value={q.points}
                          onChange={e => updatePickedPoints(q.id, Number(e.target.value))}
                          className="w-12 rounded border border-gray-300 px-1 py-1 text-center text-xs" min={1} />
                        <span className="text-[10px] text-gray-400">점</span>
                        <button onClick={() => removePicked(q.id)}
                          className="ml-1 rounded border border-red-200 px-1.5 py-1 text-[10px] text-red-400 hover:bg-red-50">
                          삭제
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="border-t border-gray-100 p-4">
                <button onClick={handleSave} disabled={loading || !selectedStudent}
                  className="w-full rounded bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
                  {loading ? '저장 중…' : saved ? '✓ 채점 결과 업데이트' : '채점 결과 저장 & 분석'}
                </button>
                {!selectedStudent && <p className="mt-1.5 text-center text-xs text-gray-400">학생을 먼저 선택해주세요</p>}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── 시험 모드 문항 채점 ── */}
      {mode === 'exam' && selectedExam && (
        <div className="mb-6 rounded-lg border border-gray-200 bg-white">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-semibold text-gray-700">
              문항별 채점
              {examQuestions.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({examQuestions.length}문항 / 틀린 문항: {wrongIds.size}개)
                </span>
              )}
            </h2>
            <div className="flex items-center gap-2">
              {existingRecordId && (
                <button onClick={handleDelete} className="text-xs text-red-400 hover:text-red-600">기록 삭제</button>
              )}
              {saved && <span className="text-xs text-green-600">✓ 저장됨</span>}
            </div>
          </div>

          {questionsLoading ? (
            <div className="py-10 text-center text-sm text-gray-400">문항 불러오는 중…</div>
          ) : examQuestions.length === 0 ? (
            <div className="py-10 text-center text-sm text-gray-400">
              이 시험에 등록된 문항이 없습니다.<br />
              <span className="text-xs">시험출제 메뉴에서 문항을 먼저 추가해주세요.</span>
            </div>
          ) : (
            <div className="divide-y divide-gray-50 p-2">
              {examQuestions.map((eq, idx) => {
                const isWrong = wrongIds.has(eq.id)
                const q = eq.question_data
                return (
                  <div key={eq.id} onClick={() => toggleWrong(eq.id)}
                    className={`flex cursor-pointer items-start gap-3 rounded-lg p-3 transition-colors ${
                      isWrong ? 'bg-red-50 hover:bg-red-100' : 'hover:bg-gray-50'
                    }`}>
                    <div className="flex shrink-0 flex-col items-center gap-1">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold ${
                        isWrong ? 'bg-red-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>{idx + 1}</span>
                      <span className={`text-[10px] font-medium ${isWrong ? 'text-red-500' : 'text-gray-300'}`}>
                        {isWrong ? '✗ 틀림' : '○ 맞음'}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="mb-0.5 flex items-center gap-2">
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] text-gray-500">
                          {TYPE_LABELS[q.type] ?? q.type}
                        </span>
                        <span className="text-[10px] text-gray-400">{eq.points}점</span>
                      </div>
                      <p className="text-sm text-gray-800 line-clamp-2">{q.question}</p>
                      {q.answer && <p className="mt-0.5 text-xs text-blue-600">정답: {q.answer}</p>}
                    </div>
                    <div className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
                      isWrong ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-400'
                    }`}>
                      {isWrong ? '❌ 틀림' : '클릭 시 틀림'}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {examQuestions.length > 0 && (
            <div className="border-t border-gray-100 p-4">
              <button onClick={handleSave} disabled={loading || !selectedStudent}
                className="w-full rounded bg-blue-600 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40">
                {loading ? '저장 중…' : saved ? '✓ 채점 결과 업데이트' : '채점 결과 저장 & 분석'}
              </button>
              {!selectedStudent && <p className="mt-1.5 text-center text-xs text-gray-400">학생을 먼저 선택해주세요</p>}
            </div>
          )}
        </div>
      )}

      {/* 분석 결과 */}
      {showAnalysis && analysis && (
        <div className="space-y-4">
          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">📊 분석 결과</h2>

            {/* 개수 요약 한 줄 */}
            <div className="mb-4 rounded-lg bg-gray-50 px-4 py-3 text-center">
              <span className="text-sm text-gray-500">
                총 <strong className="text-gray-800">{analysis.totalQuestions}문항</strong> 중{' '}
                <strong className="text-green-600">{analysis.totalQuestions - analysis.wrongCount}개 정답</strong>
                {' / '}
                <strong className="text-red-500">{analysis.wrongCount}개 오답</strong>
              </span>
            </div>

            <div className="grid grid-cols-4 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-3">
                <p className="text-xs text-gray-400">총 문항</p>
                <p className="mt-1 text-2xl font-bold text-gray-800">{analysis.totalQuestions}</p>
              </div>
              <div className="rounded-lg bg-red-50 p-3">
                <p className="text-xs text-red-400">틀린 문항</p>
                <p className="mt-1 text-2xl font-bold text-red-600">{analysis.wrongCount}</p>
                <p className="text-[10px] text-gray-400">맞은 것 {analysis.totalQuestions - analysis.wrongCount}개</p>
              </div>
              <div className="rounded-lg bg-blue-50 p-3">
                <p className="text-xs text-blue-400">득점</p>
                <p className="mt-1 text-2xl font-bold text-blue-600">
                  {analysis.score}<span className="text-sm font-normal text-gray-400">/{analysis.totalPoints}</span>
                </p>
              </div>
              <div className={`rounded-lg p-3 ${analysis.scorePct >= 80 ? 'bg-green-50' : analysis.scorePct >= 60 ? 'bg-blue-50' : 'bg-red-50'}`}>
                <p className="text-xs text-gray-400">등급</p>
                <p className={`mt-1 text-2xl font-bold ${analysis.scorePct >= 80 ? 'text-green-600' : analysis.scorePct >= 60 ? 'text-blue-600' : 'text-red-600'}`}>
                  {analysis.grade}
                </p>
                <p className="text-xs text-gray-500">{analysis.scorePct}%</p>
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-5">
            <h2 className="mb-4 text-sm font-semibold text-gray-700">📋 영역별 분석</h2>
            <div className="space-y-3">
              {analysis.typeStats.map(t => {
                const colors = getTypeColor(t.correctPct)
                return (
                  <div key={t.type} className={`rounded-lg ${colors.bg} p-3`}>
                    <div className="mb-1.5 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className={`font-semibold ${colors.text}`}>{TYPE_LABELS[t.type] ?? t.type}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${colors.bg} ${colors.text}`}>{colors.badge}</span>
                      </div>
                      <div className="text-right">
                        <span className={`text-base font-bold ${colors.text}`}>
                          {t.total - t.wrong}
                          <span className="text-xs font-normal text-gray-400">/{t.total}개 정답</span>
                        </span>
                        <span className={`ml-2 text-sm font-semibold ${colors.text}`}>({t.correctPct}%)</span>
                      </div>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-white/60">
                      <div className={`h-full rounded-full ${colors.bar}`} style={{ width: `${t.correctPct}%` }} />
                    </div>
                    {t.wrong > 0 && <p className="mt-1 text-xs text-gray-500">틀린 문항 {t.wrong}개 (-{t.wrongPoints}점)</p>}
                  </div>
                )
              })}
            </div>
          </div>

          {analysis.weakTypes.length > 0 ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4">
              <p className="mb-2 text-sm font-semibold text-red-700">⚠️ 취약 영역 집중 학습 필요</p>
              <ul className="space-y-1">
                {analysis.weakTypes.map(t => (
                  <li key={t.type} className="flex items-center gap-2 text-sm text-red-600">
                    <span>•</span>
                    <span><strong>{TYPE_LABELS[t.type] ?? t.type}</strong>: {t.wrong}개 오답 (정답률 {t.correctPct}%)</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="rounded-lg border border-green-200 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-700">🎉 전 영역 60% 이상! 전반적으로 우수합니다.</p>
            </div>
          )}

          {analysis.wrongQuestions.length > 0 && (
            <div className="rounded-lg border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-700">❌ 틀린 문항 상세 ({analysis.wrongQuestions.length}개)</h2>
              <div className="space-y-3">
                {analysis.wrongQuestions.map(eq => {
                  const q = eq.question_data
                  const globalIdx = activeQuestions.findIndex(x => x.id === eq.id) + 1
                  return (
                    <div key={eq.id} className="rounded-lg border border-red-100 bg-red-50 p-3">
                      <div className="mb-1 flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{globalIdx}</span>
                        <span className="rounded bg-white px-1.5 py-0.5 text-[10px] text-gray-500">{TYPE_LABELS[q.type] ?? q.type}</span>
                        <span className="text-[10px] text-gray-400">{eq.points}점</span>
                      </div>
                      <p className="mb-1.5 text-sm text-gray-800">{q.question}</p>
                      {q.answer && <p className="text-xs font-medium text-blue-700">✓ 정답: {q.answer}</p>}
                      {q.explanation && <p className="mt-1 text-xs text-gray-500">💡 해설: {q.explanation}</p>}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
            <p className="mb-2 text-sm font-semibold text-blue-700">📄 학생 성취도 보고서로 연동</p>
            <p className="mb-3 text-xs text-blue-600">분석 결과를 바탕으로 보고서를 자동으로 채워드립니다.</p>
            <button onClick={openReport}
              className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
              📋 보고서 작성 & 출력
            </button>
          </div>
        </div>
      )}

      {!selectedExam && mode === 'exam' && pickedQuestions.length === 0 && (
        <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 py-16 text-center">
          <p className="text-2xl mb-3">📝</p>
          <p className="text-sm font-medium text-gray-500">
            {mode === 'exam' ? '학생과 시험을 선택하세요' : '위에서 문제은행 문항을 추가하세요'}
          </p>
          <p className="text-sm text-gray-400">틀린 문항을 체크하면 영역별 분석이 자동으로 나옵니다.</p>
        </div>
      )}
    </div>
  )
}
