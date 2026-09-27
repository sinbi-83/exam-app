import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import type { WordQuestionData } from '@/lib/wordTest'

// POST: 단어은행 자동 단어시험 저장 → 기존 exams + exam_questions (새 저장소를 만들지 않는다)
// body: { title, exam_date?, points_per_question, questions: WordQuestionData[] }
// 문항은 화면에서 만든 snapshot 그대로 저장한다. 이후 단어은행이 바뀌어도 이 시험은 바뀌지 않는다.
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const title = String(body.title ?? '').trim()
  const points = Number(body.points_per_question)
  const questions: WordQuestionData[] = Array.isArray(body.questions) ? body.questions : []

  if (!title) return NextResponse.json({ error: '시험 제목을 입력하세요.' }, { status: 400 })
  if (!Number.isInteger(points) || points < 1 || points > 100) {
    return NextResponse.json({ error: '문항당 배점은 1~100 정수여야 합니다.' }, { status: 400 })
  }
  if (questions.length === 0) return NextResponse.json({ error: '저장할 문항이 없습니다.' }, { status: 400 })
  const bad = questions.find(
    (q) =>
      q?.type !== 'word' || q.source !== 'vocabulary_bank' || !q.source_vocabulary_entry_id ||
      (q.direction !== 'en_ko' && q.direction !== 'ko_en') || !q.question || !q.answer || !Array.isArray(q.accepted_answers),
  )
  if (bad) return NextResponse.json({ error: '문항 형식이 올바르지 않습니다.' }, { status: 400 })

  const { data: exam, error: examError } = await supabase
    .from('exams')
    .insert({
      user_id: user.id,
      title,
      exam_date: body.exam_date || null,
      total_questions: questions.length,
      max_score: questions.length * points,
    })
    .select('id')
    .single()
  if (examError || !exam) return NextResponse.json({ error: examError?.message ?? '시험 저장 실패' }, { status: 500 })

  const rows = questions.map((q, i) => ({
    exam_id: exam.id,
    user_id: user.id,
    // 필요한 칸만 골라 snapshot 으로 고정한다
    question_data: {
      type: 'word',
      direction: q.direction,
      question: q.question,
      answer: q.answer,
      accepted_answers: q.accepted_answers,
      expression: q.expression,
      meaning_ko: q.meaning_ko,
      pos: q.pos ?? null,
      entry_type: q.entry_type,
      source: 'vocabulary_bank',
      source_vocabulary_entry_id: q.source_vocabulary_entry_id,
    },
    sort_order: i,
    points,
  }))

  const { error: qError } = await supabase.from('exam_questions').insert(rows)
  if (qError) {
    // 문항 없이 빈 시험 카드만 남지 않게 되돌린다
    await supabase.from('exams').delete().eq('id', exam.id).eq('user_id', user.id)
    return NextResponse.json({ error: `문항 저장 실패: ${qError.message}` }, { status: 500 })
  }

  return NextResponse.json({ data: { exam_id: exam.id } })
}
