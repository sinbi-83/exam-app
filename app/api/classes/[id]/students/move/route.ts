import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabaseServer'
import { kstDateString } from '@/lib/dashboard'
import { checkStudentsOwnership } from '@/lib/ownership'
import { addMembersToClass, checkClassManagementReady, checkClassOwnership, closeMemberships } from '@/lib/classManagementData'
import { isDateString, leaveDateProblem, NOT_READY_MESSAGE } from '@/lib/classManagement'

// POST { student_ids, to_class_id, moved_on? } : 이 반에서 다른 반으로 옮기기.
// 새 반에 먼저 넣고 이 반에서 뺀다. 두 번째 단계가 실패하면 학생이 두 반에 함께 남고, 그 사실을 오류로 알린다 (학생이 어느 반에도 없게 되지는 않는다).
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const supabase = await createClient()
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 })

  const readiness = await checkClassManagementReady(supabase)
  if (!readiness.ready) {
    if (readiness.missing) return NextResponse.json({ error: NOT_READY_MESSAGE, needsMigration: true }, { status: 503 })
    return NextResponse.json({ error: readiness.error }, { status: 500 })
  }

  const body = await request.json()
  const toClassId = body.to_class_id
  const studentIds: unknown[] = Array.isArray(body.student_ids) ? body.student_ids : []
  if (!toClassId) return NextResponse.json({ error: '옮길 반을 골라 주세요.' }, { status: 400 })
  if (toClassId === params.id) return NextResponse.json({ error: '같은 반으로는 옮길 수 없습니다.' }, { status: 400 })
  if (studentIds.length === 0) return NextResponse.json({ error: '학생을 골라 주세요.' }, { status: 400 })
  const movedOn = body.moved_on ?? kstDateString(new Date())
  if (!isDateString(movedOn)) return NextResponse.json({ error: '날짜 형식이 올바르지 않습니다.' }, { status: 400 })

  for (const classId of [params.id, toClassId]) {
    const ownership = await checkClassOwnership(supabase, classId, user.id)
    if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })
  }
  const ownership = await checkStudentsOwnership(supabase, studentIds, user.id)
  if (!ownership.ok) return NextResponse.json({ error: ownership.error }, { status: ownership.status })
  const ids = [...new Set(studentIds as string[])]

  // 지금 이 반에 있는 학생만, 날짜가 맞을 때만 옮긴다 (새 반에 넣기 전에 확인)
  const { data: open, error: openError } = await supabase.from('class_students').select('student_id, joined_on').eq('user_id', user.id).eq('class_id', params.id).in('student_id', ids).is('left_on', null)
  if (openError) return NextResponse.json({ error: openError.message }, { status: 500 })
  if ((open ?? []).length !== ids.length) return NextResponse.json({ error: '이 반에 없는 학생이 있습니다. 새로고침한 뒤 다시 해 주세요.' }, { status: 409 })
  const problem = leaveDateProblem(movedOn, open ?? [])
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const added = await addMembersToClass(supabase, user.id, toClassId, ids, movedOn)
  if (!added.ok) return NextResponse.json({ error: added.error }, { status: added.status })

  const closed = await closeMemberships(supabase, user.id, params.id, ids, movedOn)
  if (!closed.ok) {
    return NextResponse.json({ error: `새 반에는 들어갔지만 이 반에서 빠지지 못했습니다. 이 반에서 "빼기"를 해 주세요. (${closed.error})` }, { status: closed.status })
  }
  return NextResponse.json({ moved: closed.closed, warnings: added.warnings })
}
