import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { chunk } from '@/lib/supabasePaging'
import { inferExamType } from '@/lib/examType'

// POST: 혼합 시험(7단계) 저장 → 기존 exams + exam_questions (새 저장소·새 칸을 만들지 않는다)
// body: { title, exam_date?, questions: question_data[], points?: number[] (문항별 배점, 100점 맞추기) | points_per_question }
// - exam_type 은 새 값을 만들지 않고 문항으로 추론한 값과 같게 저장한다 (지문 문항이 있으면 'problem', 단어만이면 'word')
// - 단어 문항은 단어은행의 '사용 중'(approved, 삭제 안 됨) 단어만 받는다 — DB 로 한 번 더 확인
// - 문항은 화면에서 만든 snapshot 그대로. 문항 저장이 실패하면 빈 시험 카드가 남지 않게 되돌린다
type QD = Record<string, unknown> & { type?: unknown; question?: unknown; source?: unknown }

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const title = String(body.title ?? '').trim()
  const questions: QD[] = Array.isArray(body.questions) ? body.questions : []

  if (!title) return NextResponse.json({ error: '시험 제목을 입력하세요.' }, { status: 400 })
  if (questions.length === 0) return NextResponse.json({ error: '저장할 문항이 없습니다.' }, { status: 400 })
  // 문항별 배점: points 배열(100점 맞추기 등)이 있으면 그것, 없으면 문항당 같은 배점(points_per_question)
  const perQuestion: number[] = Array.isArray(body.points)
    ? body.points.map((p: unknown) => Number(p))
    : questions.map(() => Number(body.points_per_question))
  if (perQuestion.length !== questions.length || perQuestion.some((p) => !Number.isInteger(p) || p < 1 || p > 100)) {
    return NextResponse.json({ error: '문항별 배점은 문항 수만큼, 1~100 정수여야 합니다.' }, { status: 400 })
  }
  if (questions.length > 200) return NextResponse.json({ error: '문항은 200개까지 저장할 수 있습니다.' }, { status: 400 })

  const bad = questions.find((q) => {
    if (!q || typeof q.type !== 'string' || typeof q.question !== 'string' || !q.question) return true
    if (q.type === 'word') {
      return (
        q.source !== 'vocabulary_bank' || !q.source_vocabulary_entry_id ||
        (q.direction !== 'en_ko' && q.direction !== 'ko_en') || !q.answer || !Array.isArray(q.accepted_answers)
      )
    }
    return q.source !== 'question_bank' && q.source !== 'external_passage'
  })
  if (bad) return NextResponse.json({ error: '문항 형식이 올바르지 않습니다.' }, { status: 400 })

  // 단어 문항: 지금도 '사용 중'인 단어인지 확인 (확인 필요·삭제된 단어는 절대 넣지 않는다)
  const wordIds = [...new Set(questions.filter((q) => q.type === 'word').map((q) => String(q.source_vocabulary_entry_id)))]
  if (wordIds.length > 0) {
    const approved = new Set<string>()
    for (const ids of chunk(wordIds, 100)) {
      const { data, error } = await supabase
        .from('vocabulary_entries')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'approved')
        .is('deleted_at', null)
        .in('id', ids)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      for (const r of data ?? []) approved.add(r.id as string)
    }
    const notApproved = wordIds.filter((id) => !approved.has(id))
    if (notApproved.length > 0) {
      return NextResponse.json({ error: `'사용 중'이 아닌 단어가 ${notApproved.length}개 있습니다. 다시 뽑아 주세요.` }, { status: 400 })
    }
  }

  const examType = inferExamType(questions.map((q) => ({ question_data: { type: q.type as string } })))
  const { data: exam, error: examError } = await supabase
    .from('exams')
    .insert({
      user_id: user.id,
      title,
      exam_date: body.exam_date || null,
      total_questions: questions.length,
      max_score: perQuestion.reduce((s, p) => s + p, 0),
      exam_type: examType,
    })
    .select('id')
    .single()
  if (examError || !exam) return NextResponse.json({ error: examError?.message ?? '시험 저장 실패' }, { status: 500 })

  const rows = questions.map((q, i) => ({ exam_id: exam.id, user_id: user.id, question_data: q, sort_order: i, points: perQuestion[i] }))
  const { error: qError } = await supabase.from('exam_questions').insert(rows)
  if (qError) {
    await supabase.from('exams').delete().eq('id', exam.id).eq('user_id', user.id)
    return NextResponse.json({ error: `문항 저장 실패: ${qError.message}` }, { status: 500 })
  }

  return NextResponse.json({ data: { exam_id: exam.id, exam_type: examType } })
}
