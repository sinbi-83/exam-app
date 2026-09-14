'use client'

import { useEffect, useState, Suspense } from 'react'
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

  // 선택
  const [studentId, setStudentId] = useState('')
  const [examId, setExamId] = useState('')

  // 성적
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examDate, setExamDate] = useState('')
  const [examTitleOverride, setExamTitleOverride] = useState('') // 시험 미선택 시 직접 표시용

  // 영역별 점수
  const [typeScores, setTypeScores] = useState<Record<string, string>>(
    Object.fromEntries(ALL_TYPES.map((t) => [t, '']))
  )

  // 선생님 코멘트
  const [comment, setComment] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [strengths, setStrengths] = useState('')
  const [teacher, setTeacher] = useState('')
  const [vocabAnalysis, setVocabAnalysis] = useState('')
  const [grammarAnalysis, setGrammarAnalysis] = useState('')
  const [readingAnalysis, setReadingAnalysis] = useState('')

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

  // 학생·시험 로드 후 URL 파라미터로 자동 채우기 (오답분석 연동)
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

    if (!studentIdParam) return  // 오답분석에서 온 게 아님

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

    // 시험이 선택됐으면 만점/날짜 맞추기
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
      if (found.max_score) setMaxScore(String(found.max_score))
      if (found.exam_date) setExamDate(found.exam_date)
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

    // 보고서 DB 저장
    try {
      await fetch('/api/reports', {
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
        }),
      })
    } catch {
      // 저장 실패해도 인쇄는 진행
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
        {/* 기본 정보 */}
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
              <label className="mb-1 block text-xs text-gray-600">점수 *</label>
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
            </div>
          </div>
        </section>

        {/* 영역별 점수 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">
            ② 영역별 점수{' '}
            <span className="font-normal text-gray-400">(선택)</span>
            {fromWrongAnswers && (
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-600">
                오답분석 자동 채움
              </span>
            )}
          </h2>
          <p className="mb-3 text-xs text-gray-400">입력하지 않으면 보고서에서 해당 영역은 생략됩니다.</p>
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

        {/* 선생님 코멘트 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">
            ③ 선생님 코멘트
            {fromWrongAnswers && (
              <span className="ml-2 rounded bg-blue-100 px-2 py-0.5 text-[10px] font-normal text-blue-600">
                오답분석 자동 채움
              </span>
            )}
          </h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-600">담당 교사 이름</label>
              <input
                type="text"
                value={teacher}
                onChange={(e) => setTeacher(e.target.value)}
                placeholder="예) Jennifer.T"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">잘한 점 / 강점 <span className="text-gray-400">(줄바꿈으로 구분하면 목록으로 표시)</span></label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows={3}
                placeholder={"어휘력이 매우 뛰어납니다\n지문 파악 속도가 빠릅니다\n독해 정확도가 높습니다"}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">보완이 필요한 부분 <span className="text-gray-400">(줄바꿈으로 구분)</span></label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder={"서술형 조건 충족 연습 필요\n어법 문제 근거 정리 필요\n조건 영작 집중 연습"}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">다음 학습 계획 <span className="text-gray-400">(줄바꿈으로 구분 → 체크리스트로 표시)</span></label>
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                rows={3}
                placeholder={"매일 단어 20개 암기\n서술형 1문제씩 연습\nEBS 어법 집중 복습"}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </section>

        {/* 상세 분석 (선택) */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">④ 상세 분석 <span className="font-normal text-gray-400">(선택 — 비워두면 점수 기반 자동 생성)</span></h2>
          <p className="mb-4 text-xs text-gray-400">보고서의 어휘력/이해(어법)/독해 분석 칸에 들어갈 내용입니다.</p>
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-gray-600">어휘력 분석</label>
              <textarea value={vocabAnalysis} onChange={(e) => setVocabAnalysis(e.target.value)} rows={2}
                placeholder="예) 다양한 어휘를 문맥 속에서 정확히 이해하고 있습니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">이해 / 어법 분석</label>
              <textarea value={grammarAnalysis} onChange={(e) => setGrammarAnalysis(e.target.value)} rows={2}
                placeholder="예) 핵심 문법 포인트 이해도가 높으나 심화 어법 연습이 필요합니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">독해 & 요약 분석</label>
              <textarea value={readingAnalysis} onChange={(e) => setReadingAnalysis(e.target.value)} rows={2}
                placeholder="예) 지문 흐름 파악이 우수하며 핵심 내용 요약 능력을 꾸준히 키워가세요."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm" />
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
