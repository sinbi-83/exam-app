import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 로그인한 선생님이 등록한 시험 카드 목록 가져오기 (최신순)
export async function GET() {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('exams')
    .select('id, title, exam_date, total_questions, max_score, question_set_id, exam_type, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST: 새 시험 카드 생성
export async function POST(request: NextRequest) {
  const supabase = await createClient()

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError || !user) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })
  }

  const body = await request.json()
  const { title, exam_date, total_questions, max_score, question_set_id } = body

  if (!title || !title.trim()) {
    return NextResponse.json({ error: '시험명은 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('exams')
    .insert({
      user_id: user.id,
      title: title.trim(),
      exam_date: exam_date || null,
      total_questions: total_questions || null,
      max_score: max_score || null,
      question_set_id: question_set_id || null,
      // 이 경로(시험출제·채점관리 시험카드)로 만드는 시험은 문제 시험. 단어 시험은 /api/vocabulary/word-test 에서 'word' 로 만든다
      exam_type: 'problem',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}