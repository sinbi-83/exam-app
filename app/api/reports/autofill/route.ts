import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { computeTypeStats, TYPE_LABELS } from '@/lib/analyticsShared'

// GET: 보고서 작성 화면(/report)에서 학생+시험을 고르면, 이미 채점관리(exam_results)에
// 저장된 성적과 오답분석(wrong_answer_records) 기록을 바탕으로
//   - 총점 / 만점 / 시험일
//   - 영역별 점수(어휘/어법/독해/지문요약/서술형 — TYPE_LABELS에 있는 유형만)
// 을 계산해서 돌려주는 "연결 전용" API.
//
// 새 분석 로직을 만들지 않는다: /api/analytics, /wrong-answers 화면과 동일하게
// lib/analyticsShared.ts의 computeTypeStats + TYPE_LABELS를 그대로 재사용한다.
// (mc/blank/tf/order/match 등 TYPE_LABELS에 없는 유형은 보고서 영역과 1:1로 대응되지 않으므로
//  억지로 매핑하지 않고 그대로 비워둔다.)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const examId = searchParams.get('exam_id')

  // 학생/시험이 둘 다 선택되지 않았으면(=직접 입력 모드 포함) 자동입력할 것이 없다.
  if (!studentId || !examId) {
    return NextResponse.json({ examResult: null, typeScores: null })
  }

  // 1) 총점/만점/시험일 — 같은 학생×시험 조합으로 저장된 exam_results 중 가장 최근 것 하나.
  //    (exam_results는 upsert가 아니라 매번 insert이므로 여러 건일 수 있다 — 최신 기록을 기준으로 삼는다.)
  const { data: resultRows, error: resultError } = await supabase
    .from('exam_results')
    .select('score, max_score, exam_date, created_at')
    .eq('user_id', user.id)
    .eq('student_id', studentId)
    .eq('exam_id', examId)
    .order('created_at', { ascending: false })
    .limit(1)

  if (resultError) return NextResponse.json({ error: resultError.message }, { status: 500 })

  const examResult = resultRows && resultRows.length > 0
    ? { score: resultRows[0].score, max_score: resultRows[0].max_score, exam_date: resultRows[0].exam_date }
    : null

  // 2) 영역별 점수 — exam_questions(문항 구성)와 wrong_answer_records(오답 기록)가 둘 다 있어야 계산 가능.
  //    오답 기록이 없으면 "무엇을 맞았는지"를 알 수 없으므로, 근거 부족으로 판단하고 비워둔다.
  const [questionsRes, wrongRes] = await Promise.all([
    supabase
      .from('exam_questions')
      .select('id, points, question_data')
      .eq('user_id', user.id)
      .eq('exam_id', examId),
    supabase
      .from('wrong_answer_records')
      .select('wrong_question_ids')
      .eq('user_id', user.id)
      .eq('exam_id', examId)
      .eq('student_id', studentId)
      .maybeSingle(),
  ])

  if (questionsRes.error) return NextResponse.json({ error: questionsRes.error.message }, { status: 500 })
  if (wrongRes.error) return NextResponse.json({ error: wrongRes.error.message }, { status: 500 })

  let typeScores: Record<string, number> | null = null

  const questions = (questionsRes.data ?? []) as { id: string; points: number; question_data: { type: string } }[]

  if (questions.length > 0 && wrongRes.data) {
    const wrongIds = new Set<string>(wrongRes.data.wrong_question_ids ?? [])
    const stats = computeTypeStats(questions, wrongIds)

    const mapped: Record<string, number> = {}
    for (const stat of stats) {
      const label = TYPE_LABELS[stat.type]
      if (!label) continue // 보고서 영역과 대응되지 않는 유형(mc/blank/tf/order/match 등)은 건너뜀
      mapped[label] = stat.points - stat.wrongPoints // 해당 영역에서 실제로 획득한 점수
    }
    if (Object.keys(mapped).length > 0) typeScores = mapped
  }

  return NextResponse.json({ examResult, typeScores })
}
