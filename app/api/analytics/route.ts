import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { computeTypeStats } from '@/lib/analyticsShared'

interface ExamRow {
  id: string
  title: string
  exam_date: string | null
  max_score: number | null
}

interface ExamResultRow {
  id: string
  student_id: string
  exam_id: string | null
  exam_title: string
  score: number
  max_score: number
  exam_date: string
}

interface ExamQuestionRow {
  id: string
  exam_id: string
  points: number
  question_data: { type: string }
}

interface WrongAnswerRow {
  exam_id: string | null
  student_id: string
  wrong_question_ids: string[]
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const [studentsRes, examsRes, resultsRes, questionsRes, wrongRes] = await Promise.all([
    supabase.from('students').select('id, name, grade').eq('user_id', user.id),
    supabase.from('exams').select('id, title, exam_date, max_score').eq('user_id', user.id),
    supabase.from('exam_results').select('id, student_id, exam_id, exam_title, score, max_score, exam_date').eq('user_id', user.id),
    supabase.from('exam_questions').select('id, exam_id, points, question_data').eq('user_id', user.id),
    supabase.from('wrong_answer_records').select('exam_id, student_id, wrong_question_ids').eq('user_id', user.id),
  ])

  const error = studentsRes.error || examsRes.error || resultsRes.error || questionsRes.error || wrongRes.error
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const students = (studentsRes.data ?? []) as { id: string; name: string; grade: string }[]
  const exams = (examsRes.data ?? []) as ExamRow[]
  const results = (resultsRes.data ?? []) as ExamResultRow[]
  const examQuestions = (questionsRes.data ?? []) as ExamQuestionRow[]
  const wrongRecords = (wrongRes.data ?? []) as WrongAnswerRow[]

  const examById = new Map(exams.map((e) => [e.id, e]))

  // 시험별 반 평균 추이 (exam_id가 연결된 결과만, 날짜순)
  const resultsByExam = new Map<string, ExamResultRow[]>()
  for (const r of results) {
    if (!r.exam_id || !examById.has(r.exam_id)) continue
    const list = resultsByExam.get(r.exam_id) ?? []
    list.push(r)
    resultsByExam.set(r.exam_id, list)
  }

  const classTrend = Array.from(resultsByExam.entries())
    .map(([examId, linked]) => {
      const exam = examById.get(examId)!
      const percentages = linked.map((r) => (r.score / r.max_score) * 100)
      const classAverage = percentages.reduce((s, p) => s + p, 0) / percentages.length
      return {
        examId,
        examTitle: exam.title,
        examDate: exam.exam_date,
        classAverage: Math.round(classAverage * 10) / 10,
        studentCount: linked.length,
      }
    })
    .sort((a, b) => new Date(a.examDate ?? 0).getTime() - new Date(b.examDate ?? 0).getTime())

  // 학생별 점수 히스토리 (날짜순)
  const perStudent: Record<string, { name: string; grade: string; history: { examTitle: string; examDate: string; score: number; maxScore: number; percent: number }[] }> = {}
  for (const s of students) {
    perStudent[s.id] = { name: s.name, grade: s.grade, history: [] }
  }
  for (const r of results) {
    if (!perStudent[r.student_id]) continue
    perStudent[r.student_id].history.push({
      examTitle: r.exam_title,
      examDate: r.exam_date,
      score: r.score,
      maxScore: r.max_score,
      percent: Math.round((r.score / r.max_score) * 1000) / 10,
    })
  }
  for (const s of Object.values(perStudent)) {
    s.history.sort((a, b) => new Date(a.examDate).getTime() - new Date(b.examDate).getTime())
  }

  // 유형별 취약점 (exam_id가 연결된 오답 기록만, 시험×학생 조합을 모두 펼쳐서 집계)
  const questionsByExam = new Map<string, ExamQuestionRow[]>()
  for (const q of examQuestions) {
    const list = questionsByExam.get(q.exam_id) ?? []
    list.push(q)
    questionsByExam.set(q.exam_id, list)
  }

  const expandedQuestions: { id: string; points: number; question_data: { type: string } }[] = []
  const expandedWrongIds = new Set<string>()
  for (const record of wrongRecords) {
    if (!record.exam_id) continue
    const questions = questionsByExam.get(record.exam_id)
    if (!questions) continue
    const wrongSet = new Set(record.wrong_question_ids)
    for (const q of questions) {
      const key = `${record.exam_id}:${record.student_id}:${q.id}`
      expandedQuestions.push({ id: key, points: q.points, question_data: q.question_data })
      if (wrongSet.has(q.id)) expandedWrongIds.add(key)
    }
  }
  const topicStats = computeTypeStats(expandedQuestions, expandedWrongIds)

  // KPI
  const classAverage = classTrend.length > 0
    ? Math.round((classTrend.reduce((s, c) => s + c.classAverage, 0) / classTrend.length) * 10) / 10
    : null

  let mostImprovedStudent: { name: string; delta: number } | null = null
  for (const s of Object.values(perStudent)) {
    if (s.history.length < 2) continue
    const delta = Math.round((s.history[s.history.length - 1].percent - s.history[0].percent) * 10) / 10
    if (!mostImprovedStudent || delta > mostImprovedStudent.delta) {
      mostImprovedStudent = { name: s.name, delta }
    }
  }

  const mostCommonWeakTopic = topicStats.length > 0 && topicStats[0].correctPct < 60 ? topicStats[0].type : null

  // 시험별 카드 (기존 /analytics 페이지의 평균/최고/최저 목록)
  const studentsById = new Map(students.map((s) => [s.id, s.name]))
  const examCards = exams
    .map((exam) => {
      const linked = results.filter((r) => r.exam_id === exam.id)
      if (linked.length === 0) {
        return { examId: exam.id, title: exam.title, examDate: exam.exam_date, maxScore: exam.max_score, count: 0, average: null, highest: null, lowest: null }
      }
      const withPct = linked.map((r) => ({ ...r, pct: r.score / r.max_score }))
      const average = Math.round((withPct.reduce((s, r) => s + r.pct, 0) / withPct.length) * 1000) / 10
      const highest = withPct.reduce((best, r) => (r.pct > best.pct ? r : best))
      const lowest = withPct.reduce((worst, r) => (r.pct < worst.pct ? r : worst))
      return {
        examId: exam.id,
        title: exam.title,
        examDate: exam.exam_date,
        maxScore: exam.max_score,
        count: linked.length,
        average,
        highest: { name: studentsById.get(highest.student_id) ?? '알 수 없음', score: highest.score },
        lowest: { name: studentsById.get(lowest.student_id) ?? '알 수 없음', score: lowest.score },
      }
    })
    .sort((a, b) => {
      if (a.count === 0 && b.count > 0) return 1
      if (a.count > 0 && b.count === 0) return -1
      return new Date(b.examDate ?? 0).getTime() - new Date(a.examDate ?? 0).getTime()
    })

  return NextResponse.json({
    classTrend,
    perStudent,
    topicStats,
    examCards,
    kpis: {
      classAverage,
      mostImprovedStudent,
      mostCommonWeakTopic,
      examCount: exams.length,
      studentCount: students.length,
    },
  })
}
