'use client'

import { useEffect, useState } from 'react'

interface Student {
  id: string
  name: string
  grade: string
}

interface Exam {
  id: string
  title: string
  exam_date: string | null
  total_questions: number | null
  max_score: number | null
}

interface ExamResult {
  id: string
  student_id: string
  exam_title: string
  score: number
  max_score: number
  exam_date: string
  students: { name: string } | null
}

export default function GradingPage() {
  const [students, setStudents] = useState<Student[]>([])
  const [results, setResults] = useState<ExamResult[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  // 성적 등록 폼
  const [studentId, setStudentId] = useState('')
  const [selectedExamId, setSelectedExamId] = useState('') // '' = 직접 입력 모드
  const [examTitle, setExamTitle] = useState('')
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examDate, setExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)
  // 틀린 개수 입력 모드
  const [scoreMode, setScoreMode] = useState<'score' | 'wrong'>('score')
  const [wrongCount, setWrongCount] = useState('')
  const [totalQuestions, setTotalQuestions] = useState('')

  // 시험 카드 관리
  const [examManagerOpen, setExamManagerOpen] = useState(false)
  const [newExamTitle, setNewExamTitle] = useState('')
  const [newExamDate, setNewExamDate] = useState(new Date().toISOString().slice(0, 10))
  const [newExamTotalQuestions, setNewExamTotalQuestions] = useState('')
  const [newExamMaxScore, setNewExamMaxScore] = useState('100')
  const [creatingExam, setCreatingExam] = useState(false)
  const [renamingExamId, setRenamingExamId] = useState('')
  const [renameValue, setRenameValue] = useState('')

  async function fetchAll() {
    setLoading(true)
    try {
      const [studentsRes, resultsRes, examsRes] = await Promise.all([
        fetch('/api/students'),
        fetch('/api/exam-results'),
        fetch('/api/exams'),
      ])
      const studentsData = await studentsRes.json()
      const resultsData = await resultsRes.json()
      const examsData = await examsRes.json()

      if (studentsRes.ok) {
        setStudents(studentsData.data || [])
        if (studentsData.data?.length > 0 && !studentId) {
          setStudentId(studentsData.data[0].id)
        }
      }
      if (resultsRes.ok) {
        setResults(resultsData.data || [])
      }
      if (examsRes.ok) {
        setExams(examsData.data || [])
      }
    } catch {
      // 조용히 실패
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 틀린 개수 → 점수 자동 계산
  const calcScore = (() => {
    const wc = Number(wrongCount)
    const tq = Number(totalQuestions)
    const ms = Number(maxScore)
    if (!wrongCount || !tq || !ms || isNaN(wc) || isNaN(tq) || isNaN(ms) || tq <= 0) return ''
    const correct = Math.max(0, tq - wc)
    return String(Math.round((correct / tq) * ms))
  })()

  // 시험 카드를 선택하면 시험명/만점/날짜를 자동으로 채워줌
  function handleSelectExam(examId: string) {
    setSelectedExamId(examId)
    if (!examId) return
    const exam = exams.find((e) => e.id === examId)
    if (exam) {
      setExamTitle(exam.title)
      setMaxScore(exam.max_score ? String(exam.max_score) : '100')
      if (exam.total_questions) setTotalQuestions(String(exam.total_questions))
      if (exam.exam_date) setExamDate(exam.exam_date)
    }
  }

  async function handleCreateExam() {
    if (!newExamTitle.trim()) {
      alert('시험명을 입력해주세요.')
      return
    }
    setCreatingExam(true)
    try {
      const res = await fetch('/api/exams', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newExamTitle,
          exam_date: newExamDate,
          total_questions: newExamTotalQuestions ? Number(newExamTotalQuestions) : null,
          max_score: newExamMaxScore ? Number(newExamMaxScore) : null,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert(result.error || '시험 카드 생성에 실패했습니다.')
        return
      }
      setNewExamTitle('')
      setNewExamTotalQuestions('')
      setNewExamMaxScore('100')
      await fetchAll()
      // 방금 만든 시험을 성적 등록 폼에 자동 선택 (방금 받은 데이터로 바로 채움)
      if (result.data) {
      setSelectedExamId(result.data.id)
      setExamTitle(result.data.title)
      setMaxScore(result.data.max_score ? String(result.data.max_score) : '100')
      if (result.data.exam_date) setExamDate(result.data.exam_date)
      }
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setCreatingExam(false)
    }
  }

  async function handleRenameExam(examId: string) {
    if (!renameValue.trim()) {
      alert('시험명을 입력해주세요.')
      return
    }
    try {
      const res = await fetch(`/api/exams/${examId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: renameValue }),
      })
      if (!res.ok) {
        const result = await res.json()
        alert(result.error || '수정에 실패했습니다.')
        return
      }
      setRenamingExamId('')
      setRenameValue('')
      fetchAll()
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!studentId || !examTitle.trim()) {
      alert('학생, 시험명은 필수입니다.')
      return
    }
    if (scoreMode === 'score' && score === '') {
      alert('점수를 입력해주세요.')
      return
    }
    if (scoreMode === 'wrong' && (!totalQuestions || !calcScore)) {
      alert('총 문항 수와 틀린 개수를 입력해주세요.')
      return
    }

    const finalScore = scoreMode === 'wrong' ? Number(calcScore) : Number(score)

    setSubmitting(true)
    try {
      const res = await fetch('/api/exam-results', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student_id: studentId,
          exam_title: examTitle,
          score: finalScore,
          max_score: Number(maxScore),
          exam_date: examDate,
          exam_id: selectedExamId || null,
        }),
      })
      const result = await res.json()
      if (!res.ok) {
        alert(result.error || '등록에 실패했습니다.')
        return
      }
      if (!selectedExamId) {
        setExamTitle('')
      }
      setScore('')
      fetchAll()
    } catch {
      alert('서버와 통신 중 문제가 발생했어요.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('이 성적 기록을 삭제하시겠습니까?')) return
    try {
      const res = await fetch(`/api/exam-results/${id}`, { method: 'DELETE' })
      if (res.ok) {
        fetchAll()
      }
    } catch {
      alert('삭제 중 문제가 발생했어요.')
    }
  }

  if (students.length === 0 && !loading) {
    return (
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-6 text-xl font-semibold text-gray-800">채점관리</h1>
        <p className="rounded-lg border border-gray-200 bg-white p-8 text-center text-sm text-gray-400">
          먼저 &apos;학생관리&apos;에서 학생을 등록해주세요.
        </p>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">채점관리</h1>

      {/* 시험 카드 관리 영역 (신규 기능) */}
      <div className="mb-8 rounded-lg border border-gray-200 bg-white p-6">
        <button
          type="button"
          onClick={() => setExamManagerOpen((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-gray-700"
        >
          <span>📋 시험 카드 관리 ({exams.length}개)</span>
          <span className="text-xs text-gray-400">{examManagerOpen ? '접기' : '펼치기'}</span>
        </button>

        {examManagerOpen && (
          <div className="mt-4 space-y-4">
            {exams.length > 0 && (
              <div className="space-y-2">
                {exams.map((exam) => (
                  <div
                    key={exam.id}
                    className="flex items-center justify-between rounded border border-gray-200 px-3 py-2"
                  >
                    {renamingExamId === exam.id ? (
                      <div className="flex flex-1 items-center gap-2">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          className="flex-1 rounded border border-gray-300 px-2 py-1 text-sm"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRenameExam(exam.id)}
                          className="rounded bg-blue-600 px-2 py-1 text-xs text-white"
                        >
                          저장
                        </button>
                        <button
                          onClick={() => setRenamingExamId('')}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-500"
                        >
                          취소
                        </button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="text-sm font-medium text-gray-800">{exam.title}</p>
                          <p className="text-xs text-gray-400">
                            {exam.exam_date || '날짜 없음'} · 총 {exam.total_questions ?? '?'}문항 · 만점 {exam.max_score ?? '?'}점
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setRenamingExamId(exam.id)
                            setRenameValue(exam.title)
                          }}
                          className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-600 hover:bg-gray-50"
                        >
                          이름 수정
                        </button>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="rounded border border-dashed border-gray-300 p-4">
              <p className="mb-3 text-xs font-medium text-gray-500">+ 새 시험 만들기</p>
              <div className="space-y-2">
                <input
                  type="text"
                  value={newExamTitle}
                  onChange={(e) => setNewExamTitle(e.target.value)}
                  placeholder="시험명 (예: 9월 문법 시험)"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
                <div className="flex gap-2">
                  <input
                    type="date"
                    value={newExamDate}
                    onChange={(e) => setNewExamDate(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={newExamTotalQuestions}
                    onChange={(e) => setNewExamTotalQuestions(e.target.value)}
                    placeholder="총 문항수"
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                  <input
                    type="number"
                    value={newExamMaxScore}
                    onChange={(e) => setNewExamMaxScore(e.target.value)}
                    placeholder="만점"
                    className="flex-1 rounded border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleCreateExam}
                  disabled={creatingExam}
                  className="w-full rounded bg-teal-600 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {creatingExam ? '만드는 중...' : '시험 카드 만들기'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 성적 등록 폼 */}
      <form onSubmit={handleSubmit} className="mb-8 rounded-lg border border-gray-200 bg-white p-6 space-y-4">
        <div>
          <label className="block text-sm text-gray-600 mb-1">학생</label>
          <select
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.grade})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">시험 선택</label>
          <select
            value={selectedExamId}
            onChange={(e) => handleSelectExam(e.target.value)}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">직접 입력</option>
            {exams.map((exam) => (
              <option key={exam.id} value={exam.id}>
                {exam.title} {exam.exam_date ? `(${exam.exam_date})` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm text-gray-600 mb-1">시험명</label>
          <input
            type="text"
            value={examTitle}
            onChange={(e) => setExamTitle(e.target.value)}
            placeholder="예: 8월 모의고사"
            disabled={!!selectedExamId}
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
          />
        </div>

        {/* 입력 모드 토글 */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          <button
            type="button"
            onClick={() => setScoreMode('score')}
            className={`flex-1 py-2 font-medium transition-colors ${scoreMode === 'score' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            점수 직접 입력
          </button>
          <button
            type="button"
            onClick={() => setScoreMode('wrong')}
            className={`flex-1 py-2 font-medium transition-colors ${scoreMode === 'wrong' ? 'bg-blue-600 text-white' : 'bg-white text-gray-500 hover:bg-gray-50'}`}
          >
            틀린 개수로 계산
          </button>
        </div>

        {scoreMode === 'score' ? (
          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">점수</label>
              <input
                type="number"
                value={score}
                onChange={(e) => setScore(e.target.value)}
                placeholder="80"
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">만점</label>
              <input
                type="number"
                value={maxScore}
                onChange={(e) => setMaxScore(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div className="flex-1">
              <label className="block text-sm text-gray-600 mb-1">시험 날짜</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">총 문항 수</label>
                <input
                  type="number"
                  value={totalQuestions}
                  onChange={(e) => setTotalQuestions(e.target.value)}
                  placeholder="16"
                  min="1"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">틀린 개수</label>
                <input
                  type="number"
                  value={wrongCount}
                  onChange={(e) => setWrongCount(e.target.value)}
                  placeholder="3"
                  min="0"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex-1">
                <label className="block text-sm text-gray-600 mb-1">만점</label>
                <input
                  type="number"
                  value={maxScore}
                  onChange={(e) => setMaxScore(e.target.value)}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* 자동 계산 점수 표시 */}
            {calcScore && (
              <div className="rounded-lg bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-blue-700">
                  자동 계산 점수: {totalQuestions}문항 중 {Number(totalQuestions) - Number(wrongCount)}개 정답
                </span>
                <span className="text-xl font-bold text-blue-800">{calcScore}점</span>
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-600 mb-1">시험 날짜</label>
              <input
                type="date"
                value={examDate}
                onChange={(e) => setExamDate(e.target.value)}
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {submitting ? '등록 중...' : '성적 등록'}
        </button>
      </form>

      <h2 className="mb-3 text-lg font-semibold text-gray-800">최근 등록 내역</h2>
      {loading ? (
        <p className="text-sm text-gray-500">불러오는 중...</p>
      ) : results.length === 0 ? (
        <p className="rounded-lg border border-gray-200 bg-white p-6 text-center text-sm text-gray-400">
          등록된 성적이 없습니다.
        </p>
      ) : (
        <div className="space-y-2">
          {results.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between rounded-lg border border-gray-200 bg-white p-3"
            >
              <div>
                <p className="text-sm font-medium text-gray-800">
                  {r.students?.name || '알 수 없음'} · {r.exam_title}
                </p>
                <p className="text-xs text-gray-500">
                  {r.score}/{r.max_score}점 · {r.exam_date}
                </p>
              </div>
              <button
                onClick={() => handleDelete(r.id)}
                className="rounded border border-red-200 px-2 py-1 text-xs text-red-500 hover:bg-red-50"
              >
                삭제
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}