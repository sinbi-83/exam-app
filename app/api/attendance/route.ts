import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date')

  let query = supabase
    .from('attendance')
    .select('id, student_id, date, status, note, students(name, grade)')
    .eq('user_id', user.id)

  if (date) query = query.eq('date', date)

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { records } = body // [{ student_id, date, status, note }]

  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: '출석 데이터가 없습니다.' }, { status: 400 })
  }

  const rows = records.map((r: { student_id: string; date: string; status: string; note?: string }) => ({
    user_id: user.id,
    student_id: r.student_id,
    date: r.date,
    status: r.status,
    note: r.note ?? null,
  }))

  const { data, error } = await supabase
    .from('attendance')
    .upsert(rows, { onConflict: 'user_id,student_id,date' })
    .select()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
