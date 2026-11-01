import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { checkStudentOwnership } from '@/lib/ownership'
import { checkClassManagementReady, countStudentRecords } from '@/lib/classManagementData'
import { studentDeleteBlockedMessage } from '@/lib/classManagement'

// 학생 삭제는 연관 기록이 0건일 때만 된다 (출석·숙제·원비 등은 학생을 지우면 함께 지워지므로).
// 기록이 있으면 409 로 건수를 알려 주고 퇴원 처리를 안내한다.
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const ownership = await checkStudentOwnership(supabase, params.id, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })

  const { records, error: countError } = await countStudentRecords(supabase, params.id)
  if (countError) return NextResponse.json({ error: countError }, { status: 500 })
  const readiness = records.length > 0 ? await checkClassManagementReady(supabase) : null
  if (records.length > 0) {
    return NextResponse.json({ error: studentDeleteBlockedMessage(records, !!readiness?.ready), records, canWithdraw: !!readiness?.ready }, { status: 409 })
  }

  const { error } = await supabase
    .from('students')
    .delete()
    .eq('id', params.id)
    .eq('user_id', user.id)

  if (error?.code === '23503') {
    return NextResponse.json({ error: '방금 연결된 기록이 있어 삭제할 수 없습니다. 새로고침한 뒤 퇴원 처리를 해 주세요.' }, { status: 409 })
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const body = await request.json()
  const { name, grade, school_name, student_phone, parent_phone, enrolled_at, notes } = body

  const { data, error } = await supabase
    .from('students')
    .update({ name, grade, school_name, student_phone, parent_phone, enrolled_at: enrolled_at || null, notes })
    .eq('id', params.id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
