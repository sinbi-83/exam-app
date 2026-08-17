import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 로그인한 선생님이 등록한 성적 목록 가져오기 (최신순)
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
    .from('exam_results')
    .select('id, student_id, exam_title, score, max_score, exam_date, created_at, students(name)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}

// POST: 새 성적 등록
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
  const { student_id, exam_title, score, max_score, exam_date } = body

  if (!student_id || !exam_title || score === undefined) {
    return NextResponse.json({ error: '필수 항목이 누락되었습니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('exam_results')
    .insert({
      user_id: user.id,
      student_id,
      exam_title,
      score,
      max_score: max_score || 100,
      exam_date: exam_date || new Date().toISOString().slice(0, 10),
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data })
}