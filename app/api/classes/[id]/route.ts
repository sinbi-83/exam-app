import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { kstDateString } from '@/lib/dashboard'
import { checkClassManagementReady, checkClassOwnership } from '@/lib/classManagementData'
import { isDateString, leaveDateProblem, NOT_READY_MESSAGE, parseClassFields, parseSchedules } from '@/lib/classManagement'

// 반 한 개: 상세·수정·종료. 삭제 함수는 일부러 두지 않는다.

const CLASS_COLUMNS = 'id, name, target_grades, teacher_name, status, closed_on, note, created_at'

type Params = { params: { id: string } }

export async function GET(_request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    if (readiness.missing) return NextResponse.json({ data: null, needsMigration: true })
    return NextResponse.json({ error: readiness.error }, { status: 500 })
  }
  const ownership = await checkClassOwnership(supabase, params.id, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })

  const [cls, schedules, memberships] = await Promise.all([
    supabase.from('classes').select(CLASS_COLUMNS).eq('id', params.id).eq('user_id', user.id).single(),
    supabase.from('class_schedules').select('id, class_id, weekday, start_time, end_time').eq('user_id', user.id).eq('class_id', params.id).order('weekday').order('start_time'),
    supabase.from('class_students').select('id, student_id, joined_on, left_on').eq('user_id', user.id).eq('class_id', params.id).order('joined_on'),
  ])
  const failed = cls.error ?? schedules.error ?? memberships.error
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 })

  const rows = memberships.data ?? []
  const studentIds = [...new Set(rows.map((m) => m.student_id as string))]
  const { data: students, error: studentError } = studentIds.length
    ? await supabase.from('students').select('id, name, grade, school_name, status').eq('user_id', user.id).in('id', studentIds)
    : { data: [], error: null }
  if (studentError) return NextResponse.json({ error: studentError.message }, { status: 500 })
  const byId = new Map((students ?? []).map((s) => [s.id as string, s]))
  const withStudent = rows.map((m) => ({ ...m, student: byId.get(m.student_id as string) ?? null }))

  return NextResponse.json({
    data: {
      ...cls.data,
      schedules: schedules.data ?? [],
      members: withStudent.filter((m) => m.left_on === null),
      past_members: withStudent.filter((m) => m.left_on !== null),
    },
    needsMigration: false,
  })
}

// PATCH { action: 'close', closed_on? } : 반 종료 (소속을 닫고 상태를 바꾼다)
// PATCH { name?, target_grades?, teacher_name?, note?, schedules? } : 수정
export async function PATCH(request: NextRequest, { params }: Params) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    if (readiness.missing) return NextResponse.json({ error: NOT_READY_MESSAGE, needsMigration: true }, { status: 503 })
    return NextResponse.json({ error: readiness.error }, { status: 500 })
  }
  const ownership = await checkClassOwnership(supabase, params.id, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })

  const body = await request.json()

  if (body.action === 'close') {
    const closedOn = body.closed_on ?? kstDateString(new Date())
    if (!isDateString(closedOn)) return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })
    const { data: cls, error: readError } = await supabase.from('classes').select('status').eq('id', params.id).eq('user_id', user.id).single()
    if (readError) return NextResponse.json({ error: readError.message }, { status: 500 })
    if (cls.status === 'closed') return NextResponse.json({ error: '이미 종료된 반입니다.' }, { status: 409 })

    const { data: open, error: openError } = await supabase.from('class_students').select('id, joined_on').eq('user_id', user.id).eq('class_id', params.id).is('left_on', null)
    if (openError) return NextResponse.json({ error: openError.message }, { status: 500 })
    const problem = leaveDateProblem(closedOn, open ?? [])
    if (problem) return NextResponse.json({ error: `종료${problem}` }, { status: 400 })

    // 소속을 먼저 닫는다. 그다음 단계가 실패해도 다시 누르면 이어서 끝난다.
    if ((open ?? []).length > 0) {
      const { error } = await supabase.from('class_students').update({ left_on: closedOn }).eq('user_id', user.id).eq('class_id', params.id).is('left_on', null)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const { data, error } = await supabase.from('classes').update({ status: 'closed', closed_on: closedOn }).eq('id', params.id).eq('user_id', user.id).select(CLASS_COLUMNS).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data, closed_members: (open ?? []).length })
  }

  const parsed = parseClassFields(body, true)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const schedules = body.schedules === undefined ? null : parseSchedules(body.schedules)
  if (schedules && !schedules.ok) return NextResponse.json({ error: schedules.error }, { status: 400 })

  if (Object.keys(parsed.fields).length > 0) {
    const { error } = await supabase.from('classes').update(parsed.fields).eq('id', params.id).eq('user_id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (schedules?.ok) {
    // 새 시간을 먼저 넣고 옛 시간을 지운다 (중간에 실패해도 시간이 사라지지 않게)
    const { data: old, error: oldError } = await supabase.from('class_schedules').select('id').eq('user_id', user.id).eq('class_id', params.id)
    if (oldError) return NextResponse.json({ error: oldError.message }, { status: 500 })
    if (schedules.schedules.length > 0) {
      const { error } = await supabase.from('class_schedules').insert(schedules.schedules.map((s) => ({ ...s, user_id: user.id, class_id: params.id })))
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    const oldIds = (old ?? []).map((s) => s.id as string)
    if (oldIds.length > 0) {
      const { error } = await supabase.from('class_schedules').delete().eq('user_id', user.id).in('id', oldIds)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

  const { data, error } = await supabase.from('classes').select(CLASS_COLUMNS).eq('id', params.id).eq('user_id', user.id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
