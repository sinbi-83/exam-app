import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('student_id')
  const status = searchParams.get('status')

  let query = supabase
    .from('homework')
    .select('id, student_id, title, due_date, status, note, created_at, students(name, grade)')
    .eq('user_id', user.id)

  if (studentId) query = query.eq('student_id', studentId)
  if (status) query = query.eq('status', status)

  const { data, error } = await query.order('due_date', { ascending: true, nullsFirst: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { student_id, title, due_date, note } = body

  if (!student_id || !title) {
    return NextResponse.json({ error: '학생과 숙제 내용을 입력해주세요.' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('homework')
    .insert({
      user_id: user.id,
      student_id,
      title,
      due_date: due_date || null,
      note: note || null,
    })
    .select('id, student_id, title, due_date, status, note, created_at, students(name, grade)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
