import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 저장된 보고서 목록
export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { data, error } = await supabase
    .from('reports')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: 보고서 저장
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const {
    student_id, exam_id,
    student_name, student_grade,
    exam_title, exam_date,
    score, max_score,
    strengths, comment, next_steps,
    type_scores,
  } = body

  if (!student_name || score === undefined) {
    return NextResponse.json({ error: '학생 이름과 점수는 필수입니다.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('reports')
    .insert({
      user_id: user.id,
      student_id: student_id || null,
      exam_id: exam_id || null,
      student_name,
      student_grade: student_grade || null,
      exam_title: exam_title || null,
      exam_date: exam_date || null,
      score: Number(score),
      max_score: Number(max_score) || 100,
      strengths: strengths || null,
      comment: comment || null,
      next_steps: next_steps || null,
      type_scores: type_scores || {},
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE: 보고서 삭제
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase
    .from('reports')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
