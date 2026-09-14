import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 오답 기록 조회 (?student_id=...&exam_id=...)
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const examId = searchParams.get('exam_id')

  let query = supabase
    .from('wrong_answer_records')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (studentId) query = query.eq('student_id', studentId)
  if (examId) query = query.eq('exam_id', examId)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: 오답 기록 저장 (있으면 업데이트, 없으면 생성)
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { exam_id, student_id, wrong_question_ids, scored_at, notes } = body

  if (!exam_id || !student_id) {
    return NextResponse.json({ error: '시험과 학생을 선택해주세요.' }, { status: 400 })
  }

  // 기존 기록이 있으면 업데이트
  const { data: existing } = await supabase
    .from('wrong_answer_records')
    .select('id')
    .eq('user_id', user.id)
    .eq('exam_id', exam_id)
    .eq('student_id', student_id)
    .maybeSingle()

  if (existing) {
    const { data, error } = await supabase
      .from('wrong_answer_records')
      .update({
        wrong_question_ids: wrong_question_ids ?? [],
        scored_at: scored_at ?? null,
        notes: notes ?? null,
      })
      .eq('id', existing.id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // 새로 생성
  const { data, error } = await supabase
    .from('wrong_answer_records')
    .insert({
      user_id: user.id,
      exam_id,
      student_id,
      wrong_question_ids: wrong_question_ids ?? [],
      scored_at: scored_at ?? null,
      notes: notes ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE: 오답 기록 삭제 (?id=...)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase
    .from('wrong_answer_records')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
