import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { selectAllPages } from '@/lib/supabasePaging'
import { kstDateString } from '@/lib/dashboard'
import { checkStudentsOwnership } from '@/lib/ownership'
import { addMembersToClass, checkClassManagementReady } from '@/lib/classManagementData'
import { isDateString, NOT_READY_MESSAGE, parseClassFields, parseSchedules } from '@/lib/classManagement'

// 반 목록·만들기 (class-management-migration.sql). 삭제는 없다 (종료만, /api/classes/[id]).
// SQL 적용 전이면 GET 은 빈 목록 + needsMigration, 쓰기는 503.

const CLASS_COLUMNS = 'id, name, target_grades, teacher_name, status, closed_on, note, created_at'

export async function GET() {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    if (readiness.missing) return NextResponse.json({ data: [], memberships: [], needsMigration: true })
    return NextResponse.json({ error: readiness.error }, { status: 500 })
  }

  const [classes, schedules, memberships] = await Promise.all([
    supabase.from('classes').select(CLASS_COLUMNS).eq('user_id', user.id).order('created_at', { ascending: false }),
    supabase.from('class_schedules').select('id, class_id, weekday, start_time, end_time').eq('user_id', user.id).order('weekday').order('start_time'),
    selectAllPages<{ class_id: string; student_id: string; joined_on: string }>((from, to) =>
      supabase.from('class_students').select('class_id, student_id, joined_on').eq('user_id', user.id).is('left_on', null).order('id').range(from, to),
    ),
  ])
  const failed = classes.error ?? schedules.error ?? memberships.error
  if (failed) return NextResponse.json({ error: failed.message }, { status: 500 })

  const data = (classes.data ?? []).map((c) => ({
    ...c,
    schedules: (schedules.data ?? []).filter((s) => s.class_id === c.id),
    member_count: memberships.data.filter((m) => m.class_id === c.id).length,
  }))
  return NextResponse.json({ data, memberships: memberships.data, needsMigration: false })
}

// POST { name, target_grades?, teacher_name?, note?, schedules?, student_ids?, joined_on? }
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    if (readiness.missing) return NextResponse.json({ error: NOT_READY_MESSAGE, needsMigration: true }, { status: 503 })
    return NextResponse.json({ error: readiness.error }, { status: 500 })
  }

  const body = await request.json()
  const parsed = parseClassFields(body, false)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const schedules = parseSchedules(body.schedules ?? [])
  if (!schedules.ok) return NextResponse.json({ error: schedules.error }, { status: 400 })
  const studentIds: unknown[] = Array.isArray(body.student_ids) ? body.student_ids : []
  const joinedOn = body.joined_on ?? kstDateString(new Date())
  if (!isDateString(joinedOn)) return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })

  // 반을 만들기 전에 학생부터 확인한다 (반은 지울 수 없으므로 실패한 반이 남지 않게)
  const ownership = await checkStudentsOwnership(supabase, studentIds, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })
  if (studentIds.length > 0) {
    const { data: withdrawn, error } = await supabase.from('students').select('id').eq('user_id', user.id).eq('status', 'withdrawn').in('id', studentIds as string[])
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if ((withdrawn ?? []).length > 0) return NextResponse.json({ error: '퇴원한 학생은 반에 넣을 수 없습니다. 먼저 재원으로 바꿔 주세요.' }, { status: 409 })
  }

  const { data: created, error: createError } = await supabase.from('classes').insert({ ...parsed.fields, user_id: user.id }).select(CLASS_COLUMNS).single()
  if (createError || !created) return NextResponse.json({ error: createError?.message ?? '반 만들기 실패' }, { status: 500 })

  if (schedules.schedules.length > 0) {
    const { error } = await supabase.from('class_schedules').insert(schedules.schedules.map((s) => ({ ...s, user_id: user.id, class_id: created.id })))
    if (error) return NextResponse.json({ error: `반은 만들어졌지만 요일·시간을 저장하지 못했습니다: ${error.message}`, class_id: created.id }, { status: 500 })
  }

  const members = await addMembersToClass(supabase, user.id, created.id, studentIds, joinedOn)
  if (!members.ok) return NextResponse.json({ error: `반은 만들어졌지만 학생을 넣지 못했습니다: ${members.error}`, class_id: created.id }, { status: members.status })
  return NextResponse.json({ data: created, added: members.added.length, warnings: members.warnings })
}
