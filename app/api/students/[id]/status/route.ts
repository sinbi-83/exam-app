import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { addDays, kstDateString } from '@/lib/dashboard'
import { checkStudentOwnership } from '@/lib/ownership'
import { isDateString, isSchemaMissing, isStudentStatus, NOT_READY_MESSAGE } from '@/lib/classManagement'

// PATCH { status: 'active'|'paused' } : 재원·휴원으로 바꾸기
// PATCH { status: 'withdrawn', withdrawn_on?, withdraw_note? } : 퇴원 처리 → DB 함수 withdraw_student 가 상태 변경과 소속 닫기를 한 번에 한다.
// 퇴원했다가 돌아와도 예전 반에 자동으로 넣지 않고, 마지막 퇴원일·사유는 기록으로 남긴다.
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const ownership = await checkStudentOwnership(supabase, params.id, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })

  const body = await request.json()
  if (!isStudentStatus(body.status)) return NextResponse.json({ error: '상태 값이 올바르지 않습니다.' }, { status: 400 })

  const needsMigration = () => NextResponse.json({ error: NOT_READY_MESSAGE, needsMigration: true }, { status: 503 })

  const { data: current, error: readError } = await supabase.from('students').select('status').eq('id', params.id).eq('user_id', user.id).single()
  if (readError) return isSchemaMissing(readError) ? needsMigration() : NextResponse.json({ error: readError.message }, { status: 500 })

  if (body.status === 'withdrawn') {
    const today = kstDateString(new Date())
    const withdrawnOn = body.withdrawn_on ?? today
    if (!isDateString(withdrawnOn)) return NextResponse.json({ error: '퇴원일 형식이 올바르지 않습니다.' }, { status: 400 })
    if (withdrawnOn >= addDays(today, 1)) return NextResponse.json({ error: '퇴원일은 오늘 이후로 정할 수 없습니다.' }, { status: 400 })
    if (current.status === 'withdrawn') return NextResponse.json({ error: '이미 퇴원한 학생입니다.' }, { status: 409 })

    const { data, error } = await supabase.rpc('withdraw_student', {
      p_student_id: params.id,
      p_withdrawn_on: withdrawnOn,
      p_note: typeof body.withdraw_note === 'string' ? body.withdraw_note : null,
    })
    if (error) {
      if (isSchemaMissing(error)) return needsMigration()
      if (error.code === 'P0002') return NextResponse.json({ error: '이미 퇴원한 학생입니다.' }, { status: 409 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true, status: 'withdrawn', closed_memberships: data ?? 0 })
  }

  const { error } = await supabase.from('students').update({ status: body.status }).eq('id', params.id).eq('user_id', user.id)
  if (error) return isSchemaMissing(error) ? needsMigration() : NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status: body.status })
}
