'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'

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

const TYPE_LABELS: Record<string, string> = {
  어휘: '어휘',
  어법: '어법',
  서술형: '서술형',
  독해: '독해',
  지문요약: '지문요약',
}
const ALL_TYPES = ['어휘', '어법', '독해', '지문요약', '서술형']

export default function ReportPage() {
  const router = useRouter()
  const [students, setStudents] = useState<Student[]>([])
  const [exams, setExams] = useState<Exam[]>([])
  const [loading, setLoading] = useState(true)

  // 선택
  const [studentId, setStudentId] = useState('')
  const [examId, setExamId] = useState('')

  // 성적
  const [score, setScore] = useState('')
  const [maxScore, setMaxScore] = useState('100')
  const [examDate, setExamDate] = useState('')

  // 영역별 점수 (선택적)
  const [typeScores, setTypeScores] = useState<Record<string, string>>(
    Object.fromEntries(ALL_TYPES.map((t) => [t, '']))
  )

  // 선생님 코멘트
  const [comment, setComment] = useState('')
  const [nextSteps, setNextSteps] = useState('')
  const [strengths, setStrengths] = useState('')

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

  function handleExamSelect(id: string) {
    setExamId(id)
    const found = exams.find((e) => e.id === id)
    if (found) {
      if (found.max_score) setMaxScore(String(found.max_score))
      if (found.exam_date) setExamDate(found.exam_date)
    }
  }

  function handlePrint() {
    if (!studentId || !score) {
      alert('학생과 점수를 입력해주세요.')
      return
    }
    const student = students.find((s) => s.id === studentId)
    const exam = exams.find((e) => e.id === examId)

    const params = new URLSearchParams({
      studentName: student?.name ?? '',
      studentGrade: student?.grade ?? '',
      examTitle: exam?.title ?? '(시험명 미지정)',
      examDate: examDate || exam?.exam_date || new Date().toISOString().slice(0, 10),
      score,
      maxScore,
      comment,
      nextSteps,
      strengths,
      typeScores: JSON.stringify(
        Object.fromEntries(
          Object.entries(typeScores).filter(([, v]) => v !== '')
        )
      ),
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

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold text-gray-800">보고서 작성</h1>

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
                <option value="">시험 선택 (직접 입력 가능)</option>
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

        {/* 영역별 점수 (선택) */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-1 text-sm font-semibold text-gray-700">② 영역별 점수 <span className="font-normal text-gray-400">(선택)</span></h2>
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
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
            ))}
          </div>
        </section>

        {/* 선생님 코멘트 */}
        <section className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">③ 선생님 코멘트</h2>
          <div className="space-y-4">
            <div>
              <label className="mb-1 block text-xs text-gray-600">잘한 점 / 강점</label>
              <textarea
                value={strengths}
                onChange={(e) => setStrengths(e.target.value)}
                rows={2}
                placeholder="예) 어휘력이 매우 뛰어나며 지문 파악 속도가 빠릅니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">보완이 필요한 부분</label>
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="예) 서술형 문제에서 조건을 꼼꼼히 확인하는 습관이 필요합니다. 어법 규칙 중 시제 일치 부분을 더 연습해야 합니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-600">다음 학습 계획 / 권고사항</label>
              <textarea
                value={nextSteps}
                onChange={(e) => setNextSteps(e.target.value)}
                rows={2}
                placeholder="예) 매일 단어 20개 암기 + 서술형 1문제씩 연습을 권장합니다."
                className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
              />
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
