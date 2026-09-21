import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'

export async function GET(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const month = searchParams.get('month') // 'YYYY-MM'

  let query = supabase
    .from('tuition_records')
    .select('id, student_id, month_name, amount, paid_amount, status, paid_at, note, students(name, grade)')
    .eq('user_id', user.id)

  if (month) query = query.eq('month_name', month)

  const { data, error } = await query.order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { student_id, month_name, amount, paid_amount, status, paid_at, note } = body
  if (!student_id || !month_name) return NextResponse.json({ error: '필수 항목 누락.' }, { status: 400 })

  const { data, error } = await supabase
    .from('tuition_records')
    .upsert({
      user_id: user.id, student_id, month_name,
      amount: amount ?? 0,
      paid_amount: paid_amount ?? null,
      status: status ?? 'unpaid',
      paid_at: paid_at ?? null,
      note: note ?? null,
    }, { onConflict: 'user_id,student_id,month_name' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id 필요' }, { status: 400 })

  const { error } = await supabase.from('tuition_records').delete().eq('id', id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
