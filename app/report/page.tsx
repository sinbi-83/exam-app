'use client'

import { useEffect, useRef, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

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

const ALL_TYPES = ['어휘', '어법', '독해', '지문요약', '서술형']

function ReportForm() {
  const searchParams = useSearchParams()
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)
  const [prefilled, setPrefilled] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiGenerated, setAiGenerated] = useState(false)

  // STEP 2-A: 학생+시험 선택 시 exam_results/wrong_answer_records에서 자동 불러오기
  // 'idle'=아직 학생/시험 미선택, 'loading'=조회 중, 'applied'=자동값 반영됨, 'none'=조회했지만 저장된 결과 없음
  const [autoFillStatus, setAutoFillStatus] = useState<'idle' | 'loading' | 'applied' | 'none'>('idle')
  const [typeAutoApplied, setTypeAutoApplied] = useState(false)
  // "우리가(자동으로) 마지막으로 채워넣은 값"을 기억해서, 선생님이 그 값을 직접 고쳤으면 다시 덮어쓰지 않는다.
  const autoValuesRef = useRef<{ score: string; maxScore: string; examDate: string }>({
    score: '', maxScore: '', examDate: '',
  })
  const autoTypeScoresRef = useRef<Record<string, string>>({})

  // 선택
  const [studentId, setStudentId] = useState('')
  const [examId, setExamId] = useState('')

  // 성적
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examDate, setExamDate] = useState('')
  const [examTitleOverride, setExamTitleOverride] = useState('')

  // 영역별 점수
  const [typeScores, setTypeScores] = useState<Record<string, string>>(
    Object.fromEntries(ALL_TYPES.map((t) => [t, '']))
  )

  // 선생님 단문 메모 (AI 입력용)
  const [strengthsMemo, setStrengthsMemo] = useState('')
  const [commentMemo, setCommentMemo] = useState('')
  const [nextStepsMemo, setNextStepsMemo] = useState('')
  const [vocabMemo, setVocabMemo] = useState('')
  const [grammarMemo, setGrammarMemo] = useState('')
  const [readingMemo, setReadingMemo] = useState('')

  // AI가 생성하거나 선생님이 직접 편집하는 최종 내용
  const [strengths, setStrengths] = useState('')
  const [comment, setComment] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [vocabAnalysis, setVocabAnalysis] = useState('')
  const [grammarAnalysis, setGrammarAnalysis] = useState('')
  const [readingAnalysis, setReadingAnalysis] = useState('')
  const [teacher, setTeacher] = useState('')

  useEffect(() => {
    Promise.all([
      fetch('/api/students').then((r) => r.json()),
      fetch('/api/exams').then((r) => r.json()),
    ])
      .then(([sJson, eJson]) => {
        setStudents(sJson.data ?? [])
        setExams(eJson.data ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  // 오답분석 연동 — URL 파라미터로 자동 채우기
  useEffect(() => {
    if (loading || prefilled) return
    const studentIdParam = searchParams.get('student_id')
    const examIdParam    = searchParams.get('exam_id')
    const scoreParam     = searchParams.get('score')
    const maxScoreParam  = searchParams.get('maxScore')
    const examDateParam  = searchParams.get('examDate')
    const commentParam   = searchParams.get('comment')
    const strengthsParam = searchParams.get('strengths')
    const nextStepsParam = searchParams.get('nextSteps')
    const typeScoresParam = searchParams.get('typeScores')
    const examTitleParam = searchParams.get('examTitle')

    if (!studentIdParam) return

    if (studentIdParam) setStudentId(studentIdParam)
    if (examIdParam)    setExamId(examIdParam)
    if (scoreParam)     setScore(scoreParam)
    if (maxScoreParam)  setMaxScore(maxScoreParam)
    if (examDateParam)  setExamDate(examDateParam)
    if (commentParam)   setComment(commentParam)
    if (strengthsParam) setStrengths(strengthsParam)
    if (nextStepsParam) setNextSteps(nextStepsParam)
    if (examTitleParam) setExamTitleOverride(examTitleParam)

    if (typeScoresParam) {
      try {
        const parsed: Record<string, number> = JSON.parse(typeScoresParam)
        setTypeScores(prev => {
          const next = { ...prev }
          Object.entries(parsed).forEach(([k, v]) => {
            if (k in next) next[k] = String(v)
          })
          return next
        })
      } catch { /* ignore */ }
    }

    if (examIdParam) {
      const found = exams.find(e => e.id === examIdParam)
      if (found) {
        if (found.max_score && !maxScoreParam) setMaxScore(String(found.max_score))
        if (found.exam_date && !examDateParam) setExamDate(found.exam_date)
      }
    }

    setPrefilled(true)
  }, [loading, exams, students, prefilled, searchParams])

  function handleExamSelect(id: string) {
    setExamId(id)
    setExamTitleOverride('')
    const found = exams.find((e) => e.id === id)
    if (found) {
      if (found.max_score) {
        setMaxScore(String(found.max_score))
        autoValuesRef.current.maxScore = String(found.max_score)
      }
      if (found.exam_date) {
        setExamDate(found.exam_date)
        autoValuesRef.current.examDate = found.exam_date
      }
    }
  }

  // STEP 2-A: 학생+시험이 모두 선택되면 이미 채점관리(exam_results)에 저장된 성적과
  // 오답분석(wrong_answer_records) 기록을 조회해 총점/영역별 점수를 자동으로 채운다.
  // 학생 또는 시험이 "실제로 바뀔 때"만 다시 조회하고(의존성 배열에 studentId, examId만 둠),
  // 선생님이 이미 직접 고친 값은 덮어쓰지 않는다(아래 applyAuto 참고).
  useEffect(() => {
    if (!studentId || !examId) {
      setAutoFillStatus('idle')
      return
    }

    let cancelled = false
    setAutoFillStatus('loading')
    setTypeAutoApplied(false)

    function applyAuto(field: 'score' | 'maxScore' | 'examDate', current: string, next: string, setter: (v: string) => void) {
      const lastAuto = autoValuesRef.current[field]
      // 필드가 비어 있거나, 지난번에 우리가 자동으로 넣어준 값 그대로면 새 값을 적용한다.
      // 선생님이 그 사이에 직접 고쳤다면(현재 값 ≠ 마지막 자동값) 건드리지 않는다.
      if (current === '' || current === lastAuto) {
        setter(next)
        autoValuesRef.current[field] = next
      }
    }

    fetch(`/api/reports/autofill?student_id=${studentId}&exam_id=${examId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return

        const result = json.examResult as { score: number; max_score: number; exam_date: string | null } | null
        const typeScoresAuto = json.typeScores as Record<string, number> | null

        if (result) {
          applyAuto('score', score, String(result.score), setScore)
          applyAuto('maxScore', maxScore, String(result.max_score), setMaxScore)
          if (result.exam_date) applyAuto('examDate', examDate, result.exam_date, setExamDate)
          setAutoFillStatus('applied')
        } else {
          setAutoFillStatus('none')
        }

        if (typeScoresAuto && Object.keys(typeScoresAuto).length > 0) {
          setTypeScores((prev) => {
            const next = { ...prev }
            for (const [label, value] of Object.entries(typeScoresAuto)) {
              if (!(label in next)) continue
              const current = next[label]
              const lastAuto = autoTypeScoresRef.current[label] ?? ''
              if (current === '' || current === lastAuto) {
                next[label] = String(value)
                autoTypeScoresRef.current[label] = String(value)
              }
            }
            return next
          })
          setTypeAutoApplied(true)
        }
      })
      .catch(() => {
        if (!cancelled) setAutoFillStatus('none')
      })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, examId])

  // AI 초안 생성
  async function handleAiGenerate() {
    const student = students.find((s) => s.id === studentId)
    if (!student) {
      alert('먼저 학생을 선택해주세요.')
      return
    }
    if (!score) {
      alert('점수를 먼저 입력해주세요.')
      return
    }

    setAiLoading(true)
    try {
      const filteredTypeScores = Object.fromEntries(
        Object.entries(typeScores).filter(([, v]) => v !== '').map(([k, v]) => [k, Number(v)])
      )

      const res = await fetch('/api/generate-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentName: student.name,
          studentGrade: student.grade,
          score: Number(score),
          maxScore: Number(maxScore),
          typeScores: filteredTypeScores,
          strengthsMemo,
          commentMemo,
          nextStepsMemo,
          vocabMemo,
          grammarMemo,
          readingMemo,
        }),
      })

      const json = await res.json()
      if (!json.ok) {
        alert('AI 초안 생성 실패: ' + (json.message ?? '다시 시도해주세요.'))
        return
      }

      const d = json.data
      if (d.strengths)     setStrengths(d.strengths)
      if (d.comment)       setComment(d.comment)
      if (d.nextSteps)     setNextSteps(d.nextSteps)
      if (d.vocabAnalysis)    setVocabAnalysis(d.vocabAnalysis)
      if (d.grammarAnalysis)  setGrammarAnalysis(d.grammarAnalysis)
      if (d.readingAnalysis)  setReadingAnalysis(d.readingAnalysis)

      setAiGenerated(true)
    } catch {
      alert('네트워크 오류. 다시 시도해주세요.')
    } finally {
      setAiLoading(false)
    }
  }

  async function handlePrint() {
    if (!studentId || !score) {
      alert('학생과 점수를 입력해주세요.')
      return
    }
    const student = students.find((s) => s.id === studentId)
    const exam    = exams.find((e) => e.id === examId)
    const filteredTypeScores = Object.fromEntries(Object.entries(typeScores).filter(([, v]) => v !== ''))

    // 보고서 DB 저장 — 실패해도 인쇄는 그대로 진행하되(기존 동작 유지),
    // 저장이 안 됐다는 사실은 조용히 넘어가지 않고 선생님께 알린다.
    let saveFailed = false
    try {
      const saveRes = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id:    studentId,
          exam_id:       examId || null,
          student_name:  student?.name ?? '',
          student_grade: student?.grade ?? '',
          exam_title:    exam?.title ?? examTitleOverride ?? '(시험명 미지정)',
          exam_date:     examDate || exam?.exam_date || new Date().toISOString().slice(0, 10),
          score,
          max_score:     maxScore,
          strengths,
          comment,
          next_steps:    nextSteps,
          type_scores:   filteredTypeScores,
          teacher,
          vocab_analysis:    vocabAnalysis,
          grammar_analysis:  grammarAnalysis,
          reading_analysis:  readingAnalysis,
        }),
      })
      if (!saveRes.ok) {
        saveFailed = true
      } else {
        const saveJson = await saveRes.json().catch(() => null)
        if (!saveJson || saveJson.error) saveFailed = true
      }
    } catch {
      saveFailed = true
    }

    if (saveFailed) {
      alert('⚠️ 보고서 저장에 실패했습니다. 인쇄는 계속 진행하지만, "저장된 보고서" 목록에는 남지 않습니다. 잠시 후 다시 시도하거나 저장 없이 나온 인쇄물을 확인해주세요.')
    }

    const params = new URLSearchParams({
      studentName:  student?.name ?? '',
      studentGrade: student?.grade ?? '',
      examTitle:    exam?.title ?? examTitleOverride ?? '(시험명 미지정)',
      examDate:     examDate || exam?.exam_date || new Date().toISOString().slice(0, 10),
      score,
      maxScore,
      comment,
      nextSteps,
      strengths,
      teacher,
      vocabAnalysis,
      grammarAnalysis,
      readingAnalysis,
      typeScores: JSON.stringify(filteredTypeScores),
    })

    window.open(`/report/print?${params.toString()}`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-sm text-gray-400">
        불러오는 중…
      </div>
    )
  }

  const fromWrongAnswers = !!searchParams.get('student_id')

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-xl font-semibold text-gray-800">보고서 작성</h1>

      {/* 오답분석 연동 안내 배너 */}
      {fromWrongAnswers && (
        <div className="mb-5 flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <span className="text-base">📊</span>
          <span>오답 분석 결과가 자동으로 채워졌습니다. 내용을 확인 후 수정하세요.</span>
        </div>
      )}

      <div className="space-y-6">

        {/* ① 기본 정보 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">① 기본 정보</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-xs text-gray-600">학생 *</label>
              <select
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">학생 선택</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.grade})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">시험</label>
              <select
                value={examId}
                onChange={(e) => handleExamSelect(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="">
                  {examTitleOverride ? `📋 ${examTitleOverride}` : '시험 선택 (직접 입력 가능)'}
                </option>
                {exams.map((ex) => (
                  <option key={ex.id} value={ex.id}>
                    {ex.title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">시험일</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1.5 text-xs text-gray-600">
                점수 *
                {autoFillStatus === 'applied' && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-normal text-blue-600">
                    🔄 채점관리 성적에서 자동 불러옴
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  value={score}
                  onChange={(e) => setScore(e.target.value)}
                  placeholder="취득점수"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <span className="flex items-center text-sm text-gray-400">/</span>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  placeholder="만점"
                  className="w-24 rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              {autoFillStatus === 'none' && (
                <p className="mt-1 text-[11px] text-gray-400">
                  이 학생·시험 조합으로 채점관리에 저장된 성적이 없습니다 — 직접 입력하세요.
                </p>
              )}
            </div>
          </div>
          <div className="mt-4">
            <label className="mb-1 block text-xs text-gray-600">담당 교사 이름</label>
            <input
              type="text"
              value={teacher}
              onChange={(e) => setTeacher(e.target.value)}
              placeholder="예) Jennifer.T"
              className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
        </section>

        {/* ② 영역별 점수 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">
            ② 영역별 점수{' '}
            <span className="font-normal text-gray-400">(선택)</span>
            {fromWrongAnswers && (
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-600">
                오답분석 자동 채움
              </span>
            )}
            {!fromWrongAnswers && typeAutoApplied && (
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-600">
                🔄 시험 결과에서 자동 계산됨
              </span>
            )}
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            입력하지 않으면 보고서에서 해당 영역은 생략됩니다.
            {autoFillStatus === 'applied' && !typeAutoApplied && (
              <> 이 시험은 오답분석 기록이 없어 영역별 점수는 자동 계산되지 않았습니다 — 필요하면 직접 입력하세요.</>
            )}
          </p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
            {ALL_TYPES.map((type) => (
              <div key={type}>
                <label className="mb-1 block text-xs text-gray-600">{type}</label>
                <input
                  type="number"
                  value={typeScores[type]}
                  onChange={(e) =>
                    setTypeScores((prev) => ({ ...prev, [type]: e.target.value }))
                  }
                  placeholder="점"
                  className={`w-full rounded border px-2 py-1.5 text-sm ${
                    typeScores[type] ? 'border-blue-300 bg-blue-50' : 'border-gray-300'
                  }`}
                />
              </div>
            ))}
          </div>
        </section>

        {/* ③ 선생님 관찰 메모 (AI 입력용) */}
        <section className="rounded-lg border border-amber-200 bg-amber-50 p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-amber-800">③ 선생님 관찰 메모</h2>
              <p className="mt-0.5 text-xs text-amber-600">
                짧게 키워드나 단문으로 입력하세요. AI가 완성된 문장으로 바꿔드립니다.
              </p>
            </div>
            <button
              onClick={handleAiGenerate}
              disabled={aiLoading}
              className={`flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white shadow transition ${
                aiLoading
                  ? 'cursor-not-allowed bg-amber-300'
                  : 'bg-amber-500 hover:bg-amber-600'
              }`}
            >
              {aiLoading ? (
                <>
                  <span className="animate-spin">⏳</span> AI 생성 중…
                </>
              ) : (
                <>✨ AI 초안 생성</>
              )}
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-700">강점 메모</label>
              <textarea
                value={strengthsMemo}
                onChange={(e) => setStrengthsMemo(e.target.value)}
                rows={2}
                placeholder="예) 어휘 강함, 독해 빠름"
                className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-700">보완 메모</label>
              <textarea
                value={commentMemo}
                onChange={(e) => setCommentMemo(e.target.value)}
                rows={2}
                placeholder="예) 서술형 조건 누락, 어법 약함"
                className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-700">학습계획 메모</label>
              <textarea
                value={nextStepsMemo}
                onChange={(e) => setNextStepsMemo(e.target.value)}
                rows={2}
                placeholder="예) 단어 20개, 서술형 연습"
                className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-amber-700">어휘/어법/독해 메모</label>
              <textarea
                value={`${vocabMemo ? '어휘: ' + vocabMemo : ''}${grammarMemo ? '\n어법: ' + grammarMemo : ''}${readingMemo ? '\n독해: ' + readingMemo : ''}`}
                onChange={(e) => {
                  const lines = e.target.value.split('\n')
                  for (const line of lines) {
                    if (line.startsWith('어휘:')) setVocabMemo(line.replace('어휘:', '').trim())
                    else if (line.startsWith('어법:')) setGrammarMemo(line.replace('어법:', '').trim())
                    else if (line.startsWith('독해:')) setReadingMemo(line.replace('독해:', '').trim())
                  }
                }}
                rows={2}
                placeholder={"어휘: 문맥 이해 우수\n어법: 심화 연습 필요\n독해: 속도 개선 필요"}
                className="w-full rounded border border-amber-200 bg-white px-3 py-2 text-sm placeholder:text-gray-300"
              />
            </div>
          </div>

          <div className="mt-3 flex items-center gap-1.5 rounded bg-amber-100 px-3 py-2 text-xs text-amber-700">
            <span>💡</span>
            <span>메모를 비워도 됩니다 — AI가 점수 데이터만으로도 초안을 작성합니다.</span>
          </div>
        </section>

        {/* ④ AI 초안 확인 & 편집 */}
        <section className={`rounded-lg border p-5 transition-all ${
          aiGenerated ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-white'
        }`}>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-gray-700">
                ④ 보고서 내용 확인 & 편집
                {aiGenerated && (
                  <span className="ml-2 rounded bg-green-100 px-2 py-0.5 text-[10px] font-normal text-green-600">
                    ✅ AI 초안 생성됨
                  </span>
                )}
              </h2>
              <p className="mt-0.5 text-xs text-gray-400">
                {aiGenerated
                  ? 'AI 초안을 확인하고 필요하면 직접 수정해주세요.'
                  : '직접 입력하거나, 위 ③에서 AI 초안 생성 버튼을 누르세요.'}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                강점 / 잘한 점
                <span className="ml-1 text-gray-400 font-normal">(줄바꿈 → 목록으로 표시)</span>
              </label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows={3}
                placeholder="AI 초안 생성 후 여기에 내용이 채워집니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                보완이 필요한 부분
                <span className="ml-1 text-gray-400 font-normal">(줄바꿈 → 목록으로 표시)</span>
              </label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="AI 초안 생성 후 여기에 내용이 채워집니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                다음 학습 계획
                <span className="ml-1 text-gray-400 font-normal">(줄바꿈 → 체크리스트로 표시)</span>
              </label>
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                rows={3}
                placeholder="AI 초안 생성 후 여기에 내용이 채워집니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>

            {/* 상세 분석 */}
            <div className="rounded border border-gray-200 bg-gray-50 p-3">
              <div className="mb-2 text-xs font-semibold text-gray-600">상세 분석 (어휘 / 어법 / 독해)</div>
              <div className="space-y-2">
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-500">어휘력 분석</label>
                  <textarea
                    value={vocabAnalysis}
                    onChange={(e) => setVocabAnalysis(e.target.value)}
                    rows={2}
                    placeholder="AI 초안 생성 후 자동 입력"
                    className="w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-500">어법 / 이해 분석</label>
                  <textarea
                    value={grammarAnalysis}
                    onChange={(e) => setGrammarAnalysis(e.target.value)}
                    rows={2}
                    placeholder="AI 초안 생성 후 자동 입력"
                    className="w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-[11px] text-gray-500">독해 & 요약 분석</label>
                  <textarea
                    value={readingAnalysis}
                    onChange={(e) => setReadingAnalysis(e.target.value)}
                    rows={2}
                    placeholder="AI 초안 생성 후 자동 입력"
                    className="w-full rounded border border-gray-300 bg-white px-3 py-1.5 text-sm"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 생성 버튼 */}
        <div className="flex justify-end gap-3">
          <button
            onClick={handlePrint}
            className="rounded bg-blue-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
          >
            보고서 미리보기 &amp; 인쇄
          </button>
        </div>
      </div>
    </div>
  )
}

export default function ReportPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20 text-sm text-gray-400">불러오는 중…</div>}>
      <ReportForm />
    </Suspense>
  )
}
