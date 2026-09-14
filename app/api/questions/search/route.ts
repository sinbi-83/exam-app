import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { searchParams } = new URL(request.url)
  const grade = searchParams.get('grade')
  const difficultiesParam = searchParams.get('difficulties') // 예: "2,3,4"

  let query = supabase
    .from('questions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(500)

  if (grade && grade !== 'all') {
    query = query.eq('grade', grade)
  }

  if (difficultiesParam) {
    const numbers = difficultiesParam
      .split(',')
      .map((n) => Number(n))
      .filter((n) => !Number.isNaN(n))
    if (numbers.length > 0 && numbers.length < 3) {
      query = query.in('difficulty', numbers)
    }
  }

  const { data, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // 신규: 검색된 문항들이 어느 지문에서 나왔는지, 그 원문도 같이 가져오기
  const questionSetIds = Array.from(
    new Set((data || []).map((q: any) => q.question_set_id).filter(Boolean))
  )

  let passages: Record<string, string> = {}
  if (questionSetIds.length > 0) {
    const { data: setsData, error: setsError } = await supabase
      .from('question_sets')
      .select('id, passage')
      .in('id', questionSetIds)

    if (!setsError && setsData) {
      passages = Object.fromEntries(setsData.map((s: any) => [s.id, s.passage]))
    }
  }

  // DB 컬럼명(question_text, question_type, choices, correct_answer)을
  // 프론트엔드 인터페이스(question, type, options, answer)에 맞게 변환
  const mapped = (data || []).map((q: any) => ({
    id: q.id,
    type: (q.question_type ?? '').replace(/^reading_|^essay_/, '') || q.question_type,
    question: q.question_text ?? '',
    options: q.choices ?? [],
    answer: q.correct_answer ?? '',
    explanation: q.explanation ?? '',
    grade: q.grade ?? '',
    topic: q.topic ?? '',
    difficulty: q.difficulty,
    question_set_id: q.question_set_id,
  }))

  return NextResponse.json({ data: mapped, passages })
}