import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

// GET: 특정 시험의 문항 목록
export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const examId = searchParams.get('exam_id')
  if (!examId) return NextResponse.json({ error: 'exam_id가 필요합니다.' }, { status: 400 })

  const { data, error } = await supabase
    .from('exam_questions')
    .select('*')
    .eq('exam_id', examId)
    .eq('user_id', user.id)
    .order('sort_order', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// POST: 문항 추가
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { exam_id, question_data, sort_order, points } = body
  if (!exam_id || !question_data) return NextResponse.json({ error: '필수 항목 누락.' }, { status: 400 })

  const { data, error } = await supabase
    .from('exam_questions')
    .insert({ exam_id, user_id: user.id, question_data, sort_order: sort_order ?? 0, points: points ?? 5 })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

// DELETE: 문항 삭제 (?id=...)
export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const { error } = await supabase
    .from('exam_questions')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// PATCH: 순서/배점 수정
export async function PATCH(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { id, sort_order, points } = body
  if (!id) return NextResponse.json({ error: 'id가 필요합니다.' }, { status: 400 })

  const updateFields: Record<string, unknown> = {}
  if (sort_order !== undefined) updateFields.sort_order = sort_order
  if (points !== undefined) updateFields.points = points

  const { data, error } = await supabase
    .from('exam_questions')
    .update(updateFields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
